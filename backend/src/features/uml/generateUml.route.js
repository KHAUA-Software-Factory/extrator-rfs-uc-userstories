import { z } from 'zod';

import { generateUmlPrompt } from '../../../prompts.js';
import { RequirementSchema } from '../../schemas/requirements.js';
import { UseCaseSchema } from '../../schemas/useCases.js';

export function registerGenerateUmlRoute({ app, openai, requireFirebaseUser, env = process.env }) {
  const GenerateUmlResponseSchema = z.object({
    plantuml: z.string(),
  });

  app.post('/api/generate-uml', requireFirebaseUser, async (req, res) => {
    if (!openai) return res.status(500).json({ error: 'openai_not_configured' });

    const requirementsRaw = req.body?.requisitos_funcionais;
    const useCasesRaw = req.body?.casos_de_uso;
    const systemName = String(req.body?.systemName || 'Sistema').trim() || 'Sistema';

    let requirements = null;
    let useCases = null;

    if (useCasesRaw) {
      try {
        useCases = z.array(UseCaseSchema).parse(useCasesRaw);
      } catch (e) {
        return res.status(400).json({ error: 'invalid_use_cases', detail: String(e) });
      }
    } else {
      try {
        requirements = z.array(RequirementSchema).parse(requirementsRaw);
      } catch (e) {
        return res.status(400).json({ error: 'invalid_requirements', detail: String(e) });
      }
    }

    const model = String(env.OPENAI_MODEL || 'gpt-5.2').trim();
    const userPayload = JSON.stringify(
      useCases
        ? { systemName, casos_de_uso: useCases }
        : { systemName, requisitos_funcionais: requirements },
      null,
      2,
    );
    const systemPrompt = generateUmlPrompt();

    try {
      const response = await openai.responses.create({
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPayload },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'geracao_plantuml_usecase',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['plantuml'],
              properties: {
                plantuml: { type: 'string' },
              },
            },
          },
        },
      });

      const rawText = response.output_text;
      if (!rawText) return res.status(500).json({ error: 'openai_empty_output' });

      const parsed = JSON.parse(rawText);
      const validated = GenerateUmlResponseSchema.parse(parsed);

      const plantuml = validated.plantuml.trim();
      if (!plantuml.includes('@startuml') || !plantuml.includes('@enduml')) {
        return res.status(500).json({ error: 'plantuml_invalid', detail: 'missing_start_or_end' });
      }

      return res.json({ plantuml });
    } catch (e) {
      return res.status(500).json({ error: 'openai_generate_uml_failed', detail: String(e) });
    }
  });
}
