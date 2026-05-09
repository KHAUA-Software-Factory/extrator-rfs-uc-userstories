import { z } from 'zod';

const SessionSchema = z.object({
  title: z.string(),
  descriptionText: z.string(),
  requirementsText: z.string(),
  useCasesText: z.string(),
  plantumlText: z.string(),
  diagramModelText: z.string(),
  userStoriesText: z.string(),
  statusText: z.string(),
  createdAtText: z.string(),
  updatedAtText: z.string(),
});

const SessionPatchSchema = SessionSchema.omit({
  createdAtText: true,
  updatedAtText: true,
}).partial();

function sessionDefaults() {
  const now = new Date().toISOString();
  return {
    title: 'Nova sessão',
    descriptionText: '',
    requirementsText: '',
    useCasesText: '',
    plantumlText: '',
    diagramModelText: '',
    userStoriesText: '',
    statusText: 'draft',
    createdAtText: now,
    updatedAtText: now,
  };
}

function requireFirestore(adminApp, res) {
  if (!adminApp) {
    res.status(500).json({ error: 'firebase_admin_not_configured' });
    return null;
  }
  return adminApp.firestore();
}

function sessionCollection(db, uid) {
  return db.collection('users').doc(uid).collection('sessions');
}

async function touchUserDocument(db, user, now) {
  await db
    .collection('users')
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        email: String(user.email || ''),
        updatedAtText: now,
      },
      { merge: true },
    );
}

function mapSessionListItem(uid, id, data) {
  return {
    id,
    uid,
    title: String(data.title || ''),
    statusText: String(data.statusText || ''),
    updatedAtText: String(data.updatedAtText || ''),
  };
}

function mapLoadedSession(uid, id, data) {
  return {
    id,
    uid,
    title: String(data.title || ''),
    descriptionText: String(data.descriptionText || ''),
    requirementsText: String(data.requirementsText || ''),
    useCasesText: String(data.useCasesText || ''),
    plantumlText: String(data.plantumlText || ''),
    diagramModelText: String(data.diagramModelText || ''),
    userStoriesText: String(data.userStoriesText || ''),
    statusText: String(data.statusText || ''),
    createdAtText: String(data.createdAtText || ''),
    updatedAtText: String(data.updatedAtText || ''),
  };
}

async function listAdminSessions(db) {
  const usersSnap = await db.collection('users').get();
  const sessionGroups = await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const snap = await sessionCollection(db, userDoc.id).orderBy('updatedAtText', 'desc').get();
      return snap.docs.map((doc) => mapSessionListItem(userDoc.id, doc.id, doc.data()));
    }),
  );

  return sessionGroups
    .flat()
    .sort((left, right) => right.updatedAtText.localeCompare(left.updatedAtText));
}

function isPermissionDenied(error) {
  return String(error?.code || '') === '7' || /PERMISSION_DENIED/i.test(String(error));
}

function sendFirestoreError(res, fallbackError, error) {
  if (isPermissionDenied(error)) {
    return res.status(500).json({
      error: 'firestore_permission_denied',
      detail:
        'Firebase Admin inicializou, mas a service account nao tem permissao IAM para acessar o Firestore.',
    });
  }
  return res.status(500).json({ error: fallbackError, detail: String(error) });
}

export function registerSessionsRoute({ app, adminApp, requireFirebaseUser } = {}) {
  app.get('/api/sessions', requireFirebaseUser, async (req, res) => {
    const db = requireFirestore(adminApp, res);
    if (!db) return;

    try {
      const snap = await sessionCollection(db, req.user.uid).orderBy('updatedAtText', 'desc').get();
      return res.json({
        sessions: snap.docs.map((doc) => mapSessionListItem(req.user.uid, doc.id, doc.data())),
      });
    } catch (e) {
      return sendFirestoreError(res, 'list_sessions_failed', e);
    }
  });

  app.get('/api/admin/sessions', requireFirebaseUser, async (req, res) => {
    if (req.user.admin !== true) return res.status(403).json({ error: 'admin_required' });

    const db = requireFirestore(adminApp, res);
    if (!db) return;

    try {
      const sessions = await listAdminSessions(db);
      return res.json({ sessions });
    } catch (e) {
      return sendFirestoreError(res, 'list_admin_sessions_failed', e);
    }
  });

  app.post('/api/sessions', requireFirebaseUser, async (req, res) => {
    const db = requireFirestore(adminApp, res);
    if (!db) return;

    try {
      const payload = sessionDefaults();
      await touchUserDocument(db, req.user, payload.updatedAtText);
      const docRef = await sessionCollection(db, req.user.uid).add(payload);
      return res.status(201).json({ id: docRef.id, uid: req.user.uid });
    } catch (e) {
      return sendFirestoreError(res, 'create_session_failed', e);
    }
  });

  app.get('/api/sessions/:sessionId', requireFirebaseUser, async (req, res) => {
    const db = requireFirestore(adminApp, res);
    if (!db) return;

    try {
      const snap = await sessionCollection(db, req.user.uid).doc(req.params.sessionId).get();
      if (!snap.exists) return res.status(404).json({ error: 'session_not_found' });
      return res.json(mapLoadedSession(req.user.uid, snap.id, snap.data()));
    } catch (e) {
      return sendFirestoreError(res, 'load_session_failed', e);
    }
  });

  app.patch('/api/sessions/:sessionId', requireFirebaseUser, async (req, res) => {
    const db = requireFirestore(adminApp, res);
    if (!db) return;

    let patch;
    try {
      patch = SessionPatchSchema.parse(req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'invalid_session_patch', detail: String(e) });
    }

    try {
      const ref = sessionCollection(db, req.user.uid).doc(req.params.sessionId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'session_not_found' });
      await ref.update({ ...patch, updatedAtText: new Date().toISOString() });
      return res.json({ ok: true });
    } catch (e) {
      return sendFirestoreError(res, 'update_session_failed', e);
    }
  });
}
