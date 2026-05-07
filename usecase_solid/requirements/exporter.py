from __future__ import annotations

import json
from typing import Iterable, List

from usecase_solid.domain import FunctionalRequirement
from usecase_solid.domain.requirements import requirements_from_dicts


def requirements_to_json(requirements: Iterable[FunctionalRequirement]) -> str:
    data = {"requisitos_funcionais": [requirement.to_dict() for requirement in requirements]}
    return json.dumps(data, ensure_ascii=False, indent=2)


def requirements_from_json(value: str) -> List[FunctionalRequirement]:
    data = json.loads(value)
    if isinstance(data, dict):
        values = data.get("requisitos_funcionais", [])
    elif isinstance(data, list):
        values = data
    else:
        values = []
    return requirements_from_dicts(values)


def export_requirements_markdown(requirements: Iterable[FunctionalRequirement]) -> str:
    lines = [
        "| ID | Ator | Acao | Objeto | Prioridade | Descricao | Origem |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for requirement in requirements:
        row = [
            requirement.id,
            requirement.actor,
            requirement.action,
            requirement.object_name,
            requirement.priority,
            requirement.description,
            requirement.source,
        ]
        lines.append("| " + " | ".join(_escape(value) for value in row) + " |")
    return "\n".join(lines)


def _escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")
