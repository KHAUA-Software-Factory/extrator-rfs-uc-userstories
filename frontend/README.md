# Extrator de Elementos de Engenharia de Software - Frontend

Interface Vite + React para o fluxo de engenharia de requisitos com IA.

Este diretorio foi preparado para ser um repositorio independente do backend.

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
VITE_API_BASE_URL=https://api.seu-dominio.com
VITE_BASE_PATH=/
```

Em desenvolvimento local, `VITE_API_BASE_URL` pode apontar para `http://localhost:4000`.
Para publicar em um subdomínio cujo document root já é a pasta do app, use
`VITE_BASE_PATH=/`. Use `/ms/` apenas se o frontend for acessado por um caminho como
`https://khaua.com.br/ms/`.

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
`.github/workflows/deploy-frontend.yml`; quando `frontend/` for a raiz do repo, use
`frontend/.github/workflows/deploy.yml`.

Configure estes secrets no repositorio do frontend:

- `HOST`
- `USER`
- `PASS`
- `VITE_API_BASE_URL` (opcional; padrao: `https://ms-app.khaua.com.br`)
- `VITE_BASE_PATH` (opcional; padrao: `/`)
