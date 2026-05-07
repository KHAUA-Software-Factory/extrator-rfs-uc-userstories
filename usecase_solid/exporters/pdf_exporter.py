from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import List, Optional

from usecase_solid.application import UseCaseAnalysisResult
from usecase_solid.domain import FunctionalRequirement, UserStory


_DEPS_HINT = (
    "Geracao de PDF requer as bibliotecas reportlab e svglib. "
    "Instale com: pip install reportlab svglib"
)


class PdfReportExporter:
    """Gera um PDF unico contendo, em sequencia: descricao livre, requisitos
    funcionais, casos de uso, diagrama, relatorio textual e PlantUML.
    """

    def build(
        self,
        input_text: str,
        requirements: List[FunctionalRequirement],
        result: Optional[UseCaseAnalysisResult],
        user_stories: Optional[List[UserStory]] = None,
    ) -> bytes:
        try:
            from reportlab.lib import colors
            from reportlab.lib.enums import TA_LEFT
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.lib.units import mm
            from reportlab.platypus import (
                KeepTogether,
                PageBreak,
                Paragraph,
                SimpleDocTemplate,
                Spacer,
                Table,
                TableStyle,
            )
        except ImportError as exc:
            raise RuntimeError(_DEPS_HINT) from exc

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title="Relatorio de Casos de Uso",
        )

        styles = getSampleStyleSheet()
        styles.add(
            ParagraphStyle(
                name="Heading1Custom",
                parent=styles["Heading1"],
                fontSize=18,
                spaceAfter=10,
                spaceBefore=0,
                textColor=colors.HexColor("#1d4ed8"),
            )
        )
        styles.add(
            ParagraphStyle(
                name="Heading2Custom",
                parent=styles["Heading2"],
                fontSize=13,
                spaceAfter=6,
                spaceBefore=14,
                textColor=colors.HexColor("#172033"),
            )
        )
        styles.add(
            ParagraphStyle(
                name="MonoBlock",
                parent=styles["Code"],
                fontName="Courier",
                fontSize=8.5,
                leading=11,
                leftIndent=4,
                rightIndent=4,
                backColor=colors.HexColor("#f3f4f6"),
                borderPadding=4,
                alignment=TA_LEFT,
            )
        )
        styles.add(
            ParagraphStyle(
                name="BodyJustified",
                parent=styles["BodyText"],
                fontSize=10,
                leading=13,
            )
        )
        styles.add(
            ParagraphStyle(
                name="Caption",
                parent=styles["BodyText"],
                fontSize=8.5,
                leading=11,
                textColor=colors.HexColor("#5f6b7a"),
            )
        )

        story: list = []
        self._cover(story, styles)
        self._section_input(story, styles, input_text)
        self._section_requirements(story, styles, requirements, colors, Table, TableStyle, mm)
        if result is not None:
            self._section_use_cases(story, styles, result, colors, Table, TableStyle, mm)
            self._section_diagram(story, styles, result, mm)
            self._section_text_report(story, styles, result)
            self._section_plantuml(story, styles, result)
            self._section_user_stories(story, styles, user_stories or [], colors, Table, TableStyle, mm)
        else:
            story.append(Paragraph("Casos de uso", styles["Heading2Custom"]))
            story.append(
                Paragraph(
                    "Os casos de uso ainda nao foram gerados. Aprove os requisitos para incluir esta secao.",
                    styles["BodyJustified"],
                )
            )

        doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
        return buffer.getvalue()

    def write(
        self,
        input_text: str,
        requirements: List[FunctionalRequirement],
        result: Optional[UseCaseAnalysisResult],
        path: Path,
        user_stories: Optional[List[UserStory]] = None,
    ) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.build(input_text, requirements, result, user_stories=user_stories))
        return path

    def _cover(self, story: list, styles) -> None:
        from reportlab.platypus import Paragraph, Spacer
        story.append(Paragraph("Relatorio de Casos de Uso", styles["Heading1Custom"]))
        timestamp = datetime.now().strftime("%d/%m/%Y %H:%M")
        story.append(
            Paragraph(
                f"Gerado em {timestamp} pelo Extrator SOLID de Casos de Uso.",
                styles["Caption"],
            )
        )
        story.append(Spacer(1, 8))

    def _section_input(self, story: list, styles, input_text: str) -> None:
        from reportlab.platypus import Paragraph, Spacer
        story.append(Paragraph("1. Descricao livre (entrada)", styles["Heading2Custom"]))
        text = (input_text or "").strip()
        if not text:
            story.append(
                Paragraph(
                    "<i>Sem descricao livre informada.</i>",
                    styles["BodyJustified"],
                )
            )
            return
        story.append(Paragraph(_escape(text).replace("\n", "<br/>"), styles["BodyJustified"]))
        story.append(Spacer(1, 4))

    def _section_requirements(
        self,
        story: list,
        styles,
        requirements: List[FunctionalRequirement],
        colors,
        Table,
        TableStyle,
        mm,
    ) -> None:
        from reportlab.platypus import Paragraph, Spacer
        story.append(Paragraph("2. Requisitos funcionais", styles["Heading2Custom"]))
        if not requirements:
            story.append(
                Paragraph("<i>Nenhum requisito funcional aprovado.</i>", styles["BodyJustified"])
            )
            return

        header = ["ID", "Ator", "Acao", "Objeto", "Prio.", "Descricao", "Origem"]
        body_style = ParagraphStyle_inline_body(styles)
        rows = [[Paragraph(_escape(value), body_style) for value in header]]
        for requirement in requirements:
            rows.append(
                [
                    Paragraph(_escape(requirement.id), body_style),
                    Paragraph(_escape(requirement.actor or "-"), body_style),
                    Paragraph(_escape(requirement.action or "-"), body_style),
                    Paragraph(_escape(requirement.object_name or "-"), body_style),
                    Paragraph(_escape(requirement.priority or "-"), body_style),
                    Paragraph(_escape(requirement.description or "-"), body_style),
                    Paragraph(_escape(requirement.source or "-"), body_style),
                ]
            )

        col_widths = [16 * mm, 22 * mm, 22 * mm, 26 * mm, 14 * mm, 50 * mm, 24 * mm]
        table = Table(rows, repeatRows=1, colWidths=col_widths)
        table.setStyle(_table_style(colors))
        story.append(table)
        story.append(Spacer(1, 4))

    def _section_use_cases(
        self,
        story: list,
        styles,
        result: UseCaseAnalysisResult,
        colors,
        Table,
        TableStyle,
        mm,
    ) -> None:
        from reportlab.platypus import Paragraph, Spacer
        story.append(Paragraph("3. Casos de uso", styles["Heading2Custom"]))
        document = result.document
        if not document.use_cases:
            story.append(
                Paragraph("<i>Nenhum caso de uso gerado.</i>", styles["BodyJustified"])
            )
            return

        actor_names = {actor.id: actor.name for actor in document.actors.values()}
        relations_by_uc = _index_relationships(document)

        header = ["ID", "Ator(es)", "Caso de uso", "Descricao", "Gatilho", "Pre-cond.", "Relacoes"]
        body_style = ParagraphStyle_inline_body(styles)
        rows = [[Paragraph(_escape(value), body_style) for value in header]]
        for use_case in document.use_cases:
            actors = ", ".join(actor_names.get(actor_id, actor_id) for actor_id in use_case.actor_ids) or "-"
            preconditions = "; ".join(use_case.preconditions) if use_case.preconditions else "-"
            relations = relations_by_uc.get(use_case.id, "-")
            rows.append(
                [
                    Paragraph(_escape(use_case.id), body_style),
                    Paragraph(_escape(actors), body_style),
                    Paragraph(_escape(use_case.name), body_style),
                    Paragraph(_escape(use_case.description or "-"), body_style),
                    Paragraph(_escape(use_case.trigger or "-"), body_style),
                    Paragraph(_escape(preconditions), body_style),
                    Paragraph(_escape(relations), body_style),
                ]
            )

        col_widths = [14 * mm, 22 * mm, 30 * mm, 40 * mm, 22 * mm, 24 * mm, 22 * mm]
        table = Table(rows, repeatRows=1, colWidths=col_widths)
        table.setStyle(_table_style(colors))
        story.append(table)
        story.append(Spacer(1, 4))

    def _section_diagram(self, story: list, styles, result: UseCaseAnalysisResult, mm) -> None:
        from reportlab.platypus import PageBreak, Paragraph, Spacer
        story.append(PageBreak())
        story.append(Paragraph("4. Diagrama de casos de uso", styles["Heading2Custom"]))
        drawing = _svg_to_drawing(
            result.svg_diagram,
            max_width_mm=180,
            max_height_mm=230,
            mm=mm,
        )
        if drawing is None:
            story.append(
                Paragraph(
                    "<i>Nao foi possivel renderizar o diagrama SVG no PDF.</i>",
                    styles["BodyJustified"],
                )
            )
            return
        story.append(drawing)
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(
                "Setas tracejadas representam &lt;&lt;include&gt;&gt; e &lt;&lt;extend&gt;&gt;.",
                styles["Caption"],
            )
        )

    def _section_text_report(self, story: list, styles, result: UseCaseAnalysisResult) -> None:
        from reportlab.platypus import KeepTogether, PageBreak, Paragraph
        story.append(PageBreak())
        story.append(Paragraph("5. Relatorio textual", styles["Heading2Custom"]))
        report = (result.text_report or "").strip() or "(vazio)"
        story.append(Paragraph(_pre_to_html(report), styles["MonoBlock"]))

    def _section_plantuml(self, story: list, styles, result: UseCaseAnalysisResult) -> None:
        from reportlab.platypus import Paragraph, Spacer
        story.append(Spacer(1, 8))
        story.append(Paragraph("6. PlantUML", styles["Heading2Custom"]))
        plantuml = (result.plantuml_diagram or "").strip() or "(vazio)"
        story.append(Paragraph(_pre_to_html(plantuml), styles["MonoBlock"]))

    def _section_user_stories(
        self,
        story: list,
        styles,
        user_stories: List[UserStory],
        colors,
        Table,
        TableStyle,
        mm,
    ) -> None:
        from reportlab.platypus import PageBreak, Paragraph, Spacer
        story.append(PageBreak())
        story.append(Paragraph("7. User Stories", styles["Heading2Custom"]))
        if not user_stories:
            story.append(
                Paragraph(
                    "<i>User stories nao foram geradas. Valide os casos de uso e clique em "
                    "'Gerar User Stories com IA'.</i>",
                    styles["BodyJustified"],
                )
            )
            return

        body_style = ParagraphStyle_inline_body(styles)
        header = ["ID", "Papel", "Quero", "Para", "Criterios de aceitacao", "UC(s)"]
        rows = [[Paragraph(_escape(value), body_style) for value in header]]
        for us in user_stories:
            criteria = "<br/>".join(_escape(item) for item in us.acceptance_criteria) or "-"
            related = ", ".join(us.related_uc_ids) or "-"
            rows.append(
                [
                    Paragraph(_escape(us.id), body_style),
                    Paragraph(_escape(us.role or "-"), body_style),
                    Paragraph(_escape(us.want or "-"), body_style),
                    Paragraph(_escape(us.benefit or "-"), body_style),
                    Paragraph(criteria, body_style),
                    Paragraph(_escape(related), body_style),
                ]
            )

        col_widths = [14 * mm, 26 * mm, 40 * mm, 35 * mm, 45 * mm, 14 * mm]
        table = Table(rows, repeatRows=1, colWidths=col_widths)
        table.setStyle(_table_style(colors))
        story.append(table)
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(
                "Formato: 'Como [papel], eu quero [funcionalidade] para [beneficio].'",
                styles["Caption"],
            )
        )


