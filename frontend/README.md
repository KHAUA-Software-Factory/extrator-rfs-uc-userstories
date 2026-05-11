# Extrator de Elementos de Engenharia de Software - Frontend

Aplicacao Vite + React com Firebase Auth, Firestore direto no navegador e chamadas
diretas para a API da OpenAI.

Nao existe mais backend Node neste projeto. Sessoes sao lidas e gravadas com o
SDK cliente do Firestore em `users/{uid}/sessions/{sessionId}`. A geracao com IA
usa `fetch` para `https://api.openai.com/v1/responses`.

## Variaveis de ambiente

Crie um arquivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Configure:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_OPENAI_API_KEY=
VITE_OPENAI_MODEL=gpt-5.2
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
VITE_BASE_PATH=/
```

No GitHub Actions, cadastre a chave da OpenAI como secret
`VITE_OPENAI_API_KEY`. O workflow grava esse valor em `.env.production` antes do
build.

Aviso importante: qualquer variavel `VITE_*` fica embutida no JavaScript final.
Sem backend/proxy, a chave da OpenAI fica exposta para quem abrir o site.

## Firebase

Publique as regras do Firestore em `../firestore.rules`. O app espera:

```text
users/{uid}/sessions/{sessionId}
```

Usuarios autenticados precisam estar cadastrados em `userAccess/{gmail}` com:

```json
{ "email": "nome@gmail.com", "role": "admin" }
```

Niveis:

- `admin`: ve todas as sessoes e insere, edita e remove usuarios.
- `user`: ve apenas as proprias sessoes.

Para criar o primeiro admin sem backend, cadastre manualmente o documento
`userAccess/seu-email@gmail.com` no Firebase Console ou use uma conta com custom
claim `admin=true`.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Validacao

```bash
npm run lint
npm run test
npm run build
```

## Deploy

Os workflows compilam o projeto e enviam `dist/` por FTPS. No monorepo, use
`.github/workflows/deploy-frontend.yml`; quando `frontend/` for a raiz do repo,
use `frontend/.github/workflows/deploy.yml`.

Secrets esperados:

- `HOST`
- `USER`
- `PASS`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_MODEL` (opcional)
- `VITE_OPENAI_BASE_URL` (opcional)
- `VITE_BASE_PATH` (opcional; padrao: `/` para `ms.khaua.com.br`)
