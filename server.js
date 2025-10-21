import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import pdfParse from 'pdf-parse-fork';
import { SimpleRAG } from './simple-rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// OpenAI configuração
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Sistema RAG
const ragSystem = new SimpleRAG(process.env.OPENAI_API_KEY);

// Cache para armazenar textos dos PDFs
const pdfCache = new Map();

// Função para extrair texto do PDF usando pdf-parse-fork
async function extractTextFromPDF(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error(`Erro ao extrair texto do PDF ${pdfPath}:`, error.message);
    return '';
  }
}

// Função para carregar todos os PDFs da pasta leis
async function loadAllPDFs() {
  const leisPath = path.join(__dirname, 'leis');
  const files = fs.readdirSync(leisPath).filter(f => f.endsWith('.pdf'));
  
  console.log(`Carregando ${files.length} arquivos PDF...`);
  
  for (const file of files) {
    const filePath = path.join(leisPath, file);
    const text = await extractTextFromPDF(filePath);
    
    pdfCache.set(file, {
      name: file,
      text: text,
      preview: text.substring(0, 500)
    });
    
    console.log(`✓ ${file} carregado (${text.length} caracteres)`);
  }
  
  console.log('Todos os PDFs foram carregados!');
}

// Rota principal
app.get('/', (req, res) => {
  res.json({
    message: 'API de Consulta de Leis Moçambicanas',
    endpoints: {
      '/leis': 'Lista todas as leis disponíveis',
      '/perguntar': 'POST - Faz uma pergunta sobre as leis (método antigo)',
      '/perguntar-rag': 'POST - Faz uma pergunta usando RAG (recomendado)',
      '/rag/stats': 'Estatísticas do sistema RAG'
    }
  });
});

// Rota para listar todas as leis disponíveis
app.get('/leis', (req, res) => {
  const leis = Array.from(pdfCache.entries()).map(([name, data]) => ({
    nome: name,
    caracteres: data.text.length,
    preview: data.preview
  }));
  
  res.json({
    total: leis.length,
    leis: leis
  });
});

