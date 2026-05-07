from __future__ import annotations

import re

from usecase_solid.text_utils import normalize_spaces


class PortugueseTextPreprocessor:
    """Normaliza texto preservando informacao semantica relevante."""

    def preprocess(self, text: str) -> str:
        text = text.replace("\u2022", "\n")
        text = text.replace("-", " - ")
        text = re.sub(r"[ \t]+", " ", text)
        lines = [normalize_spaces(line) for line in text.splitlines()]
        return "\n".join(line for line in lines if line)
