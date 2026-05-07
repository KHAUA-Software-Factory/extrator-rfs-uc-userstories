from __future__ import annotations

from usecase_solid.domain import UseCaseDocument
from usecase_solid.exporters.formatting import actor_names, relationship_summary
from usecase_solid.text_utils import join_unique


class MarkdownUseCaseExporter:
    def export(self, document: UseCaseDocument) -> str:
        headers = [
            "ID",
            "Ator(es)",
            "Caso de uso",
            "Descrição",
            "Gatilho/Condição",
            "Pré-condições",
            "Relações",
        ]
        lines = [
            "| " + " | ".join(headers) + " |",
            "| " + " | ".join("---" for _ in headers) + " |",
        ]
        for use_case in document.use_cases:
            row = [
                use_case.id,
                actor_names(document, use_case),
                use_case.name,
                use_case.description or "-",
                use_case.trigger or "-",
                join_unique(use_case.preconditions) or "-",
                relationship_summary(document, use_case),
            ]
            lines.append("| " + " | ".join(self._escape(value) for value in row) + " |")
        return "\n".join(lines)

    def _escape(self, value: str) -> str:
        return value.replace("|", "\\|").replace("\n", "<br>")
