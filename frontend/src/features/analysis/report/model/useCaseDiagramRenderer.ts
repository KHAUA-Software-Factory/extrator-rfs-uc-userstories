import { relayoutDiagramModel, type DiagramModel } from '../../../../plantumlBridge';

export type RenderedDiagramSvg = {
  svg: string;
  width: number;
  height: number;
};

export type DiagramImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type DiagramPdfPageSize = {
  width: number;
  height: number;
};

type NodeBox = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isUseCase: boolean;
};

const ACTOR_WIDTH = 132;
const ACTOR_HEIGHT = 112;
const USE_CASE_WIDTH = 248;
const USE_CASE_HEIGHT = 66;
const INCLUDE_EDGE_COLOR = '#dc2626';
const EXTEND_EDGE_COLOR = '#0f766e';
const INCLUDE_LABEL_COLOR = '#b91c1c';
const EXTEND_LABEL_COLOR = '#0f766e';
const ASSOCIATION_COLOR = '#94a3b8';
const PADDING = 56;
const SYSTEM_PADDING = 36;
const MAX_CANVAS_SIDE = 8192;
export const DIAGRAM_PDF_PAGE_MARGIN = 18;
const DIAGRAM_TARGET_SCALE = 0.82;
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const A1_LANDSCAPE = { width: 2383.94, height: 1683.78 };

/**
 * Renderiza o diagrama em SVG usando as próprias posições do modelo
 * (calculadas pelo layout profissional 360° em plantumlBridge.ts).
 * A paleta, o boundary do sistema e os atores em
 * stick figure são desenhados em SVG puro para que a prévia e o PDF
 * fiquem sempre idênticos ao editor.
 */
export async function renderUseCaseDiagramSvg(diagram: DiagramModel): Promise<RenderedDiagramSvg> {
  return buildSvg(diagram);
}

export async function renderUseCaseDiagramImage(diagram: DiagramModel): Promise<DiagramImage> {
  const rendered = await renderUseCaseDiagramSvg(diagram);
  return svgToPng(rendered);
}

export function getUseCaseDiagramPdfPageSize(
  renderedWidth: number,
  renderedHeight: number,
): DiagramPdfPageSize {
  return {
    width: clamp(
      renderedWidth * DIAGRAM_TARGET_SCALE + DIAGRAM_PDF_PAGE_MARGIN * 2,
      A4_LANDSCAPE.width,
      A1_LANDSCAPE.width,
    ),
    height: clamp(
      renderedHeight * DIAGRAM_TARGET_SCALE + DIAGRAM_PDF_PAGE_MARGIN * 2,
      A4_LANDSCAPE.height,
      A1_LANDSCAPE.height,
    ),
  };
}

