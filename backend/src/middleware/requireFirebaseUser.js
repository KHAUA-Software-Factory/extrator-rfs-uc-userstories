export function createRequireFirebaseUser({ adminApp, devBypassEnv = process.env } = {}) {
  return async function requireFirebaseUser(req, res, next) {
    if (String(devBypassEnv.DEV_AUTH_BYPASS || '') === '1') {
      req.user = {
        uid: devBypassEnv.DEV_UID || 'dev',
        email: devBypassEnv.DEV_EMAIL || 'dev@example.com',
        admin: true,
      };
      return next();
    }

    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'missing_bearer_token' });
    }
    if (!adminApp) {
      return res.status(500).json({ error: 'firebase_admin_not_configured' });
    }
    try {
      const decoded = await adminApp.auth().verifyIdToken(match[1]);
      req.user = decoded;
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token', detail: String(e) });
    }
  };
}
