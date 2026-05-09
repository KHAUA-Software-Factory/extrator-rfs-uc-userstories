import { describe, expect, it } from 'vitest';

import { UseCaseSchema } from './useCases.js';

describe('UseCaseSchema', () => {
  it('accepts editable include and extend relations', () => {
    const parsed = UseCaseSchema.parse({
      id: 'UC001',
      nome: 'Realizar pedido',
      ator_principal: 'Cliente',
      objetivo: 'Permitir que o cliente realize um pedido.',
      relacoes: [
        { tipo: 'include', destino: 'UC002', condicao: '' },
        { tipo: 'extend', destino: 'UC003', condicao: 'quando houver cupom' },
      ],
    });

    expect(parsed.relacoes).toHaveLength(2);
    expect(parsed.relacoes[0].tipo).toBe('include');
    expect(parsed.relacoes[1].tipo).toBe('extend');
  });

  it('keeps old use case records compatible by defaulting relations to an empty list', () => {
    const parsed = UseCaseSchema.parse({
      id: 'UC001',
      nome: 'Realizar pedido',
      ator_principal: 'Cliente',
      objetivo: 'Permitir que o cliente realize um pedido.',
    });

    expect(parsed.relacoes).toEqual([]);
  });
});
