from __future__ import annotations

import html
import mimetypes
import os
import posixpath
import re
import socketserver
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Dict, List, Optional

from usecase_solid.ai import OpenAIRequirementsExtractor, OpenAIUserStoriesExtractor
from usecase_solid.application import UseCaseAnalysisResult
from usecase_solid.bootstrap import build_analysis_service
from usecase_solid.domain import FunctionalRequirement, UserStory
from usecase_solid.domain.models import Actor, UseCase, UseCaseDocument
from usecase_solid.domain.requirements import requirements_from_dicts
from usecase_solid.output_writer import write_analysis_outputs, write_pdf_report, write_requirements_outputs
from usecase_solid.text_utils import slugify


_RF_ID_PATTERN = re.compile(r"^RF(\d+)$", re.IGNORECASE)
_UC_ID_PATTERN = re.compile(r"^UC(\d+)$", re.IGNORECASE)


class WebGuiState:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        self.service = build_analysis_service()
        self.example_text = self._read_example()
        self.last_input_text: str = ""
        self.last_requirements: List[FunctionalRequirement] = []
        self.last_result: Optional[UseCaseAnalysisResult] = None
        self.last_user_stories: List[UserStory] = []
        self.requirements_validated: bool = False
        self.use_cases_validated: bool = False

    def extract_requirements(
        self, text: str, suggest_extras: bool = False
    ) -> tuple[List[FunctionalRequirement], Dict[str, Path]]:
        requirements = OpenAIRequirementsExtractor().extract(text, suggest_extras=suggest_extras)
        paths = write_requirements_outputs(requirements, self.output_dir)
        self.last_input_text = text
        self.last_requirements = list(requirements)
        self.last_result = None
        self.last_user_stories = []
        self.requirements_validated = False
        self.use_cases_validated = False
        return requirements, paths

    def validate_requirements(self, requirements: List[FunctionalRequirement]) -> None:
        self.last_requirements = list(requirements)
        self.requirements_validated = True
        self.use_cases_validated = False
        self.last_user_stories = []
        self.last_result = None

    def generate_use_cases_from_requirements(
        self, requirements: List[FunctionalRequirement], input_text: str = ""
    ) -> tuple[UseCaseAnalysisResult, Dict[str, Path]]:
        result = self.service.execute_from_requirements(requirements)
        paths = write_analysis_outputs(
            result,
            self.output_dir,
            input_text=input_text or self.last_input_text,
            requirements=requirements,
        )
        self.last_input_text = input_text or self.last_input_text
        self.last_requirements = list(requirements)
        self.last_result = result
        self.use_cases_validated = False
        self.last_user_stories = []
        return result, paths

    def validate_use_cases(self) -> None:
        if self.last_result is None:
            return
        self.use_cases_validated = True

    def update_use_cases(
        self, updated: List[UseCase]
    ) -> tuple[UseCaseAnalysisResult, Dict[str, Path]]:
        document = self._build_document_from_use_cases(updated)
        result = self.service._build_result(document)
        paths = write_analysis_outputs(
            result,
            self.output_dir,
            input_text=self.last_input_text,
            requirements=self.last_requirements,
        )
        self.last_result = result
        self.use_cases_validated = False
        self.last_user_stories = []
        return result, paths

    def _build_document_from_use_cases(self, updated: List[UseCase]) -> UseCaseDocument:
        previous = self.last_result.document if self.last_result is not None else None
        document = UseCaseDocument()
        document.use_cases = list(updated)

        referenced_actor_ids: set[str] = set()
        for uc in updated:
            referenced_actor_ids.update(uc.actor_ids)

        if previous is not None:
            for actor_id, actor in previous.actors.items():
                if actor_id in referenced_actor_ids:
                    document.actors[actor_id] = actor
        for actor_id in referenced_actor_ids:
            if actor_id not in document.actors:
                fallback_name = actor_id.replace("_", " ").strip().title() or actor_id
                document.actors[actor_id] = Actor(id=actor_id, name=fallback_name)

        valid_uc_ids = {uc.id for uc in updated}
        if previous is not None:
            for relationship in previous.relationships:
                if (
                    relationship.source_id in valid_uc_ids
                    and relationship.target_id in valid_uc_ids
                ):
                    document.relationships.append(relationship)
        return document

    def generate_user_stories(self) -> List[UserStory]:
        if self.last_result is None:
            raise RuntimeError("Gere os casos de uso antes de criar user stories.")
        if not self.use_cases_validated:
            raise RuntimeError("Valide os casos de uso antes de criar user stories.")
        stories = OpenAIUserStoriesExtractor().extract(self.last_result)
        self.last_user_stories = list(stories)
        return stories

    def reset_pipeline(self) -> None:
        self.last_input_text = ""
        self.last_requirements = []
        self.last_result = None
        self.last_user_stories = []
        self.requirements_validated = False
        self.use_cases_validated = False

    def process_directly(self, text: str) -> tuple[UseCaseAnalysisResult, Dict[str, Path]]:
        result = self.service.execute(text)
        paths = write_analysis_outputs(result, self.output_dir, input_text=text)
        self.last_input_text = text
        self.last_requirements = []
        self.last_result = result
        self.requirements_validated = False
        self.use_cases_validated = False
        self.last_user_stories = []
        return result, paths

    def build_pdf(self) -> Optional[bytes]:
        if self.last_result is None and not self.last_requirements and not self.last_input_text:
            return None
        path = write_pdf_report(
            self.last_input_text,
            self.last_requirements,
            self.last_result,
            self.output_dir,
            user_stories=self.last_user_stories,
        )
        if path is None:
            return None
        return path.read_bytes()

    def _read_example(self) -> str:
        example = Path("examples/entrada.txt")
        if example.exists():
            return example.read_text(encoding="utf-8")
        return ""


