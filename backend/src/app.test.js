import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('app security', () => {
  it('allows only configured CORS origins in production', async () => {
    const app = createApp({
      env: {
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://ms.khaua.com.br',
      },
    });

    const allowed = await request(app)
      .options('/api/extract-requirements')
      .set('Origin', 'https://ms.khaua.com.br')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://ms.khaua.com.br');

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets API security headers', async () => {
    const app = createApp({ env: { NODE_ENV: 'production' } });

    const res = await request(app).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('rejects JSON bodies above the configured limit', async () => {
    const app = createApp({
      env: {
        JSON_BODY_LIMIT: '10b',
      },
    });

    const res = await request(app).post('/api/extract-requirements').send({ text: 'long body' });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });
});
