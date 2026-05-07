from __future__ import annotations

from usecase_solid.application import UseCaseAnalysisService
from usecase_solid.exporters import CsvUseCaseExporter, MarkdownUseCaseExporter, TextReportExporter
from usecase_solid.nlp import PortugueseActionParser, PortugueseTextPreprocessor, RuleBasedRelationshipDetector, RuleBasedUseCaseExtractor
from usecase_solid.renderers import PlantUmlRenderer, SvgUseCaseDiagramRenderer


def build_analysis_service() -> UseCaseAnalysisService:
    action_parser = PortugueseActionParser()
    return UseCaseAnalysisService(
        preprocessor=PortugueseTextPreprocessor(),
        extractor=RuleBasedUseCaseExtractor(action_parser),
        relationship_detector=RuleBasedRelationshipDetector(action_parser),
        markdown_exporter=MarkdownUseCaseExporter(),
        csv_exporter=CsvUseCaseExporter(),
        text_report_exporter=TextReportExporter(),
        svg_renderer=SvgUseCaseDiagramRenderer(),
        plantuml_renderer=PlantUmlRenderer(),
    )