def ParagraphStyle_inline_body(styles):
    from reportlab.lib.styles import ParagraphStyle
    base = styles["BodyText"]
    return ParagraphStyle(
        name="TableBody",
        parent=base,
        fontSize=8.5,
        leading=11,
        spaceAfter=0,
        spaceBefore=0,
    )


def _table_style(colors):
    from reportlab.platypus import TableStyle
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#172033")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d7dee8")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]
    )


def _index_relationships(document) -> dict:
    use_case_names = {use_case.id: use_case.name for use_case in document.use_cases}
    by_source: dict = {}
    for relation in document.relationships:
        target_name = use_case_names.get(relation.target_id, relation.target_id)
        suffix = f" [{relation.condition}]" if relation.condition else ""
        item = f"{relation.label} {target_name}{suffix}"
        by_source.setdefault(relation.source_id, []).append(item)
    return {source_id: "; ".join(items) for source_id, items in by_source.items()}


def _svg_to_drawing(svg_text: str, max_width_mm: float, mm, max_height_mm: float = 230.0):
    if not svg_text:
        return None
    try:
        from svglib.svglib import svg2rlg
    except ImportError:
        return None
    try:
        drawing = svg2rlg(BytesIO(svg_text.encode("utf-8")))
    except Exception:
        return None
    if drawing is None or not drawing.width or not drawing.height:
        return drawing

    max_width = max_width_mm * mm
    max_height = max_height_mm * mm
    scale_w = max_width / float(drawing.width) if drawing.width > max_width else 1.0
    scale_h = max_height / float(drawing.height) if drawing.height > max_height else 1.0
    scale = min(scale_w, scale_h)
    if scale < 1.0:
        drawing.width = drawing.width * scale
        drawing.height = drawing.height * scale
        drawing.scale(scale, scale)
    return drawing


def _escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _pre_to_html(value: str) -> str:
    escaped = _escape(value)
    return escaped.replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")


def _footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillGray(0.4)
    canvas.drawRightString(
        doc.pagesize[0] - 18 * _mm(),
        12 * _mm(),
        f"pagina {doc.page}",
    )
    canvas.restoreState()


def _mm() -> float:
    from reportlab.lib.units import mm
    return mm
