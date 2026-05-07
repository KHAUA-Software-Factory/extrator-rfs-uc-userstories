import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from usecase_solid.bootstrap import build_analysis_service
from usecase_solid.domain import FunctionalRequirement
from usecase_solid.output_writer import write_pdf_report

try:
    import reportlab  # noqa: F401
    import svglib  # noqa: F401
    PDF_DEPS_AVAILABLE = True
except ImportError:
    PDF_DEPS_AVAILABLE = False


@unittest.skipUnless(PDF_DEPS_AVAILABLE, "reportlab/svglib nao instalados")
class PdfReportTest(unittest.TestCase):
    def test_pdf_report_contains_pdf_header_and_eof(self):
        text = (
            "O cliente pode realizar login. "
            "O cliente pode consultar pedidos. "
            "Para consultar pedidos, o cliente deve realizar login."
        )
        result = build_analysis_service().execute(text)
        requirements = [
            FunctionalRequirement(
                id="RF001",
                description="O cliente deve consultar pedidos.",
                actor="Cliente",
                action="Consultar",
                object_name="pedidos",
                priority="Alta",
                source="consultar pedidos",
            )
        ]

        with TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            pdf_path = write_pdf_report(text, requirements, result, output_dir)
            self.assertIsNotNone(pdf_path)
            data = pdf_path.read_bytes()
            self.assertTrue(data.startswith(b"%PDF-"), "PDF deve comecar com %PDF-")
            self.assertIn(b"%%EOF", data[-64:])
            self.assertGreater(len(data), 5_000, "PDF parece pequeno demais")


@unittest.skipUnless(PDF_DEPS_AVAILABLE, "reportlab/svglib nao instalados")
class PdfReportTallSvgTest(unittest.TestCase):
    """Garante que diagramas SVG muito altos sao escalados para caber na pagina A4."""

    def test_tall_svg_does_not_raise_layout_error(self):
        from dataclasses import replace
        text = (
            "O cliente realiza login. O cliente consulta pedidos. "
            "Para consultar pedidos, o cliente deve realizar login. "
            "O atendente cadastra produtos. O gerente aprova relatorios."
        )
        result = build_analysis_service().execute(text)

        tall_svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="510" height="2400" '
            'viewBox="0 0 510 2400">'
            '<rect x="10" y="10" width="490" height="2380" fill="white" stroke="black"/>'
            '<text x="20" y="40" font-size="14">Diagrama gigante para regressao</text>'
            "</svg>"
        )
        result_tall = replace(result, svg_diagram=tall_svg)

        requirements = [
            FunctionalRequirement(
                id="RF001",
                description="Consultar pedidos.",
                actor="Cliente",
                action="Consultar",
                object_name="pedidos",
                priority="Alta",
            )
        ]

        with TemporaryDirectory() as tmp:
            pdf_path = write_pdf_report(text, requirements, result_tall, Path(tmp))
            self.assertIsNotNone(pdf_path, "geracao com SVG alto nao deveria abortar")
            data = pdf_path.read_bytes()
            self.assertTrue(data.startswith(b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