function buildSvg(diagram: DiagramModel): RenderedDiagramSvg {
  const modelWithPositions = ensurePositions(diagram);
  const boxes = buildNodeBoxes(modelWithPositions);
  if (!boxes.length) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="600" height="360"><rect width="600" height="360" fill="#ffffff"/></svg>`;
    return { svg, width: 600, height: 360 };
  }

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  const offsetX = PADDING - minX;
  const offsetY = PADDING - minY;
  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;
  const shifted = boxes.map((box) => ({ ...box, x: box.x + offsetX, y: box.y + offsetY }));
  const boxById = new Map(shifted.map((box) => [box.id, box]));
  const systemBounds = getSystemBounds(shifted.filter((box) => box.isUseCase));
  const relationEdges = diagram.edges.filter((edge) => getRelationType(edge) !== 'association');
  const relationLabelsVisible = relationEdges.length > 0;
  const hasInclude = relationEdges.some((edge) => getRelationType(edge) === 'include');
  const hasExtend = relationEdges.some((edge) => getRelationType(edge) === 'extend');
  const associationSourceCounts = getAssociationSourceCounts(diagram.edges);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  );
  parts.push(svgDefs());
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

  if (systemBounds) {
    parts.push(
      `<rect class="dgm-system" x="${systemBounds.x}" y="${systemBounds.y}" width="${systemBounds.width}" height="${systemBounds.height}" rx="14" ry="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
    );
    parts.push(
      `<text x="${systemBounds.x + 18}" y="${systemBounds.y + 26}" fill="#475569" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700">${escapeXml(diagram.systemName || 'Sistema')}</text>`,
    );
  }

  const laneInfo = computeEdgeLanes(diagram.edges);

  diagram.edges.forEach((edge) => {
    const source = boxById.get(String(edge.source));
    const target = boxById.get(String(edge.target));
    if (!source || !target) return;
    const relationType = getRelationType(edge);
    const lane = laneInfo.get(String(edge.id)) || { index: 0, count: 1 };
    const bundledAssociation =
      relationType === 'association' &&
      (associationSourceCounts.get(getAssociationActorId(edge)) || 0) >= 4 &&
      source.isUseCase !== target.isUseCase;
    const geometry = bundledAssociation
      ? buildBundledAssociationGeometry(source, target)
      : buildCurveGeometry(source, target, lane.index, lane.count, relationType);
    const stroke =
      relationType === 'include'
        ? INCLUDE_EDGE_COLOR
        : relationType === 'extend'
          ? EXTEND_EDGE_COLOR
          : ASSOCIATION_COLOR;
    const dash = relationType === 'association' ? '' : ' stroke-dasharray="6 5"';
    const marker =
      relationType === 'association' ? '' : ` marker-end="url(#arrow-${relationType})"`;
    const opacity = relationType === 'association' ? (bundledAssociation ? 0.16 : 0.34) : 0.98;
    if (relationType !== 'association') {
      parts.push(
        `<path d="${geometry.path}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>`,
      );
    }
    parts.push(
      `<path d="${geometry.path}" fill="none" stroke="${stroke}" stroke-width="${relationType === 'association' ? 1.1 : 2.6}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${opacity}"${dash}${marker}/>`,
    );
    if (relationType !== 'association' && relationLabelsVisible) {
      const labelColor = relationType === 'include' ? INCLUDE_LABEL_COLOR : EXTEND_LABEL_COLOR;
      const labelText = `<<${relationType}>>`;
      parts.push(edgeLabelMarkup(geometry.labelX, geometry.labelY, labelText, labelColor));
    }
  });

  if (!relationLabelsVisible && relationEdges.length > 0) {
    parts.push(legendMarkup(width, hasInclude, hasExtend));
  }

  shifted.forEach((box) => {
    if (box.isUseCase) {
      parts.push(useCaseMarkup(box));
    } else {
      parts.push(actorMarkup(box));
    }
  });

  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}

function ensurePositions(model: DiagramModel): DiagramModel {
  const hasPositions = model.nodes.some((node) => {
    const x = Number(node.position?.x);
    const y = Number(node.position?.y);
    return (Number.isFinite(x) && x !== 0) || (Number.isFinite(y) && y !== 0);
  });
  if (hasPositions) return model;
  return relayoutDiagramModel(model);
}

function buildNodeBoxes(model: DiagramModel): NodeBox[] {
  return model.nodes
    .filter((node) => {
      const id = String(node.id);
      return !id.startsWith('__system');
    })
    .map((node) => {
      const isUseCase = String(node.id).startsWith('UC');
      return {
        id: String(node.id),
        label: String((node.data as { label?: unknown } | undefined)?.label || node.id),
        x: Number(node.position?.x) || 0,
        y: Number(node.position?.y) || 0,
        width: isUseCase ? USE_CASE_WIDTH : ACTOR_WIDTH,
        height: isUseCase ? USE_CASE_HEIGHT : ACTOR_HEIGHT,
        isUseCase,
      };
    });
}

function getSystemBounds(useCaseBoxes: NodeBox[]) {
  if (!useCaseBoxes.length) return null;
  const minX = Math.min(...useCaseBoxes.map((b) => b.x));
  const minY = Math.min(...useCaseBoxes.map((b) => b.y));
  const maxX = Math.max(...useCaseBoxes.map((b) => b.x + b.width));
  const maxY = Math.max(...useCaseBoxes.map((b) => b.y + b.height));
  return {
    x: minX - SYSTEM_PADDING,
    y: minY - SYSTEM_PADDING - 14,
    width: maxX - minX + SYSTEM_PADDING * 2,
    height: maxY - minY + SYSTEM_PADDING * 2 + 14,
  };
}

function center(box: NodeBox) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function computeEdgeLanes(
  edges: ReadonlyArray<{ id?: unknown; source: unknown; target: unknown }>,
): Map<string, { index: number; count: number }> {
  const groups = new Map<string, Array<{ id: string; target: string }>>();
  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);
    const id = String(edge.id ?? `${source}->${target}`);
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source)!.push({ id, target });
  }
  const result = new Map<string, { index: number; count: number }>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.target.localeCompare(b.target));
    const count = group.length;
    group.forEach((entry, index) => result.set(entry.id, { index, count }));
  }
  return result;
}

