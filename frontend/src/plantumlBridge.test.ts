import { describe, expect, it } from 'vitest';

import {
  buildDiagramModelFromUseCases,
  diagramModelToPlantuml,
  plantumlToDiagramModel,
  relayoutDiagramModel,
  relayoutDiagramModelWithGraphviz,
} from './plantumlBridge';
import {
  getUseCaseDiagramPdfPageSize,
  renderUseCaseDiagramSvg,
} from './features/analysis/report/model/useCaseDiagramRenderer';

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
    // Layout 360°: UCs ficam empilhadas em grade central; UC001 (1ª) acima de UC002 (2ª) acima de UC003 (3ª).
    expect(pos('UC001').y).toBeLessThan(pos('UC002').y);
    expect(pos('UC002').y).toBeLessThan(pos('UC003').y);

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
    function overlaps(a: { x: number; y: number }, b: { x: number; y: number; id?: string }) {
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
    expect(assoc.every((e) => e.type === 'smoothCurve')).toBe(true);
    expect(rel.every((e) => e.type === 'smoothCurve')).toBe(true);
  });

  it('posiciona atores em lados opostos do sistema (layout 360°)', () => {
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

    const actorNodes = model.nodes.filter((node) => !String(node.id).startsWith('UC'));
    expect(actorNodes).toHaveLength(2);
    const sortedByX = [...actorNodes].sort((a, b) => a.position.x - b.position.x);
    // Com dois atores e UCs centrais, eles devem ficar em lados opostos
    // (um à esquerda do bloco de UCs, outro à direita).
    const ucXs = model.nodes
      .filter((node) => String(node.id).startsWith('UC'))
      .map((node) => node.position.x);
    const minUcX = Math.min(...ucXs);
    const maxUcX = Math.max(...ucXs);
    expect(sortedByX[0]!.position.x).toBeLessThan(minUcX);
    expect(sortedByX[1]!.position.x).toBeGreaterThan(maxUcX);
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

  it('respeita a ordem de execução das UCs ao plotar o diagrama', () => {
    const model = buildDiagramModelFromUseCases(
      [
        {
          id: 'UC001',
          nome: 'Efetuar login',
          ator_principal: 'Cliente',
          objetivo: '',
          relacoes: [],
        },
        {
          id: 'UC002',
          nome: 'Listar pedidos',
          ator_principal: 'Cliente',
          objetivo: '',
          relacoes: [],
        },
        {
          id: 'UC003',
          nome: 'Pagar pedido',
          ator_principal: 'Cliente',
          objetivo: '',
          relacoes: [],
        },
      ],
      'Sistema',
    );

    const pos = (id: string) => model.nodes.find((n) => n.id === id)!.position;
    // No layout de tela, y cresce para baixo: UC001 deve ficar acima de UC002 e UC003.
    expect(pos('UC001').y).toBeLessThan(pos('UC002').y);
    expect(pos('UC002').y).toBeLessThan(pos('UC003').y);

    // PlantUML preserva a sequência das UCs.
    const plantuml = diagramModelToPlantuml(model);
    const ucOrder = ['UC001', 'UC002', 'UC003'].map((id) => plantuml.indexOf(id));
    expect(ucOrder.every((index, i) => i === 0 || index > ucOrder[i - 1]!)).toBe(true);
  });

  it('normaliza arestas antigas (smoothstep/straight) para curvas suaves ao reabrir', () => {
    const input = [
      '@startuml',
      'actor "Cliente" as cliente',
      'rectangle "Sistema" {',
      '  usecase "Consultar pedidos" as UC001',
      '  usecase "Exportar pedidos" as UC002',
      '}',
      'cliente -- UC001',
      'UC002 ..> UC001 : <<include>>',
      '@enduml',
    ].join('\n');

    const model = plantumlToDiagramModel(input);
    expect(model.edges.length).toBe(2);
    expect(model.edges.every((edge) => edge.type === 'smoothCurve')).toBe(true);
    const includeEdge = model.edges.find((edge) => String(edge.label || '').includes('include'));
    expect(includeEdge?.label).toBe('<<include>>');
    expect(includeEdge?.data).toMatchObject({ relationType: 'include' });
  });

  it('renderiza o SVG final com curvas visíveis nos relacionamentos', async () => {
    const model = buildDiagramModelFromUseCases([
      {
        id: 'UC001',
        nome: 'Consultar pedidos',
        ator_principal: 'Cliente',
        objetivo: '',
        relacoes: [],
      },
    ]);

    const { svg } = await renderUseCaseDiagramSvg(model);
    const match = svg.match(/<path d="([^"]+)" fill="none" stroke="#94a3b8"/);
    expect(match?.[1]).toContain(' C ');

    const numbers = match![1].match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const [sx, sy, c1x, c1y, c2x, c2y, tx, ty] = numbers;
    const distanceToLine = (x: number, y: number) =>
      Math.abs((ty! - sy!) * x - (tx! - sx!) * y + tx! * sy! - ty! * sx!) /
      Math.hypot(ty! - sy!, tx! - sx!);

    expect(Math.max(distanceToLine(c1x!, c1y!), distanceToLine(c2x!, c2y!))).toBeGreaterThan(1);
  });

  it('usa Graphviz para espaçar diagramas grandes com muitos include', async () => {
    const useCases = Array.from({ length: 42 }, (_, index) => {
      const id = `UC${String(index + 1).padStart(3, '0')}`;
      return {
        id,
        nome: `Caso de uso ${index + 1}`,
        ator_principal: 'Usuario',
        objetivo: '',
        relacoes:
          index === 0
            ? []
            : [
                {
                  tipo: 'include' as const,
                  destino: `UC${String(Math.max(1, Math.floor((index + 1) / 2))).padStart(3, '0')}`,
                  condicao: '',
                },
              ],
      };
    });
    const model = await relayoutDiagramModelWithGraphviz(
      buildDiagramModelFromUseCases(useCases, 'Sistema'),
    );
    const ucNodes = model.nodes.filter((node) => String(node.id).startsWith('UC'));
    const xs = ucNodes.map((node) => node.position.x);
    const ys = ucNodes.map((node) => node.position.y);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(900);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(900);
    expect(model.edges.every((edge) => edge.type === 'smoothCurve')).toBe(true);
  });

  it('aumenta a pagina do PDF quando o diagrama final e grande', () => {
    const smallPage = getUseCaseDiagramPdfPageSize(600, 360);
    expect(smallPage.width).toBeCloseTo(841.89);
    expect(smallPage.height).toBeCloseTo(595.28);

    const largePage = getUseCaseDiagramPdfPageSize(2600, 1400);
    expect(largePage.width).toBeGreaterThan(841.89);
    expect(largePage.height).toBeGreaterThan(595.28);
    expect(largePage.width).toBeLessThanOrEqual(2383.94);
    expect(largePage.height).toBeLessThanOrEqual(1683.78);
  });
});
