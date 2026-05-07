from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from usecase_solid.domain import UseCaseDocument
from usecase_solid.nlp.verb_lexicon import PortugueseActionLexicon
from usecase_solid.text_utils import clean_actor, clean_object, normalize_spaces, sentence_case, split_sentences


MODAL_PATTERN = (
    r"(?:pode|podem|deve|devem|precisa|precisam|consegue|conseguem|ira|irá|vai|"
    r"podera|poderá|poderão|devera|deverá|deverão)\s+"
)


@dataclass(frozen=True)
class ParsedAction:
    actor: str
    verb: str
    obj: str
    condition: str
    sentence: str

    @property
    def name(self) -> str:
        return sentence_case(f"{self.verb} {self.obj}")


class PortugueseActionParser:
    def __init__(self, lexicon: Optional[PortugueseActionLexicon] = None) -> None:
        self.lexicon = lexicon or PortugueseActionLexicon()
        verb_pattern = "|".join(re.escape(form) for form in self.lexicon.all_forms())
        nominal_pattern = "|".join(re.escape(form) for form in self.lexicon.all_nominal_forms())
        self._capability_pattern = re.compile(
            rf"\b(?:o|a)?\s*(?:sistema|software|aplicação|aplicacao|aplicativo|plataforma)\s+"
            rf"(?:deve\s+)?(?:permitir|permite|permitirá|permitira|possibilitar|possibilita|oferecer|oferece)\s+"
            rf"(?:a[oo]s?\s+(?P<actor>[A-Za-zÀ-ÿ0-9 _/-]{{2,80}}?)\s+)?"
            rf"(?P<verb>{verb_pattern})\s+(?P<object>[^.;:\n]+)",
            flags=re.IGNORECASE,
        )
        self._system_pattern = re.compile(
            rf"\b(?:o|a)?\s*(?:sistema|software|aplicação|aplicacao|aplicativo|plataforma)\s+"
            rf"(?:deve\s+)?(?:permitir|permite|permitirá|permitira|possibilitar|possibilita|oferecer|oferece)\s+"
            rf"(?:que\s+)?(?P<actor>[A-Za-zÀ-ÿ0-9 _/-]{{2,80}}?)\s+"
            rf"(?:{MODAL_PATTERN})?(?P<verb>{verb_pattern})\s+(?P<object>[^.;:\n]+)",
            flags=re.IGNORECASE,
        )
        self._intent_pattern = re.compile(
            rf"^\s*(?:eu\s+)?(?:quero|preciso|gostaria\s+de|necessito|desejo|tenho\s+que|devo)\s+"
            rf"(?P<verb>{verb_pattern})\s+(?P<object>[^.;:\n]+)",
            flags=re.IGNORECASE,
        )
        self._actor_pattern = re.compile(
            rf"\b(?P<actor>(?:o|a|os|as|um|uma)?\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _/-]{{1,80}}?)\s+"
            rf"(?:{MODAL_PATTERN})?(?P<verb>{verb_pattern})\s+(?P<object>[^.;:\n]+)",
            flags=re.IGNORECASE,
        )
        self._bare_action_pattern = re.compile(
            rf"\b(?P<verb>{verb_pattern})\s+(?P<object>[^.;:\n]+)",
            flags=re.IGNORECASE,
        )
        self._nominal_action_pattern = re.compile(
            rf"\b(?P<nominal>{nominal_pattern})\s+(?:de|do|da|dos|das)\s+"
            rf"(?P<object>.+?)(?=(?:\s+(?:e|ou)\s+(?:{nominal_pattern})\s+"
            rf"(?:de|do|da|dos|das)\b)|[.;,\n]|$)",
            flags=re.IGNORECASE,
        )

    def parse_actions(self, sentence: str) -> List[ParsedAction]:
        matches: List[ParsedAction] = []
        for fragment in self._candidate_fragments(sentence):
            fragment_matches: List[ParsedAction] = []
            for pattern in (self._capability_pattern, self._intent_pattern, self._system_pattern, self._actor_pattern):
                for match in pattern.finditer(fragment):
                    parsed = self._to_action(match, sentence)
                    if parsed:
                        fragment_matches.append(parsed)
            if not fragment_matches:
                parsed = self._parse_bare_action(fragment, sentence)
                if parsed:
                    fragment_matches.append(parsed)
            if not fragment_matches:
                fragment_matches.extend(self._parse_nominal_actions(fragment, sentence))

            for parsed in fragment_matches:
                if parsed.name not in [item.name for item in matches]:
                    matches.append(parsed)
        return matches

    def parse_action_phrase(self, phrase: str, default_actor: str = "Usuario") -> Optional[ParsedAction]:
        phrase = self._strip_case_use_prefix(phrase)
        for pattern in (self._actor_pattern, self._bare_action_pattern):
            match = pattern.search(phrase)
            if not match:
                continue
            actor = match.groupdict().get("actor") or default_actor
            parsed = self._to_action(match, phrase, fallback_actor=actor)
            if parsed:
                return parsed
        return None

    def _to_action(self, match: re.Match[str], sentence: str, fallback_actor: str = "Usuario") -> Optional[ParsedAction]:
        raw_actor = match.groupdict().get("actor") or fallback_actor
        if self._is_invalid_actor(raw_actor):
            return None
        actor = clean_actor(raw_actor)
        verb = self.lexicon.canonical(match.group("verb"))
        obj = clean_object(match.group("object"))
        if not obj:
            return None
        condition = self._extract_condition(sentence)
        return ParsedAction(actor=actor, verb=verb, obj=obj, condition=condition, sentence=normalize_spaces(sentence))

    def _candidate_fragments(self, sentence: str) -> List[str]:
        fragments = [sentence]
        fragments.extend(part.strip() for part in re.split(r",", sentence) if part.strip())
        return fragments

    def _parse_bare_action(self, fragment: str, sentence: str) -> Optional[ParsedAction]:
        if self._has_relationship_marker(fragment):
            return None
        match = self._bare_action_pattern.match(fragment.strip())
        if not match:
            return None
        return self._to_action(match, sentence, fallback_actor="Usuario")

    def _parse_nominal_actions(self, fragment: str, sentence: str) -> List[ParsedAction]:
        if self._has_relationship_marker(fragment):
            return []
        actions: List[ParsedAction] = []
        for match in self._nominal_action_pattern.finditer(fragment):
            verb = self.lexicon.canonical_from_nominal(match.group("nominal"))
            obj = clean_object(match.group("object"))
            if not obj:
                continue
            actions.append(
                ParsedAction(
                    actor="Usuario",
                    verb=verb,
                    obj=obj,
                    condition=self._extract_condition(sentence),
                    sentence=normalize_spaces(sentence),
                )
            )
        return actions

    def _is_invalid_actor(self, raw_actor: str) -> bool:
        normalized = raw_actor.strip().lower()
        normalized = re.sub(r"\s+", " ", normalized)
        if normalized in {"para", "antes", "apos", "após", "quando", "caso", "se", "quero", "preciso", "gostaria"}:
            return True
        return self._has_relationship_marker(normalized)

    def _has_relationship_marker(self, value: str) -> bool:
        return bool(
            re.search(
                r"\b(inclui|requer|exige|necessita|depende|estende|extende|extensão|extensao)\b",
                value,
                flags=re.IGNORECASE,
            )
        )

    def _extract_condition(self, sentence: str) -> str:
        match = re.search(r"\b(quando|caso|se|desde que)\s+(.+)$", sentence, flags=re.IGNORECASE)
        if not match:
            return ""
        return normalize_spaces(match.group(0).strip(" .,:;"))

    def _strip_case_use_prefix(self, phrase: str) -> str:
        return re.sub(
            r"^\s*(?:o|a)?\s*caso\s+de\s+uso\s+",
            "",
            phrase,
            flags=re.IGNORECASE,
        ).strip()


