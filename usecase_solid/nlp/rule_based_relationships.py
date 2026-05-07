from __future__ import annotations

import re
from typing import Optional

from usecase_solid.domain import RelationshipType, UseCase, UseCaseDocument
from usecase_solid.nlp.rule_based_extractor import ParsedAction, PortugueseActionParser
from usecase_solid.text_utils import normalize_spaces, split_sentences


class RuleBasedRelationshipDetector:
    def __init__(self, action_parser: Optional[PortugueseActionParser] = None) -> None:
        self.action_parser = action_parser or PortugueseActionParser()

    def detect(self, text: str, document: UseCaseDocument) -> None:
        for sentence in split_sentences(text):
            self._detect_include(sentence, document)
            self._detect_extend(sentence, document)
        self._sync_preconditions(document)

    def _detect_include(self, sentence: str, document: UseCaseDocument) -> None:
        normalized = normalize_spaces(sentence)

        para_match = re.search(
            r"\bpara\s+(?P<base>[^,.;]+),?\s+(?P<included>.+)$",
            normalized,
            flags=re.IGNORECASE,
        )
        if para_match and re.search(
            r"\b(deve|devem|precisa|precisam|necess[aá]rio|obrigat[oó]rio|requer|exige)\b",
            para_match.group("included"),
            flags=re.IGNORECASE,
        ):
            base = self.action_parser.parse_action_phrase(para_match.group("base"))
            included = self.action_parser.parse_action_phrase(para_match.group("included"))
            self._add_relation(document, base, included, RelationshipType.INCLUDE)

        include_match = re.search(
            r"(?P<base>.+?)\s+(?:sempre\s+)?(?:inclui|requer|exige|necessita\s+de|depende\s+de)\s+(?P<target>.+)$",
            normalized,
            flags=re.IGNORECASE,
        )
        if include_match:
            base = self.action_parser.parse_action_phrase(include_match.group("base"))
            included = self.action_parser.parse_action_phrase(include_match.group("target"))
            self._add_relation(document, base, included, RelationshipType.INCLUDE)

        before_match = re.search(
            r"\bantes\s+de\s+(?P<base>[^,.;]+),?\s+(?P<included>.+)$",
            normalized,
            flags=re.IGNORECASE,
        )
        if before_match:
            base = self.action_parser.parse_action_phrase(before_match.group("base"))
            included = self.action_parser.parse_action_phrase(before_match.group("included"))
            self._add_relation(document, base, included, RelationshipType.INCLUDE)

    def _detect_extend(self, sentence: str, document: UseCaseDocument) -> None:
        normalized = normalize_spaces(sentence)
        condition = self._extract_condition(normalized)

        direct_match = re.search(
            r"(?P<extension>.+?)\s+(?:estende|extende|é\s+uma\s+extensão\s+de|e\s+uma\s+extensao\s+de)\s+"
            r"(?P<base>.+?)(?:\s+(?:quando|caso|se)\s+(?P<condition>.+))?$",
            normalized,
            flags=re.IGNORECASE,
        )
        if direct_match:
            extension = self.action_parser.parse_action_phrase(direct_match.group("extension"))
            base = self.action_parser.parse_action_phrase(direct_match.group("base"))
            relation_condition = direct_match.group("condition") or condition
            self._add_relation(document, extension, base, RelationshipType.EXTEND, relation_condition)

        inverse_match = re.search(
            r"(?P<base>.+?)\s+(?:pode\s+ser\s+estendido\s+por|é\s+estendido\s+por|e\s+estendido\s+por)\s+"
            r"(?P<extension>.+?)(?:\s+(?:quando|caso|se)\s+(?P<condition>.+))?$",
            normalized,
            flags=re.IGNORECASE,
        )
        if inverse_match:
            base = self.action_parser.parse_action_phrase(inverse_match.group("base"))
            extension = self.action_parser.parse_action_phrase(inverse_match.group("extension"))
            relation_condition = inverse_match.group("condition") or condition
            self._add_relation(document, extension, base, RelationshipType.EXTEND, relation_condition)

    def _add_relation(
        self,
        document: UseCaseDocument,
        source_action: Optional[ParsedAction],
        target_action: Optional[ParsedAction],
        relationship_type: RelationshipType,
        condition: str = "",
    ) -> None:
        if source_action is None or target_action is None:
            return

        source = self._get_or_create_use_case(document, source_action)
        target = self._get_or_create_use_case(document, target_action)
        document.add_relationship(source.id, target.id, relationship_type, condition)

    def _get_or_create_use_case(self, document: UseCaseDocument, action: ParsedAction) -> UseCase:
        existing = document.find_use_case(action.name)
        if existing is not None and action.actor.lower() == "usuario":
            return existing

        actor = document.add_actor(action.actor)
        return document.get_or_add_use_case(
            name=action.name,
            actor_id=actor.id,
            description=f"Permite ao ator {action.actor} executar o objetivo: {action.name}.",
            trigger=action.condition,
            source_sentence=action.sentence,
        )

    def _sync_preconditions(self, document: UseCaseDocument) -> None:
        by_id = {use_case.id: use_case for use_case in document.use_cases}
        for relationship in document.relationships:
            if relationship.type is not RelationshipType.INCLUDE:
                continue
            source = by_id.get(relationship.source_id)
            target = by_id.get(relationship.target_id)
            if source and target:
                source.add_precondition(target.name)

    def _extract_condition(self, sentence: str) -> str:
        match = re.search(r"\b(quando|caso|se|desde que)\s+(.+)$", sentence, flags=re.IGNORECASE)
        return normalize_spaces(match.group(0).strip(" .,:;")) if match else ""
