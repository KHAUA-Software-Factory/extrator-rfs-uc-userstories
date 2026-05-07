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


if __name__ == "__main__":
    unittest.main()
