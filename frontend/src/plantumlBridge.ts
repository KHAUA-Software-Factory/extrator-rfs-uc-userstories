import type { CSSProperties } from 'react';
import { MarkerType, type Edge, type Node } from 'reactflow';

import type { UseCase } from './features/analysis/model/types';

export type DiagramModel = {
  systemName: string;
  nodes: Node[];
  edges: Edge[];
};

const ACTOR_WIDTH = 132;
const ACTOR_HEIGHT = 112;
const USE_CASE_WIDTH = 248;
const USE_CASE_HEIGHT = 66;
const UC_TOP_MARGIN = 34;
const INCLUDE_EDGE_COLOR = '#dc2626';
const EXTEND_EDGE_COLOR = '#0f766e';

const actorNodeStyle = {
  width: ACTOR_WIDTH,
  height: ACTOR_HEIGHT,
  border: '0',
  background: 'transparent',
  color: '#1f2937',
  padding: 0,
} satisfies CSSProperties;

const useCaseNodeStyle = {
  width: USE_CASE_WIDTH,
  height: USE_CASE_HEIGHT,
  border: 0,
  background: 'transparent',
  padding: 0,
} satisfies CSSProperties;

const associationEdgeStyle = {
  stroke: '#94a3b8',
  strokeWidth: 1.5,
  opacity: 0.85,
} satisfies CSSProperties;

function relationEdgeStyle(type: 'include' | 'extend') {
  return {
    stroke: type === 'include' ? INCLUDE_EDGE_COLOR : EXTEND_EDGE_COLOR,
    strokeWidth: 2,
    strokeDasharray: '6 5',
    opacity: 0.92,
  } satisfies CSSProperties;
}

const actorRe = /^\s*actor\s+"([^"]+)"\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const rectStartRe = /^\s*rectangle\s+"([^"]+)"\s*\{\s*$/;
const rectEndRe = /^\s*\}\s*$/;
const usecaseRe = /^\s*usecase\s+"([^"]+)"\s+as\s+(UC\d+)\s*$/;
const assocRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+--\s+(UC\d+)\s*$/;
const relRe = /^\s*(UC\d+)\s+\.\.>\s+(UC\d+)\s+:\s+<<\s*(include|extend)\s*>>\s*$/i;

export function plantumlToDiagramModel(plantuml: string): DiagramModel {
  const lines = plantuml.split(/\r?\n/);
  const actorMap = new Map<string, string>();
  const useCaseMap = new Map<string, string>();
  const edges: Edge[] = [];
  let systemName = 'Sistema';

  let inRect = false;
  for (const line of lines) {
    const actorMatch = line.match(actorRe);
    if (actorMatch) {
      actorMap.set(actorMatch[2], actorMatch[1]);
      continue;
    }

    const rectStart = line.match(rectStartRe);
    if (rectStart) {
      systemName = rectStart[1] || systemName;
      inRect = true;
      continue;
    }
    if (inRect && rectEndRe.test(line)) {
      inRect = false;
      continue;
    }
    if (inRect) {
      const ucMatch = line.match(usecaseRe);
      if (ucMatch) {
        useCaseMap.set(ucMatch[2], ucMatch[1]);
      }
      continue;
    }

    const assocMatch = line.match(assocRe);
    if (assocMatch) {
      edges.push(createAssociationEdge(assocMatch[1], assocMatch[2]));
      continue;
    }

    const relMatch = line.match(relRe);
    if (relMatch) {
      edges.push(
        createRelationEdge(
          relMatch[1],
          relMatch[2],
          relMatch[3].toLowerCase() === 'extend' ? 'extend' : 'include',
        ),
      );
    }
  }

  return createDiagramFromMaps(systemName, actorMap, useCaseMap, edges);
}

