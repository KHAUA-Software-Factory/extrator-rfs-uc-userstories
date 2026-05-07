from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from usecase_solid.application import UseCaseAnalysisResult
from usecase_solid.config import OpenAIConfig, get_openai_config
from usecase_solid.domain import UserStory
from usecase_solid.domain.user_stories import user_stories_from_dicts


class OpenAIUserStoriesExtractor:
    def __init__(self, config: Optional[OpenAIConfig] = None) -> None:
        self.config = config or get_openai_config()

    def extract(self, result: UseCaseAnalysisResult) -> List[UserStory]:
        if not self.config.api_key or self.config.api_key == "coloque_sua_chave_aqui":
            raise ValueError(
                "OPENAI_API_KEY nao foi configurada. Copie .env.example para .env e informe sua chave."
            )

        payload = self._build_payload(result)
        request = urllib.request.Request(
            url=f"{self.config.base_url}/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response_data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Erro da API OpenAI ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Nao foi possivel conectar a API OpenAI: {exc.reason}") from exc

        parsed = self._parse_response(response_data)
        return user_stories_from_dicts(parsed.get("user_stories", []))

    def _build_payload(self, result: UseCaseAnalysisResult) -> Dict[str, Any]:
        document = result.document
        actor_names = {actor.id: actor.name for actor in document.actors.values()}
        ucs_payload = []
        for use_case in document.use_cases:
            ucs_payload.append(
                {
                    "id": use_case.id,
                    "nome": use_case.name,
                    "atores": [actor_names.get(actor_id, actor_id) for actor_id in use_case.actor_ids],
                    "descricao": use_case.description,
                    "gatilho": use_case.trigger,
                    "pre_condicoes": list(use_case.preconditions),
                }
            )
        user_input = json.dumps({"casos_de_uso": ucs_payload}, ensure_ascii=False, indent=2)

        return {
            "model": self.config.model,
            "input": [
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": self._system_prompt(),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": user_input,
                        }
                    ],
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "geracao_user_stories",
                    "strict": True,
                    "schema": self._schema(),
                }
            },
        }

    def _system_prompt(self) -> str:
        return (
            "Voce e um analista que escreve user stories no formato Mike Cohn: "
            "'Como [papel], eu quero [funcionalidade] para [beneficio].' "
            "A entrada do usuario e uma lista JSON de casos de uso ja validados. "
            "Para cada caso de uso, gere UMA user story principal. "
            "O 'papel' deve sair do(s) ator(es) do caso de uso (priorize o ator principal). "
            "O 'quero' descreve a funcionalidade derivada do nome/descricao do caso de uso, em linguagem natural. "
            "O 'para' descreve um beneficio claro para o ator (motivacao, objetivo de negocio). "
            "Inclua de 2 a 4 criterios de aceitacao curtos, comecando com 'Dado que', 'Quando' ou 'Entao'. "
            "Em 'casos_de_uso_relacionados' coloque os ids do(s) caso(s) de uso de origem (ex.: ['UC001'])."
        )

    def _schema(self) -> Dict[str, Any]:
        story_schema = {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "id",
                "papel",
                "quero",
                "para",
                "criterios_de_aceitacao",
                "casos_de_uso_relacionados",
            ],
            "properties": {
                "id": {"type": "string", "description": "Identificador sequencial, como US001."},
                "papel": {"type": "string", "description": "Ator/persona da user story."},
                "quero": {"type": "string", "description": "Funcionalidade desejada."},
                "para": {"type": "string", "description": "Beneficio/motivacao para o ator."},
                "criterios_de_aceitacao": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Lista de 2 a 4 criterios em estilo Gherkin curto.",
                },
                "casos_de_uso_relacionados": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "IDs dos casos de uso de origem (ex.: 'UC001').",
                },
            },
        }
        return {
            "type": "object",
            "additionalProperties": False,
            "required": ["user_stories"],
            "properties": {
                "user_stories": {
                    "type": "array",
                    "items": story_schema,
                }
            },
        }

    def _parse_response(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        output_text = response_data.get("output_text")
        if not output_text:
            output_text = self._collect_output_text(response_data)
        if not output_text:
            raise RuntimeError("A API nao retornou texto estruturado.")
        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"A API retornou JSON invalido: {output_text}") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("A API retornou um formato inesperado.")
        return parsed

    def _collect_output_text(self, response_data: Dict[str, Any]) -> str:
        chunks: List[str] = []
        for item in response_data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and "text" in content:
                    chunks.append(content["text"])
        return "".join(chunks)
