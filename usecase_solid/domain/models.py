from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

from usecase_solid.text_utils import loose_fingerprint, slugify


class RelationshipType(Enum):
    ASSOCIATION = "association"
    INCLUDE = "include"
    EXTEND = "extend"


@dataclass(frozen=True)
class Actor:
    id: str
    name: str


@dataclass
class UseCase:
    id: str
    name: str
    actor_ids: List[str] = field(default_factory=list)
    description: str = ""
    trigger: str = ""
    preconditions: List[str] = field(default_factory=list)
    main_flow: List[str] = field(default_factory=list)
    postconditions: List[str] = field(default_factory=list)
    source_sentences: List[str] = field(default_factory=list)

    def add_actor(self, actor_id: str) -> None:
        if actor_id and actor_id not in self.actor_ids:
            self.actor_ids.append(actor_id)

    def add_source_sentence(self, sentence: str) -> None:
        sentence = sentence.strip()
        if sentence and sentence not in self.source_sentences:
            self.source_sentences.append(sentence)

    def add_precondition(self, precondition: str) -> None:
        precondition = precondition.strip()
        if precondition and precondition not in self.preconditions:
            self.preconditions.append(precondition)


@dataclass(frozen=True)
class Relationship:
    source_id: str
    target_id: str
    type: RelationshipType
    label: str
    condition: str = ""


@dataclass
class UseCaseDocument:
    actors: Dict[str, Actor] = field(default_factory=dict)
    use_cases: List[UseCase] = field(default_factory=list)
    relationships: List[Relationship] = field(default_factory=list)

    def add_actor(self, actor_name: str) -> Actor:
        actor_name = actor_name.strip() or "Usuario"
        actor_id = slugify(actor_name)
        actor = self.actors.get(actor_id)
        if actor is None:
            actor = Actor(id=actor_id, name=actor_name)
            self.actors[actor_id] = actor
        return actor

    def find_use_case(self, name: str) -> Optional[UseCase]:
        wanted = loose_fingerprint(name)
        if not wanted:
            return None

        for use_case in self.use_cases:
            current = loose_fingerprint(use_case.name)
            if current == wanted or current in wanted or wanted in current:
                return use_case
        return None

    def get_or_add_use_case(
        self,
        name: str,
        actor_id: str = "",
        description: str = "",
        trigger: str = "",
        source_sentence: str = "",
    ) -> UseCase:
        existing = self.find_use_case(name)
        if existing is not None:
            existing.add_actor(actor_id)
            existing.add_source_sentence(source_sentence)
            if trigger and not existing.trigger:
                existing.trigger = trigger
            if description and not existing.description:
                existing.description = description
            return existing

        use_case = UseCase(
            id=f"UC{len(self.use_cases) + 1:03d}",
            name=name.strip(),
            actor_ids=[actor_id] if actor_id else [],
            description=description.strip(),
            trigger=trigger.strip(),
            source_sentences=[source_sentence.strip()] if source_sentence.strip() else [],
        )
        self.use_cases.append(use_case)
        return use_case

    def add_relationship(
        self,
        source_id: str,
        target_id: str,
        relationship_type: RelationshipType,
        condition: str = "",
    ) -> None:
        if not source_id or not target_id or source_id == target_id:
            return

        label = f"<<{relationship_type.value}>>"
        candidate = Relationship(
            source_id=source_id,
            target_id=target_id,
            type=relationship_type,
            label=label,
            condition=condition.strip(),
        )
        if candidate not in self.relationships:
            self.relationships.append(candidate)
