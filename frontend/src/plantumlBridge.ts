import type { CSSProperties } from 'react';
import { MarkerType, type Edge, type Node } from 'reactflow';

import type { UseCase } from './features/analysis/model/types';

export type DiagramModel = {
  systemName: string;
  nodes: Node[];
  edges: Edge[];
};

const ACTOR_WIDTH = 172;
const ACTOR_HEIGHT = 54;
const USE_CASE_WIDTH = 248;
const USE_CASE_HEIGHT = 66;
const VERTICAL_GAP = 104;
const UC_TOP_MARGIN = 34;
const ACTOR_LEFT_X = 24;
/** Espaço horizontal mínimo entre cantos esquerdo de dois UCs na mesma faixa. */
const UC_HORIZONTAL_STRIDE = USE_CASE_WIDTH + 36;
const LAYER_GROUP_GAP = 48;
const ZONE_ACTOR_TO_UC_GAP = 28;
const ZONE_BETWEEN_ACTORS_GAP = 56;
const ZONE_ROW_WRAP_WIDTH = 5200;
const ZONE_ROW_VERTICAL_GAP = 72;
/** Acima disso, abre uma 2ª coluna na mesma faixa (evita listas infinitas, mantém associações curtas). */
const MAX_UC_ROWS_SINGLE_COLUMN = 28;
const OVERLAP_PADDING = 14;

const actorNodeStyle = {
  width: ACTOR_WIDTH,
  minHeight: ACTOR_HEIGHT,
  border: '1px solid #94a3b8',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#1f2937',
  fontWeight: 650,
  padding: '10px 12px',
  textAlign: 'center',
  whiteSpace: 'normal',
} satisfies CSSProperties;

const useCaseNodeStyle = {
  width: USE_CASE_WIDTH,
  minHeight: USE_CASE_HEIGHT,
  border: '2px solid #2563eb',
  borderRadius: 999,
  background: '#ffffff',
  color: '#172033',
  fontWeight: 600,
  padding: '12px 18px',
  textAlign: 'center',
  whiteSpace: 'normal',
} satisfies CSSProperties;

const associationEdgeStyle = {
  stroke: '#64748b',
  strokeWidth: 1.15,
  opacity: 0.38,
} satisfies CSSProperties;

function relationEdgeStyle(type: 'include' | 'extend') {
  return {
    stroke: type === 'include' ? '#2563eb' : '#7c3aed',
    strokeWidth: 1.35,
    strokeDasharray: '7 5',
    opacity: 0.42,
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
 * Recalcula apenas posições (mantém ids, labels, estilos e arestas) usando o mesmo
 * algoritmo de camadas usado na geração inicial — útil após edições manuais no canvas.
 */
export function relayoutDiagramModel(model: DiagramModel): DiagramModel {
  const actorMap = new Map<string, string>();
  const useCaseMap = new Map<string, string>();

  for (const node of model.nodes) {
    const id = String(node.id);
    const label = String((node.data as { label?: unknown } | undefined)?.label || id);
    if (id.startsWith('UC')) useCaseMap.set(id, label);
    else actorMap.set(id, label);
  }

  const positions = computeDiagramPositions(actorMap, useCaseMap, model.edges);

  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const next = positions.get(String(node.id));
      if (!next) return node;
      return { ...node, position: next };
    }),
  };
}

export function diagramModelToDrawioXml(model: DiagramModel): string {
  const nodes = model.nodes.map((node) => {
    const isUseCase = String(node.id).startsWith('UC');
    const geometry = getNodeGeometry(node);
    const style = isUseCase
      ? 'ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#2563eb;strokeWidth=2;fontStyle=1;'
      : 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#94a3b8;fontStyle=1;';

    return [
      `        <mxCell id="${escapeXml(String(node.id))}" value="${escapeXml(getNodeLabel(node))}" style="${style}" vertex="1" parent="1">`,
      `          <mxGeometry x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" as="geometry" />`,
      '        </mxCell>',
    ].join('\n');
  });

  const edges = model.edges.map((edge) => {
    const relationType = getEdgeRelationType(edge);
    const label = relationType === 'association' ? '' : `&lt;&lt;${relationType}&gt;&gt;`;
    const style =
      relationType === 'association'
        ? 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeColor=#64748b;strokeWidth=2;'
        : 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;endArrow=open;strokeColor=#2563eb;strokeWidth=2;';

    return [
      `        <mxCell id="${escapeXml(String(edge.id))}" value="${label}" style="${style}" edge="1" parent="1" source="${escapeXml(String(edge.source))}" target="${escapeXml(String(edge.target))}">`,
      '          <mxGeometry relative="1" as="geometry" />',
      '        </mxCell>',
    ].join('\n');
  });

  return [
    '<mxfile host="app.diagrams.net" type="device">',
    `  <diagram id="software-engineering-extractor-usecase-diagram" name="${escapeXml(model.systemName || 'Diagrama')}">`,
    '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1000" math="0" shadow="0">',
    '      <root>',
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    ...nodes,
    ...edges,
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
    '',
  ].join('\n');
}

