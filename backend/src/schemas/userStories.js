import { z } from 'zod';

export const UserStorySchema = z.object({
  id: z.string(),
  papel: z.string(),
  quero: z.string(),
  para: z.string(),
  criterios_de_aceitacao: z.array(z.string()),
  casos_de_uso_relacionados: z.array(z.string()),
});
