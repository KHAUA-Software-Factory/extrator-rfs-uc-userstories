import { URL } from 'node:url';

const PRODUCTION_ORIGINS = [
  'https://ms.khaua.com.br',
  'https://khaua.com.br',
  'https://www.khaua.com.br',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

export function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '*') return '*';

  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function getAllowedOrigins(env = process.env) {
  const configuredOrigins = String(env.CORS_ORIGINS || env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
    .filter((origin) => origin !== '*' || env.NODE_ENV !== 'production');

  const origins = configuredOrigins.length
    ? configuredOrigins
    : env.NODE_ENV === 'production'
      ? PRODUCTION_ORIGINS
      : DEVELOPMENT_ORIGINS;

  return new Set(origins.map(normalizeOrigin).filter(Boolean));
}

export function createCorsOptions(env = process.env) {
  const allowedOrigins = getAllowedOrigins(env);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.has('*') || allowedOrigins.has(normalized)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  };
}

export function applySecurityHeaders(app, env = process.env) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );

    if (env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    next();
  });
}

export function jsonErrorHandler(error, req, res, next) {
  void req;

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }

  return next(error);
}
