from __future__ import annotations

from typing import Protocol

from usecase_solid.domain import UseCaseDocument


class TextPreprocessor(Protocol):
    def preprocess(self, text: str) -> str:
        ...


class UseCaseExtractor(Protocol):
    def extract(self, text: str) -> UseCaseDocument:
        ...


class RelationshipDetector(Protocol):
    def detect(self, text: str, document: UseCaseDocument) -> None:
        ...


class DocumentExporter(Protocol):
    def export(self, document: UseCaseDocument) -> str:
        ...


class DiagramRenderer(Protocol):
    def render(self, document: UseCaseDocument) -> str:
        ...
