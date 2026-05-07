from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from usecase_solid.config import OpenAIConfig, get_openai_config
from usecase_solid.domain import FunctionalRequirement
from usecase_solid.domain.requirements import requirements_from_dicts


class OpenAIRequirementsExtractor:
    def __init__(self, config: Optional[OpenAIConfig] = None) -> None:
        self.config = config or get_openai_config()

    def extract(self, text: str, suggest_extras: bool = False) -> List[FunctionalRequirement]:
        if not self.config.api_key or self.config.api_key == "coloque_sua_chave_aqui":
            raise ValueError("OPENAI_API_KEY nao foi configurada. Copie .env.example para .env e informe sua chave.")

        payload = self._build_payload(text, suggest_extras)
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
        return requirements_from_dicts(parsed.get("requisitos_funcionais", []))

    def _build_payload(self, text: str, suggest_extras: bool = False) -> Dict[str, Any]:
        return {
            "model": self.config.model,
            "input": [
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": self._system_prompt(suggest_extras),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": text,
                        }
                    ],
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "extracao_requisitos_funcionais",
                    "strict": True,
                    "schema": self._schema(),
                }
            },
        }

    def _system_prompt(self, suggest_extras: bool = False) -> str:
        base = (
            "Voce e um analista de requisitos. Extraia requisitos funcionais a partir do texto livre do usuario. "
            "Nao gere casos de uso e nao gere user stories nesta etapa. "
            "Cada requisito deve ser claro, verificavel e escrito em portugues. "
            "Use ator='Usuario' quando o ator nao estiver explicito. "
            "Use acao no infinitivo, como Criar, Consultar, Cancelar, Emitir. "
            "Use objeto como o alvo funcional da acao. "
        )
        if suggest_extras:
            return base + (
                "Alem dos requisitos explicitamente descritos no texto, sugira tambem requisitos funcionais "
                "essenciais para um sistema do mesmo tipo, mesmo que nao tenham sido mencionados pelo usuario. "
                "Use sua experiencia em sistemas similares (ex.: totem de auto-atendimento, e-commerce, painel "
                "administrativo, app movel, ERP, sistema de reservas) para complementar fluxos basicos faltantes. "
                "Para cada requisito que veio diretamente do texto do usuario, preencha 'origem' com o trecho "
                "literal que motivou o requisito. Para cada requisito sugerido por inferencia, preencha 'origem' "
                "com o prefixo 'sugestao IA: ' seguido de uma justificativa curta (ex.: 'sugestao IA: pagamento e "
                "essencial em totens de auto-atendimento'). "
                "Cobertura esperada: cadastro/login se aplicavel, fluxos principais do dominio, pagamento, "
                "geracao de comprovantes, administracao basica, tratamento de erros e cancelamento."
            )
        return base + (
            "Nao invente funcionalidades sem apoio no texto; quando houver ambiguidade, mantenha a descricao conservadora. "
            "Para cada requisito, preencha 'origem' com o trecho literal do texto que motivou o requisito."
        )

    def _schema(self) -> Dict[str, Any]:
        requirement_schema = {
            "type": "object",
            "additionalProperties": False,
            "required": ["id", "descricao", "ator", "acao", "objeto", "prioridade", "origem"],
            "properties": {
                "id": {"type": "string", "description": "Identificador sequencial, como RF001."},
                "descricao": {"type": "string", "description": "Descricao completa do requisito funcional."},
                "ator": {"type": "string", "description": "Ator principal relacionado ao requisito."},
                "acao": {"type": "string", "description": "Acao funcional principal no infinitivo."},
                "objeto": {"type": "string", "description": "Objeto ou entidade alvo da acao."},
                "prioridade": {"type": "string", "enum": ["Alta", "Media", "Baixa"]},
                "origem": {"type": "string", "description": "Trecho curto do texto original que motivou o requisito."},
            },
        }
        return {
            "type": "object",
            "additionalProperties": False,
            "required": ["requisitos_funcionais"],
            "properties": {
                "requisitos_funcionais": {
                    "type": "array",
                    "items": requirement_schema,
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
