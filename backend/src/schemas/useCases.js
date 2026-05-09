import { z } from 'zod';

export const UseCaseRelationSchema = z.object({
  tipo: z.enum(['include', 'extend']),
  destino: z.string(),
  condicao: z.string().optional().default(''),
});

export const UseCaseSchema = z.object({
  id: z.string(),
  nome: z.string(),
  ator_principal: z.string(),
  objetivo: z.string(),
  relacoes: z.array(UseCaseRelationSchema).optional().default([]),
});
