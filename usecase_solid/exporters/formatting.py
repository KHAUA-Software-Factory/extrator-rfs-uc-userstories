from __future__ import annotations

from typing import Dict, List

from usecase_solid.domain import RelationshipType, UseCase, UseCaseDocument
from usecase_solid.text_utils import join_unique


def actor_names(document: UseCaseDocument, use_case: UseCase) -> str:
    names = [document.actors[actor_id].name for actor_id in use_case.actor_ids if actor_id in document.actors]
    return join_unique(names) or "Usuario"


def relationship_summary(document: UseCaseDocument, use_case: UseCase) -> str:
    by_id: Dict[str, UseCase] = {item.id: item for item in document.use_cases}
    parts: List[str] = []
    for relationship in document.relationships:
        if relationship.source_id != use_case.id:
            continue
        target = by_id.get(relationship.target_id)
        if target is None:
            continue
        condition = f" [{relationship.condition}]" if relationship.condition else ""
        if relationship.type is RelationshipType.INCLUDE:
            parts.append(f"<<include>> {target.name}{condition}")
        elif relationship.type is RelationshipType.EXTEND:
            parts.append(f"<<extend>> {target.name}{condition}")
    return join_unique(parts) or "-"
