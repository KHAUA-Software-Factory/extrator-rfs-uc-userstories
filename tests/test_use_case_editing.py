from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from usecase_solid.domain import FunctionalRequirement, UseCase
from usecase_solid.web_gui import (
    WebGuiState,
    _use_cases_from_form,
    _use_cases_match,
)


def _seed_state_with_use_cases(tmp_dir: Path) -> WebGuiState:
    state = WebGuiState(tmp_dir)
    requirements = [
        FunctionalRequirement(
            id="RF001",
            description="O Cliente realiza pedido pelo totem.",
            actor="Cliente",
            action="realizar",
            object_name="pedido",
            priority="Alta",
            source="frase de origem",
        ),
        FunctionalRequirement(
            id="RF002",
            description="O Atendente confirma o pedido no balcao.",
            actor="Atendente",
            action="confirmar",
            object_name="pedido",
            priority="Media",
            source="",
        ),
    ]
    state.last_input_text = "Sistema de totem do McDonalds."
    state.last_requirements = list(requirements)
    state.requirements_validated = True
    result, _ = state.generate_use_cases_from_requirements(requirements, input_text=state.last_input_text)
    assert result.document.use_cases, "fixture deveria ter use cases"
    return state


class WebGuiUseCaseEditingTest(unittest.TestCase):
    def test_update_use_cases_replaces_state_and_invalidates_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            state = _seed_state_with_use_cases(tmp_dir)
            state.use_cases_validated = True

            existing = list(state.last_result.document.use_cases)
            edited = [
                UseCase(
                    id=existing[0].id,
                    name="Realizar pedido (atualizado)",
                    actor_ids=list(existing[0].actor_ids),
                    description="Cliente faz o pedido pelo totem com customizacoes.",
                    trigger=existing[0].trigger,
                    preconditions=["Cliente identificado"],
                    source_sentences=list(existing[0].source_sentences),
                ),
            ]

            result, paths = state.update_use_cases(edited)

            self.assertEqual(len(result.document.use_cases), 1)
            self.assertEqual(result.document.use_cases[0].name, "Realizar pedido (atualizado)")
            self.assertFalse(state.use_cases_validated)
            self.assertEqual(state.last_user_stories, [])
            self.assertIn("tabela_casos_de_uso.md", paths)

    def test_use_cases_from_form_parses_actors_and_preconditions(self) -> None:
        fields = {
            "uc_id": ["UC001", "UC002"],
            "uc_name": ["Realizar pedido", "Confirmar pedido"],
            "uc_actors": ["Cliente, Atendente", "Atendente"],
            "uc_description": ["descricao 1", "descricao 2"],
            "uc_trigger": ["clica botao", "recebe pedido"],
            "uc_preconditions": ["Cliente logado\nSaldo positivo", "Pedido aberto"],
            "uc_sources": ["", ""],
        }

        ucs = _use_cases_from_form(fields)

        self.assertEqual(len(ucs), 2)
        self.assertEqual(ucs[0].id, "UC001")
        self.assertEqual(ucs[0].actor_ids, ["cliente", "atendente"])
        self.assertEqual(ucs[0].preconditions, ["Cliente logado", "Saldo positivo"])
        self.assertEqual(ucs[1].actor_ids, ["atendente"])
        self.assertEqual(ucs[1].preconditions, ["Pedido aberto"])

    def test_use_cases_match_detects_changes(self) -> None:
        original = [
            UseCase(id="UC001", name="A", actor_ids=["x"]),
            UseCase(id="UC002", name="B", actor_ids=["y"]),
        ]
        same = [
            UseCase(id="UC001", name="A", actor_ids=["x"]),
            UseCase(id="UC002", name="B", actor_ids=["y"]),
        ]
        edited = [
            UseCase(id="UC001", name="A renomeado", actor_ids=["x"]),
            UseCase(id="UC002", name="B", actor_ids=["y"]),
        ]
        self.assertTrue(_use_cases_match(original, same))
        self.assertFalse(_use_cases_match(original, edited))
        self.assertFalse(_use_cases_match(original, original[:1]))


if __name__ == "__main__":
    unittest.main()
