import { describe, expect, it } from 'vitest';

import {
  buildDiagramModelFromUseCases,
  diagramModelToDrawioXml,
  diagramModelToPlantuml,
  plantumlToDiagramModel,
  relayoutDiagramModel,
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

    const pos = (id: string) => model.nodes.find((node) => node.id === id)!.position;
    // Include: UC002 → UC001 coloca o caso incluído à direita (fluxo LTR).
    expect(pos('UC001').x).toBeGreaterThan(pos('UC002').x);
    // Extend: UC003 → UC002 coloca o estendido à direita da base.
    expect(pos('UC002').x).toBeGreaterThan(pos('UC003').x);

    const relayouted = relayoutDiagramModel(model);
    expect(relayouted.nodes.map((node) => node.id)).toEqual(model.nodes.map((node) => node.id));
    expect(relayouted.nodes.find((n) => n.id === 'UC001')!.position.x).toBe(pos('UC001').x);
  });

  it('distributes many use cases across columns and uses curved edges', () => {
    const useCases = Array.from({ length: 36 }, (_, i) => ({
      id: `UC${String(i + 1).padStart(3, '0')}`,
      nome: `Caso ${i + 1}`,
      ator_principal: 'Usuario',
      objetivo: '',
      relacoes: [],
    }));
    const model = buildDiagramModelFromUseCases(useCases, 'Sistema');
    const ucNodes = model.nodes.filter((n) => String(n.id).startsWith('UC'));
    expect(ucNodes).toHaveLength(36);

    const W = 248;
    const H = 66;
    const pad = 4;
    function overlaps(
      a: { x: number; y: number },
      b: { x: number; y: number; id?: string },
    ) {
      return !(
        a.x + W + pad <= b.x ||
        b.x + W + pad <= a.x ||
        a.y + H + pad <= b.y ||
        b.y + H + pad <= a.y
      );
    }
    for (let i = 0; i < ucNodes.length; i += 1) {
      for (let j = i + 1; j < ucNodes.length; j += 1) {
        expect(overlaps(ucNodes[i]!.position, ucNodes[j]!.position)).toBe(false);
      }
    }

    const xs = ucNodes.map((n) => n.position.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(240);

    const assoc = model.edges.filter((e) => !String(e.label || '').includes('<<'));
    const rel = model.edges.filter((e) => String(e.label || '').includes('<<'));
    expect(assoc.length).toBeGreaterThan(0);
    expect(assoc.every((e) => e.type === 'straight')).toBe(true);
    expect(rel.every((e) => e.type === 'default')).toBe(true);
  });

  it('coloca UCs de atores diferentes em faixas horizontais separadas', () => {
    const model = buildDiagramModelFromUseCases(
      [
        {
          id: 'UC001',
          nome: 'Admin A',
          ator_principal: 'Administrador',
          objetivo: '',
          relacoes: [],
        },
        {
          id: 'UC002',
          nome: 'Admin B',
          ator_principal: 'Administrador',
          objetivo: '',
          relacoes: [],
        },
        {
          id: 'UC003',
          nome: 'Usuario C',
          ator_principal: 'Usuario Final',
          objetivo: '',
          relacoes: [],
        },
      ],
      'Sistema',
    );

    const pos = (id: string) => model.nodes.find((n) => n.id === id)!.position;
    expect(pos('UC003').x).toBeGreaterThan(pos('UC001').x);
    expect(pos('UC003').x).toBeGreaterThan(pos('UC002').x);
  });

  it('parses PlantUML with UC ids beyond three digits', () => {
    const input = [
      '@startuml',
      'actor "Admin" as admin',
      'rectangle "Sistema" {',
      '  usecase "Relatorio" as UC100',
      '  usecase "Exportar" as UC120',
      '}',
      'admin -- UC100',
      'UC120 ..> UC100 : <<extend>>',
      '@enduml',
    ].join('\n');

    const model = plantumlToDiagramModel(input);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['UC100', 'UC120', 'admin']);
    expect(model.edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      'UC120->UC100',
      'admin->UC100',
    ]);
  });

  it('lays out 130 use cases without overlaps', () => {
    const useCases = Array.from({ length: 130 }, (_, i) => ({
      id: `UC${String(i + 1).padStart(3, '0')}`,
      nome: `UC ${i + 1}`,
      ator_principal: 'Usuario',
      objetivo: '',
      relacoes: [],
    }));
    const model = buildDiagramModelFromUseCases(useCases, 'Sistema');
    expect(model.nodes.filter((n) => String(n.id).startsWith('UC'))).toHaveLength(130);

    const W = 248;
    const H = 66;
    const pad = 4;
    const ucs = model.nodes.filter((n) => String(n.id).startsWith('UC'));
    for (let i = 0; i < ucs.length; i += 1) {
      for (let j = i + 1; j < ucs.length; j += 1) {
        const a = ucs[i]!.position;
        const b = ucs[j]!.position;
        const overlap = !(
          a.x + W + pad <= b.x ||
          b.x + W + pad <= a.x ||
          a.y + H + pad <= b.y ||
          b.y + H + pad <= a.y
        );
        expect(overlap).toBe(false);
      }
    }
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