def run_web_gui(
    host: Optional[str] = None,
    port: Optional[int] = None,
    open_browser: Optional[bool] = None,
    output_dir: Optional[Path] = None,
) -> int:
    if host is None:
        host = os.environ.get("GUI_HOST", "127.0.0.1").strip() or "127.0.0.1"
    if port is None:
        port_env = os.environ.get("GUI_PORT", "8765").strip()
        port = int(port_env or "8765")
    if open_browser is None:
        open_browser = os.environ.get("GUI_OPEN_BROWSER", "1").strip().lower() not in {"0", "false", "no", "off"}
    if output_dir is None:
        output_dir = Path(os.environ.get("GUI_OUTPUT_DIR", "outputs/web_gui").strip() or "outputs/web_gui")

    state = WebGuiState(output_dir)
    handler_class = _build_handler(state)

    with _bind_server(host, port, handler_class) as server:
        actual_port = server.server_address[1]
        display_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
        url = f"http://{display_host}:{actual_port}"
        print(f"Interface web disponivel em: {url}")
        if host in {"0.0.0.0", "::"}:
            print(f"(escutando em {host}:{actual_port}, acessivel pela rede)")
        print("Pressione Ctrl+C para encerrar.")
        if open_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nInterface encerrada.")
    return 0


def _bind_server(host: str, port: int, handler_class: type[BaseHTTPRequestHandler]) -> socketserver.TCPServer:
    last_error: Optional[OSError] = None
    for candidate_port in range(port, port + 20):
        try:
            return ReusableThreadingTCPServer((host, candidate_port), handler_class)
        except OSError as exc:
            last_error = exc
            continue
    detail = f" Ultimo erro: {last_error}" if last_error else ""
    raise OSError(f"Nao foi possivel abrir uma porta entre {port} e {port + 19}.{detail}")


