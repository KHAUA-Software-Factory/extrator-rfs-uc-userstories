import type { DiagramModel } from '../../../../plantumlBridge';
import type { FunctionalRequirement, UseCase, UserStory } from '../../model/types';

type ExportAnalysisPdfInput = {
  title: string;
  statusLabel: string;
  descriptionText: string;
  requirements: FunctionalRequirement[];
  useCases: UseCase[];
  diagram: DiagramModel | null;
  userStories: UserStory[];
  filename: string;
};

type PdfBox = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isUseCase: boolean;
};

const PAGE_MARGIN = 42;
const LINE_HEIGHT = 13;
const HEADER_FILL = '#eef2f7';
const BORDER_COLOR = '#cbd5e1';
const TEXT_COLOR = '#172033';
const MUTED_COLOR = '#475569';

export async function exportAnalysisPdf(input: ExportAnalysisPdfInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  function ensureSpace(height: number) {
    if (y + height <= pageHeight - PAGE_MARGIN) return;
    doc.addPage();
    y = PAGE_MARGIN;
  }

  function text(value: unknown) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function addTitle() {
    doc.setProperties({
      title: input.title || 'Analise de requisitos',
      subject: 'Relatorio de engenharia de software',
      creator: 'Extrator de Engenharia de Software',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(TEXT_COLOR);
    const titleLines = doc.splitTextToSize(text(input.title || 'Analise de requisitos'), contentWidth);
    doc.text(titleLines, PAGE_MARGIN, y);
    y += titleLines.length * 18 + 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(MUTED_COLOR);
    doc.text(`Status: ${text(input.statusLabel)}`, PAGE_MARGIN, y);
    y += 13;
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, PAGE_MARGIN, y);
    y += 20;

    doc.setDrawColor(TEXT_COLOR);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    y += 18;
  }

  function addSection(title: string) {
    ensureSpace(34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(TEXT_COLOR);
    doc.text(title, PAGE_MARGIN, y);
    y += 17;
  }

  function addParagraph(title: string, value: string) {
    addSection(title);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_COLOR);
    const lines = doc.splitTextToSize(text(value) || 'Sem descricao registrada.', contentWidth);
    lines.forEach((line: string) => {
      ensureSpace(LINE_HEIGHT);
      doc.text(line, PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    });
    y += 8;
  }

  function drawTable(headers: string[], rows: string[][], widths: number[]) {
    const headerHeight = 23;
    const cellPadding = 5;

    function drawHeader() {
      ensureSpace(headerHeight);
      let x = PAGE_MARGIN;
      doc.setFillColor(HEADER_FILL);
      doc.setDrawColor(BORDER_COLOR);
      doc.setTextColor(TEXT_COLOR);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      headers.forEach((header, index) => {
        doc.rect(x, y, widths[index], headerHeight, 'FD');
        doc.text(text(header), x + cellPadding, y + 15);
        x += widths[index];
      });
      y += headerHeight;
    }

    drawHeader();

    if (!rows.length) {
      rows = [['-']];
      widths = [contentWidth];
    }

    rows.forEach((row) => {
      const splitCells = row.map((cell, index) => {
        const lines = doc.splitTextToSize(text(cell) || '-', widths[index] - cellPadding * 2);
        return lines.slice(0, 8);
      });
      const rowHeight =
        Math.max(...splitCells.map((lines: string[]) => lines.length || 1)) * LINE_HEIGHT +
        cellPadding * 2;

      if (y + rowHeight > pageHeight - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
        drawHeader();
      }

      let x = PAGE_MARGIN;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(TEXT_COLOR);
      doc.setDrawColor(BORDER_COLOR);

      splitCells.forEach((lines: string[], index: number) => {
        doc.rect(x, y, widths[index], rowHeight);
        doc.text(lines.length ? lines : ['-'], x + cellPadding, y + cellPadding + 8);
        x += widths[index];
      });
      y += rowHeight;
    });

    y += 12;
  }

  addTitle();
  addParagraph('Descricao inicial', input.descriptionText);

  addSection('Requisitos funcionais');
  drawTable(
    ['ID', 'Descricao', 'Ator', 'Prioridade'],
    input.requirements.map((requirement) => [
      requirement.id,
      requirement.descricao,
      requirement.ator,
      requirement.prioridade,
    ]),
    [52, contentWidth - 202, 95, 55],
  );

  addSection('Casos de uso');
  drawTable(
    ['ID', 'Nome', 'Ator', 'Objetivo', 'Relacoes'],
    input.useCases.map((useCase) => [
      useCase.id,
      useCase.nome,
      useCase.ator_principal,
      useCase.objetivo,
      formatUseCaseRelations(useCase),
    ]),
    [48, 108, 86, contentWidth - 358, 116],
  );

  addDiagram(input.diagram);

  addSection('User stories');
  drawTable(
    ['ID', 'Story', 'Criterios de aceitacao', 'UCs'],
    input.userStories.map((story) => [
      story.id,
      `Como ${story.papel}, eu quero ${story.quero} para ${story.para}.`,
      (story.criterios_de_aceitacao || []).join(' | '),
      (story.casos_de_uso_relacionados || []).join(', '),
    ]),
    [46, contentWidth * 0.36, contentWidth * 0.42, contentWidth * 0.12],
  );

  doc.save(input.filename);

  function addDiagram(diagram: DiagramModel | null) {
    addSection('Diagrama de casos de uso');

    if (!diagram || !diagram.nodes.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(MUTED_COLOR);
      doc.text('Diagrama indisponivel.', PAGE_MARGIN, y);
      y += 20;
      return;
    }

    const boxes = buildBoxes(diagram);
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const rawWidth = Math.max(1, maxX - minX);
    const rawHeight = Math.max(1, maxY - minY);
    const maxDiagramHeight = 255;
    const scale = Math.min((contentWidth - 24) / rawWidth, maxDiagramHeight / rawHeight, 1);
    const diagramHeight = rawHeight * scale + 28;

    ensureSpace(diagramHeight + 10);

    const originX = PAGE_MARGIN + 12 - minX * scale;
    const originY = y + 14 - minY * scale;
    const scaled = (value: number) => value * scale;
    const center = (box: PdfBox) => ({
      x: originX + scaled(box.x + box.width / 2),
      y: originY + scaled(box.y + box.height / 2),
    });

    doc.setDrawColor(BORDER_COLOR);
    doc.setFillColor('#ffffff');
    doc.rect(PAGE_MARGIN, y, contentWidth, diagramHeight, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(MUTED_COLOR);
    doc.text(text(diagram.systemName || 'Sistema'), PAGE_MARGIN + 10, y + 14);

    diagram.edges.forEach((edge) => {
      const source = boxes.find((box) => box.id === String(edge.source));
      const target = boxes.find((box) => box.id === String(edge.target));
      if (!source || !target) return;
      const start = center(source);
      const end = center(target);
      const relationType = getRelationType(edge);

      doc.setDrawColor(relationType === 'association' ? '#64748b' : '#2563eb');
      doc.setLineWidth(relationType === 'association' ? 0.8 : 1);
      if (relationType !== 'association') {
        doc.setLineDashPattern([4, 3], 0);
      }
      doc.line(start.x, start.y, end.x, end.y);
      doc.setLineDashPattern([], 0);

      if (relationType !== 'association') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor('#1d4ed8');
        doc.text(
          `<<${relationType}>>`,
          (start.x + end.x) / 2,
          (start.y + end.y) / 2 - 4,
          { align: 'center' },
        );
      }
    });

    boxes.forEach((box) => {
      const x = originX + scaled(box.x);
      const boxY = originY + scaled(box.y);
      const width = scaled(box.width);
      const height = scaled(box.height);
      const centerX = x + width / 2;
      const centerY = boxY + height / 2;

      doc.setDrawColor(box.isUseCase ? '#2563eb' : '#94a3b8');
      doc.setFillColor(box.isUseCase ? '#ffffff' : '#f8fafc');
      if (box.isUseCase) {
        doc.ellipse(centerX, centerY, width / 2, height / 2, 'FD');
      } else {
        doc.rect(x, boxY, width, height, 'FD');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.max(6.5, Math.min(8, 8 * scale + 1)));
      doc.setTextColor(TEXT_COLOR);
      const labelLines = doc.splitTextToSize(text(box.label), Math.max(34, width - 10)).slice(0, 3);
      const firstLineY = centerY - ((labelLines.length - 1) * 9) / 2;
      doc.text(labelLines, centerX, firstLineY, { align: 'center', baseline: 'middle' });
    });

    y += diagramHeight + 14;
  }
}

function buildBoxes(diagram: DiagramModel): PdfBox[] {
  return diagram.nodes.map((node) => {
    const isUseCase = String(node.id).startsWith('UC');
    return {
      id: String(node.id),
      label: String((node.data as { label?: unknown } | undefined)?.label || node.id),
      x: node.position.x,
      y: node.position.y,
      width: isUseCase ? 248 : 172,
      height: isUseCase ? 66 : 54,
      isUseCase,
    };
  });
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

function formatUseCaseRelations(useCase: UseCase) {
  const relations = useCase.relacoes || [];
  if (!relations.length) return '-';
  return relations
    .map((relation) => {
      const condition = relation.condicao ? ` (${relation.condicao})` : '';
      return `${relation.tipo} ${relation.destino}${condition}`;
    })
    .join('; ');
}
