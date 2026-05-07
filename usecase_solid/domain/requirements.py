from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

from usecase_solid.text_utils import normalize_spaces, sentence_case


@dataclass
class FunctionalRequirement:
    id: str
    description: str
    actor: str
    action: str
    object_name: str
    priority: str = "Media"
    source: str = ""

    @property
    def use_case_name(self) -> str:
        action = sentence_case(self.action.strip())
        object_name = normalize_spaces(self.object_name)
        return normalize_spaces(f"{action} {object_name}")

    def to_dict(self) -> Dict[str, str]:
        return {
            "id": self.id,
            "descricao": self.description,
            "ator": self.actor,
            "acao": self.action,
            "objeto": self.object_name,
            "prioridade": self.priority,
            "origem": self.source,
        }

    @classmethod
    def from_dict(cls, value: Dict[str, Any], index: int = 1) -> "FunctionalRequirement":
        return cls(
            id=normalize_spaces(str(value.get("id") or f"RF{index:03d}")),
            description=normalize_spaces(str(value.get("descricao") or value.get("description") or "")),
            actor=normalize_spaces(str(value.get("ator") or value.get("actor") or "Usuario")),
            action=normalize_spaces(str(value.get("acao") or value.get("action") or "")),
            object_name=normalize_spaces(str(value.get("objeto") or value.get("object_name") or value.get("object") or "")),
            priority=normalize_spaces(str(value.get("prioridade") or value.get("priority") or "Media")),
            source=normalize_spaces(str(value.get("origem") or value.get("source") or "")),
        )


def requirements_from_dicts(values: Iterable[Dict[str, Any]]) -> List[FunctionalRequirement]:
    requirements = [FunctionalRequirement.from_dict(value, index) for index, value in enumerate(values, start=1)]
    return normalize_requirement_ids(requirements)


def normalize_requirement_ids(requirements: List[FunctionalRequirement]) -> List[FunctionalRequirement]:
    for index, requirement in enumerate(requirements, start=1):
        if not requirement.id:
            requirement.id = f"RF{index:03d}"
    return requirements
