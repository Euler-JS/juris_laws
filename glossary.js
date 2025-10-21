import OpenAI from 'openai';
import { OpenAIEmbeddings } from '@langchain/openai';

/**
 * Sistema de Glossário Jurídico
 * Explica termos técnicos de forma simples e contextualizada
 */
export class LegalGlossary {
  constructor(openaiApiKey) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: 'text-embedding-3-small'
    });
    
    // Cache de termos já explicados nesta sessão
    this.termCache = new Map();
    
    // Banco de termos jurídicos comuns (será expandido)
    this.commonTerms = this.initializeCommonTerms();
  }

  /**
   * Inicializa banco de termos jurídicos comuns
   */
  initializeCommonTerms() {
    return {
      // Direito do Trabalho
      'justa causa': {
        categoria: 'direito_trabalho',
        sinonimos: ['causa justa', 'motivo justo'],
        nivel_dificuldade: 2
      },
      'despedimento': {
        categoria: 'direito_trabalho',
        sinonimos: ['demissão', 'exoneração'],
        nivel_dificuldade: 1
      },
      'indemnização': {
        categoria: 'direito_trabalho',
        sinonimos: ['indenização', 'compensação', 'reparação'],
        nivel_dificuldade: 2
      },
      'aviso prévio': {
        categoria: 'direito_trabalho',
        sinonimos: ['pré-aviso', 'notificação prévia'],
        nivel_dificuldade: 1
      },
      
      // Direito de Família
      'regime de bens': {
        categoria: 'direito_familia',
        sinonimos: ['regime matrimonial'],
        nivel_dificuldade: 3
      },
      'comunhão de adquiridos': {
        categoria: 'direito_familia',
        sinonimos: ['comunhão parcial'],
        nivel_dificuldade: 3
      },
      'comunhão geral': {
        categoria: 'direito_familia',
        sinonimos: ['comunhão universal'],
        nivel_dificuldade: 3
      },
      'separação de bens': {
        categoria: 'direito_familia',
        sinonimos: [],
        nivel_dificuldade: 2
      },
      'meação': {
        categoria: 'direito_familia',
        sinonimos: ['partilha'],
        nivel_dificuldade: 2
      },
      'guarda': {
        categoria: 'direito_familia',
        sinonimos: ['custódia'],
        nivel_dificuldade: 1
      },
      
      // Direito Civil/Propriedade
      'usucapião': {
        categoria: 'direito_civil',
        sinonimos: ['prescrição aquisitiva', 'usucapia'],
        nivel_dificuldade: 4
      },
      'posse': {
        categoria: 'direito_civil',
        sinonimos: ['detenção'],
        nivel_dificuldade: 2
      },
      'propriedade': {
        categoria: 'direito_civil',
        sinonimos: ['domínio'],
        nivel_dificuldade: 1
      },
      'boa-fé': {
        categoria: 'direito_civil',
        sinonimos: ['boa fé'],
        nivel_dificuldade: 2
      },
      'má-fé': {
        categoria: 'direito_civil',
        sinonimos: ['má fé'],
        nivel_dificuldade: 2
      },
      
      // Direito Penal
      'dolo': {
        categoria: 'direito_penal',
        sinonimos: ['intenção'],
        nivel_dificuldade: 3
      },
      'culpa': {
        categoria: 'direito_penal',
        sinonimos: ['negligência'],
        nivel_dificuldade: 2
      },
      'prescrição': {
        categoria: 'direito_penal',
        sinonimos: [],
        nivel_dificuldade: 3
      }
    };
  }

  /**
   * Detecta se a pergunta é um pedido de glossário
   * @param {string} pergunta - Pergunta do usuário
   * @param {Object} conversationContext - Contexto da conversa anterior
   * @returns {Object|null} { termo, confianca } ou null
   */
  detectGlossaryRequest(pergunta, conversationContext = null) {
    const perguntaLower = pergunta.toLowerCase().trim();
    
    // Padrões comuns de pedido de glossário
    const patterns = [
      /o que (?:é|significa) ['"]?([^'"?]+)['"]?/i,
      /(?:explique|defina|definição de) ['"]?([^'"?]+)['"]?/i,
      /o que quer dizer ['"]?([^'"?]+)['"]?/i,
      /significado de ['"]?([^'"?]+)['"]?/i,
      /(?:não entendi|não compreendi) (?:o termo |a palavra )?['"]?([^'"?]+)['"]?/i,
      /qual (?:o|a) significado de ['"]?([^'"?]+)['"]?/i
    ];

    for (const pattern of patterns) {
      const match = perguntaLower.match(pattern);
      if (match && match[1]) {
        const termo = match[1].trim();
        
        // Verificar se termo existe no banco ou se apareceu na conversa anterior
        const isKnownTerm = this.isKnownTerm(termo);
        const wasInPreviousResponse = conversationContext?.termos_tecnicos_usados?.includes(termo);
        
        if (isKnownTerm || wasInPreviousResponse) {
          return {
            termo: termo,
            confianca: isKnownTerm ? 0.95 : 0.85,
            fonte: isKnownTerm ? 'banco_termos' : 'conversa_anterior'
          };
        }
      }
    }

    return null;
  }

  /**
   * Verifica se termo é conhecido
   * @param {string} termo - Termo a verificar
   * @returns {boolean}
   */
  isKnownTerm(termo) {
    const termoLower = termo.toLowerCase();
    
    // Busca exata
    if (this.commonTerms[termoLower]) {
      return true;
    }
    
    // Busca em sinônimos
    for (const [key, data] of Object.entries(this.commonTerms)) {
      if (data.sinonimos.some(sin => sin.toLowerCase() === termoLower)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Normaliza termo para busca (encontra termo principal mesmo se usuário usou sinônimo)
   * @param {string} termo - Termo digitado pelo usuário
   * @returns {string} Termo principal
   */
  normalizeTerm(termo) {
    const termoLower = termo.toLowerCase();
    
    // Busca exata
    if (this.commonTerms[termoLower]) {
      return termoLower;
    }
    
    // Busca em sinônimos
    for (const [key, data] of Object.entries(this.commonTerms)) {
      if (data.sinonimos.some(sin => sin.toLowerCase() === termoLower)) {
        return key;
      }
    }
    
    return termoLower;
  }

  /**
   * Extrai termos técnicos de um texto
   * @param {string} texto - Texto para extrair termos
   * @returns {Array} Lista de termos encontrados
   */
  extractTechnicalTerms(texto) {
    const termos = [];
    const textoLower = texto.toLowerCase();
    
    // Buscar termos conhecidos no texto
    for (const termo of Object.keys(this.commonTerms)) {
      if (textoLower.includes(termo)) {
        termos.push(termo);
      }
    }
    
    // Buscar palavras em MAIÚSCULAS (geralmente termos técnicos)
    const palavrasMaiusculas = texto.match(/\b[A-ZÇÃÕ]{3,}(?:\s+[A-ZÇÃÕ]{3,})*\b/g) || [];
    termos.push(...palavrasMaiusculas.map(p => p.toLowerCase()));
    
    return [...new Set(termos)]; // Remover duplicados
  }

  /**
   * Gera explicação completa de um termo
   * @param {string} termo - Termo a explicar
   * @param {Array} relevantChunks - Chunks de leis relevantes (do RAG)
   * @param {Object} conversationContext - Contexto da conversa
   * @returns {Promise<Object>} Explicação estruturada
   */
  async explainTerm(termo, relevantChunks = [], conversationContext = null) {
    // Verificar cache
    if (this.termCache.has(termo)) {
      console.log(`   ✓ Termo "${termo}" encontrado em cache`);
      return this.termCache.get(termo);
    }

    const termoNormalizado = this.normalizeTerm(termo);
    const termData = this.commonTerms[termoNormalizado];
    
    // Preparar contexto das leis
    const leisContext = relevantChunks.length > 0 
      ? relevantChunks
          .map((chunk, i) => `[LEI ${i + 1}] (${chunk.lei})\n${chunk.text}`)
          .join('\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n')
      : 'Nenhum trecho de lei específico encontrado.';

    // Preparar contexto da conversa
    const conversaContext = conversationContext 
      ? `\nCONTEXTO DA CONVERSA ANTERIOR:\nO usuário estava perguntando sobre: ${conversationContext.pergunta}\n`
      : '';

    const systemPrompt = `Você é um Professor de Direito especializado em explicar termos jurídicos de forma clara e acessível.

MISSÃO: Explicar o termo jurídico "${termo}" de forma que qualquer pessoa possa entender.

PRINCÍPIOS:
1. CLAREZA: Use linguagem simples, evite juridiquês
2. EXEMPLOS: Sempre forneça exemplos práticos do dia-a-dia
3. PRECISÃO: Mantenha a definição juridicamente correta
4. CONTEXTUALIZAÇÃO: Use as leis de Moçambique quando disponíveis
5. ESTRUTURA: Organize a explicação de forma didática

ESTRUTURA OBRIGATÓRIA DA RESPOSTA:

1. 💬 DEFINIÇÃO SIMPLES (2-3 frases)
   - Explique como se estivesse conversando com um amigo
   - Use palavras do quotidiano
   - Evite termos técnicos (ou explique-os também)

2. 📜 DEFINIÇÃO LEGAL (se disponível nas leis fornecidas)
   - Cite o artigo e lei específica
   - Transcreva a parte relevante
   - Explique o que a lei quer dizer

3. 💡 EXEMPLOS PRÁTICOS (2-3 exemplos)
   - Situações reais do dia-a-dia
   - Fáceis de entender
   - Relacionados com Moçambique

4. ✅ QUANDO SE APLICA / ⚠️ QUANDO NÃO SE APLICA
   - Casos em que o termo é usado
   - Casos em que NÃO é usado

5. 🔗 TERMOS RELACIONADOS (3-5 termos)
   - Outros termos que o usuário pode querer saber
   - Breve explicação de 1 linha de cada

6. 📚 ONDE APARECE (se disponível)
   - Leis que mencionam este termo
   - Artigos específicos

TOM: Didático, amigável, claro, paciente
FORMATO: Use emojis, seções claras, exemplos concretos`;

    const userPrompt = `${conversaContext}

TERMO A EXPLICAR: "${termo}"
${termData ? `Categoria: ${termData.categoria}` : ''}

TRECHOS DAS LEIS DE MOÇAMBIQUE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${leisContext}

Explique o termo seguindo TODA a estrutura obrigatória acima.
Use exemplos específicos de Moçambique.`;

    try {
      console.log(`\n📖 Gerando explicação para: "${termo}"`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2500
      });

      const explicacao = response.choices[0].message.content;

      const result = {
        termo: termo,
        termo_normalizado: termoNormalizado,
        categoria: termData?.categoria || 'geral',
        nivel_dificuldade: termData?.nivel_dificuldade || 2,
        explicacao: explicacao,
        leis_consultadas: relevantChunks.map(c => c.lei),
        num_leis: relevantChunks.length
      };

      // Armazenar em cache
      this.termCache.set(termo, result);
      this.termCache.set(termoNormalizado, result);

      console.log(`   ✓ Explicação gerada com sucesso`);

      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar explicação:', error);
      throw error;
    }
  }

  /**
   * Sugere explicações para termos detectados em um texto
   * @param {string} texto - Texto com possíveis termos técnicos
   * @returns {Array} Lista de sugestões { termo, confianca }
   */
  suggestExplanations(texto) {
    const termos = this.extractTechnicalTerms(texto);
    
    return termos.map(termo => ({
      termo: termo,
      categoria: this.commonTerms[termo]?.categoria || 'geral',
      nivel_dificuldade: this.commonTerms[termo]?.nivel_dificuldade || 2
    }));
  }

  /**
   * Limpa cache (útil para liberar memória)
   */
  clearCache() {
    this.termCache.clear();
    console.log('✓ Cache de termos limpo');
  }

  /**
   * Estatísticas do glossário
   */
  getStats() {
    return {
      termos_registrados: Object.keys(this.commonTerms).length,
      termos_em_cache: this.termCache.size,
      categorias: [...new Set(Object.values(this.commonTerms).map(t => t.categoria))]
    };
  }
}
