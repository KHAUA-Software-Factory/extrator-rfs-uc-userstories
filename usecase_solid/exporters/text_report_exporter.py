from __future__ import annotations

from typing import Dict

from usecase_solid.domain import RelationshipType, UseCase, UseCaseDocument
from usecase_solid.exporters.formatting import actor_names
from usecase_solid.text_utils import join_unique


class TextReportExporter:
    def export(self, document: UseCaseDocument) -> str:
        by_id: Dict[str, UseCase] = {use_case.id: use_case for use_case in document.use_cases}
        lines = ["RELATORIO DE CASOS DE USO", ""]

        for use_case in document.use_cases:
            lines.extend(
                [
                    f"{use_case.id} - {use_case.name}",
                    f"Atores: {actor_names(document, use_case)}",
                    f"Descricao: {use_case.description or '-'}",
                    f"Gatilho/Condicao: {use_case.trigger or '-'}",
                    f"Pre-condicoes: {join_unique(use_case.preconditions) or '-'}",
                    "Fluxo principal:",
                ]
            )
            for index, step in enumerate(use_case.main_flow, start=1):
                lines.append(f"  {index}. {step}")
            lines.append(f"Pos-condicoes: {join_unique(use_case.postconditions) or '-'}")
            source = join_unique(use_case.source_sentences)
            lines.append(f"Trecho de origem: {source or '-'}")
            lines.append("")

        lines.append("RELACOES UML")
        if not document.relationships:
            lines.append("- Nenhuma relacao <<include>> ou <<extend>> identificada.")
        for relationship in document.relationships:
            source = by_id.get(relationship.source_id)
            target = by_id.get(relationship.target_id)
            if not source or not target:
                continue
            label = "<<include>>" if relationship.type is RelationshipType.INCLUDE else "<<extend>>"
            condition = f" [{relationship.condition}]" if relationship.condition else ""
            lines.append(f"- {source.name} -- {label} --> {target.name}{condition}")
        return "\n".join(lines)