function escapeQuotes(value: string): string {
  return value.replaceAll('"', '\\"');
}

/**
 * Camadas em grafos UC→UC (include/extend): o alvo fica à direita do origem,
 * reduzindo cruzamentos e alinhando o fluxo típico LTR do PlantUML.
 */
function computeUseCaseLayers(useCaseIds: string[], edges: Edge[]): Map<string, number> {
  const ucSet = new Set(useCaseIds);
  const layer = new Map<string, number>();
  for (const id of useCaseIds) layer.set(id, 0);

  const maxIter = Math.max(8, useCaseIds.length + 4);
  for (let iter = 0; iter < maxIter; iter += 1) {
    let changed = false;
    for (const edge of edges) {
      if (getEdgeRelationType(edge) === 'association') continue;
      const source = String(edge.source);
      const target = String(edge.target);
      if (!ucSet.has(source) || !ucSet.has(target)) continue;
      const nextLayer = (layer.get(source) ?? 0) + 1;
      if (nextLayer > (layer.get(target) ?? 0)) {
        layer.set(target, nextLayer);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return layer;
}

/**
 * Prioriza **poucas colunas** (idealmente 1) para que associações ator→UC fiquem curtas;
 * só abre mais colunas quando passa de {@link MAX_UC_ROWS_SINGLE_COLUMN} UCs no mesmo bloco.
 */
function computeUseCaseColumnPlan(count: number): { rows: number; subCols: number } {
  if (count <= 0) return { rows: 1, subCols: 1 };
  if (count <= MAX_UC_ROWS_SINGLE_COLUMN) return { rows: count, subCols: 1 };
  const subCols = Math.ceil(count / MAX_UC_ROWS_SINGLE_COLUMN);
  const rows = Math.ceil(count / subCols);
  return { rows, subCols };
}

function inferPrimaryActorForUcs(edges: Edge[], actorIdSet: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (getEdgeRelationType(edge) !== 'association') continue;
    const s = String(edge.source);
    const t = String(edge.target);
    let actor: string | null = null;
    let uc: string | null = null;
    if (actorIdSet.has(s) && t.startsWith('UC')) {
      actor = s;
      uc = t;
    } else if (actorIdSet.has(t) && s.startsWith('UC')) {
      actor = t;
      uc = s;
    }
    if (actor && uc && !map.has(uc)) map.set(uc, actor);
  }
  return map;
}

function actorZoneLayoutFraction(
  useCaseIds: string[],
  inferred: Map<string, string>,
): number {
  if (!useCaseIds.length) return 0;
  let hit = 0;
  for (const id of useCaseIds) {
    if (inferred.has(id)) hit += 1;
  }
  return hit / useCaseIds.length;
}

function nodeBoundingBox(id: string, position: { x: number; y: number }) {
  const w = id.startsWith('UC') ? USE_CASE_WIDTH : ACTOR_WIDTH;
  const h = id.startsWith('UC') ? USE_CASE_HEIGHT : ACTOR_HEIGHT;
  return {
    x: position.x,
    y: position.y,
    w,
    h,
    right: position.x + w,
    bottom: position.y + h,
  };
}

function rectsOverlap(
  a: ReturnType<typeof nodeBoundingBox>,
  b: ReturnType<typeof nodeBoundingBox>,
  pad = 2,
) {
  return !(
    a.right + pad <= b.x ||
    b.right + pad <= a.x ||
    a.bottom + pad <= b.y ||
    b.bottom + pad <= a.y
  );
}

/**
 * Afasta nós que ainda se interceptam após o layout em grade (ex.: labels longas no futuro).
 * Só desloca casos de uso; atores ficam fixos na coluna esquerda.
 */
function hasBoundingOverlap(
  positions: Map<string, { x: number; y: number }>,
  ordered: string[],
): boolean {
  for (let i = 0; i < ordered.length; i += 1) {
    const idA = ordered[i]!;
    const pa = positions.get(idA);
    if (!pa) continue;
    const boxA = nodeBoundingBox(idA, pa);
    for (let j = i + 1; j < ordered.length; j += 1) {
      const idB = ordered[j]!;
      const pb = positions.get(idB);
      if (!pb) continue;
      const boxB = nodeBoundingBox(idB, pb);
      if (rectsOverlap(boxA, boxB, OVERLAP_PADDING)) return true;
    }
  }
  return false;
}

function resolveNodeOverlaps(
  positions: Map<string, { x: number; y: number }>,
  actorIds: string[],
  useCaseIds: string[],
  minUcXClamp: number | null = ACTOR_LEFT_X + ACTOR_WIDTH + 24,
) {
  const actorSet = new Set(actorIds);
  const ordered = [...actorIds, ...useCaseIds];
  const maxIter = Math.min(320, Math.max(72, 24 + Math.ceil(useCaseIds.length * 1.2)));

  for (let iter = 0; iter < maxIter; iter += 1) {
    let changed = false;

    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const idA = ordered[i]!;
        const idB = ordered[j]!;
        const pa = positions.get(idA);
        const pb = positions.get(idB);
        if (!pa || !pb) continue;

        const boxA = nodeBoundingBox(idA, pa);
        const boxB = nodeBoundingBox(idB, pb);
        if (!rectsOverlap(boxA, boxB, OVERLAP_PADDING)) continue;

        const moveActorA = actorSet.has(idA) && !actorSet.has(idB);
        const moveActorB = actorSet.has(idB) && !actorSet.has(idA);
        let moveId =
          moveActorA ? idB : moveActorB ? idA : idA.startsWith('UC') && idB.startsWith('UC')
            ? idA > idB
              ? idA
              : idB
            : idA.startsWith('UC')
              ? idA
              : idB;
        if (actorSet.has(moveId)) {
          moveId = idA > idB ? idA : idB;
        }

        const m = positions.get(moveId)!;
        const bm = nodeBoundingBox(moveId, m);
        const other = moveId === idA ? boxB : boxA;

        const pushDown = Math.max(0, other.bottom - bm.y) + OVERLAP_PADDING;
        const pushRight = Math.max(0, other.right - bm.x) + OVERLAP_PADDING;

        const minUcX = minUcXClamp ?? Number.NEGATIVE_INFINITY;
        if (pushRight <= pushDown + 4 && bm.x + pushRight >= minUcX) {
          m.x += pushRight;
        } else {
          m.y += pushDown;
        }

        if (minUcXClamp !== null && m.x < minUcX) m.x = minUcX;
        changed = true;
      }
    }

    if (!changed) break;
  }
}

