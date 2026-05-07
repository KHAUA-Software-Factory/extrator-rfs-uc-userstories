from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

from usecase_solid.application import UseCaseAnalysisResult
from usecase_solid.domain import FunctionalRequirement, UserStory
from usecase_solid.requirements import export_requirements_markdown, requirements_to_json


OUTPUT_FILES = {
    "tabela": "tabela_casos_de_uso.md",
    "csv": "casos_de_uso.csv",
    "relatorio": "relatorio_casos_de_uso.txt",
    "svg": "diagrama_casos_de_uso.svg",
    "plantuml": "diagrama_casos_de_uso.puml",
    "pdf": "relatorio_completo.pdf",
}


def write_analysis_outputs(
    result: UseCaseAnalysisResult,
    output_dir: Path,
    input_text: str = "",
    requirements: Optional[List[FunctionalRequirement]] = None,
    user_stories: Optional[List[UserStory]] = None,
) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    contents = {
        OUTPUT_FILES["tabela"]: result.markdown_table,
        OUTPUT_FILES["csv"]: result.csv_table,
        OUTPUT_FILES["relatorio"]: result.text_report,
        OUTPUT_FILES["svg"]: result.svg_diagram,
        OUTPUT_FILES["plantuml"]: result.plantuml_diagram,
    }

    paths: Dict[str, Path] = {}
    for filename, content in contents.items():
        path = output_dir / filename
        path.write_text(content, encoding="utf-8")
        paths[filename] = path

    pdf_path = write_pdf_report(
        input_text,
        requirements or [],
        result,
        output_dir,
        user_stories=user_stories or [],
    )
    if pdf_path is not None:
        paths[OUTPUT_FILES["pdf"]] = pdf_path
    return paths


def write_pdf_report(
    input_text: str,
    requirements: List[FunctionalRequirement],
    result: Optional[UseCaseAnalysisResult],
    output_dir: Path,
    user_stories: Optional[List[UserStory]] = None,
) -> Optional[Path]:
    try:
        from usecase_solid.exporters import PdfReportExporter
    except ImportError:
        return None
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = output_dir / OUTPUT_FILES["pdf"]
    try:
        PdfReportExporter().write(input_text, requirements, result, pdf_path, user_stories=user_stories or [])
    except RuntimeError:
        return None
    return pdf_path


def write_requirements_outputs(requirements: list[FunctionalRequirement], output_dir: Path) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    contents = {
        "requisitos_funcionais.json": requirements_to_json(requirements),
        "requisitos_funcionais.md": export_requirements_markdown(requirements),
    }

    paths: Dict[str, Path] = {}
    for filename, content in contents.items():
        path = output_dir / filename
        path.write_text(content, encoding="utf-8")
        paths[filename] = path
    return paths
