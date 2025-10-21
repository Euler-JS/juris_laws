# API de Consulta de Leis Moçambicanas

Sistema web para consultar leis de Moçambique usando OpenAI GPT.

## Configuração

1. **Instalar dependências:**
```bash
npm install
```

2. **Configurar API Key da OpenAI:**
Edite o arquivo `.env` e adicione sua chave da OpenAI:
```
OPENAI_API_KEY=sua_chave_aqui
PORT=3000
```

## Como usar

1. **Iniciar o servidor:**
```bash
node server.js
```

2. **Abrir no navegador:**
```
http://localhost:3000
```

3. **Fazer perguntas:**
- Selecione uma lei específica ou deixe "Todas as leis"
- Digite sua pergunta sobre a legislação
- Clique em "Consultar Leis"

## Endpoints da API

### GET `/leis`
Lista todas as leis disponíveis.

**Resposta:**
```json
{
  "total": 47,
  "leis": ["lei-da-familia.pdf", "codigo-penal.pdf", ...]
}
```

### POST `/perguntar`
Faz uma pergunta sobre as leis.

**Body:**
```json
{
  "pergunta": "O que diz a lei sobre casamento?",
  "lei": "lei-da-familia.pdf"
}
```

**Resposta:**
```json
{
  "pergunta": "O que diz a lei sobre casamento?",
  "resposta": "De acordo com a Lei da Família...",
  "lei": "lei-da-familia.pdf",
  "modelo": "gpt-4o-mini"
}
```

## Exemplos de Perguntas

- "Qual é a idade mínima para casar em Moçambique?"
- "O que diz a lei sobre divórcio?"
- "Quais são os requisitos para cidadania?"
- "Como funciona a herança segundo a lei?"
- "O que diz o código penal sobre furto?"

## Estrutura do Projeto

```
juris_laws/
├── server.js          # Servidor Express
├── public/
│   └── index.html     # Interface web
├── leis/              # Pasta com PDFs das leis
├── .env               # Configurações (API keys)
└── package.json       # Dependências
```

## Observações

- Os PDFs são carregados em memória no início
- O sistema usa extração de texto básica dos PDFs
- Para melhor performance, considere usar uma biblioteca de PDF mais robusta
- O limite de tokens da OpenAI pode restringir o contexto enviado
