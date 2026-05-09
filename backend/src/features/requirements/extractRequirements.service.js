import { openaiJsonSchema } from '../../shared/openaiJsonSchema.js';
import { extractRequirementsPrompt } from '../../../prompts.js';

export async function extractRequirementsService({ openai, model, text }) {
  const systemPrompt = extractRequirementsPrompt();

  return openaiJsonSchema({
    openai,
    model,
    systemPrompt,
    userContent: text,
    schemaSpec: {
      type: 'json_schema',
      name: 'extracao_requisitos_funcionais',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['requisitos_funcionais'],
        properties: {
          requisitos_funcionais: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'descricao', 'ator', 'acao', 'objeto', 'prioridade', 'origem'],
              properties: {
                id: { type: 'string' },
                descricao: { type: 'string' },
                ator: { type: 'string' },
                acao: { type: 'string' },
                objeto: { type: 'string' },
                prioridade: { type: 'string', enum: ['Alta', 'Media', 'Baixa', 'Média'] },
                origem: { type: 'string' },
              },
            },
          },
        },
      },
    },
  });
}
