import express from 'express';
import cors from 'cors';

function createApp({ requireFirebaseUser, openai, adminEmails, admin }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/ensure-claims', requireFirebaseUser, async (req, res) => {
    const decoded = req.user;
    const email = String(decoded.email || '').toLowerCase();
    const shouldBeAdmin = email && adminEmails.has(email);

    if (!shouldBeAdmin) {
      return res.json({ ok: true, admin: decoded.admin === true });
    }

    if (decoded.admin === true) {
      return res.json({ ok: true, admin: true });
    }

    try {
      await admin.auth().setCustomUserClaims(decoded.uid, { admin: true });
      return res.json({ ok: true, admin: true, updated: true });
    } catch (e) {
      return res.status(500).json({ error: 'set_custom_claims_failed', detail: String(e) });
    }
  });

  app.post('/api/extract-requirements', requireFirebaseUser, async (req, res) => {
    if (!openai) return res.status(500).json({ error: 'openai_not_configured' });
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'missing_text' });

    try {
      const response = await openai.responses.create();
      const rawText = response.output_text;
      if (!rawText) return res.status(500).json({ error: 'openai_empty_output' });
      return res.json(JSON.parse(rawText));
    } catch (e) {
      return res.status(500).json({ error: 'openai_extract_failed', detail: String(e) });
    }
  });

  return app;
}

export { createApp };
