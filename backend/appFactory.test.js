import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './appFactory.js';

describe('backend appFactory', () => {
  it('health returns ok', async () => {
    const app = createApp({
      requireFirebaseUser: (req, _res, next) => next(),
      openai: null,
      adminEmails: new Set(),
      admin: { auth: () => ({ setCustomUserClaims: async () => {} }) },
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('extract-requirements returns openai_not_configured when missing', async () => {
    const app = createApp({
      requireFirebaseUser: (req, _res, next) => {
        req.user = { uid: 'u' };
        next();
      },
      openai: null,
      adminEmails: new Set(),
      admin: { auth: () => ({ setCustomUserClaims: async () => {} }) },
    });

    const res = await request(app)
      .post('/api/extract-requirements')
      .set('Authorization', 'Bearer test')
      .send({ text: 'abc' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('openai_not_configured');
  });
});