function computeLayeredDiagramPositions(
  actorIds: string[],
  useCaseIds: string[],
  layers: Map<string, number>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const byLayer = new Map<number, string[]>();
  for (const id of useCaseIds) {
    const L = layers.get(id) ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L)!.push(id);
  }
  for (const list of byLayer.values()) list.sort();

  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b);
  const UC_START_X = Math.max(ACTOR_LEFT_X + ACTOR_WIDTH + 32, 280);

  const layerLayout = new Map<number, { ids: string[]; subCols: number; rows: number }>();
  let maxRowsInAnyLayer = 1;

  for (const L of layerKeys) {
    const ids = byLayer.get(L) || [];
    if (!ids.length) continue;
    const { rows, subCols } = computeUseCaseColumnPlan(ids.length);
    maxRowsInAnyLayer = Math.max(maxRowsInAnyLayer, rows);
    layerLayout.set(L, { ids, subCols, rows });
  }

  const rowGapUsed = Math.max(
    USE_CASE_HEIGHT + 16,
    Math.min(
      VERTICAL_GAP,
      Math.floor(9000 / Math.max(4, maxRowsInAnyLayer + 3)),
    ),
  );

  let layerCursorX = UC_START_X;
  for (const L of layerKeys) {
    const pack = layerLayout.get(L);
    if (!pack) continue;
    const { ids, subCols, rows } = pack;

    ids.forEach((id, idx) => {
      const subCol = Math.floor(idx / rows);
      const row = idx % rows;
      positions.set(id, {
        x: layerCursorX + subCol * UC_HORIZONTAL_STRIDE,
        y: UC_TOP_MARGIN + row * rowGapUsed,
      });
    });

    layerCursorX += subCols * UC_HORIZONTAL_STRIDE + LAYER_GROUP_GAP;
  }

  const diagramContentHeight =
    (maxRowsInAnyLayer - 1) * rowGapUsed + USE_CASE_HEIGHT;
  const actorTop = UC_TOP_MARGIN;
  const actorBottom = UC_TOP_MARGIN + Math.max(diagramContentHeight - ACTOR_HEIGHT, 0);
  const actorSpan = Math.max(actorBottom - actorTop, 0);
  const actorStep = actorIds.length > 1 ? actorSpan / (actorIds.length - 1) : 0;

  actorIds.forEach((id, idx) => {
    const y =
      actorIds.length === 1
        ? UC_TOP_MARGIN + Math.max(0, (diagramContentHeight - ACTOR_HEIGHT) / 2)
        : actorTop + idx * actorStep;
    positions.set(id, { x: ACTOR_LEFT_X, y });
  });

  return positions;
}

