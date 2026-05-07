from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from usecase_solid.domain import UseCaseDocument
from usecase_solid.domain.requirements import FunctionalRequirement
from usecase_solid.ports import DiagramRenderer, DocumentExporter, RelationshipDetector, TextPreprocessor, UseCaseExtractor
from usecase_solid.requirements.converter import RequirementsToUseCasesConverter


@dataclass(frozen=True)
class UseCaseAnalysisResult:
    document: UseCaseDocument
    markdown_table: str
    csv_table: str
    text_report: str
    svg_diagram: str
    plantuml_diagram: str


class UseCaseAnalysisService:
    def __init__(
        self,
        preprocessor: TextPreprocessor,
        extractor: UseCaseExtractor,
        relationship_detector: RelationshipDetector,
        markdown_exporter: DocumentExporter,
        csv_exporter: DocumentExporter,
        text_report_exporter: DocumentExporter,
        svg_renderer: DiagramRenderer,
        plantuml_renderer: DiagramRenderer,
        requirements_converter: Optional[RequirementsToUseCasesConverter] = None,
    ) -> None:
        self.preprocessor = preprocessor
        self.extractor = extractor
        self.relationship_detector = relationship_detector
        self.markdown_exporter = markdown_exporter
        self.csv_exporter = csv_exporter
        self.text_report_exporter = text_report_exporter
        self.svg_renderer = svg_renderer
        self.plantuml_renderer = plantuml_renderer
        self.requirements_converter = requirements_converter or RequirementsToUseCasesConverter()

    def execute(self, text: str) -> UseCaseAnalysisResult:
        clean_text = self.preprocessor.preprocess(text)
        document = self.extractor.extract(clean_text)
        self.relationship_detector.detect(clean_text, document)
        return self._build_result(document)

    def execute_from_requirements(self, requirements: list[FunctionalRequirement]) -> UseCaseAnalysisResult:
        document = self.requirements_converter.convert(requirements)
        joined_descriptions = "\n".join(requirement.description for requirement in requirements)
        self.relationship_detector.detect(joined_descriptions, document)
        return self._build_result(document)

    def _build_result(self, document: UseCaseDocument) -> UseCaseAnalysisResult:
        return UseCaseAnalysisResult(
            document=document,
            markdown_table=self.markdown_exporter.export(document),
            csv_table=self.csv_exporter.export(document),
            text_report=self.text_report_exporter.export(document),
            svg_diagram=self.svg_renderer.render(document),
            plantuml_diagram=self.plantuml_renderer.render(document),
        )
