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
```

Em desenvolvimento local, `VITE_API_BASE_URL` pode apontar para `http://localhost:4000`.

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

O workflow em `.github/workflows/deploy.yml` compila o projeto e envia `dist/` por FTP.

Configure estes secrets no repositorio do frontend:

- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `FTP_FRONTEND_DIR`
