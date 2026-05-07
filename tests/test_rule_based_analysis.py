import unittest

from usecase_solid.bootstrap import build_analysis_service
from usecase_solid.domain import FunctionalRequirement, RelationshipType
from usecase_solid.requirements import requirements_from_json, requirements_to_json


class RuleBasedAnalysisTest(unittest.TestCase):
    def test_extracts_use_cases_and_relationships(self):
        text = """
        O cliente pode realizar login no sistema.
        O cliente pode consultar pedidos.
        Para consultar pedidos, o cliente deve realizar login.
        O cliente pode cancelar pedido quando o pedido ainda não foi enviado.
        Cancelar pedido estende consultar pedidos quando o pedido ainda não foi enviado.
        O administrador deve cadastrar produto.
        """

        result = build_analysis_service().execute(text)

        names = {use_case.name for use_case in result.document.use_cases}
        self.assertIn("Realizar login no sistema", names)
        self.assertIn("Consultar pedidos", names)
        self.assertIn("Cancelar pedido", names)
        self.assertIn("Cadastrar produto", names)

        relationships = {(item.type, item.source_id, item.target_id) for item in result.document.relationships}
        self.assertTrue(any(item[0] is RelationshipType.INCLUDE for item in relationships))
        self.assertTrue(any(item[0] is RelationshipType.EXTEND for item in relationships))
        self.assertIn("| ID | Ator(es) | Caso de uso |", result.markdown_table)
        self.assertIn("<svg", result.svg_diagram)
        self.assertIn('class="relationship-edge"', result.svg_diagram)
        self.assertIn(" H ", result.svg_diagram)
        self.assertIn(" V ", result.svg_diagram)

    def test_handles_text_without_use_cases(self):
        result = build_analysis_service().execute("qualquer texto sem acao reconhecida")

        self.assertEqual([], result.document.use_cases)
        self.assertIn("| ID | Ator(es) | Caso de uso |", result.markdown_table)
        self.assertIn("Nenhum caso de uso identificado", result.svg_diagram)

    def test_extracts_short_action_without_actor(self):
        result = build_analysis_service().execute("criar novos pedidos")

        self.assertEqual(1, len(result.document.use_cases))
        self.assertEqual("Criar novos pedidos", result.document.use_cases[0].name)
        self.assertIn("Usuario", result.markdown_table)

    def test_extracts_user_intention_sentence(self):
        result = build_analysis_service().execute("Eu quero criar novos pedidos")

        self.assertEqual(1, len(result.document.use_cases))
        self.assertEqual("Criar novos pedidos", result.document.use_cases[0].name)
        self.assertIn("Usuario", result.markdown_table)

    def test_extracts_system_capability_without_explicit_actor(self):
        result = build_analysis_service().execute("O sistema deve permitir criar novos pedidos")

        self.assertEqual(1, len(result.document.use_cases))
        self.assertEqual("Criar novos pedidos", result.document.use_cases[0].name)

    def test_extracts_nominal_functionality_list(self):
        result = build_analysis_service().execute("Funcionalidades: cadastro de clientes, consulta de pedidos e emissão de relatórios.")

        names = {use_case.name for use_case in result.document.use_cases}
        self.assertIn("Cadastrar clientes", names)
        self.assertIn("Consultar pedidos", names)
        self.assertIn("Emitir relatórios", names)

    def test_generates_use_cases_from_approved_requirements(self):
        requirements = [
            FunctionalRequirement(
                id="RF001",
                description="O sistema deve permitir que o cliente crie novos pedidos.",
                actor="Cliente",
                action="Criar",
                object_name="novos pedidos",
                priority="Alta",
                source="criar novos pedidos",
            )
        ]

        result = build_analysis_service().execute_from_requirements(requirements)

        self.assertEqual(1, len(result.document.use_cases))
        self.assertEqual("Criar novos pedidos", result.document.use_cases[0].name)
        self.assertIn("Cliente", result.markdown_table)

    def test_serializes_requirements_to_json(self):
        requirements = [
            FunctionalRequirement(
                id="RF001",
                description="O sistema deve permitir consultar pedidos.",
                actor="Usuario",
                action="Consultar",
                object_name="pedidos",
            )
        ]

        parsed = requirements_from_json(requirements_to_json(requirements))

        self.assertEqual("RF001", parsed[0].id)
        self.assertEqual("Consultar", parsed[0].action)
        self.assertEqual("pedidos", parsed[0].object_name)


if __name__ == "__main__":
    unittest.main()
