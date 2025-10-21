import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { v4 as uuidv4 } from 'uuid';

export class RAGSystem {
  constructor(openaiApiKey) {
    this.client = new ChromaClient();
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: 'text-embedding-3-small'
    });
    this.collection = null;
    this.collectionName = 'leis_mocambique';
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', '']
    });
  }

  async initialize() {
    try {
      // Tentar deletar coleção existente
      try {
        await this.client.deleteCollection({ name: this.collectionName });
      } catch (e) {
        // Coleção não existe, tudo bem
      }

      // Criar nova coleção
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        metadata: { 
          description: 'Leis de Moçambique indexadas',
          'hnsw:space': 'cosine'
        }
      });

      console.log('✓ ChromaDB inicializado');
    } catch (error) {
      console.error('Erro ao inicializar ChromaDB:', error);
      throw error;
    }
  }

  async indexLaw(lawName, lawText) {
    if (!this.collection) {
      throw new Error('RAG não foi inicializado. Chame initialize() primeiro.');
    }

    // Dividir texto em chunks
    const chunks = await this.textSplitter.splitText(lawText);
    
    if (chunks.length === 0) {
      console.warn(`⚠️  ${lawName}: Nenhum chunk gerado`);
      return 0;
    }

    // Criar embeddings para cada chunk
    const embeddings = await this.embeddings.embedDocuments(chunks);
    
    // Preparar dados para ChromaDB
    const ids = chunks.map(() => uuidv4());
    const metadatas = chunks.map((chunk, i) => ({
      lei: lawName,
      chunk_index: i,
      total_chunks: chunks.length
    }));

    // Adicionar ao ChromaDB
    await this.collection.add({
      ids: ids,
      embeddings: embeddings,
      documents: chunks,
      metadatas: metadatas
    });

    return chunks.length;
  }

  async indexAllLaws(pdfCache) {
    console.log('\n📚 Indexando leis no RAG...');
    let totalChunks = 0;

    for (const [name, data] of pdfCache.entries()) {
      const chunks = await this.indexLaw(name, data.text);
      totalChunks += chunks;
      console.log(`  ✓ ${name}: ${chunks} chunks`);
    }

    console.log(`\n✅ Total de ${totalChunks} chunks indexados!\n`);
    return totalChunks;
  }

  async search(query, topK = 5) {
    if (!this.collection) {
      throw new Error('RAG não foi inicializado');
    }

    // Criar embedding da pergunta
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Buscar chunks similares
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK
    });

    // Formatar resultados
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];

    const formattedResults = documents.map((doc, i) => ({
      text: doc,
      lei: metadatas[i]?.lei || 'Desconhecida',
      chunkIndex: metadatas[i]?.chunk_index || 0,
      similarity: 1 - distances[i] // Converter distância em similaridade
    }));

    return formattedResults;
  }

  async getStats() {
    if (!this.collection) return null;

    const count = await this.collection.count();
    return {
      totalChunks: count,
      collectionName: this.collectionName
    };
  }
}
