from __future__ import annotations

import csv
from io import StringIO

from usecase_solid.domain import UseCaseDocument
from usecase_solid.exporters.formatting import actor_names, relationship_summary
from usecase_solid.text_utils import join_unique


class CsvUseCaseExporter:
    def export(self, document: UseCaseDocument) -> str:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "atores", "caso_de_uso", "descricao", "gatilho", "pre_condicoes", "relacoes"])
        for use_case in document.use_cases:
            writer.writerow(
                [
                    use_case.id,
                    actor_names(document, use_case),
                    use_case.name,
                    use_case.description,
                    use_case.trigger,
                    join_unique(use_case.preconditions),
                    relationship_summary(document, use_case),
                ]
            )
        return output.getvalue()
