import unittest

from usecase_solid.domain import UserStory
from usecase_solid.domain.user_stories import user_stories_from_dicts


class UserStoryTest(unittest.TestCase):
    def test_text_format(self):
        story = UserStory(id="US001", role="Cliente", want="consultar pedidos", benefit="acompanhar minhas compras")
        self.assertEqual(
            "Como Cliente, eu quero consultar pedidos para acompanhar minhas compras.",
            story.text,
        )

    def test_text_without_benefit(self):
        story = UserStory(id="US002", role="Admin", want="cadastrar produto", benefit="")
        self.assertEqual("Como Admin, eu quero cadastrar produto.", story.text)

    def test_round_trip_dict(self):
        original = UserStory(
            id="US001",
            role="Cliente",
            want="cancelar pedido",
            benefit="parar uma compra equivocada",
            acceptance_criteria=["Dado um pedido nao enviado", "Quando cancelo", "Entao o status fica cancelado"],
            related_uc_ids=["UC003"],
        )
        copies = user_stories_from_dicts([original.to_dict()])
        self.assertEqual(1, len(copies))
        copy = copies[0]
        self.assertEqual(original.id, copy.id)
        self.assertEqual(original.role, copy.role)
        self.assertEqual(original.want, copy.want)
        self.assertEqual(original.benefit, copy.benefit)
        self.assertEqual(original.acceptance_criteria, copy.acceptance_criteria)
        self.assertEqual(original.related_uc_ids, copy.related_uc_ids)

    def test_assigns_id_when_missing(self):
        stories = user_stories_from_dicts([
            {"papel": "Cliente", "quero": "x", "para": "y"},
            {"papel": "Cliente", "quero": "x", "para": "y"},
        ])
        self.assertEqual("US001", stories[0].id)
        self.assertEqual("US002", stories[1].id)


if __name__ == "__main__":
    unittest.main()
