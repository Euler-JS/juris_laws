import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export class SimpleRAG {
  constructor(openaiApiKey) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: 'text-embedding-3-small'
    });
    this.chunks = []; // { text, lei, embedding, metadata }
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

  async indexLaw(lawName, lawText) {
    // Dividir texto em chunks
    const textChunks = await this.textSplitter.splitText(lawText);
    
    if (textChunks.length === 0) {
      console.warn(`⚠️  ${lawName}: Nenhum chunk gerado`);
      return 0;
    }

    // Criar embeddings para cada chunk
    const embeddings = await this.embeddings.embedDocuments(textChunks);
    
    // Armazenar chunks com metadados enriquecidos
    const articles = new Set();
    for (let i = 0; i < textChunks.length; i++) {
      const articleNumber = this.extractArticleNumber(textChunks[i]);
      const articleTitle = this.extractArticleTitle(textChunks[i]);
      
      if (articleNumber) articles.add(articleNumber);
      
      this.chunks.push({
        text: textChunks[i],
        lei: lawName,
        chunkIndex: i,
        embedding: embeddings[i],
        articleNumber: articleNumber,
        articleTitle: articleTitle,
        hasArticle: articleNumber !== null
      });
    }

    // Log de artigos indexados
    if (articles.size > 0) {
      const sortedArticles = Array.from(articles).sort((a, b) => a - b);
      console.log(`    Artigos: ${sortedArticles.join(', ')}`);
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
    // Detectar se está buscando artigo específico
    const articleMatch = query.match(/artigo\s+(\d+)/i);
    const searchingArticle = articleMatch ? parseInt(articleMatch[1]) : null;

    // Criar embedding da pergunta
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Calcular similaridade com todos os chunks
    let results = this.chunks.map(chunk => ({
      text: chunk.text,
      lei: chunk.lei,
      chunkIndex: chunk.chunkIndex,
      articleNumber: chunk.articleNumber,
      articleTitle: chunk.articleTitle,
      similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Reranking: priorizar artigo específico se mencionado
    if (searchingArticle) {
      results = results.sort((a, b) => {
        // Artigo exato tem prioridade máxima
        const aExact = a.articleNumber === searchingArticle ? 1 : 0;
        const bExact = b.articleNumber === searchingArticle ? 1 : 0;
        
        if (aExact !== bExact) return bExact - aExact;
        
        // Depois por similaridade
        return b.similarity - a.similarity;
      });

      // Log para debug
      const foundArticle = results.find(r => r.articleNumber === searchingArticle);
      if (foundArticle) {
        console.log(`✓ Artigo ${searchingArticle} encontrado (similaridade: ${foundArticle.similarity.toFixed(3)})`);
      } else {
        console.warn(`⚠️  Artigo ${searchingArticle} NÃO encontrado nos resultados`);
        console.log('Artigos encontrados:', results.slice(0, 10).map(r => r.articleNumber).filter(Boolean));
      }
    } else {
      // Ordenar por similaridade normalmente
      results.sort((a, b) => b.similarity - a.similarity);
    }
    
    return results.slice(0, topK);
  }

  getStats() {
    return {
      totalChunks: this.chunks.length,
      leisIndexadas: [...new Set(this.chunks.map(c => c.lei))].length
    };
  }

  // Listar artigos indexados
  getIndexedArticles(lawName = null) {
    const filteredChunks = lawName 
      ? this.chunks.filter(c => c.lei === lawName)
      : this.chunks;

    const articlesMap = new Map();
    
    filteredChunks
      .filter(c => c.articleNumber !== null)
      .forEach(c => {
        const key = `${c.lei}-${c.articleNumber}`;
        if (!articlesMap.has(key)) {
          articlesMap.set(key, {
            number: c.articleNumber,
            title: c.articleTitle,
            lei: c.lei
          });
        }
      });

    return Array.from(articlesMap.values()).sort((a, b) => a.number - b.number);
  }

  // Verificar se artigo específico existe
  checkArticleExists(articleNumber, lawName = null) {
    return this.chunks.some(c => 
      c.articleNumber === articleNumber && 
      (lawName === null || c.lei === lawName)
    );
  }
}
