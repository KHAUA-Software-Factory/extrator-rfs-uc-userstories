from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict


@dataclass(frozen=True)
class OpenAIConfig:
    api_key: str
    model: str
    base_url: str


def load_environment(env_path: Path = Path(".env")) -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
        return
    except ModuleNotFoundError:
        _load_dotenv_fallback(env_path)


def get_openai_config() -> OpenAIConfig:
    load_environment()
    return OpenAIConfig(
        api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        model=os.getenv("OPENAI_MODEL", "gpt-5.2").strip(),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/"),
    )


def _load_dotenv_fallback(env_path: Path) -> None:
    if not env_path.exists():
        return
    values = _parse_env_file(env_path)
    for key, value in values.items():
        os.environ.setdefault(key, value)


def _parse_env_file(env_path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values
