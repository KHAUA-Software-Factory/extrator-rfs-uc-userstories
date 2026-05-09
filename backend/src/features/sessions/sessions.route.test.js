import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { registerSessionsRoute } from './sessions.route.js';

function createSessionsApp({ db, user = { uid: 'admin', email: 'admin@example.com', admin: true } }) {
  const app = express();
  app.use(express.json());
  registerSessionsRoute({
    app,
    adminApp: { firestore: () => db },
    requireFirebaseUser: (req, _res, next) => {
      req.user = user;
      next();
    },
  });
  return app;
}

function sessionDoc(id, data) {
  return { id, data: () => data };
}

describe('sessions route', () => {
  it('lists admin sessions without using a collection group query', async () => {
    const sessionsByUser = {
      alice: [
        sessionDoc('older', {
          title: 'Older session',
          statusText: 'draft',
          updatedAtText: '2026-05-08T10:00:00.000Z',
        }),
      ],
      bob: [
        sessionDoc('newer', {
          title: 'Newer session',
          statusText: 'done',
          updatedAtText: '2026-05-08T11:00:00.000Z',
        }),
      ],
    };
    const collectionGroup = vi.fn(() => {
      throw new Error('collectionGroup should not be used');
    });
    const db = {
      collectionGroup,
      collection: (name) => {
        expect(name).toBe('users');
        return {
          get: async () => ({ docs: Object.keys(sessionsByUser).map((id) => ({ id })) }),
          doc: (uid) => ({
            collection: (collectionName) => {
              expect(collectionName).toBe('sessions');
              return {
                orderBy: (field, direction) => {
                  expect(field).toBe('updatedAtText');
                  expect(direction).toBe('desc');
                  return {
                    get: async () => ({ docs: sessionsByUser[uid] || [] }),
                  };
                },
              };
            },
          }),
        };
      },
    };

    const res = await request(createSessionsApp({ db })).get('/api/admin/sessions');

    expect(res.status).toBe(200);
    expect(collectionGroup).not.toHaveBeenCalled();
    expect(res.body.sessions).toEqual([
      {
        id: 'newer',
        uid: 'bob',
        title: 'Newer session',
        statusText: 'done',
        updatedAtText: '2026-05-08T11:00:00.000Z',
      },
      {
        id: 'older',
        uid: 'alice',
        title: 'Older session',
        statusText: 'draft',
        updatedAtText: '2026-05-08T10:00:00.000Z',
      },
    ]);
  });

  it('creates the parent user document before adding a session', async () => {
    const setUser = vi.fn(async () => {});
    const addSession = vi.fn(async () => ({ id: 'new-session' }));
    const db = {
      collection: (name) => {
        expect(name).toBe('users');
        return {
          doc: (uid) => ({
            set: setUser,
            collection: (collectionName) => {
              expect(uid).toBe('alice');
              expect(collectionName).toBe('sessions');
              return { add: addSession };
            },
          }),
        };
      },
    };

    const res = await request(
      createSessionsApp({
        db,
        user: { uid: 'alice', email: 'alice@example.com', admin: false },
      }),
    ).post('/api/sessions');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'new-session', uid: 'alice' });
    expect(setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'alice',
        email: 'alice@example.com',
        updatedAtText: expect.any(String),
      }),
      { merge: true },
    );
    expect(addSession).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Nova sessão',
        updatedAtText: expect.any(String),
      }),
    );
  });
});
