# Extrator de Elementos de Engenharia de Software - Backend

API Node + Express para autenticacao Firebase e chamadas OpenAI do extrator de elementos de engenharia de software.

Este diretorio foi preparado para ser um repositorio independente do frontend.

## Variaveis de ambiente

Crie um arquivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Configure:

```bash
PORT=4000
HOST=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
OPENAI_BASE_URL=https://api.openai.com/v1
FIREBASE_SERVICE_ACCOUNT_FILE=service-account.json
ADMIN_EMAILS=
CORS_ORIGINS=https://ms.khaua.com.br,https://khaua.com.br,https://www.khaua.com.br
JSON_BODY_LIMIT=1mb
```

O arquivo `service-account.json` e qualquer `.env` local ficam ignorados pelo Git.
Em hospedagem, use `FIREBASE_SERVICE_ACCOUNT_JSON` com o JSON inteiro da service account
quando nao quiser subir um arquivo `service-account.json`.

Deixe `HOST` vazio na maioria das hospedagens. Para rodar localmente preso ao loopback, use
`HOST=127.0.0.1`.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Validacao

```bash
npm run lint
npm run test
```

## Firestore

As regras do Firestore ficam em `firestore.rules`.

O backend usa Firebase Admin para ler/gravar sessoes. A service account configurada em
`service-account.json` precisa ter permissao IAM no projeto do Firebase para acessar o
Firestore. No Google Cloud Console, conceda a essa service account pelo menos o papel
`Cloud Datastore User` (`roles/datastore.user`) ou um papel superior equivalente.

## Deploy

Os workflows enviam o backend por FTPS, com a aplicação Node fora de `public_html` e
uma ponte Passenger pública. No monorepo, use `.github/workflows/deploy-backend.yml`;
quando `backend/` for a raiz do repo, use `backend/.github/workflows/deploy.yml`.

Configure estes secrets no repositorio do backend:

- `HOST`
- `USER`
- `PASS`
- `BACKEND_APP_ROOT` (opcional; padrao do workflow para `nodeapps/ms-app`)
- `BACKEND_BASE_URI` (opcional; padrao `/`)
- `BACKEND_NODE_PATH` (opcional; padrao Node 20 do cPanel)
- `CORS_ORIGINS` (opcional; padrao: `https://ms.khaua.com.br,https://khaua.com.br,https://www.khaua.com.br`)
- `JSON_BODY_LIMIT` (opcional; padrao: `1mb`)
