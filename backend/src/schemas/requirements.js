import { z } from 'zod';

export const PrioritySchema = z
  .string()
  .transform((v) => String(v || '').trim())
  .transform((v) => {
    const lower = v.toLowerCase();
    if (lower === 'média' || lower === 'media') return 'Media';
    if (lower === 'alta') return 'Alta';
    if (lower === 'baixa') return 'Baixa';
    return v;
  })
  .refine((v) => v === 'Alta' || v === 'Media' || v === 'Baixa', { message: 'invalid_priority' });

export const RequirementSchema = z.object({
  id: z.string(),
  descricao: z.string(),
  ator: z.string(),
  acao: z.string(),
  objeto: z.string(),
  prioridade: PrioritySchema,
  origem: z.string(),
});
