import { z } from 'zod';

import { generateUseCasesPrompt } from '../../../prompts.js';
import { RequirementSchema } from '../../schemas/requirements.js';
import { UseCaseSchema } from '../../schemas/useCases.js';

export function registerGenerateUseCasesRoute({
  app,
  openai,
  requireFirebaseUser,
  env = process.env,
}) {
  const GenerateUseCasesResponseSchema = z.object({
    casos_de_uso: z.array(UseCaseSchema),
  });

  app.post('/api/generate-use-cases', requireFirebaseUser, async (req, res) => {
    if (!openai) return res.status(500).json({ error: 'openai_not_configured' });

    const requirementsRaw = req.body?.requisitos_funcionais;
    let requirements;
    try {
      requirements = z.array(RequirementSchema).parse(requirementsRaw);
    } catch (e) {
      return res.status(400).json({ error: 'invalid_requirements', detail: String(e) });
    }

    const model = String(env.OPENAI_MODEL || 'gpt-5.2').trim();
    const userPayload = JSON.stringify({ requisitos_funcionais: requirements }, null, 2);
    const systemPrompt = generateUseCasesPrompt();

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
            name: 'geracao_casos_de_uso',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['casos_de_uso'],
              properties: {
                casos_de_uso: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'nome', 'ator_principal', 'objetivo', 'relacoes'],
                    properties: {
                      id: { type: 'string' },
                      nome: { type: 'string' },
                      ator_principal: { type: 'string' },
                      objetivo: { type: 'string' },
                      relacoes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['tipo', 'destino', 'condicao'],
                          properties: {
                            tipo: { type: 'string', enum: ['include', 'extend'] },
                            destino: { type: 'string' },
                            condicao: { type: 'string' },
                          },
                        },
                      },
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
      const validated = GenerateUseCasesResponseSchema.parse(parsed);
      return res.json(validated);
    } catch (e) {
      return res.status(500).json({ error: 'openai_generate_use_cases_failed', detail: String(e) });
    }
  });
}
