import { z } from 'zod';

import { generateUserStoriesPrompt } from '../../../prompts.js';
import { UserStorySchema } from '../../schemas/userStories.js';

export function registerGenerateUserStoriesRoute({
  app,
  openai,
  requireFirebaseUser,
  env = process.env,
}) {
  const GenerateUserStoriesResponseSchema = z.object({
    user_stories: z.array(UserStorySchema),
  });

  app.post('/api/generate-user-stories', requireFirebaseUser, async (req, res) => {
    if (!openai) return res.status(500).json({ error: 'openai_not_configured' });

    const plantuml = String(req.body?.plantuml || '').trim();
    if (!plantuml) return res.status(400).json({ error: 'missing_plantuml' });

    const model = String(env.OPENAI_MODEL || 'gpt-5.2').trim();
    const systemPrompt = generateUserStoriesPrompt();

    try {
      const response = await openai.responses.create({
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: plantuml },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'geracao_user_stories',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['user_stories'],
              properties: {
                user_stories: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                      'id',
                      'papel',
                      'quero',
                      'para',
                      'criterios_de_aceitacao',
                      'casos_de_uso_relacionados',
                    ],
                    properties: {
                      id: { type: 'string' },
                      papel: { type: 'string' },
                      quero: { type: 'string' },
                      para: { type: 'string' },
                      criterios_de_aceitacao: { type: 'array', items: { type: 'string' } },
                      casos_de_uso_relacionados: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = response.output_text;
      if (!rawText) return res.status(500).json({ error: 'openai_empty_output' });

      const parsed = JSON.parse(rawText);
      const validated = GenerateUserStoriesResponseSchema.parse(parsed);
      return res.json(validated);
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'openai_generate_user_stories_failed', detail: String(e) });
    }
  });
}
