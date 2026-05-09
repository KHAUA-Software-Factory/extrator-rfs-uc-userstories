import { z } from 'zod';

import { RequirementSchema } from '../../schemas/requirements.js';
import { extractRequirementsService } from './extractRequirements.service.js';

export function registerExtractRequirementsRoute({
  app,
  openai,
  requireFirebaseUser,
  env = process.env,
}) {
  const ExtractRequirementsResponseSchema = z.object({
    requisitos_funcionais: z.array(RequirementSchema),
  });

  app.post('/api/extract-requirements', requireFirebaseUser, async (req, res) => {
    if (!openai) return res.status(500).json({ error: 'openai_not_configured' });

    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'missing_text' });

    const model = String(env.OPENAI_MODEL || 'gpt-5.2').trim();

    try {
      const parsed = await extractRequirementsService({ openai, model, text });
      const validated = ExtractRequirementsResponseSchema.parse(parsed);
      return res.json(validated);
    } catch (e) {
      if (String(e?.code || '') === 'openai_empty_output') {
        return res.status(500).json({ error: 'openai_empty_output' });
      }
      return res.status(500).json({ error: 'openai_extract_failed', detail: String(e) });
    }
  });
}
