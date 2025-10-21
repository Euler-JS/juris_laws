import OpenAI from 'openai';

/**
 * Classificador Inteligente
 * Detecta se o usuário quer:
 * - CONSULTA: Informação técnica objetiva sobre leis
 * - ASSISTENCIA: Ajuda com situação pessoal/problema real
 */
export class IntentClassifier {
  constructor(openaiApiKey) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  /**
   * Classifica a intenção do usuário
   * @param {string} pergunta - Pergunta do usuário
   * @returns {Promise<Object>} { modo: 'consulta'|'assistencia', confianca: number, analise: {...} }
   */
  async classify(pergunta) {
    const prompt = `Você é um classificador de intenções para um sistema jurídico de Moçambique.

Analise a pergunta do usuário e determine:

1. MODO (escolha um):
   - "consulta": Usuário quer informação objetiva sobre leis (ex: "O que diz o artigo X?", "Qual a lei sobre Y?")
   - "assistencia": Usuário tem problema pessoal e precisa de ajuda (ex: "Fui despedido...", "Estou sofrendo...", "O que posso fazer?")
   - "glossario": Usuário quer explicação de um termo jurídico (ex: "O que é usucapião?", "O que significa justa causa?", "Explique regime de bens")

2. ÁREA LEGAL (escolha uma ou mais):
   - direito_trabalho
   - direito_familia
   - direito_penal
   - direito_civil
   - direito_propriedade
   - direitos_humanos
   - outro

3. URGÊNCIA (escolha uma):
   - baixa: Pergunta acadêmica ou curiosidade
   - media: Situação que requer atenção
   - alta: Problema urgente, consequências sérias

4. EMOÇÃO DETECTADA (escolha uma):
   - neutra: Tom objetivo
   - preocupacao: Tom de preocupação
   - desespero: Tom de urgência/desespero
   - raiva: Tom de revolta/injustiça
   - confusao: Tom de dúvida/confusão

5. PROBLEMA (se modo = assistencia):
   - Descreva brevemente o problema principal em 1 frase

6. VULNERABILIDADES (se aplicável):
   - Lista de fatores de vulnerabilidade detectados (ex: ["dependentes_menores", "situacao_financeira"])

Responda APENAS em formato JSON válido:
{
  "modo": "consulta" ou "assistencia" ou "glossario",
  "confianca": 0.0-1.0,
  "area_legal": ["..."],
  "urgencia": "baixa|media|alta",
  "emocao": "neutra|preocupacao|desespero|raiva|confusao",
  "problema": "descrição do problema" ou null,
  "vulnerabilidades": ["..."] ou [],
  "termo_glossario": "termo que usuário quer explicação" ou null,
  "reasoning": "breve explicação da classificação"
}

PERGUNTA DO USUÁRIO:
"${pergunta}"`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um classificador especializado em detectar intenções em consultas jurídicas.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Baixa temperatura para respostas consistentes
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      console.log(`\n🎯 Classificação da pergunta:`);
      console.log(`   Modo: ${result.modo.toUpperCase()}`);
      console.log(`   Confiança: ${(result.confianca * 100).toFixed(0)}%`);
      console.log(`   Urgência: ${result.urgencia}`);
      console.log(`   Emoção: ${result.emocao}`);
      if (result.problema) {
        console.log(`   Problema: ${result.problema}`);
      }

      return result;
    } catch (error) {
      console.error('❌ Erro ao classificar pergunta:', error);
      // Fallback: assume consulta se houver erro
      return {
        modo: 'consulta',
        confianca: 0.5,
        area_legal: ['geral'],
        urgencia: 'media',
        emocao: 'neutra',
        problema: null,
        vulnerabilidades: [],
        reasoning: 'Classificação por fallback devido a erro'
      };
    }
  }

  /**
   * Extrai fatos relevantes da situação (para modo assistência)
   * @param {string} pergunta - Situação descrita pelo usuário
   * @param {Object} classification - Resultado da classificação
   * @returns {Promise<Object>} Fatos extraídos estruturados
   */
  async extractFacts(pergunta, classification) {
    if (classification.modo !== 'assistencia') {
      return null;
    }

    const prompt = `Você é um extrator de fatos para casos jurídicos em Moçambique.

Analise a situação descrita e extraia os fatos relevantes de forma estruturada.

SITUAÇÃO:
"${pergunta}"

CONTEXTO DA CLASSIFICAÇÃO:
- Área legal: ${classification.area_legal.join(', ')}
- Problema: ${classification.problema}
- Vulnerabilidades: ${classification.vulnerabilidades.join(', ') || 'nenhuma'}

Extraia e estruture os seguintes fatos (responda em JSON):
{
  "problema_principal": "problema central em 1 frase",
  "problemas_secundarios": ["lista de problemas adicionais"],
  "contexto_temporal": "quando aconteceu (ex: recente, há 3 meses, etc)",
  "partes_envolvidas": {
    "usuario": "descrição do usuário",
    "outra_parte": "descrição da outra parte (empregador, familiar, etc)"
  },
  "vulnerabilidades": {
    "tem_dependentes": true/false,
    "numero_dependentes": número ou null,
    "situacao_financeira": "estavel|vulneravel|critica",
    "outras": ["lista de outras vulnerabilidades"]
  },
  "documentos_mencionados": ["lista de documentos que usuário mencionou ter ou não ter"],
  "acoes_ja_tomadas": ["o que usuário já fez"],
  "perguntas_especificas": ["o que usuário quer saber especificamente"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um extrator de fatos especializado em casos jurídicos.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const facts = JSON.parse(response.choices[0].message.content);
      
      console.log(`\n📋 Fatos extraídos:`);
      console.log(`   Problema: ${facts.problema_principal}`);
      if (facts.vulnerabilidades.tem_dependentes) {
        console.log(`   ⚠️  Tem ${facts.vulnerabilidades.numero_dependentes} dependentes`);
      }

      return facts;
    } catch (error) {
      console.error('❌ Erro ao extrair fatos:', error);
      return null;
    }
  }
}
