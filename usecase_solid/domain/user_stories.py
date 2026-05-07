from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List

from usecase_solid.text_utils import normalize_spaces


@dataclass
class UserStory:
    id: str
    role: str
    want: str
    benefit: str
    acceptance_criteria: List[str] = field(default_factory=list)
    related_uc_ids: List[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        role = self.role.strip() or "usuario"
        want = self.want.strip() or "interagir com o sistema"
        benefit = self.benefit.strip()
        if benefit:
            return f"Como {role}, eu quero {want} para {benefit}."
        return f"Como {role}, eu quero {want}."

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "papel": self.role,
            "quero": self.want,
            "para": self.benefit,
            "criterios_de_aceitacao": list(self.acceptance_criteria),
            "casos_de_uso_relacionados": list(self.related_uc_ids),
        }

    @classmethod
    def from_dict(cls, value: Dict[str, Any], index: int = 1) -> "UserStory":
        criteria_value = (
            value.get("criterios_de_aceitacao")
            or value.get("acceptance_criteria")
            or value.get("criterios")
            or []
        )
        related_value = (
            value.get("casos_de_uso_relacionados")
            or value.get("related_uc_ids")
            or value.get("ucs")
            or []
        )
        return cls(
            id=normalize_spaces(str(value.get("id") or f"US{index:03d}")),
            role=normalize_spaces(str(value.get("papel") or value.get("role") or "Usuario")),
            want=normalize_spaces(str(value.get("quero") or value.get("want") or "")),
            benefit=normalize_spaces(str(value.get("para") or value.get("benefit") or "")),
            acceptance_criteria=[normalize_spaces(str(item)) for item in criteria_value if str(item).strip()],
            related_uc_ids=[normalize_spaces(str(item)) for item in related_value if str(item).strip()],
        )


def user_stories_from_dicts(values: Iterable[Dict[str, Any]]) -> List[UserStory]:
    stories = [UserStory.from_dict(value, index) for index, value in enumerate(values, start=1)]
    for index, story in enumerate(stories, start=1):
        if not story.id:
            story.id = f"US{index:03d}"
    return stories