// Rota para fazer perguntas
app.post('/perguntar', async (req, res) => {
  try {
    const { pergunta, lei } = req.body;
    
    if (!pergunta) {
      return res.status(400).json({ error: 'Pergunta é obrigatória' });
    }
    
    // Construir contexto com as leis
    let contexto = '';
    let leisUsadas = [];
    
    if (lei) {
      // Se uma lei específica foi mencionada
      const leiData = pdfCache.get(lei);
      if (leiData) {
        contexto = `=== ${leiData.name} ===\n${leiData.text}`;
        leisUsadas.push(lei);
      } else {
        return res.status(404).json({ error: 'Lei não encontrada' });
      }
    } else {
      // Buscar nas leis relevantes baseado em palavras-chave
      const palavrasChave = pergunta.toLowerCase();
      let textoTotal = 0;
      const maxTexto = 100000; // Limitar contexto total
      
      for (const [name, data] of pdfCache.entries()) {
        if (textoTotal >= maxTexto) break;
        
        // Adicionar lei ao contexto
        const textoLei = data.text.substring(0, 30000);
        contexto += `\n\n=== ${name} ===\n${textoLei}`;
        leisUsadas.push(name);
        textoTotal += textoLei.length;
      }
    }
    
    // Chamar OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um assistente jurídico especializado em leis de Moçambique.

REGRAS IMPORTANTES:
1. Responda APENAS com base no conteúdo das leis fornecidas abaixo
2. SEMPRE cite o artigo específico e o nome da lei quando responder
3. Se a informação NÃO estiver nos documentos fornecidos, responda: "Não há resposta segundo as leis fornecidas"
4. NÃO invente ou assuma informações que não estejam explícitas nos documentos
5. Use o formato: "Segundo o Artigo X da [Nome da Lei], ..."
6. Se encontrar múltiplos artigos relevantes, cite todos

Leis fornecidas:
${contexto}`
        },
        {
          role: 'user',
          content: pergunta
        }
      ],
      temperature: 0.1, // Baixa temperatura para respostas mais precisas
      max_tokens: 1500
    });
    
    res.json({
      pergunta,
      resposta: response.choices[0].message.content,
      leisConsultadas: leisUsadas,
      totalLeis: leisUsadas.length,
      modelo: 'gpt-4o-mini'
    });
    
  } catch (error) {
    console.error('Erro ao processar pergunta:', error);
    res.status(500).json({ 
      error: 'Erro ao processar pergunta',
      details: error.message 
    });
  }
});

// Rota para buscar lei específica
app.get('/lei/:nome', (req, res) => {
  const { nome } = req.params;
  const leiData = pdfCache.get(nome);
  
  if (!leiData) {
    return res.status(404).json({ error: 'Lei não encontrada' });
  }
  
  res.json({
    nome: leiData.name,
    texto: leiData.text,
    caracteres: leiData.text.length
  });
});

// ============ NOVOS ENDPOINTS RAG ============

// Rota para perguntas usando RAG
app.post('/perguntar-rag', async (req, res) => {
  try {
    const { pergunta, topK = 5 } = req.body;
    
    if (!pergunta) {
      return res.status(400).json({ error: 'Pergunta é obrigatória' });
    }

    // 1. Buscar chunks relevantes usando RAG
    const results = await ragSystem.search(pergunta, topK);
    
    if (results.length === 0) {
      return res.json({
        pergunta,
        resposta: 'Não encontrei informações relevantes nas leis fornecidas.',
        chunksEncontrados: 0
      });
    }

    // 2. Construir contexto com os chunks encontrados
    const contexto = results
      .map((r, i) => `[Chunk ${i + 1} - ${r.lei} - Similaridade: ${(r.similarity * 100).toFixed(1)}%]\n${r.text}`)
      .join('\n\n---\n\n');

    const leisEncontradas = [...new Set(results.map(r => r.lei))];

    // 3. Enviar ao GPT
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um assistente jurídico especializado em leis de Moçambique.

REGRAS IMPORTANTES:
1. Responda APENAS com base nos trechos (chunks) das leis fornecidos abaixo
2. SEMPRE cite o artigo específico e o nome da lei quando responder
3. Se a informação NÃO estiver nos trechos fornecidos, responda: "Não há informação suficiente nos trechos fornecidos"
4. NÃO invente ou assuma informações que não estejam explícitas nos trechos
5. Use o formato: "Segundo o Artigo X da [Nome da Lei], ..."
6. Os trechos foram selecionados automaticamente como os mais relevantes para a pergunta

Trechos relevantes das leis:
${contexto}`
        },
        {
          role: 'user',
          content: pergunta
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    res.json({
      pergunta,
      resposta: response.choices[0].message.content,
      chunksEncontrados: results.length,
      leisConsultadas: leisEncontradas,
      detalhesChunks: results.map(r => ({
        lei: r.lei,
        similaridade: `${(r.similarity * 100).toFixed(1)}%`,
        preview: r.text.substring(0, 150) + '...'
      })),
      modelo: 'gpt-4o-mini',
      metodo: 'RAG'
    });

  } catch (error) {
    console.error('Erro ao processar pergunta RAG:', error);
    res.status(500).json({
      error: 'Erro ao processar pergunta',
      details: error.message
    });
  }
});

// Estatísticas do RAG
app.get('/rag/stats', async (req, res) => {
  try {
    const stats = await ragSystem.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar servidor
async function start() {
  console.log('🚀 Iniciando servidor...\n');
  
  // 1. Carregar PDFs
  await loadAllPDFs();
  
  // 2. Indexar RAG
  await ragSystem.indexAllLaws(pdfCache);
  
  const stats = ragSystem.getStats();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📚 ${pdfCache.size} leis carregadas`);
    console.log(`🔍 ${stats.totalChunks} chunks indexados no RAG`);
    console.log(`\n💡 Acesse http://localhost:${PORT} no navegador`);
    console.log(`\n📖 Endpoints disponíveis:`);
    console.log(`  • POST /perguntar     - Método antigo (envia todas leis)`);
    console.log(`  • POST /perguntar-rag - Método RAG (busca inteligente) ⭐`);
    console.log(`  • GET  /rag/stats     - Estatísticas do RAG`);
    console.log(`\nExemplo RAG:`);
    console.log(`curl -X POST http://localhost:${PORT}/perguntar-rag \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"pergunta": "O que diz a lei de terras?"}'`);
  });
}

start().catch(console.error);
