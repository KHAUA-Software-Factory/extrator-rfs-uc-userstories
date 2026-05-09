export function registerEnsureClaimsRoute({
  app,
  adminApp,
  adminEmails,
  requireFirebaseUser,
} = {}) {
  app.post('/api/auth/ensure-claims', requireFirebaseUser, async (req, res) => {
    const decoded = req.user;
    const email = String(decoded.email || '').toLowerCase();
    const shouldBeAdmin = email && adminEmails?.has(email);

    if (!shouldBeAdmin) {
      return res.json({ ok: true, admin: decoded.admin === true });
    }

    if (decoded.admin === true) {
      return res.json({ ok: true, admin: true });
    }

    try {
      await adminApp.auth().setCustomUserClaims(decoded.uid, { admin: true });
      return res.json({ ok: true, admin: true, updated: true });
    } catch (e) {
      return res.status(500).json({ error: 'set_custom_claims_failed', detail: String(e) });
    }
  });
}