class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def _build_handler(state: WebGuiState) -> type[BaseHTTPRequestHandler]:
    def _render_page(*args, **kwargs) -> str:
        kwargs.setdefault("requirements_validated", state.requirements_validated)
        kwargs.setdefault("use_cases_validated", state.use_cases_validated)
        kwargs.setdefault("user_stories", state.last_user_stories)
        return _render_page_impl(*args, **kwargs)

    class UseCaseWebGuiHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/":
                self._send_html(_render_page(state.example_text))
                return
            if parsed.path == "/download-pdf":
                self._download_pdf_from_state()
                return
            if parsed.path.startswith("/outputs/"):
                self._send_output_file(parsed.path)
                return
            self.send_error(404, "Pagina nao encontrada")

        def do_POST(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            fields = urllib.parse.parse_qs(body, keep_blank_values=True)
            description = fields.get("description", [""])[0].strip()
            suggest_extras = _is_checked(fields, "suggest_extras")

            if parsed.path == "/extract-requirements":
                self._extract_requirements(description, suggest_extras)
                return
            if parsed.path == "/generate-use-cases":
                self._generate_use_cases(description, fields, suggest_extras)
                return
            if parsed.path == "/process-direct":
                self._process_directly(description, suggest_extras)
                return
            if parsed.path == "/add-requirement":
                self._add_requirement(description, fields, suggest_extras)
                return
            if parsed.path == "/remove-requirement":
                self._remove_requirement(description, fields, suggest_extras)
                return
            if parsed.path == "/validate-requirements":
                self._validate_requirements(description, fields, suggest_extras)
                return
            if parsed.path == "/validate-use-cases":
                self._validate_use_cases(description, fields, suggest_extras)
                return
            if parsed.path == "/save-use-cases":
                self._save_use_cases(description, fields, suggest_extras)
                return
            if parsed.path == "/add-use-case":
                self._add_use_case(description, fields, suggest_extras)
                return
            if parsed.path == "/remove-use-case":
                self._remove_use_case(description, fields, suggest_extras)
                return
            if parsed.path == "/generate-user-stories":
                self._generate_user_stories(description, suggest_extras)
                return
            if parsed.path == "/download-pdf":
                self._download_pdf_from_form(description, fields, suggest_extras)
                return
            if parsed.path == "/reset":
                self._reset_pipeline()
                return
            self.send_error(404, "Pagina nao encontrada")

        def _extract_requirements(self, description: str, suggest_extras: bool) -> None:
            if not description:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        error="Digite uma descricao antes de extrair requisitos.",
                    )
                )
                return
            try:
                requirements, paths = state.extract_requirements(description, suggest_extras=suggest_extras)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        error=f"Erro ao extrair requisitos com IA: {exc}",
                    )
                )
                return
            modo = "modo SUGESTAO IA" if suggest_extras else "modo conservador"
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=requirements,
                    requirement_paths=paths,
                    status=(
                        f"{len(requirements)} requisito(s) funcional(is) extraido(s) ({modo}). "
                        "Revise, edite e aprove para gerar casos de uso."
                    ),
                )
            )

        def _generate_use_cases(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            requirements = _requirements_from_form(fields)
            if not requirements:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        error="Nenhum requisito funcional aprovado foi informado.",
                    )
                )
                return
            if not state.requirements_validated:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=requirements,
                        error="Clique em 'Validar requisitos' antes de gerar os casos de uso.",
                    )
                )
                return
            try:
                write_requirements_outputs(requirements, state.output_dir)
                result, paths = state.generate_use_cases_from_requirements(requirements, input_text=description)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=requirements,
                        error=f"Erro ao gerar casos de uso: {exc}",
                    )
                )
                return
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=requirements,
                    result=result,
                    analysis_paths=paths,
                    status=(
                        f"{len(result.document.use_cases)} caso(s) de uso gerado(s). "
                        "Revise e clique em 'Validar casos de uso' para liberar a etapa de User Stories."
                    ),
                )
            )

        def _validate_requirements(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            requirements = _requirements_from_form(fields)
            if not requirements:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        error="Adicione pelo menos um requisito antes de validar.",
                    )
                )
                return
            state.validate_requirements(requirements)
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=requirements,
                    status=f"{len(requirements)} requisito(s) validado(s). Agora clique em 'Gerar casos de uso'.",
                )
            )

        def _validate_use_cases(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            if state.last_result is None:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        error="Gere os casos de uso antes de valida-los.",
                    )
                )
                return
            try:
                self._persist_inline_use_cases(fields)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=f"Erro ao salvar edicoes dos casos de uso: {exc}",
                    )
                )
                return
            state.validate_use_cases()
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=state.last_requirements,
                    result=state.last_result,
                    status=(
                        f"{len(state.last_result.document.use_cases)} caso(s) de uso validado(s). "
                        "Clique em 'Gerar User Stories com IA' para a proxima etapa."
                    ),
                )
            )

        def _save_use_cases(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            if state.last_result is None:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        error="Gere os casos de uso antes de salvar edicoes.",
                    )
                )
                return
            try:
                self._persist_inline_use_cases(fields)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=f"Erro ao salvar edicoes dos casos de uso: {exc}",
                    )
                )
                return
            ucs = state.last_result.document.use_cases if state.last_result else []
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=state.last_requirements,
                    result=state.last_result,
                    status=(
                        f"{len(ucs)} caso(s) de uso atualizado(s). Clique em 'Validar casos de uso' "
                        "para liberar a Etapa 3."
                    ),
                )
            )

        def _add_use_case(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            current = _use_cases_from_form(fields)
            current.append(_make_blank_use_case(current))
            try:
                state.update_use_cases(current)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=f"Erro ao adicionar caso de uso: {exc}",
                    )
                )
                return
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=state.last_requirements,
                    result=state.last_result,
                    status="Caso de uso em branco adicionado. Preencha os campos e clique em 'Salvar casos de uso'.",
                )
            )

        def _remove_use_case(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            current = _use_cases_from_form(fields)
            try:
                index = int(fields.get("remove_uc_index", ["-1"])[0])
            except ValueError:
                index = -1
            if 0 <= index < len(current):
                removed = current.pop(index)
                status = f"Caso de uso {removed.id or '(sem id)'} removido."
            else:
                status = "Indice invalido para remocao do caso de uso."
            try:
                state.update_use_cases(current)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=f"Erro ao remover caso de uso: {exc}",
                    )
                )
                return
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=state.last_requirements,
                    result=state.last_result,
                    status=status,
                )
            )

        def _persist_inline_use_cases(self, fields: Dict[str, List[str]]) -> None:
            if "uc_id" not in fields:
                return
            updated = _use_cases_from_form(fields)
            current = state.last_result.document.use_cases if state.last_result else []
            if not _use_cases_match(updated, current):
                state.update_use_cases(updated)

        def _generate_user_stories(self, description: str, suggest_extras: bool) -> None:
            try:
                stories = state.generate_user_stories()
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=f"Erro ao gerar User Stories: {exc}",
                    )
                )
                return
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=state.last_requirements,
                    result=state.last_result,
                    status=f"{len(stories)} user story(ies) gerada(s) com IA.",
                )
            )

        def _add_requirement(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            current = _raw_requirements_from_form(fields)
            current.append(_make_blank_requirement(current))
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=current,
                    status="Linha em branco adicionada. Preencha os campos e clique em Aprovar.",
                )
            )

        def _remove_requirement(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            current = _raw_requirements_from_form(fields)
            try:
                index = int(fields.get("remove_index", ["-1"])[0])
            except ValueError:
                index = -1
            if 0 <= index < len(current):
                removed = current.pop(index)
                status = f"Requisito {removed.id or '(sem id)'} removido."
            else:
                status = "Indice invalido para remocao."
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    requirements=current,
                    status=status,
                )
            )

        def _reset_pipeline(self) -> None:
            state.reset_pipeline()
            self._send_html(
                _render_page(
                    state.example_text,
                    status="Pipeline resetado. Cole uma nova descricao para comecar.",
                )
            )

        def _process_directly(self, description: str, suggest_extras: bool) -> None:
            if not description:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        error="Digite uma descricao antes de processar.",
                    )
                )
                return
            try:
                result, paths = state.process_directly(description)
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        error=f"Erro ao processar diretamente: {exc}",
                    )
                )
                return
            self._send_html(
                _render_page(
                    description,
                    suggest_extras=suggest_extras,
                    result=result,
                    analysis_paths=paths,
                    status=f"{len(result.document.use_cases)} caso(s) de uso gerado(s) diretamente, sem etapa de RFs.",
                )
            )

        def _download_pdf_from_state(self) -> None:
            try:
                payload = state.build_pdf()
            except Exception as exc:
                self._send_html(
                    _render_page(
                        state.last_input_text,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=f"Erro ao gerar PDF: {exc}",
                    )
                )
                return
            if payload is None:
                self._send_html(
                    _render_page(
                        state.last_input_text,
                        requirements=state.last_requirements,
                        result=state.last_result,
                        error=(
                            "Nao foi possivel gerar o PDF. Gere os casos de uso antes ou instale "
                            "as dependencias com: pip install reportlab svglib"
                        ),
                    )
                )
                return
            self._send_pdf(payload)

        def _download_pdf_from_form(
            self, description: str, fields: Dict[str, List[str]], suggest_extras: bool
        ) -> None:
            requirements = _requirements_from_form(fields)
            result: Optional[UseCaseAnalysisResult] = state.last_result
            try:
                if requirements and not _requirements_match(requirements, state.last_requirements):
                    result, _ = state.generate_use_cases_from_requirements(requirements, input_text=description)
                elif requirements and state.last_input_text != description:
                    state.last_input_text = description
                elif state.last_result is not None:
                    pass
                elif description.strip():
                    result, _ = state.process_directly(description)
                else:
                    state.last_input_text = ""
                    state.last_requirements = []
                    state.last_result = None
                payload = state.build_pdf()
            except Exception as exc:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=requirements,
                        error=f"Erro ao gerar PDF: {exc}",
                    )
                )
                return
            if payload is None:
                self._send_html(
                    _render_page(
                        description,
                        suggest_extras=suggest_extras,
                        requirements=requirements,
                        result=result,
                        error=(
                            "Nao foi possivel gerar o PDF. Verifique reportlab/svglib instalados e "
                            "informe pelo menos uma descricao ou requisito."
                        ),
                    )
                )
                return
            self._send_pdf(payload)

        def _send_pdf(self, payload: bytes) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header(
                "Content-Disposition",
                'attachment; filename="relatorio_completo.pdf"',
            )
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _send_html(self, value: str) -> None:
            payload = value.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _send_output_file(self, request_path: str) -> None:
            filename = posixpath.basename(request_path)
            target = state.output_dir / filename
            if not target.exists() or not target.is_file():
                self.send_error(404, "Arquivo nao encontrado")
                return
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            payload = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format: str, *args: object) -> None:
            return

    return UseCaseWebGuiHandler