function getAssociationSourceCounts(edges: DiagramModel['edges']): Map<string, number> {
  return edges.reduce((counts, edge) => {
    if (getRelationType(edge) !== 'association') return counts;
    const actorId = getAssociationActorId(edge);
    counts.set(actorId, (counts.get(actorId) || 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function getAssociationActorId(edge: DiagramModel['edges'][number]) {
  const source = String(edge.source);
  const target = String(edge.target);
  return source.startsWith('UC') ? target : source;
}

function pickAnchor(source: NodeBox, target: NodeBox) {
  const sc = center(source);
  const tc = center(target);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const sourceX = dx >= 0 ? source.x + source.width : source.x;
    const targetX = dx >= 0 ? target.x : target.x + target.width;
    return {
      sx: sourceX,
      sy: sc.y,
      tx: targetX,
      ty: tc.y,
      sTan: dx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 },
      tTan: dx >= 0 ? { x: -1, y: 0 } : { x: 1, y: 0 },
    };
  }
  const sourceY = dy >= 0 ? source.y + source.height : source.y;
  const targetY = dy >= 0 ? target.y : target.y + target.height;
  return {
    sx: sc.x,
    sy: sourceY,
    tx: tc.x,
    ty: targetY,
    sTan: dy >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 },
    tTan: dy >= 0 ? { x: 0, y: -1 } : { x: 0, y: 1 },
  };
}

function buildCurveGeometry(
  source: NodeBox,
  target: NodeBox,
  laneIndex: number,
  laneCount: number,
  relationType: 'association' | 'include' | 'extend',
) {
  const { sx, sy, tx, ty, sTan, tTan } = pickAnchor(source, target);
  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    return {
      path: `M ${sx} ${sy} L ${tx} ${ty}`,
      labelX: sx,
      labelY: sy,
    };
  }

  const tangentOffset = Math.max(36, Math.min(150, distance * 0.24));
  const lateral = getCurveLateralOffset(distance, laneIndex, laneCount, relationType);
  const perpX = -dy / distance;
  const perpY = dx / distance;

  const c1x = sx + sTan.x * tangentOffset + perpX * lateral;
  const c1y = sy + sTan.y * tangentOffset + perpY * lateral;
  const c2x = tx + tTan.x * tangentOffset + perpX * lateral;
  const c2y = ty + tTan.y * tangentOffset + perpY * lateral;

  return {
    path: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`,
    labelX: (sx + tx) / 2 + perpX * lateral * 0.7,
    labelY: (sy + ty) / 2 + perpY * lateral * 0.7,
  };
}

function buildBundledAssociationGeometry(source: NodeBox, target: NodeBox) {
  const sc = center(source);
  const tc = center(target);
  const direction = tc.x >= sc.x ? 1 : -1;
  const sx = direction >= 0 ? source.x + source.width : source.x;
  const sy = sc.y;
  const tx = direction >= 0 ? target.x : target.x + target.width;
  const ty = tc.y;
  const distance = Math.max(1, Math.abs(tx - sx));
  const trunkX = sx + direction * Math.max(72, Math.min(150, distance * 0.28));
  const turn = Math.max(30, Math.min(82, distance * 0.18));
  const midY = (sy + ty) / 2;

  return {
    path: [
      `M ${sx} ${sy}`,
      `C ${sx + direction * turn} ${sy}, ${trunkX - direction * turn * 0.35} ${sy}, ${trunkX} ${sy}`,
      `C ${trunkX} ${midY}, ${trunkX} ${midY}, ${trunkX} ${ty}`,
      `C ${trunkX + direction * turn * 0.35} ${ty}, ${tx - direction * turn} ${ty}, ${tx} ${ty}`,
    ].join(' '),
    labelX: trunkX,
    labelY: midY,
  };
}

function getCurveLateralOffset(
  distance: number,
  laneIndex: number,
  laneCount: number,
  relationType: 'association' | 'include' | 'extend',
) {
  const spread = Math.max(44, Math.min(150, distance * 0.24));
  const base =
    relationType === 'association'
      ? Math.max(28, Math.min(76, distance * 0.1))
      : Math.max(42, Math.min(104, distance * 0.14));

  if (laneCount <= 1) return base;

  const center = (laneCount - 1) / 2;
  const raw = laneIndex - center;
  if (Math.abs(raw) < 0.001) return base;
  return raw * (spread / Math.max(1, center));
}

function useCaseMarkup(box: NodeBox) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width / 2;
  const ry = box.height / 2;
  const lines = wrapLabel(box.label, 30);
  const startY = cy - (lines.length - 1) * 8;
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : 16;
      return `<tspan x="${cx}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');
  return [
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>`,
    `<text x="${cx}" y="${startY}" text-anchor="middle" fill="#172033" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="650">${tspans}</text>`,
  ].join('');
}

function actorMarkup(box: NodeBox) {
  const cx = box.x + box.width / 2;
  const headY = box.y + 16;
  const bodyTop = box.y + 29;
  const bodyBottom = box.y + 58;
  const armY = box.y + 42;
  const footY = box.y + 84;
  const labelY = box.y + box.height - 18;
  const lines = wrapLabel(box.label, 22).slice(0, 2);
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : 13;
      return `<tspan x="${cx}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');
  const body = [
    `M ${cx} ${bodyTop} L ${cx} ${bodyBottom}`,
    `M ${cx - 22} ${armY} L ${cx + 22} ${armY}`,
    `M ${cx} ${bodyBottom} L ${cx - 18} ${footY}`,
    `M ${cx} ${bodyBottom} L ${cx + 18} ${footY}`,
  ].join(' ');
  return [
    `<circle cx="${cx}" cy="${headY}" r="10" fill="#ffffff" stroke="#334155" stroke-width="3"/>`,
    `<path d="${body}" fill="none" stroke="#334155" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="#172033" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700">${tspans}</text>`,
  ].join('');
}

function edgeLabelMarkup(x: number, y: number, text: string, color: string) {
  const labelWidth = Math.max(48, text.length * 7);
  return [
    `<rect x="${x - labelWidth / 2}" y="${y - 12}" width="${labelWidth}" height="20" rx="10" ry="10" fill="#ffffff" stroke="${color}" stroke-opacity="0.4"/>`,
    `<text x="${x}" y="${y + 2}" text-anchor="middle" fill="${color}" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700">${escapeXml(text)}</text>`,
  ].join('');
}

function svgDefs() {
  return [
    '<defs>',
    `<marker id="arrow-include" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="${INCLUDE_EDGE_COLOR}"/></marker>`,
    `<marker id="arrow-extend" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="${EXTEND_EDGE_COLOR}"/></marker>`,
    '</defs>',
  ].join('');
}

function legendMarkup(width: number, hasInclude: boolean, hasExtend: boolean) {
  const entries = [
    hasInclude ? { color: INCLUDE_EDGE_COLOR, text: 'include' } : null,
    hasExtend ? { color: EXTEND_EDGE_COLOR, text: 'extend' } : null,
  ].filter(Boolean) as Array<{ color: string; text: string }>;
  if (!entries.length) return '';

  const legendWidth = 152;
  const legendHeight = 22 + entries.length * 18;
  const x = Math.max(24, width - legendWidth - 24);
  const y = 18;
  const rows = entries
    .map((entry, index) => {
      const rowY = y + 28 + index * 18;
      return [
        `<path d="M ${x + 12} ${rowY - 4} L ${x + 44} ${rowY - 4}" stroke="${entry.color}" stroke-width="2" stroke-dasharray="6 5"/>`,
        `<text x="${x + 52}" y="${rowY}" fill="#475569" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700">&lt;&lt;${entry.text}&gt;&gt;</text>`,
      ].join('');
    })
    .join('');

  return [
    `<g class="dgm-legend">`,
    `<rect x="${x}" y="${y}" width="${legendWidth}" height="${legendHeight}" rx="8" ry="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>`,
    `<text x="${x + 12}" y="${y + 17}" fill="#64748b" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700">Legenda</text>`,
    rows,
    `</g>`,
  ].join('');
}

function wrapLabel(value: string, maxLineLength: number) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines.slice(0, 3) : ['-'];
}

function getRelationType(edge: DiagramModel['edges'][number]) {
  const dataType = String(
    (edge.data as { relationType?: unknown } | undefined)?.relationType || '',
  );
  if (dataType === 'include' || dataType === 'extend') return dataType;
  const label = String(edge.label || '').toLowerCase();
  if (label.includes('extend')) return 'extend';
  if (label.includes('include')) return 'include';
  return 'association';
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function svgToPng(rendered: RenderedDiagramSvg): Promise<DiagramImage> {
  const preferredScale =
    typeof window === 'undefined' ? 2 : Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
  const rasterScale = Math.min(
    preferredScale,
    MAX_CANVAS_SIDE / rendered.width,
    MAX_CANVAS_SIDE / rendered.height,
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rendered.width * rasterScale));
  canvas.height = Math.max(1, Math.round(rendered.height * rasterScale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const image = await loadSvgImage(rendered.svg);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: rendered.width,
    height: rendered.height,
  };
}

function loadSvgImage(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg_render_failed'));
    };
    image.src = url;
  });
}
