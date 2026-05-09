import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/openaiJsonSchema.js', () => ({
  openaiJsonSchema: vi.fn(async (args) => args),
}));

import { openaiJsonSchema } from '../../shared/openaiJsonSchema.js';
import { extractRequirementsService } from './extractRequirements.service.js';

describe('extractRequirementsService', () => {
  it('does not impose hard requirement count limits in the schema or prompt', async () => {
    await extractRequirementsService({
      openai: {},
      model: 'test-model',
      text: 'sistema de reservas',
    });

    const call = openaiJsonSchema.mock.calls[0][0];
    const requirementsArray = call.schemaSpec.schema.properties.requisitos_funcionais;

    expect(requirementsArray.minItems).toBeUndefined();
    expect(requirementsArray.maxItems).toBeUndefined();
    expect(call.systemPrompt).toContain('sem limite minimo ou maximo fixo');
    expect(call.systemPrompt).not.toMatch(/NO MINIMO 12|maximo 40|minItems|maxItems/i);
  });
});