def _requirements_from_form(fields: Dict[str, List[str]]) -> List[FunctionalRequirement]:
    values = []
    for index, raw in enumerate(_iter_form_rows(fields)):
        if not raw["descricao"] and not raw["acao"] and not raw["objeto"]:
            continue
        if not raw["id"]:
            raw["id"] = f"RF{index + 1:03d}"
        values.append(raw)
    return requirements_from_dicts(values)


def _raw_requirements_from_form(fields: Dict[str, List[str]]) -> List[FunctionalRequirement]:
    requirements: List[FunctionalRequirement] = []
    for raw in _iter_form_rows(fields):
        requirements.append(
            FunctionalRequirement(
                id=raw["id"],
                description=raw["descricao"],
                actor=raw["ator"] or "Usuario",
                action=raw["acao"],
                object_name=raw["objeto"],
                priority=raw["prioridade"] or "Media",
                source=raw["origem"],
            )
        )
    return requirements


def _iter_form_rows(fields: Dict[str, List[str]]) -> List[Dict[str, str]]:
    ids = fields.get("req_id", [])
    rows: List[Dict[str, str]] = []
    for index in range(len(ids)):
        rows.append(
            {
                "id": _field_at(fields, "req_id", index),
                "descricao": _field_at(fields, "req_description", index),
                "ator": _field_at(fields, "req_actor", index),
                "acao": _field_at(fields, "req_action", index),
                "objeto": _field_at(fields, "req_object", index),
                "prioridade": _field_at(fields, "req_priority", index),
                "origem": _field_at(fields, "req_source", index),
            }
        )
    return rows


def _field_at(fields: Dict[str, List[str]], key: str, index: int) -> str:
    values = fields.get(key, [])
    if index >= len(values):
        return ""
    return values[index].strip()


def _requirements_match(
    a: List[FunctionalRequirement], b: List[FunctionalRequirement]
) -> bool:
    if len(a) != len(b):
        return False
    for left, right in zip(a, b):
        if (
            left.id != right.id
            or left.actor != right.actor
            or left.action != right.action
            or left.object_name != right.object_name
            or left.priority != right.priority
            or (left.description or "").strip() != (right.description or "").strip()
            or (left.source or "").strip() != (right.source or "").strip()
        ):
            return False
    return True


def _is_checked(fields: Dict[str, List[str]], key: str) -> bool:
    values = fields.get(key, [])
    if not values:
        return False
    value = values[0].strip().lower()
    return value in {"on", "1", "true", "yes", "checked"}