/**
 * Vários atores: cada um com a sua “faixa” (ator + UCs associados), quebra de linha se passar da largura-alvo.
 * Reduz o leque gigante de associações vindas de um único ponto à esquerda.
 */
function computeActorZonePositions(
  actorIds: string[],
  useCaseIds: string[],
  layers: Map<string, number>,
  inferred: Map<string, string>,
): Map<string, { x: number; y: number }> {
  const ORPHAN = '__orphan__';
  const ucByActor = new Map<string, string[]>();
  for (const aid of actorIds) ucByActor.set(aid, []);

  for (const uc of useCaseIds) {
    const a = inferred.get(uc) || ORPHAN;
    if (!ucByActor.has(a)) ucByActor.set(a, []);
    ucByActor.get(a)!.push(uc);
  }

  const orphan = ucByActor.get(ORPHAN);
  if (orphan?.length) {
    ucByActor.delete(ORPHAN);
    const sink = actorIds.reduce((best, id) => {
      const len = ucByActor.get(id)?.length ?? 0;
      const bestLen = ucByActor.get(best)?.length ?? 0;
      return len > bestLen ? id : best;
    }, actorIds[0]!);
    ucByActor.get(sink)!.push(...orphan);
  }

  const sortUc = (a: string, b: string) => {
    const d = (layers.get(a) ?? 0) - (layers.get(b) ?? 0);
    return d !== 0 ? d : a.localeCompare(b);
  };
  for (const list of ucByActor.values()) list.sort(sortUc);

  const actorsWithZones = actorIds
    .filter((id) => (ucByActor.get(id)?.length ?? 0) > 0)
    .sort((a, b) => {
      const d = ucByActor.get(b)!.length - ucByActor.get(a)!.length;
      return d !== 0 ? d : a.localeCompare(b);
    });

  const positions = new Map<string, { x: number; y: number }>();
  let cursorX = ACTOR_LEFT_X;
  let rowYOffset = 0;
  let rowMaxHeight = 0;

  for (const actorId of actorsWithZones) {
    const ids = ucByActor.get(actorId)!;
    const { rows, subCols } = computeUseCaseColumnPlan(ids.length);
    const rowGap = Math.max(
      USE_CASE_HEIGHT + 16,
      Math.min(VERTICAL_GAP, Math.floor(9600 / Math.max(4, rows + 3))),
    );
    const gridH = (rows - 1) * rowGap + USE_CASE_HEIGHT;
    const zoneW = ACTOR_WIDTH + ZONE_ACTOR_TO_UC_GAP + subCols * UC_HORIZONTAL_STRIDE;

    if (cursorX + zoneW > ZONE_ROW_WRAP_WIDTH && cursorX > ACTOR_LEFT_X) {
      rowYOffset += rowMaxHeight + ZONE_ROW_VERTICAL_GAP;
      rowMaxHeight = 0;
      cursorX = ACTOR_LEFT_X;
    }

    const baseY = UC_TOP_MARGIN + rowYOffset;
    const actorY = baseY + Math.max(0, (gridH - ACTOR_HEIGHT) / 2);
    positions.set(actorId, { x: cursorX, y: actorY });

    const ucBaseX = cursorX + ACTOR_WIDTH + ZONE_ACTOR_TO_UC_GAP;

    ids.forEach((id, idx) => {
      const subCol = Math.floor(idx / rows);
      const row = idx % rows;
      positions.set(id, {
        x: ucBaseX + subCol * UC_HORIZONTAL_STRIDE,
        y: baseY + row * rowGap,
      });
    });

    rowMaxHeight = Math.max(rowMaxHeight, gridH);
    cursorX += zoneW + ZONE_BETWEEN_ACTORS_GAP;
  }

  let stackY = UC_TOP_MARGIN + rowYOffset + rowMaxHeight + 48;
  for (const aid of actorIds) {
    if (positions.has(aid)) continue;
    positions.set(aid, { x: ACTOR_LEFT_X, y: stackY });
    stackY += ACTOR_HEIGHT + 20;
  }

  return positions;
}

