from __future__ import annotations

import re
import unicodedata
from typing import Iterable, List


ARTICLES = {"a", "as", "o", "os", "um", "uma", "uns", "umas"}


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_for_match(value: str) -> str:
    value = strip_accents(value).lower()
    value = re.sub(r"[^a-z0-9\s/_-]", " ", value)
    return normalize_spaces(value)


def slugify(value: str) -> str:
    slug = normalize_for_match(value)
    slug = re.sub(r"[^a-z0-9]+", "_", slug).strip("_")
    return slug or "usuario"


def sentence_case(value: str) -> str:
    value = normalize_spaces(value)
    if not value:
        return value
    return value[0].upper() + value[1:]


def clean_actor(value: str) -> str:
    value = normalize_spaces(value)
    value = re.sub(
        r"^(quando|caso|se|entao|então|tambem|também|e|alem disso|além disso|que)\s+",
        "",
        value,
        flags=re.IGNORECASE,
    )
    words = [word for word in value.split() if normalize_for_match(word) not in ARTICLES]
    value = " ".join(words)
    return sentence_case(value) if value else "Usuario"


def clean_object(value: str) -> str:
    value = normalize_spaces(value)
    value = re.split(
        r"\b(quando|caso|se|desde que|apos|após|antes de|durante|no fluxo de|na etapa de|opcionalmente)\b",
        value,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    value = re.sub(r"^(de|do|da|dos|das|um|uma|o|a|os|as)\s+", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+(e|ou)$", "", value, flags=re.IGNORECASE)
    return normalize_spaces(value.strip(" .,:;"))


def split_sentences(text: str) -> List[str]:
    text = text.replace("\r\n", "\n")
    parts: List[str] = []
    for line in text.splitlines():
        line = normalize_spaces(line)
        if not line:
            continue
        chunks = re.split(r"(?<=[.!?;])\s+", line)
        parts.extend(chunk.strip() for chunk in chunks if chunk.strip())
    return parts


def loose_fingerprint(value: str) -> str:
    normalized = normalize_for_match(value)
    tokens = []
    for token in normalized.split():
        if token in ARTICLES:
            continue
        if len(token) > 3 and token.endswith("s"):
            token = token[:-1]
        tokens.append(token)
    return " ".join(tokens)


def join_unique(values: Iterable[str], separator: str = "; ") -> str:
    output: List[str] = []
    for value in values:
        value = normalize_spaces(value)
        if value and value not in output:
            output.append(value)
    return separator.join(output)


def wrap_text(value: str, max_chars: int) -> List[str]:
    words = normalize_spaces(value).split()
    if not words:
        return [""]

    lines: List[str] = []
    current: List[str] = []
    current_len = 0
    for word in words:
        projected = current_len + len(word) + (1 if current else 0)
        if current and projected > max_chars:
            lines.append(" ".join(current))
            current = [word]
            current_len = len(word)
        else:
            current.append(word)
            current_len = projected
    if current:
        lines.append(" ".join(current))
    return lines
