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
const HORIZONTAL_GAP = 330;
const VERTICAL_GAP = 104;

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
  strokeWidth: 1.7,
} satisfies CSSProperties;

function relationEdgeStyle(type: 'include' | 'extend') {
  return {
    stroke: type === 'include' ? '#2563eb' : '#7c3aed',
    strokeWidth: 2,
    strokeDasharray: '7 5',
  } satisfies CSSProperties;
}

const actorRe = /^\s*actor\s+"([^"]+)"\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const rectStartRe = /^\s*rectangle\s+"([^"]+)"\s*\{\s*$/;
const rectEndRe = /^\s*\}\s*$/;
const usecaseRe = /^\s*usecase\s+"([^"]+)"\s+as\s+(UC\d{3,})\s*$/;
const assocRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+--\s+(UC\d{3,})\s*$/;
const relRe = /^\s*(UC\d{3,})\s+\.\.>\s+(UC\d{3,})\s+:\s+<<\s*(include|extend)\s*>>\s*$/i;

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

function createDiagramFromMaps(
  systemName: string,
  actorMap: Map<string, string>,
  useCaseMap: Map<string, string>,
  edges: Edge[],
): DiagramModel {
  const nodes: Node[] = [];
  const actorIds = [...actorMap.keys()].sort();
  const useCaseIds = [...useCaseMap.keys()].sort();
  const useCaseColumns = useCaseIds.length > 8 ? 2 : 1;
  const rowsPerColumn = Math.max(1, Math.ceil(useCaseIds.length / useCaseColumns));
  const actorAreaHeight = Math.max((rowsPerColumn - 1) * VERTICAL_GAP, (actorIds.length - 1) * 88);
  const actorStep = actorIds.length > 1 ? actorAreaHeight / (actorIds.length - 1) : 0;

  actorIds.forEach((id, idx) => {
    nodes.push({
      id,
      type: 'input',
      position: { x: 24, y: 56 + idx * actorStep },
      data: { label: actorMap.get(id) || id },
      className: 'diagram-node diagram-node--actor',
      style: actorNodeStyle,
    });
  });

  useCaseIds.forEach((id, idx) => {
    const column = Math.floor(idx / rowsPerColumn);
    const row = idx % rowsPerColumn;
    nodes.push({
      id,
      type: 'default',
      position: { x: 320 + column * HORIZONTAL_GAP, y: 34 + row * VERTICAL_GAP },
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
    type: 'smoothstep',
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
    type: 'smoothstep',
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
  if (/^UC\d{3,}$/.test(trimmed)) return trimmed;
  return `UC${String(index + 1).padStart(3, '0')}`;
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
