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
      chunkSize: 1500, // Aumentado para capturar artigos completos
      chunkOverlap: 300, // Mais overlap para contexto
      separators: ['\n\nARTIGO', '\n\n', '\n', '. ', ' ', ''] // Priorizar separação por artigo
    });
  }

  // Extrair número do artigo do texto
  extractArticleNumber(text) {
    const match = text.match(/ARTIGO\s+(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  // Extrair título/assunto do artigo
  extractArticleTitle(text) {
    const lines = text.split('\n');
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      if (line && !line.match(/^ARTIGO\s+\d+$/i)) {
        return line.substring(0, 100);
      }
    }
    return null;
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
    
    // Preparar dados para ChromaDB com metadados enriquecidos
    const ids = chunks.map(() => uuidv4());
    const metadatas = chunks.map((chunk, i) => {
      const articleNumber = this.extractArticleNumber(chunk);
      const articleTitle = this.extractArticleTitle(chunk);
      
      return {
        lei: lawName,
        chunk_index: i,
        total_chunks: chunks.length,
        article_number: articleNumber,
        article_title: articleTitle,
        has_article: articleNumber !== null,
        text_length: chunk.length,
        chunk_preview: chunk.substring(0, 100).replace(/\n/g, ' ')
      };
    });

    // Adicionar ao ChromaDB
    await this.collection.add({
      ids: ids,
      embeddings: embeddings,
      documents: chunks,
      metadatas: metadatas
    });

    // Log de artigos indexados
    const articles = metadatas
      .filter(m => m.article_number)
      .map(m => m.article_number)
      .filter((v, i, a) => a.indexOf(v) === i) // unique
      .sort((a, b) => a - b);
    
    if (articles.length > 0) {
      console.log(`    Artigos: ${articles.join(', ')}`);
    }

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

    // Detectar se está buscando artigo específico
    const articleMatch = query.match(/artigo\s+(\d+)/i);
    const searchingArticle = articleMatch ? parseInt(articleMatch[1]) : null;

    // Criar embedding da pergunta
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Buscar mais resultados se estiver procurando artigo específico
    const nResults = searchingArticle ? 10 : topK;

    // Buscar chunks similares
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: nResults
    });

    // Formatar resultados
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];

    let formattedResults = documents.map((doc, i) => ({
      text: doc,
      lei: metadatas[i]?.lei || 'Desconhecida',
      chunkIndex: metadatas[i]?.chunk_index || 0,
      articleNumber: metadatas[i]?.article_number,
      articleTitle: metadatas[i]?.article_title,
      similarity: 1 - distances[i], // Converter distância em similaridade
      distance: distances[i]
    }));

    // Reranking: priorizar artigo específico se mencionado
    if (searchingArticle) {
      formattedResults = formattedResults.sort((a, b) => {
        // Artigo exato tem prioridade máxima
        const aExact = a.articleNumber === searchingArticle ? 1 : 0;
        const bExact = b.articleNumber === searchingArticle ? 1 : 0;
        
        if (aExact !== bExact) return bExact - aExact;
        
        // Depois por similaridade
        return b.similarity - a.similarity;
      });

      // Log para debug
      const foundArticle = formattedResults.find(r => r.articleNumber === searchingArticle);
      if (foundArticle) {
        console.log(`✓ Artigo ${searchingArticle} encontrado (similaridade: ${foundArticle.similarity.toFixed(3)})`);
      } else {
        console.warn(`⚠️  Artigo ${searchingArticle} NÃO encontrado nos resultados`);
        console.log('Artigos encontrados:', formattedResults.map(r => r.articleNumber).filter(Boolean));
      }
    }

    // Retornar top K após reranking
    return formattedResults.slice(0, topK);
  }

  async getStats() {
    if (!this.collection) return null;

    const count = await this.collection.count();
    return {
      totalChunks: count,
      collectionName: this.collectionName
    };
  }

  // Nova função para verificar artigos indexados
  async getIndexedArticles(lawName = null) {
    if (!this.collection) return [];

    try {
      const allData = await this.collection.get({
        where: lawName ? { lei: lawName } : undefined,
        include: ['metadatas']
      });

      const articles = allData.metadatas
        .filter(m => m.article_number)
        .map(m => ({
          number: m.article_number,
          title: m.article_title,
          lei: m.lei
        }))
        .reduce((acc, curr) => {
          const key = `${curr.lei}-${curr.number}`;
          if (!acc.has(key)) {
            acc.set(key, curr);
          }
          return acc;
        }, new Map());

      return Array.from(articles.values()).sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error('Erro ao obter artigos indexados:', error);
      return [];
    }
  }

  // Função para verificar se artigo específico existe
  async checkArticleExists(articleNumber, lawName = null) {
    if (!this.collection) return false;

    try {
      const result = await this.collection.get({
        where: {
          article_number: articleNumber,
          ...(lawName && { lei: lawName })
        },
        limit: 1
      });

      return result.ids.length > 0;
    } catch (error) {
      return false;
    }
  }
}
