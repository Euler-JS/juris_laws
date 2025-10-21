import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export class SimpleRAG {
  constructor(openaiApiKey) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: 'text-embedding-3-small'
    });
    this.chunks = []; // { text, lei, embedding }
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', '']
    });
  }

  async indexLaw(lawName, lawText) {
    // Dividir texto em chunks
    const textChunks = await this.textSplitter.splitText(lawText);
    
    if (textChunks.length === 0) {
      console.warn(`⚠️  ${lawName}: Nenhum chunk gerado`);
      return 0;
    }

    // Criar embeddings para cada chunk
    const embeddings = await this.embeddings.embedDocuments(textChunks);
    
    // Armazenar chunks com seus embeddings
    for (let i = 0; i < textChunks.length; i++) {
      this.chunks.push({
        text: textChunks[i],
        lei: lawName,
        chunkIndex: i,
        embedding: embeddings[i]
      });
    }

    return textChunks.length;
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

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async search(query, topK = 5) {
    // Criar embedding da pergunta
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Calcular similaridade com todos os chunks
    const results = this.chunks.map(chunk => ({
      ...chunk,
      similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Ordenar por similaridade e pegar top K
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK).map(r => ({
      text: r.text,
      lei: r.lei,
      chunkIndex: r.chunkIndex,
      similarity: r.similarity
    }));
  }

  getStats() {
    return {
      totalChunks: this.chunks.length,
      leisIndexadas: [...new Set(this.chunks.map(c => c.lei))].length
    };
  }
}