def _make_blank_requirement(current: List[FunctionalRequirement]) -> FunctionalRequirement:
    next_number = 1
    for requirement in current:
        match = _RF_ID_PATTERN.match(requirement.id or "")
        if match:
            next_number = max(next_number, int(match.group(1)) + 1)
    return FunctionalRequirement(
        id=f"RF{next_number:03d}",
        description="",
        actor="Usuario",
        action="",
        object_name="",
        priority="Media",
        source="",
    )


def _use_cases_from_form(fields: Dict[str, List[str]]) -> List[UseCase]:
    use_cases: List[UseCase] = []
    ids = fields.get("uc_id", [])
    for index in range(len(ids)):
        raw_id = _field_at(fields, "uc_id", index)
        raw_name = _field_at(fields, "uc_name", index)
        raw_actors = _field_at(fields, "uc_actors", index)
        raw_description = _field_at(fields, "uc_description", index)
        raw_trigger = _field_at(fields, "uc_trigger", index)
        raw_preconditions = _field_at(fields, "uc_preconditions", index)
        raw_sources = _field_at(fields, "uc_sources", index)

        if not raw_id and not raw_name and not raw_actors and not raw_description:
            continue

        actor_ids = []
        for piece in re.split(r"[,;\n]+", raw_actors):
            name = piece.strip()
            if not name:
                continue
            actor_ids.append(slugify(name) or name.lower())
        seen: set[str] = set()
        actor_ids = [aid for aid in actor_ids if not (aid in seen or seen.add(aid))]

        preconditions = [
            line.strip() for line in raw_preconditions.splitlines() if line.strip()
        ]
        source_sentences = [
            line.strip() for line in raw_sources.splitlines() if line.strip()
        ]

        use_case = UseCase(
            id=raw_id or f"UC{index + 1:03d}",
            name=raw_name,
            actor_ids=actor_ids,
            description=raw_description,
            trigger=raw_trigger,
            preconditions=preconditions,
            source_sentences=source_sentences,
        )
        use_cases.append(use_case)
    return use_cases


def _make_blank_use_case(current: List[UseCase]) -> UseCase:
    next_number = 1
    for uc in current:
        match = _UC_ID_PATTERN.match(uc.id or "")
        if match:
            next_number = max(next_number, int(match.group(1)) + 1)
    return UseCase(
        id=f"UC{next_number:03d}",
        name="",
        actor_ids=[],
        description="",
        trigger="",
        preconditions=[],
        source_sentences=[],
    )


def _use_cases_match(a: List[UseCase], b: List[UseCase]) -> bool:
    if len(a) != len(b):
        return False
    for left, right in zip(a, b):
        if (
            left.id != right.id
            or left.name.strip() != right.name.strip()
            or list(left.actor_ids) != list(right.actor_ids)
            or left.description.strip() != right.description.strip()
            or left.trigger.strip() != right.trigger.strip()
            or list(left.preconditions) != list(right.preconditions)
        ):
            return False
    return True


