import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import { PDFDocument } from 'pdf-lib';

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

// Cache para armazenar textos dos PDFs
const pdfCache = new Map();

// Função para extrair texto do PDF usando pdf-lib
async function extractTextFromPDF(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    let text = '';
    for (let i = 0; i < pages.length; i++) {
      // pdf-lib não extrai texto diretamente, mas podemos usar outra abordagem
      text += `[Página ${i + 1}]\n`;
    }
    
    return text;
  } catch (error) {
    console.error(`Erro ao ler PDF ${pdfPath}:`, error);
    return '';
  }
}

// Função para extrair texto do PDF usando Python (melhor extração)
async function extractTextWithPython(pdfPath) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const python = spawn('python3', ['extract_pdf.py', pdfPath]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`Erro Python: ${errorOutput}`);
        resolve(''); // Retorna vazio em caso de erro
      } else {
        resolve(output);
      }
    });
  });
}

// Função alternativa usando fs para ler PDFs como texto bruto (fallback)
function readPDFAsText(pdfPath) {
  try {
    const buffer = fs.readFileSync(pdfPath);
    // Conversão básica - não é ideal mas funciona para alguns PDFs
    let text = buffer.toString('utf8');
    // Limpar caracteres não imprimíveis
    text = text.replace(/[^\x20-\x7E\n]/g, ' ');
    return text;
  } catch (error) {
    console.error(`Erro ao ler PDF ${pdfPath}:`, error);
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
    const text = readPDFAsText(filePath);
    pdfCache.set(file, {
      name: file,
      text: text.substring(0, 50000), // Limitar tamanho para não exceder token limit
      path: filePath
    });
    console.log(`✓ ${file} carregado`);
  }
  
  console.log('Todos os PDFs foram carregados!');
}

// Rota principal
app.get('/', (req, res) => {
  res.json({
    message: 'API de Consulta de Leis Moçambicanas',
    endpoints: {
      '/leis': 'Lista todas as leis disponíveis',
      '/perguntar': 'POST - Faz uma pergunta sobre as leis'
    }
  });
});

// Rota para listar todas as leis disponíveis
app.get('/leis', (req, res) => {
  const leis = Array.from(pdfCache.keys());
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
    
    if (lei) {
      // Se uma lei específica foi mencionada
      const leiData = pdfCache.get(lei);
      if (leiData) {
        contexto = `Lei: ${leiData.name}\n\n${leiData.text}`;
      } else {
        return res.status(404).json({ error: 'Lei não encontrada' });
      }
    } else {
      // Usar todas as leis (limitado)
      for (const [name, data] of pdfCache.entries()) {
        contexto += `\n\n=== ${name} ===\n${data.text.substring(0, 5000)}`;
        if (contexto.length > 30000) break; // Limitar contexto total
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
1. Responda APENAS com base no conteúdo das leis fornecidas no contexto
2. SEMPRE cite o artigo específico e o nome completo da lei (exemplo: "Artigo 50 da Lei da Família")
3. Se a informação NÃO estiver nos documentos fornecidos, responda: "Não encontrei essa informação nas leis disponíveis"
4. NÃO invente artigos ou informações
5. NÃO use conhecimento externo aos documentos
6. Cite exatamente o que está escrito nos documentos
7. Se encontrar a informação, transcreva o texto do artigo relevante

Formato de resposta:
- Nome da Lei: [nome completo da lei]
- Artigo: [número do artigo]
- Conteúdo: [texto exato do artigo ou resumo fiel]`
        },
        {
          role: 'user',
          content: `Contexto das leis disponíveis:\n${contexto}\n\nPergunta: ${pergunta}`
        }
      ],
      temperature: 0.1,
      max_tokens: 1500
    });
    
    res.json({
      pergunta,
      resposta: response.choices[0].message.content,
      lei: lei || 'Todas as leis',
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

// Inicializar servidor
async function start() {
  await loadAllPDFs();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📚 ${pdfCache.size} leis carregadas`);
    console.log(`\nExemplo de uso:`);
    console.log(`curl -X POST http://localhost:${PORT}/perguntar \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"pergunta": "O que diz a lei sobre casamento?"}'`);
  });
}

start().catch(console.error);