class RuleBasedUseCaseExtractor:
    def __init__(self, action_parser: Optional[PortugueseActionParser] = None) -> None:
        self.action_parser = action_parser or PortugueseActionParser()

    def extract(self, text: str) -> UseCaseDocument:
        document = UseCaseDocument()
        for sentence in split_sentences(text):
            for action in self.action_parser.parse_actions(sentence):
                actor = document.add_actor(action.actor)
                document.get_or_add_use_case(
                    name=action.name,
                    actor_id=actor.id,
                    description=self._describe(action.actor, action.name),
                    trigger=action.condition,
                    source_sentence=action.sentence,
                )
        self._complete_default_flows(document)
        return document

    def _describe(self, actor: str, use_case_name: str) -> str:
        return f"Permite ao ator {actor} executar o objetivo: {use_case_name}."

    def _complete_default_flows(self, document: UseCaseDocument) -> None:
        for use_case in document.use_cases:
            if not use_case.main_flow:
                use_case.main_flow = [
                    f"O ator solicita: {use_case.name}.",
                    "O sistema valida os dados e as regras do processo.",
                    f"O sistema conclui o caso de uso {use_case.name}.",
                ]
            if not use_case.postconditions:
                use_case.postconditions = [f"{use_case.name} concluído com sucesso."]