export function buildDiagramModelFromUseCases(
  useCases: UseCase[],
  systemName = 'Sistema',
): DiagramModel {
  const actorMap = new Map<string, string>();
  const useCaseMap = new Map<string, string>();
  const actorIdByName = new Map<string, string>();
  const useCaseIds = new Set<string>();
  const edges: Edge[] = [];

  useCases.forEach((useCase, index) => {
    const useCaseId = normalizeUseCaseId(useCase.id, index);
    useCaseIds.add(useCaseId);
    useCaseMap.set(useCaseId, cleanLabel(useCase.nome || useCase.objetivo || useCaseId));

    const actorName = cleanLabel(useCase.ator_principal || 'Usuario');
    const actorId = getActorId(actorName, actorIdByName, actorMap);
    edges.push(createAssociationEdge(actorId, useCaseId));
  });

  useCases.forEach((useCase, index) => {
    const sourceId = normalizeUseCaseId(useCase.id, index);
    (useCase.relacoes || []).forEach((relation) => {
      const targetId = String(relation.destino || '').trim();
      if (!useCaseIds.has(targetId) || targetId === sourceId) return;
      edges.push(
        createRelationEdge(sourceId, targetId, relation.tipo === 'extend' ? 'extend' : 'include'),
      );
    });
  });

  return createDiagramFromMaps(systemName, actorMap, useCaseMap, edges);
}

export function diagramModelToPlantuml(model: DiagramModel): string {
  const actorNodes = model.nodes.filter((n) => !String(n.id).startsWith('UC'));
  const ucNodes = model.nodes.filter((n) => String(n.id).startsWith('UC'));

  const labelOf = (n: { id: unknown; data?: unknown }) =>
    String((n.data as { label?: unknown } | undefined)?.label || n.id);

  const actorLines = actorNodes
    .map((n) => {
      const name = labelOf(n);
      return `actor "${escapeQuotes(name)}" as ${n.id}`;
    })
    .sort();

  const ucLines = ucNodes
    .map((n) => {
      const name = labelOf(n);
      return `  usecase "${escapeQuotes(name)}" as ${n.id}`;
    })
    .sort();

  const assocEdges = model.edges
    .filter((e) => getEdgeRelationType(e) === 'association')
    .map((e) => {
      const source = String(e.source);
      const target = String(e.target);
      const sourceIsUseCase = source.startsWith('UC');
      const targetIsUseCase = target.startsWith('UC');

      if (!sourceIsUseCase && targetIsUseCase) return `${source} -- ${target}`;
      if (sourceIsUseCase && !targetIsUseCase) return `${target} -- ${source}`;
      return '';
    })
    .filter(Boolean)
    .sort();

  const relEdges = model.edges
    .filter((e) => getEdgeRelationType(e) !== 'association')
    .map((e) => {
      const source = String(e.source);
      const target = String(e.target);
      if (!source.startsWith('UC') || !target.startsWith('UC')) return '';
      const label = getEdgeRelationType(e) === 'extend' ? '<<extend>>' : '<<include>>';
      return `${source} ..> ${target} : ${label}`;
    })
    .filter(Boolean)
    .sort();

  return [
    '@startuml',
    'left to right direction',
    '',
    ...actorLines,
    '',
    `rectangle "${escapeQuotes(model.systemName || 'Sistema')}" {`,
    ...ucLines,
    '}',
    '',
    ...assocEdges,
    ...relEdges,
    '@enduml',
    '',
  ].join('\n');
}

/**
 * Recalcula posições mantendo ids, labels e arestas. A ordem dos nós no modelo
 * é preservada para que UCs com ordem de execução sigam a sequência na grade.
 */
export function relayoutDiagramModel(model: DiagramModel): DiagramModel {
  const actorMap = new Map<string, string>();
  const useCaseMap = new Map<string, string>();
  const orderedUseCaseIds: string[] = [];
  const orderedActorIds: string[] = [];

  for (const node of model.nodes) {
    const id = String(node.id);
    const label = String((node.data as { label?: unknown } | undefined)?.label || id);
    if (id.startsWith('UC')) {
      useCaseMap.set(id, label);
      orderedUseCaseIds.push(id);
    } else {
      actorMap.set(id, label);
      orderedActorIds.push(id);
    }
  }

  // Agrupa UCs por cadeias de include/extend: UCs relacionadas ficam vizinhas
  // na ordem de plotagem, reduzindo o comprimento e o cruzamento dos
  // relacionamentos no diagrama final.
  const clusteredUseCaseIds = clusterUseCasesByRelations(orderedUseCaseIds, model.edges);

  const positions = computeDiagramPositions(
    actorMap,
    useCaseMap,
    clusteredUseCaseIds,
    orderedActorIds,
  );

  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const next = positions.get(String(node.id));
      if (!next) return node;
      return { ...node, position: next };
    }),
    edges: model.edges.map(normalizeDiagramEdgeVisuals),
  };
}