def _render_page_impl(
    description: str,
    requirements: Optional[List[FunctionalRequirement]] = None,
    result: Optional[UseCaseAnalysisResult] = None,
    requirement_paths: Optional[Dict[str, Path]] = None,
    analysis_paths: Optional[Dict[str, Path]] = None,
    status: str = "",
    error: str = "",
    suggest_extras: bool = False,
    requirements_validated: bool = False,
    use_cases_validated: bool = False,
    user_stories: Optional[List[UserStory]] = None,
) -> str:
    requirements = requirements or []
    user_stories = user_stories or []
    table = result.markdown_table if result else ""
    report = result.text_report if result else ""
    plantuml = result.plantuml_diagram if result else ""
    svg = result.svg_diagram if result else ""
    generated_files = _format_file_links({**(requirement_paths or {}), **(analysis_paths or {})})
    suggest_checked_attr = "checked" if suggest_extras else ""
    has_uc = result is not None and bool(result.document.use_cases)

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Extrator de Requisitos e Casos de Uso</title>
  <style>
    :root {{
      color-scheme: light;
      --border: #d7dee8;
      --text: #172033;
      --muted: #5f6b7a;
      --brand: #1d4ed8;
      --bg: #f7f9fc;
      --panel: #ffffff;
    }}
    body {{
      margin: 0;
      font-family: Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }}
    header {{
      padding: 18px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }}
    h1 {{
      margin: 0;
      font-size: 22px;
    }}
    .reset-form button {{
      margin-top: 0;
      background: #b91c1c;
    }}
    .reset-form button:hover {{
      background: #9a1818;
    }}
    main {{
      display: grid;
      grid-template-columns: minmax(360px, 0.9fr) minmax(620px, 1.5fr);
      gap: 16px;
      padding: 16px;
    }}
    section {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      min-width: 0;
    }}
    label {{
      display: block;
      font-weight: 700;
      margin-bottom: 8px;
    }}
    textarea {{
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font: 14px/1.45 Menlo, Consolas, monospace;
    }}
    .input-textarea {{
      min-height: 420px;
    }}
    button {{
      margin-top: 10px;
      border: 0;
      background: var(--brand);
      color: white;
      border-radius: 6px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
    }}
    button.secondary {{
      background: #475569;
      margin-left: 8px;
    }}
    button.danger {{
      background: #b91c1c;
      padding: 6px 10px;
      margin-top: 0;
      font-size: 12px;
    }}
    .form-actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }}
    .form-actions button {{
      margin-top: 0;
      margin-left: 0;
    }}
    .row-actions {{
      text-align: center;
      width: 1%;
      white-space: nowrap;
    }}
    .empty-row {{
      text-align: center;
      color: var(--muted);
      padding: 14px;
    }}
    .downloads {{
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      background: #f7f9fc;
    }}
    .download-pdf {{
      display: inline-block;
      background: #1d4ed8;
      color: white;
      padding: 8px 14px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 700;
    }}
    .download-pdf:hover {{
      background: #1742b8;
    }}
    .suggest-toggle {{
      margin: 12px 0 6px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #f7f9fc;
    }}
    .checkbox-label {{
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-weight: 400;
      cursor: pointer;
    }}
    .checkbox-label input[type="checkbox"] {{
      width: auto;
      margin-top: 3px;
      accent-color: var(--brand);
    }}
    .checkbox-label strong {{
      display: block;
      margin-bottom: 2px;
    }}
    .checkbox-label small {{
      display: block;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }}
    .checkbox-label code {{
      background: #e9eef7;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
    }}
    .status {{
      margin-top: 10px;
      color: var(--muted);
      font-size: 14px;
    }}
    .error {{
      margin-top: 10px;
      color: #b91c1c;
      font-weight: 700;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }}
    .table-scroll {{
      overflow-x: auto;
    }}
    .muted {{
      color: var(--muted);
    }}
    th, td {{
      border: 1px solid var(--border);
      padding: 6px;
      vertical-align: top;
    }}
    input, select {{
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px;
      font: 13px Arial, sans-serif;
    }}
    .req-description {{
      min-height: 64px;
      font: 13px Arial, sans-serif;
    }}
    .tabs {{
      display: grid;
      gap: 14px;
    }}
    details {{
      border: 1px solid var(--border);
      border-radius: 6px;
      background: white;
    }}
    summary {{
      padding: 10px 12px;
      font-weight: 700;
      cursor: pointer;
    }}
    pre {{
      margin: 0;
      padding: 12px;
      overflow: auto;
      max-height: 320px;
      border-top: 1px solid var(--border);
      font: 13px/1.45 Menlo, Consolas, monospace;
      white-space: pre-wrap;
    }}
    .diagram {{
      overflow: auto;
      border-top: 1px solid var(--border);
      padding: 12px;
    }}
    .diagram svg {{
      max-width: 100%;
      height: auto;
    }}
    a {{
      color: var(--brand);
    }}
    @media (max-width: 1000px) {{
      main {{
        grid-template-columns: 1fr;
      }}
      .input-textarea {{
        min-height: 300px;
      }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>Extrator de Requisitos Funcionais e Casos de Uso</h1>
    <form class="reset-form" method="post" action="/reset"
          onsubmit="return confirm('Resetar o pipeline? Texto, requisitos, casos de uso e user stories serao limpos.');">
      <button type="submit" title="Limpa descricao, requisitos, casos de uso e user stories.">
        Resetar pipeline
      </button>
    </form>
  </header>
  <main>
    <section>
      <form method="post" action="/extract-requirements">
        <label for="description">Descricao livre do sistema</label>
        <textarea class="input-textarea" id="description" name="description">{html.escape(description)}</textarea>
        <div class="suggest-toggle">
          <label class="checkbox-label" for="suggest_extras">
            <input type="checkbox" id="suggest_extras" name="suggest_extras" value="on" {suggest_checked_attr}>
            <span>
              <strong>Sugerir requisitos adicionais com IA</strong>
              <small>Quando marcado, a IA pode incluir RFs comuns inferidos do contexto (ex.: para "totem do McDonalds" pode sugerir selecionar produto, personalizar pedido, pagar, imprimir cupom). Cada RF inferido vem com origem prefixada por <code>sugestao IA:</code>. Quando desmarcado, a IA fica conservadora e so extrai o que esta explicito no texto.</small>
            </span>
          </label>
        </div>
        <div class="form-actions">
          <button type="submit">Extrair requisitos com IA</button>
          <button class="secondary" type="submit" formaction="/process-direct">Gerar casos direto</button>
        </div>
        <div class="status">{html.escape(status)}</div>
        <div class="error">{html.escape(error)}</div>
      </form>
    </section>
    <section class="tabs">
      {_render_requirements_form(description, requirements, suggest_extras, requirements_validated)}
      {_render_use_cases_section(description, suggest_extras, result, has_uc, use_cases_validated)}
      <details {"open" if svg else ""}>
        <summary>Diagrama SVG</summary>
        <div class="diagram">{svg}</div>
      </details>
      {_render_user_stories_section(description, suggest_extras, has_uc, use_cases_validated, user_stories)}
      <details>
        <summary>Relatorio textual</summary>
        <pre>{html.escape(report)}</pre>
      </details>
      <details>
        <summary>PlantUML</summary>
        <pre>{html.escape(plantuml)}</pre>
      </details>
      <details {"open" if generated_files else ""}>
        <summary>Arquivos gerados (PDF e demais artefatos)</summary>
        <div class="downloads">
          <a class="download-pdf" href="/download-pdf">Baixar PDF completo</a>
        </div>
        <pre>{generated_files}</pre>
      </details>
    </section>
  </main>
</body>
</html>"""


def _render_requirements_form(
    description: str,
    requirements: List[FunctionalRequirement],
    suggest_extras: bool = False,
    requirements_validated: bool = False,
) -> str:
    rows = []
    for index, requirement in enumerate(requirements):
        rows.append(
            f"""
          <tr>
            <td><input name="req_id" value="{html.escape(requirement.id)}"></td>
            <td><input name="req_actor" value="{html.escape(requirement.actor)}"></td>
            <td><input name="req_action" value="{html.escape(requirement.action)}"></td>
            <td><input name="req_object" value="{html.escape(requirement.object_name)}"></td>
            <td>
              <select name="req_priority">
                {_priority_options(requirement.priority)}
              </select>
            </td>
            <td><textarea class="req-description" name="req_description">{html.escape(requirement.description)}</textarea></td>
            <td><textarea class="req-description" name="req_source">{html.escape(requirement.source)}</textarea></td>
            <td class="row-actions">
              <button class="danger" type="submit" formaction="/remove-requirement"
                      formnovalidate name="remove_index" value="{index}">Remover</button>
            </td>
          </tr>
"""
        )

    if not rows:
        rows.append(
            """
          <tr>
            <td colspan="8" class="empty-row">
              Nenhum requisito carregado. Use <em>Extrair requisitos com IA</em> ou clique em
              <em>Adicionar requisito</em> para comecar manualmente.
            </td>
          </tr>
"""
        )

    return f"""
      <details open>
        <summary>Requisitos funcionais editaveis</summary>
        <form method="post" action="/generate-use-cases">
          <input type="hidden" name="description" value="{html.escape(description)}">
          {('<input type="hidden" name="suggest_extras" value="on">' if suggest_extras else '')}
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Ator</th>
                <th>Acao</th>
                <th>Objeto</th>
                <th>Prioridade</th>
                <th>Descricao</th>
                <th>Origem</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {''.join(rows)}
            </tbody>
          </table>
          <div class="form-actions">
            {_validate_requirements_button(requirements_validated)}
            {_generate_use_cases_button(requirements_validated)}
            <button class="secondary" type="submit" formaction="/add-requirement"
                    formnovalidate>Adicionar requisito</button>
            <button class="secondary" type="submit" formaction="/download-pdf"
                    formnovalidate>Baixar PDF com estado atual</button>
          </div>
          <div class="step-status">
            {('Etapa 1 OK: requisitos validados.' if requirements_validated else 'Etapa 1 pendente: validar os requisitos antes de gerar casos de uso.')}
          </div>
        </form>
      </details>
"""


def _validate_requirements_button(validated: bool) -> str:
    if validated:
        return (
            '<button class="success" type="submit" formaction="/validate-requirements" '
            'formnovalidate title="Requisitos validados. Clique para revalidar com edicoes atuais.">'
            "Revalidar requisitos &check;</button>"
        )
    return (
        '<button class="primary" type="submit" formaction="/validate-requirements" formnovalidate>'
        "Validar requisitos</button>"
    )


def _generate_use_cases_button(validated: bool) -> str:
    if validated:
        return (
            '<button type="submit">Gerar casos de uso</button>'
        )
    return (
        '<button type="submit" disabled '
        'title="Valide os requisitos antes de gerar os casos de uso.">'
        "Gerar casos de uso (bloqueado)</button>"
    )


def _render_use_cases_section(
    description: str,
    suggest_extras: bool,
    result: Optional[UseCaseAnalysisResult],
    has_uc: bool,
    use_cases_validated: bool,
) -> str:
    if not has_uc or result is None:
        return """
      <details>
        <summary>Casos de uso (etapa 2)</summary>
        <pre>Os casos de uso aparecerao aqui apos clicar em <strong>Gerar casos de uso</strong>.</pre>
      </details>
"""

    document = result.document
    suggest_hidden = '<input type="hidden" name="suggest_extras" value="on">' if suggest_extras else ""
    rows: List[str] = []
    for index, uc in enumerate(document.use_cases):
        actor_names = ", ".join(
            html.escape(document.actors[aid].name) if aid in document.actors else html.escape(aid)
            for aid in uc.actor_ids
        )
        preconditions_text = "\n".join(uc.preconditions)
        related = _related_relationships_label(document, uc.id)
        rows.append(
            f"""
              <tr>
                <td><input name="uc_id" value="{html.escape(uc.id)}"></td>
                <td><input name="uc_actors" value="{actor_names}"
                       placeholder="Cliente, Atendente"></td>
                <td><input name="uc_name" value="{html.escape(uc.name)}"></td>
                <td><textarea class="req-description" name="uc_description">{html.escape(uc.description)}</textarea></td>
                <td><input name="uc_trigger" value="{html.escape(uc.trigger)}"></td>
                <td><textarea class="req-description" name="uc_preconditions"
                              placeholder="Uma pre-condicao por linha">{html.escape(preconditions_text)}</textarea></td>
                <td>{related}</td>
                <td class="row-actions">
                  <button class="danger" type="submit" formaction="/remove-use-case"
                          formnovalidate name="remove_uc_index" value="{index}">Remover</button>
                </td>
              </tr>
"""
        )

    if not rows:
        rows.append(
            """
              <tr>
                <td colspan="8" class="empty-row">
                  Nenhum caso de uso. Clique em <em>Adicionar caso de uso</em>
                  para comecar manualmente.
                </td>
              </tr>
"""
        )

    if use_cases_validated:
        step_status = '<div class="step-status ok">Etapa 2 OK: casos de uso validados.</div>'
        validate_button = (
            '<button class="success" type="submit" formaction="/validate-use-cases" '
            'formnovalidate title="Casos de uso validados. Clique para revalidar com edicoes.">'
            "Revalidar casos de uso &check;</button>"
        )
    else:
        step_status = (
            '<div class="step-status">Etapa 2 pendente: revise os casos de uso e clique '
            "em <strong>Validar casos de uso</strong> para liberar a Etapa 3.</div>"
        )
        validate_button = (
            '<button class="primary" type="submit" formaction="/validate-use-cases" '
            'formnovalidate>Validar casos de uso</button>'
        )

    return f"""
      <details open>
        <summary>Casos de uso (etapa 2) - editaveis</summary>
        <form method="post" action="/save-use-cases">
          <input type="hidden" name="description" value="{html.escape(description)}">
          {suggest_hidden}
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Atores</th>
                  <th>Nome</th>
                  <th>Descricao</th>
                  <th>Gatilho</th>
                  <th>Pre-condicoes</th>
                  <th>Relacoes</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {''.join(rows)}
              </tbody>
            </table>
          </div>
          <div class="form-actions">
            <button type="submit">Salvar casos de uso</button>
            <button class="secondary" type="submit" formaction="/add-use-case"
                    formnovalidate>Adicionar caso de uso</button>
            {validate_button}
          </div>
          {step_status}
        </form>
      </details>
"""


def _related_relationships_label(document: UseCaseDocument, uc_id: str) -> str:
    parts: List[str] = []
    for relationship in document.relationships:
        if relationship.source_id == uc_id:
            target = next(
                (uc.name for uc in document.use_cases if uc.id == relationship.target_id),
                relationship.target_id,
            )
            parts.append(html.escape(f"{relationship.label} -> {target}"))
        elif relationship.target_id == uc_id:
            source = next(
                (uc.name for uc in document.use_cases if uc.id == relationship.source_id),
                relationship.source_id,
            )
            parts.append(html.escape(f"{source} {relationship.label} ->"))
    if not parts:
        return '<span class="muted">-</span>'
    return "<br>".join(parts)


def _render_user_stories_section(
    description: str,
    suggest_extras: bool,
    has_uc: bool,
    use_cases_validated: bool,
    user_stories: List[UserStory],
) -> str:
    suggest_hidden = '<input type="hidden" name="suggest_extras" value="on">' if suggest_extras else ""

    if not has_uc:
        return """
      <details>
        <summary>User Stories (etapa 3)</summary>
        <pre>Disponivel apos a Etapa 2 (casos de uso gerados e validados).</pre>
      </details>
"""

    if user_stories:
        rows = []
        for story in user_stories:
            criteria_html = "".join(
                f"<li>{html.escape(item)}</li>" for item in story.acceptance_criteria
            ) or "<li><i>(sem criterios)</i></li>"
            related = ", ".join(story.related_uc_ids) or "-"
            rows.append(
                f"""
              <tr>
                <td>{html.escape(story.id)}</td>
                <td>{html.escape(story.role)}</td>
                <td>{html.escape(story.want)}</td>
                <td>{html.escape(story.benefit)}</td>
                <td><ul class="criteria-list">{criteria_html}</ul></td>
                <td>{html.escape(related)}</td>
              </tr>
"""
            )
        body = f"""
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Papel</th><th>Quero</th><th>Para</th>
              <th>Criterios</th><th>UC(s)</th>
            </tr>
          </thead>
          <tbody>{''.join(rows)}</tbody>
        </table>
"""
    else:
        body = "<pre>Nenhuma user story gerada ainda.</pre>"

    if not use_cases_validated:
        button_block = (
            '<div class="step-status">Etapa 3 bloqueada: valide os casos de uso primeiro.</div>'
            '<button type="submit" formnovalidate disabled '
            'title="Valide os casos de uso antes de gerar User Stories.">'
            "Gerar User Stories com IA (bloqueado)</button>"
        )
    elif user_stories:
        button_block = (
            f'<div class="step-status ok">Etapa 3 OK: {len(user_stories)} user story(ies) geradas.</div>'
            '<button class="primary" type="submit" formaction="/generate-user-stories" '
            'formnovalidate>Regerar User Stories com IA</button>'
        )
    else:
        button_block = (
            '<div class="step-status">Etapa 3 liberada: clique para a IA criar as User Stories.</div>'
            '<button class="primary" type="submit" formaction="/generate-user-stories" '
            'formnovalidate>OK, gerar User Stories com IA</button>'
        )

    return f"""
      <details open>
        <summary>User Stories (etapa 3)</summary>
        {body}
        <form method="post" action="/generate-user-stories">
          <input type="hidden" name="description" value="{html.escape(description)}">
          {suggest_hidden}
          <div class="section-actions">{button_block}</div>
        </form>
      </details>
"""


def _priority_options(current: str) -> str:
    options = []
    for value in ["Alta", "Media", "Baixa"]:
        selected = " selected" if value.lower() == current.lower() else ""
        options.append(f'<option value="{value}"{selected}>{value}</option>')
    return "\n".join(options)


def _format_file_links(paths: Dict[str, Path]) -> str:
    if not paths:
        return ""
    lines = []
    for filename in paths:
        safe_name = html.escape(filename)
        href = f"/outputs/{urllib.parse.quote(filename)}"
        lines.append(f'<a href="{href}" target="_blank">{safe_name}</a>')
    return "\n".join(lines)
