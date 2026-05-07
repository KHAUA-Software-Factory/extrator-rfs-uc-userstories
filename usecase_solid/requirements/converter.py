from __future__ import annotations

from typing import Iterable

from usecase_solid.domain import FunctionalRequirement, UseCaseDocument
from usecase_solid.text_utils import sentence_case


class RequirementsToUseCasesConverter:
    def convert(self, requirements: Iterable[FunctionalRequirement]) -> UseCaseDocument:
        document = UseCaseDocument()
        for requirement in requirements:
            if not requirement.action or not requirement.object_name:
                continue
            actor = document.add_actor(requirement.actor or "Usuario")
            use_case = document.get_or_add_use_case(
                name=requirement.use_case_name,
                actor_id=actor.id,
                description=requirement.description or self._default_description(requirement),
                source_sentence=f"{requirement.id}: {requirement.description}",
            )
            if not use_case.main_flow:
                use_case.main_flow = self._main_flow(requirement)
            if not use_case.postconditions:
                use_case.postconditions = [f"{sentence_case(requirement.object_name)} atualizado conforme o requisito {requirement.id}."]
        return document

    def _default_description(self, requirement: FunctionalRequirement) -> str:
        return f"O sistema deve permitir que {requirement.actor.lower()} {requirement.use_case_name.lower()}."

    def _main_flow(self, requirement: FunctionalRequirement) -> list[str]:
        return [
            f"O ator solicita: {requirement.use_case_name}.",
            f"O sistema executa o requisito {requirement.id}.",
            "O sistema confirma a conclusao da operacao.",
        ]
