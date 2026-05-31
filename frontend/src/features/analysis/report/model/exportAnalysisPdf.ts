import type { DiagramModel } from '../../../../plantumlBridge';
import { getRequirementPriorityLabel, type RequirementLanguage } from '../../model/language';
import type { FunctionalRequirement, UseCase, UserStory } from '../../model/types';
import {
  DIAGRAM_PDF_PAGE_MARGIN,
  getUseCaseDiagramPdfPageSize,
  renderUseCaseDiagramImage,
} from './useCaseDiagramRenderer';

type ExportAnalysisPdfInput = {
  title: string;
  statusLabel: string;
  descriptionText: string;
  requirements: FunctionalRequirement[];
  useCases: UseCase[];
  diagram: DiagramModel | null;
  userStories: UserStory[];
  filename: string;
  language: RequirementLanguage;
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
  const language = input.language;

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
    const titleLines = doc.splitTextToSize(
      text(input.title || 'Analise de requisitos'),
      contentWidth,
    );
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
      getRequirementPriorityLabel(requirement.prioridade, language),
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

  await addDiagram(input.diagram);

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

  async function addDiagram(diagram: DiagramModel | null) {
    if (!diagram || !diagram.nodes.length) {
      doc.addPage('a4', 'landscape');
      y = PAGE_MARGIN;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(TEXT_COLOR);
      doc.text('Diagrama de casos de uso', PAGE_MARGIN, y);
      y += 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(MUTED_COLOR);
      doc.text('Diagrama indisponivel.', PAGE_MARGIN, y);
      doc.addPage('a4', 'portrait');
      y = PAGE_MARGIN;
      return;
    }

    const rendered = await renderUseCaseDiagramImage(diagram, {
      maxCanvasPixels: 14_000_000,
      maxCanvasSide: 4096,
    });
    const diagramPage = getUseCaseDiagramPdfPageSize(rendered.width, rendered.height);
    doc.addPage(
      [diagramPage.width, diagramPage.height],
      diagramPage.width >= diagramPage.height ? 'landscape' : 'portrait',
    );

    const diagramPageWidth = doc.internal.pageSize.getWidth();
    const diagramPageHeight = doc.internal.pageSize.getHeight();
    const diagramContentWidth = diagramPageWidth - DIAGRAM_PDF_PAGE_MARGIN * 2;
    const diagramContentHeight = diagramPageHeight - DIAGRAM_PDF_PAGE_MARGIN * 2;
    const imageScale = Math.min(
      diagramContentWidth / rendered.width,
      diagramContentHeight / rendered.height,
    );
    const imageWidth = rendered.width * imageScale;
    const imageHeight = rendered.height * imageScale;
    const imageX = DIAGRAM_PDF_PAGE_MARGIN + (diagramContentWidth - imageWidth) / 2;
    const imageY = DIAGRAM_PDF_PAGE_MARGIN + (diagramContentHeight - imageHeight) / 2;

    doc.setDrawColor(BORDER_COLOR);
    doc.setLineWidth(0.8);
    doc.rect(
      DIAGRAM_PDF_PAGE_MARGIN,
      DIAGRAM_PDF_PAGE_MARGIN,
      diagramContentWidth,
      diagramContentHeight,
    );
    doc.addImage(rendered.dataUrl, 'PNG', imageX, imageY, imageWidth, imageHeight);

    doc.addPage('a4', 'portrait');
    y = PAGE_MARGIN;
  }
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
