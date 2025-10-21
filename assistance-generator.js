import OpenAI from 'openai';

/**
 * Gerador de Respostas Assistenciais
 * Cria respostas empáticas com passos práticos para pessoas em situação vulnerável
 */
export class AssistanceGenerator {
  constructor(openaiApiKey) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  /**
   * Gera resposta assistencial completa
   * @param {string} pergunta - Situação do usuário
   * @param {Object} classification - Classificação da intenção
   * @param {Object} facts - Fatos extraídos
   * @param {Array} relevantChunks - Chunks de leis relevantes do RAG
   * @returns {Promise<Object>} Resposta assistencial estruturada
   */
  async generateAssistance(pergunta, classification, facts, relevantChunks) {
    // Preparar contexto das leis
    const leisContext = relevantChunks
      .map((chunk, i) => `[LEI ${i + 1}] (${chunk.lei}, similaridade: ${(chunk.similarity * 100).toFixed(0)}%)\n${chunk.text}`)
      .join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

    // Preparar resumo da situação
    const situacaoResumo = facts ? `
SITUAÇÃO DO UTILIZADOR:
- Problema principal: ${facts.problema_principal}
- Problemas secundários: ${facts.problemas_secundarios.join(', ') || 'nenhum'}
- Vulnerabilidades: ${facts.vulnerabilidades.tem_dependentes ? `${facts.vulnerabilidades.numero_dependentes} dependentes` : 'nenhuma específica'}
- Situação financeira: ${facts.vulnerabilidades.situacao_financeira}
- Urgência: ${classification.urgencia}
- Emoção detectada: ${classification.emocao}
` : '';

    const systemPrompt = `Você é um Assistente Jurídico Empático especializado nas leis de Moçambique.

MISSÃO: Ajudar pessoas em situações vulneráveis, fornecendo assistência jurídica prática e motivadora.

PRINCÍPIOS:
1. SER HUMANO: Reconheça o sofrimento da pessoa, seja empático
2. SER CLARO: Use linguagem simples, evite juridiquês
3. SER PRÁTICO: Forneça passos concretos que a pessoa pode fazer AGORA
4. SER MOTIVADOR: Mostre que há esperança e que a lei protege
5. SER ESPECÍFICO: Cite artigos de lei exatos, calcule valores quando possível
6. SER COMPLETO: Não deixe a pessoa sem saber o que fazer em seguida

ESTRUTURA OBRIGATÓRIA DA RESPOSTA:

1. RECONHECIMENTO EMPÁTICO (2-3 frases)
   - Reconheça a situação difícil
   - Mostre empatia genuína
   - Dê esperança inicial

2. 🛡️ SEUS DIREITOS GARANTIDOS POR LEI
   Para cada direito:
   - Nome do direito (ex: "INDEMNIZAÇÃO POR DESPEDIMENTO")
   - Lei e artigo específico (ex: "Lei do Trabalho 23/2007, Artigo 125")
   - O que a lei garante (linguagem simples)
   - Valor ou benefício específico (se aplicável)
   - Use ✓ para cada item

3. 📋 PASSOS PRÁTICOS - FAÇA AGORA
   Divida em:
   - URGENTE - Próximas 48 horas (com checkboxes ☐)
   - Esta semana (ações importantes)
   - Este mês (se aplicável)
   
   Para cada passo:
   - Seja específico (endereços, telefones, horários)
   - Explique COMO fazer
   - Diga O QUE levar

4. ⚠️ PRAZOS CRÍTICOS
   - Liste todos os prazos legais importantes
   - Use 🚨 para prazos urgentes
   - Calcule quantos dias restam (se possível inferir)
   - Explique consequências de perder prazo

5. 🆘 CONTACTOS ÚTEIS
   - Inspeção do Trabalho / Tribunal / Ordem dos Advogados
   - Assistência social (se situação financeira crítica)
   - Assistência jurídica gratuita
   - Inclua: nome, endereço, telefone, horário

6. 💡 DICAS IMPORTANTES
   - Documentos a guardar
   - O que NÃO fazer
   - Erros comuns a evitar

7. MENSAGEM FINAL MOTIVADORA
   - Reforce que a lei está do lado da pessoa
   - Mencione que muitas pessoas conseguiram justiça
   - Encoraje a não desistir

TOM: Empático, humano, prático, encorajador, profissional
FORMATO: Use emojis, seções claras, listas, destaques
LINGUAGEM: Simples, acessível, sem juridiquês`;

    const userPrompt = `${situacaoResumo}

LEIS RELEVANTES QUE PROTEGEM O UTILIZADOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━
${leisContext}

PERGUNTA/SITUAÇÃO DO UTILIZADOR:
"${pergunta}"

Forneça assistência jurídica completa seguindo TODA a estrutura obrigatória acima.
Use a data atual: 21 de outubro de 2025 para calcular prazos.`;

    try {
      console.log('\n💙 Gerando resposta assistencial...');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7, // Um pouco mais criativo para ser empático
        max_tokens: 3000
      });

      const respostaTexto = response.choices[0].message.content;

      // Estruturar resposta
      return {
        modo: 'assistencia',
        resposta: respostaTexto,
        metadata: {
          classification,
          facts,
          leis_usadas: relevantChunks.map(c => c.lei),
          num_artigos: relevantChunks.length,
          urgencia: classification.urgencia,
          area_legal: classification.area_legal
        }
      };
    } catch (error) {
      console.error('❌ Erro ao gerar assistência:', error);
      throw error;
    }
  }

  /**
   * Gera resposta de consulta técnica (modo objetivo)
   * @param {string} pergunta - Pergunta do usuário
   * @param {Array} relevantChunks - Chunks de leis relevantes
   * @returns {Promise<Object>} Resposta técnica
   */
  async generateConsulta(pergunta, relevantChunks) {
    const leisContext = relevantChunks
      .map((chunk, i) => `[TRECHO ${i + 1}] (${chunk.lei})\n${chunk.text}`)
      .join('\n\n───────\n\n');

    const systemPrompt = `Você é um assistente jurídico especializado nas leis de Moçambique.

Responda perguntas sobre leis de forma:
- OBJETIVA: Vá direto ao ponto
- PRECISA: Cite artigos e leis específicas
- CLARA: Use linguagem acessível
- COMPLETA: Não deixe dúvidas

SEMPRE cite a fonte (Lei e Artigo) ao explicar algo.
Use o contexto fornecido. NÃO invente informações.`;

    const userPrompt = `Com base nas leis de Moçambique abaixo, responda a pergunta do usuário.

LEIS RELEVANTES:
───────────────────────────────
${leisContext}

PERGUNTA:
${pergunta}

Responda de forma clara e objetiva, citando os artigos relevantes.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      return {
        modo: 'consulta',
        resposta: response.choices[0].message.content,
        metadata: {
          leis_usadas: relevantChunks.map(c => c.lei),
          num_artigos: relevantChunks.length
        }
      };
    } catch (error) {
      console.error('❌ Erro ao gerar consulta:', error);
      throw error;
    }
  }
}