function computeDiagramPositions(
  actorMap: Map<string, string>,
  useCaseMap: Map<string, string>,
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const actorIds = [...actorMap.keys()].sort();
  const useCaseIds = [...useCaseMap.keys()].sort();

  if (!useCaseIds.length) {
    const positions = new Map<string, { x: number; y: number }>();
    const actorStep = actorIds.length > 1 ? 96 : 0;
    actorIds.forEach((id, idx) => {
      positions.set(id, { x: ACTOR_LEFT_X, y: UC_TOP_MARGIN + idx * actorStep });
    });
    return positions;
  }

  const layers = computeUseCaseLayers(useCaseIds, edges);
  const inferred = inferPrimaryActorForUcs(edges, new Set(actorIds));
  const zoneFraction = actorZoneLayoutFraction(useCaseIds, inferred);

  const actorsWithInferredUcs = new Set(inferred.values());
  const activeActors = actorIds.filter((id) => actorsWithInferredUcs.has(id));
  const useZones =
    actorIds.length >= 2 && zoneFraction >= 0.45 && activeActors.length >= 2;

  if (useZones) {
    const positions = computeActorZonePositions(actorIds, useCaseIds, layers, inferred);
    const ordered = [...actorIds, ...useCaseIds];
    if (hasBoundingOverlap(positions, ordered)) {
      resolveNodeOverlaps(positions, actorIds, useCaseIds, null);
    }
    return positions;
  }

  const positions = computeLayeredDiagramPositions(actorIds, useCaseIds, layers);
  if (hasBoundingOverlap(positions, [...actorIds, ...useCaseIds])) {
    resolveNodeOverlaps(positions, actorIds, useCaseIds);
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
  const actorIds = [...actorMap.keys()].sort();
  const useCaseIds = [...useCaseMap.keys()].sort();
  const positions = computeDiagramPositions(actorMap, useCaseMap, edges);

  actorIds.forEach((id) => {
    const pos = positions.get(id) || { x: ACTOR_LEFT_X, y: UC_TOP_MARGIN };
    nodes.push({
      id,
      type: 'input',
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
      type: 'default',
      position: pos,
      data: { label: useCaseMap.get(id) || id },
      className: 'diagram-node diagram-node--usecase',
      style: useCaseNodeStyle,
    });
  });

  return {
    systemName: cleanLabel(systemName || 'Sistema'),
    nodes,
    edges: dedupeEdges(edges),
  };
}

function createAssociationEdge(source: string, target: string): Edge {
  return {
    id: `assoc:${source}--${target}`,
    source,
    target,
    type: 'straight',
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
  return {
    id: `rel:${source}..>${target}:${relationType}`,
    source,
    target,
    type: 'default',
    pathOptions: { curvature: 0.22 },
    label: `<<${relationType}>>`,
    data: { relationType },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
    labelStyle: {
      fill: relationType === 'include' ? '#1d4ed8' : '#6d28d9',
      fontWeight: 700,
    },
    markerEnd: { type: MarkerType.ArrowClosed },
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

function getNodeLabel(node: Node) {
  return String((node.data as { label?: unknown } | undefined)?.label || node.id);
}

function getNodeGeometry(node: Node) {
  const isUseCase = String(node.id).startsWith('UC');
  const width = isUseCase ? USE_CASE_WIDTH : ACTOR_WIDTH;
  const height = isUseCase ? USE_CASE_HEIGHT : ACTOR_HEIGHT;
  return {
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    width,
    height,
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
