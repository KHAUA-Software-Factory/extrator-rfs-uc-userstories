from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from usecase_solid.bootstrap import build_analysis_service
from usecase_solid.output_writer import write_analysis_outputs, write_requirements_outputs
from usecase_solid.requirements import export_requirements_markdown, requirements_from_json


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extrai casos de uso de texto em portugues e gera tabela, relatorio e diagramas."
    )
    parser.add_argument("--text", help="Texto de requisitos em linguagem natural.")
    parser.add_argument("--file", type=Path, help="Arquivo .txt com a descricao em linguagem natural.")
    parser.add_argument("--out", type=Path, default=Path("outputs"), help="Diretorio de saida.")
    parser.add_argument("--gui", action="store_true", help="Abre a interface grafica.")
    parser.add_argument("--extract-requirements", action="store_true", help="Usa IA para extrair requisitos funcionais.")
    parser.add_argument(
        "--suggest-extras",
        action="store_true",
        help=(
            "Quando combinado com --extract-requirements, permite que a IA sugira RFs "
            "comuns inferidos do contexto (com origem prefixada por 'sugestao IA:')."
        ),
    )
    parser.add_argument("--requirements-file", type=Path, help="Arquivo JSON de requisitos aprovados para gerar casos de uso.")
    args = parser.parse_args(argv)

    if args.gui:
        from usecase_solid.interface_launcher import run_interface

        return run_interface()

    service = build_analysis_service()

    if args.requirements_file:
        requirements = requirements_from_json(args.requirements_file.read_text(encoding="utf-8"))
        result = service.execute_from_requirements(requirements)
        outputs = write_analysis_outputs(result, args.out, requirements=requirements)
        print(result.markdown_table)
        print()
        print("Arquivos gerados:")
        for path in outputs.values():
            print(f"- {path}")
        return 0

    text = _read_input(args.text, args.file)
    if not text.strip():
        print("Nenhum texto informado.", file=sys.stderr)
        return 2

    if args.extract_requirements:
        from usecase_solid.ai import OpenAIRequirementsExtractor

        try:
            requirements = OpenAIRequirementsExtractor().extract(text, suggest_extras=args.suggest_extras)
        except Exception as exc:
            print(f"Erro ao extrair requisitos com IA: {exc}", file=sys.stderr)
            return 1
        outputs = write_requirements_outputs(requirements, args.out)
        print(export_requirements_markdown(requirements))
        print()
        print("Arquivos gerados:")
        for path in outputs.values():
            print(f"- {path}")
        return 0

    result = service.execute(text)
    outputs = write_analysis_outputs(result, args.out, input_text=text)

    print(result.markdown_table)
    print()
    print("Arquivos gerados:")
    for path in outputs.values():
        print(f"- {path}")
    return 0


def _read_input(text_arg: Optional[str], file_arg: Optional[Path]) -> str:
    if text_arg:
        return text_arg
    if file_arg:
        return file_arg.read_text(encoding="utf-8")
    print("Digite a descricao do sistema em portugues. Finalize com Ctrl-D:")
    return sys.stdin.read()