/**
 * Reordena os UCs de modo que cada cluster conectado por `<<include>>`/`<<extend>>`
 * apareça contiguamente na sequência. UCs sem nenhum relacionamento permanecem
 * na ordem original. Heurística simples (BFS por componente conectado) mas
 * suficiente para encurtar drasticamente as arestas em diagramas grandes.
 */
function clusterUseCasesByRelations(ucIds: string[], edges: Edge[]): string[] {
  if (ucIds.length <= 2) return ucIds;
  const ucSet = new Set(ucIds);
  const adjacency = new Map<string, Set<string>>();
  for (const id of ucIds) adjacency.set(id, new Set());

  for (const edge of edges) {
    const relation = getEdgeRelationType(edge);
    if (relation === 'association') continue;
    const a = String(edge.source);
    const b = String(edge.target);
    if (!ucSet.has(a) || !ucSet.has(b)) continue;
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  const ordered: string[] = [];
  const visited = new Set<string>();
  for (const seed of ucIds) {
    if (visited.has(seed)) continue;
    const queue: string[] = [seed];
    visited.add(seed);
    while (queue.length) {
      const next = queue.shift()!;
      ordered.push(next);
      const neighbors = adjacency.get(next);
      if (!neighbors) continue;
      // Visita vizinhos respeitando a ordem original para manter previsibilidade.
      for (const candidate of ucIds) {
        if (!neighbors.has(candidate) || visited.has(candidate)) continue;
        visited.add(candidate);
        queue.push(candidate);
      }
    }
  }
  return ordered;
}

export async function relayoutDiagramModelWithGraphviz(model: DiagramModel): Promise<DiagramModel> {
  if (model.edges.every((edge) => getEdgeRelationType(edge) === 'association')) {
    return relayoutDiagramModel(model);
  }

  try {
    const { instance } = await import('@viz-js/viz');
    const viz = await instance();
    const json = viz.renderJSON(buildGraphvizLayoutDot(model), { engine: 'dot' }) as GraphvizJson;
    const graphvizPositions = readGraphvizPositions(json);
    if (!graphvizPositions.size) return relayoutDiagramModel(model);

    return {
      ...model,
      nodes: model.nodes.map((node) => {
        const next = graphvizPositions.get(String(node.id));
        if (!next) return node;
        return { ...node, position: next };
      }),
      edges: model.edges.map(normalizeDiagramEdgeVisuals),
    };
  } catch {
    return relayoutDiagramModel(model);
  }
}

function escapeQuotes(value: string): string {
  return value.replaceAll('"', '\\"');
}

/**
 * Layout profissional 360° — espaçoso e adaptativo.
 *
 * Filosofia: legibilidade > compacidade. O diagrama pode ser tão grande quanto
 * necessário; quem está na apresentação dá zoom/pan. Mantemos número de colunas
 * BAIXO (no máximo {@link UC_GRID_MAX_COLS}) e deixamos o diagrama crescer em
 * altura para que cada caso de uso fique bem espaçado e os relacionamentos
 * (`<<include>>`/`<<extend>>`) tenham espaço para curvar sem cruzar tudo.
 *
 * 1. UCs ocupam uma grade levemente "retrato" (mais alta do que larga),
 *    capada em {@link UC_GRID_MAX_COLS} colunas — chega a ser enorme, mas
 *    permanece organizada.
 * 2. Atores são distribuídos pelo perímetro (esquerda, direita, topo, base)
 *    conforme a quantidade — 1 vai à esquerda, 2 ocupam laterais opostas,
 *    3+ se espalham para 360° ao redor da grade central.
 *
 * O resultado é um diagrama com bastante "ar", pronto para apresentação
 * executiva mesmo com dezenas de casos de uso.
 */
const PERIMETER_GAP = 220;
const UC_GRID_COL_GAP = 260;
const UC_GRID_ROW_GAP = 190;
const UC_GRID_ASPECT_TARGET = 0.65;
const UC_GRID_MAX_COLS = 4;
const GRAPHVIZ_POINT_SCALE = 1.26;

type GraphvizJson = {
  bb?: string;
  objects?: Array<{
    name?: string;
    pos?: string;
  }>;
};

function buildGraphvizLayoutDot(model: DiagramModel): string {
  const nodes = model.nodes.filter((node) => !String(node.id).startsWith('__system'));
  const actorIds = nodes.filter((node) => !isUseCaseId(node.id)).map((node) => String(node.id));
  const useCaseIds = nodes.filter((node) => isUseCaseId(node.id)).map((node) => String(node.id));
  const associationTargetsByActor = getAssociationTargetsByActor(model.edges);
  const relationEdges = model.edges.filter((edge) => getEdgeRelationType(edge) !== 'association');

  const lines = [
    'digraph UseCaseDiagram {',
    '  graph [rankdir=LR, margin=0, pad=0.3, nodesep=1.05, ranksep=2.25, splines=curved, overlap=false, concentrate=false, outputorder=edgesfirst, newrank=true];',
    '  node [shape=box, fixedsize=true, margin=0, label="", style=invis];',
    '  edge [style=invis, arrowsize=0.6];',
  ];

  actorIds.forEach((id) => {
    lines.push(
      `  ${dotId(id)} [width=${toGraphvizInches(ACTOR_WIDTH)}, height=${toGraphvizInches(ACTOR_HEIGHT)}];`,
    );
  });

  useCaseIds.forEach((id) => {
    lines.push(
      `  ${dotId(id)} [width=${toGraphvizInches(USE_CASE_WIDTH)}, height=${toGraphvizInches(USE_CASE_HEIGHT)}];`,
    );
  });

  // As relações UC→UC são o esqueleto do layout. Elas recebem peso e rank para
  // que dependências fiquem em colunas próximas e cruzem menos.
  relationEdges.forEach((edge) => {
    const source = String(edge.source);
    const target = String(edge.target);
    if (!isUseCaseId(source) || !isUseCaseId(target)) return;
    const minlen = useCaseIds.length > 24 ? 1 : 2;
    lines.push(
      `  ${dotId(source)} -> ${dotId(target)} [constraint=true, weight=6, minlen=${minlen}];`,
    );
  });

  // Associações com atores não comandam o miolo do grafo; um único vínculo
  // invisível por ator o mantém do lado esquerdo sem criar o "pente" que havia
  // esmagado todos os casos de uso.
  actorIds.forEach((actorId) => {
    const targets = associationTargetsByActor.get(actorId) || [];
    if (!targets.length) return;
    const anchor = pickActorAnchorUseCase(targets, relationEdges, useCaseIds);
    lines.push(`  ${dotId(actorId)} -> ${dotId(anchor)} [constraint=true, weight=12, minlen=1];`);
  });

  if (relationEdges.length === 0) {
    const ordered = clusterUseCasesByRelations(useCaseIds, model.edges);
    for (let index = 1; index < ordered.length; index += 1) {
      lines.push(
        `  ${dotId(ordered[index - 1]!)} -> ${dotId(ordered[index]!)} [constraint=false, weight=0];`,
      );
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function readGraphvizPositions(json: GraphvizJson): Map<string, { x: number; y: number }> {
  const graphHeight = Number(String(json.bb || '').split(',')[3] || 0);
  if (!Number.isFinite(graphHeight) || graphHeight <= 0 || !Array.isArray(json.objects)) {
    return new Map();
  }

  const positions = new Map<string, { x: number; y: number }>();
  json.objects.forEach((object) => {
    if (!object.name || !object.pos) return;
    const [rawX, rawY] = object.pos.split(',').map(Number);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;
    const width = isUseCaseId(object.name) ? USE_CASE_WIDTH : ACTOR_WIDTH;
    const height = isUseCaseId(object.name) ? USE_CASE_HEIGHT : ACTOR_HEIGHT;
    positions.set(object.name, {
      x: rawX * GRAPHVIZ_POINT_SCALE - width / 2,
      y: (graphHeight - rawY) * GRAPHVIZ_POINT_SCALE - height / 2,
    });
  });
  return normalizePositionsToPositiveSpace(positions);
}

function normalizePositionsToPositiveSpace(
  positions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  if (!positions.size) return positions;
  const minX = Math.min(...[...positions.values()].map((pos) => pos.x));
  const minY = Math.min(...[...positions.values()].map((pos) => pos.y));
  const offsetX = UC_TOP_MARGIN - minX;
  const offsetY = UC_TOP_MARGIN - minY;
  return new Map(
    [...positions.entries()].map(([id, pos]) => [
      id,
      {
        x: Math.round(pos.x + offsetX),
        y: Math.round(pos.y + offsetY),
      },
    ]),
  );
}

function getAssociationTargetsByActor(edges: Edge[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (getEdgeRelationType(edge) !== 'association') return;
    const source = String(edge.source);
    const target = String(edge.target);
    const actorId = isUseCaseId(source) ? target : source;
    const useCaseId = isUseCaseId(source) ? source : target;
    if (!isUseCaseId(useCaseId) || isUseCaseId(actorId)) return;
    if (!result.has(actorId)) result.set(actorId, []);
    result.get(actorId)!.push(useCaseId);
  });
  return result;
}

function pickActorAnchorUseCase(
  targets: string[],
  relationEdges: Edge[],
  orderedUseCaseIds: string[],
): string {
  const relationTargets = new Set(relationEdges.map((edge) => String(edge.target)));
  const entry = targets.find((target) => !relationTargets.has(target));
  if (entry) return entry;
  return [...targets].sort(
    (a, b) => orderedUseCaseIds.indexOf(a) - orderedUseCaseIds.indexOf(b),
  )[0]!;
}

function toGraphvizInches(points: number): string {
  return (points / 72).toFixed(3);
}

function dotId(value: string): string {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function pickGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 0, rows: 0 };
  if (count === 1) return { cols: 1, rows: 1 };
  const tileWidth = USE_CASE_WIDTH + UC_GRID_COL_GAP;
  const tileHeight = USE_CASE_HEIGHT + UC_GRID_ROW_GAP;
  const ratio = (UC_GRID_ASPECT_TARGET * tileHeight) / tileWidth;
  const idealCols = Math.max(1, Math.round(Math.sqrt(count * ratio)));
  const cols = Math.min(UC_GRID_MAX_COLS, Math.max(1, idealCols));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function placeActorsOnPerimeter(
  actorIds: string[],
  gridOriginX: number,
  gridOriginY: number,
  gridWidth: number,
  gridHeight: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const total = actorIds.length;
  if (!total) return positions;

  let leftCount = 0;
  let rightCount = 0;
  let topCount = 0;
  let bottomCount = 0;

  if (total === 1) {
    leftCount = 1;
  } else if (total === 2) {
    leftCount = 1;
    rightCount = 1;
  } else if (total === 3) {
    leftCount = 1;
    rightCount = 1;
    topCount = 1;
  } else if (total === 4) {
    leftCount = 1;
    rightCount = 1;
    topCount = 1;
    bottomCount = 1;
  } else {
    // Laterais (esquerda/direita) recebem o maior contingente porque a grade
    // tende a ser mais alta do que larga em termos de “slots” de ator.
    leftCount = Math.ceil(total / 4);
    rightCount = Math.ceil((total - leftCount) / 3);
    topCount = Math.ceil((total - leftCount - rightCount) / 2);
    bottomCount = total - leftCount - rightCount - topCount;
  }

  const spreadAlong = (count: number, span: number, itemSize: number) => {
    if (count === 0) return [] as number[];
    if (count === 1) return [Math.max(0, (span - itemSize) / 2)];
    const usable = Math.max(0, span - itemSize);
    const step = usable / (count - 1);
    return Array.from({ length: count }, (_, i) => i * step);
  };

  let cursor = 0;
  spreadAlong(leftCount, gridHeight, ACTOR_HEIGHT).forEach((dy, i) => {
    positions.set(actorIds[cursor + i]!, {
      x: gridOriginX - PERIMETER_GAP - ACTOR_WIDTH,
      y: gridOriginY + dy,
    });
  });
  cursor += leftCount;

  spreadAlong(rightCount, gridHeight, ACTOR_HEIGHT).forEach((dy, i) => {
    positions.set(actorIds[cursor + i]!, {
      x: gridOriginX + gridWidth + PERIMETER_GAP,
      y: gridOriginY + dy,
    });
  });
  cursor += rightCount;

  spreadAlong(topCount, gridWidth, ACTOR_WIDTH).forEach((dx, i) => {
    positions.set(actorIds[cursor + i]!, {
      x: gridOriginX + dx,
      y: gridOriginY - PERIMETER_GAP - ACTOR_HEIGHT,
    });
  });
  cursor += topCount;

  spreadAlong(bottomCount, gridWidth, ACTOR_WIDTH).forEach((dx, i) => {
    positions.set(actorIds[cursor + i]!, {
      x: gridOriginX + dx,
      y: gridOriginY + gridHeight + PERIMETER_GAP,
    });
  });

  return positions;
}

function computeDiagramPositions(
  actorMap: Map<string, string>,
  useCaseMap: Map<string, string>,
  orderedUseCaseIds?: string[],
  orderedActorIds?: string[],
): Map<string, { x: number; y: number }> {
  const actorIds =
    orderedActorIds && orderedActorIds.length === actorMap.size
      ? orderedActorIds.slice()
      : [...actorMap.keys()];
  const useCaseIds =
    orderedUseCaseIds && orderedUseCaseIds.length === useCaseMap.size
      ? orderedUseCaseIds.slice()
      : [...useCaseMap.keys()].sort();

  // Origem reserva espaço para atores em todas as direções (em torno do bloco central).
  const gridOriginX = ACTOR_WIDTH + PERIMETER_GAP + UC_TOP_MARGIN;
  const gridOriginY = ACTOR_HEIGHT + PERIMETER_GAP + UC_TOP_MARGIN;

  if (!useCaseIds.length) {
    const positions = new Map<string, { x: number; y: number }>();
    const actorStep = actorIds.length > 1 ? ACTOR_HEIGHT + 24 : 0;
    actorIds.forEach((id, idx) => {
      positions.set(id, { x: gridOriginX, y: gridOriginY + idx * actorStep });
    });
    return positions;
  }

  const { cols, rows } = pickGridDimensions(useCaseIds.length);
  const positions = new Map<string, { x: number; y: number }>();
  useCaseIds.forEach((id, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    positions.set(id, {
      x: gridOriginX + col * (USE_CASE_WIDTH + UC_GRID_COL_GAP),
      y: gridOriginY + row * (USE_CASE_HEIGHT + UC_GRID_ROW_GAP),
    });
  });

  const gridWidth = cols * USE_CASE_WIDTH + Math.max(0, cols - 1) * UC_GRID_COL_GAP;
  const gridHeight = rows * USE_CASE_HEIGHT + Math.max(0, rows - 1) * UC_GRID_ROW_GAP;

  const actorPositions = placeActorsOnPerimeter(
    actorIds,
    gridOriginX,
    gridOriginY,
    gridWidth,
    gridHeight,
  );
  actorPositions.forEach((pos, id) => positions.set(id, pos));

  // Atores sem posição (caso o cálculo não distribua) caem na coluna esquerda.
  let stackY = gridOriginY + gridHeight + PERIMETER_GAP;
  for (const id of actorIds) {
    if (positions.has(id)) continue;
    positions.set(id, { x: gridOriginX, y: stackY });
    stackY += ACTOR_HEIGHT + 20;
  }

  return positions;
}

function createDiagramFromMaps(
  systemName: string,
  actorMap: Map<string, string>,
  useCaseMap: Map<string, string>,
  edges: Edge[],
): DiagramModel {
  const nodes: Node[] = [];
  const actorIds = [...actorMap.keys()];
  const useCaseIds = [...useCaseMap.keys()].sort();
  const positions = computeDiagramPositions(actorMap, useCaseMap, useCaseIds, actorIds);

  actorIds.forEach((id) => {
    const pos = positions.get(id) || { x: 24, y: UC_TOP_MARGIN };
    nodes.push({
      id,
      type: 'actor',
      position: pos,
      data: { label: actorMap.get(id) || id },
      className: 'diagram-node diagram-node--actor',
      style: actorNodeStyle,
    });
  });

  useCaseIds.forEach((id) => {
    const pos = positions.get(id) || { x: 300, y: UC_TOP_MARGIN };
    nodes.push({
      id,
      type: 'useCase',
      position: pos,
      data: { label: useCaseMap.get(id) || id },
      className: 'diagram-node diagram-node--usecase',
      style: useCaseNodeStyle,
    });
  });

  return {
    systemName: cleanLabel(systemName || 'Sistema'),
    nodes,
    edges: dedupeEdges(edges).map(normalizeDiagramEdgeVisuals),
  };
}

function createAssociationEdge(source: string, target: string): Edge {
  return {
    id: `assoc:${source}--${target}`,
    source,
    target,
    type: 'smoothCurve',
    label: '',
    data: { relationType: 'association' },
    style: associationEdgeStyle,
  };
}

function createRelationEdge(
  source: string,
  target: string,
  relationType: 'include' | 'extend',
): Edge {
  const color = relationType === 'include' ? INCLUDE_EDGE_COLOR : EXTEND_EDGE_COLOR;
  return {
    id: `rel:${source}..>${target}:${relationType}`,
    source,
    target,
    type: 'smoothCurve',
    label: `<<${relationType}>>`,
    data: { relationType },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    style: relationEdgeStyle(relationType),
  };
}

function normalizeDiagramEdgeVisuals(edge: Edge): Edge {
  const relationType = getEdgeRelationType(edge);
  if (relationType === 'association') {
    const source = String(edge.source);
    const target = String(edge.target);
    const sourceIsUseCase = isUseCaseId(source);
    const targetIsUseCase = isUseCaseId(target);
    const normalizedSource = sourceIsUseCase && !targetIsUseCase ? target : source;
    const normalizedTarget = sourceIsUseCase && !targetIsUseCase ? source : target;

    return {
      ...edge,
      source: normalizedSource,
      target: normalizedTarget,
      type: 'smoothCurve',
      label: '',
      data: { ...(edge.data || {}), relationType },
      labelBgStyle: undefined,
      labelStyle: undefined,
      labelBgPadding: undefined,
      labelBgBorderRadius: undefined,
      markerEnd: undefined,
      style: associationEdgeStyle,
    };
  }

  const color = relationType === 'include' ? INCLUDE_EDGE_COLOR : EXTEND_EDGE_COLOR;
  return {
    ...edge,
    type: 'smoothCurve',
    label: `<<${relationType}>>`,
    data: { ...(edge.data || {}), relationType },
    labelBgStyle: undefined,
    labelStyle: undefined,
    labelBgPadding: undefined,
    labelBgBorderRadius: undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    style: relationEdgeStyle(relationType),
  };
}

function dedupeEdges(edges: Edge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.source}:${edge.target}:${getEdgeRelationType(edge)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getEdgeRelationType(edge: Edge): 'association' | 'include' | 'extend' {
  const dataType = String(
    (edge.data as { relationType?: unknown } | undefined)?.relationType || '',
  );
  if (dataType === 'include' || dataType === 'extend') return dataType;
  const label = String(edge.label || '').toLowerCase();
  if (label.includes('extend')) return 'extend';
  if (label.includes('include')) return 'include';
  return 'association';
}

function isUseCaseId(id: unknown): boolean {
  return String(id).startsWith('UC');
}

function normalizeUseCaseId(id: string, index: number) {
  const trimmed = String(id || '')
    .trim()
    .toUpperCase();
  if (/^UC\d+$/.test(trimmed)) return trimmed;
  const n = index + 1;
  const width = Math.max(3, String(n).length);
  return `UC${String(n).padStart(width, '0')}`;
}

function getActorId(
  actorName: string,
  actorIdByName: Map<string, string>,
  actorMap: Map<string, string>,
) {
  const normalizedName = actorName.toLowerCase();
  const existing = actorIdByName.get(normalizedName);
  if (existing) return existing;

  const base = slugId(actorName, 'ator');
  let candidate = base;
  let suffix = 2;
  while (actorMap.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  actorIdByName.set(normalizedName, candidate);
  actorMap.set(candidate, actorName);
  return candidate;
}

function slugId(value: string, fallback: string) {
  const ascii = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safe = ascii || fallback;
  return /^[a-z_]/.test(safe) ? safe : `${fallback}_${safe}`;
}

function cleanLabel(value: string) {
  return String(value || '').trim() || 'Sem titulo';
}
