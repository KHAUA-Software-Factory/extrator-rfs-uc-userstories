import { describe, expect, it } from 'vitest';

import {
  buildDiagramModelFromUseCases,
  diagramModelToDrawioXml,
  diagramModelToPlantuml,
  plantumlToDiagramModel,
} from './plantumlBridge';

describe('plantumlBridge', () => {
  it('parses minimal PlantUML and round-trips', () => {
    const input = [
      '@startuml',
      'left to right direction',
      '',
      'actor "Cliente" as cliente',
      '',
      'rectangle "Sistema" {',
      '  usecase "Consultar pedidos" as UC001',
      '}',
      '',
      'cliente -- UC001',
      '@enduml',
      '',
    ].join('\n');

    const model = plantumlToDiagramModel(input);
    expect(model.systemName).toBe('Sistema');
    expect(model.nodes.length).toBe(2);
    expect(model.edges.length).toBe(1);

    const output = diagramModelToPlantuml(model);
    expect(output).toContain('@startuml');
    expect(output).toContain('@enduml');
    expect(output).toContain('actor "Cliente" as cliente');
    expect(output).toContain('usecase "Consultar pedidos" as UC001');
    expect(output).toContain('cliente -- UC001');
  });

  it('builds a diagram from use cases preserving include and extend relations', () => {
    const model = buildDiagramModelFromUseCases([
      {
        id: 'UC001',
        nome: 'Efetuar login',
        ator_principal: 'Cliente',
        objetivo: 'Acessar a conta',
        relacoes: [],
      },
      {
        id: 'UC002',
        nome: 'Consultar pedidos',
        ator_principal: 'Cliente',
        objetivo: 'Consultar pedidos feitos',
        relacoes: [{ tipo: 'include', destino: 'UC001', condicao: '' }],
      },
      {
        id: 'UC003',
        nome: 'Exportar pedidos',
        ator_principal: 'Cliente',
        objetivo: 'Exportar pedidos',
        relacoes: [{ tipo: 'extend', destino: 'UC002', condicao: 'quando solicitado' }],
      },
    ]);

    const plantuml = diagramModelToPlantuml(model);

    expect(model.nodes.map((node) => node.id)).toEqual(['cliente', 'UC001', 'UC002', 'UC003']);
    expect(plantuml).toContain('UC002 ..> UC001 : <<include>>');
    expect(plantuml).toContain('UC003 ..> UC002 : <<extend>>');
  });

  it('exports diagrams.net XML', () => {
    const model = buildDiagramModelFromUseCases([
      {
        id: 'UC001',
        nome: 'Efetuar login',
        ator_principal: 'Cliente',
        objetivo: 'Acessar a conta',
        relacoes: [],
      },
    ]);

    const xml = diagramModelToDrawioXml(model);

    expect(xml).toContain('<mxfile');
    expect(xml).toContain('UC001');
    expect(xml).toContain('Efetuar login');
  });
});
