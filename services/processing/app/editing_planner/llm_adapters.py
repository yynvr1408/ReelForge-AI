"""Modular LLM and rule-based adapters for natural-language editing briefs.

Satisfies Section 14 of the product specification:
- Converts natural language instructions into a validated editing plan.
- Supports rule-based offline fallback (always functional without external deps).
- Supports local Ollama or OpenAI-compatible endpoints when available.
- Supports optional cloud LLM providers through interchangeable adapters.
- Generates alternative edit proposals (e.g., dynamic, cinematic, balanced).
- Never executes arbitrary code or unvalidated shell commands.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any

from app.editing_planner.brief_parser import parse_editing_brief

logger = logging.getLogger(__name__)


class BaseLLMAdapter(ABC):
    """Abstract interface for editing brief interpretation and plan variation."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier for this adapter (e.g. 'rule_based', 'local_ollama')."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if provider is configured and reachable."""

    @abstractmethod
    def parse_brief(self, text: str | None) -> dict[str, Any]:
        """Convert a user brief into structured editing parameters."""

    def generate_alternatives(
        self, text: str | None, base_interpretation: dict[str, Any] | None = None, count: int = 3
    ) -> list[dict[str, Any]]:
        """Generate alternative editorial variations based on the brief."""
        base = base_interpretation or self.parse_brief(text)
        alternatives: list[dict[str, Any]] = []

        # 1. Dynamic / Fast pacing
        alt1 = dict(base)
        alt1["name"] = "Dynamic & Upbeat"
        alt1["description"] = "Punchy cuts with higher energy and rhythmic focus."
        alt1["shot_duration_seconds"] = 1.5
        alt1["audio_priority"] = "rhythmic_activity"
        alternatives.append(alt1)

        # 2. Cinematic & Narrative
        alt2 = dict(base)
        alt2["name"] = "Cinematic Flow"
        alt2["description"] = "Slower, deliberate shot lengths prioritizing visual stability."
        alt2["shot_duration_seconds"] = 4.0
        alt2["avoid_shake_candidates"] = True
        alternatives.append(alt2)

        # 3. Balanced Showcase
        if count >= 3:
            alt3 = dict(base)
            alt3["name"] = "Balanced Showcase"
            alt3["description"] = "Balanced 2.5s pacing highlighting top-scoring moments."
            alt3["shot_duration_seconds"] = 2.5
            alternatives.append(alt3)

        return alternatives[:count]


class RuleBasedAdapter(BaseLLMAdapter):
    """Offline, deterministic rule-based adapter (the default fallback)."""

    @property
    def provider_id(self) -> str:
        return "rule_based"

    @property
    def display_name(self) -> str:
        return "Offline Rule-Based Assistant (Built-in)"

    def is_available(self) -> bool:
        return True

    def parse_brief(self, text: str | None) -> dict[str, Any]:
        result = parse_editing_brief(text)
        result["adapter_used"] = self.provider_id
        return result


class LocalOllamaAdapter(BaseLLMAdapter):
    """Adapter connecting to local Ollama (e.g. http://127.0.0.1:11434)."""

    def __init__(self, endpoint: str | None = None, model: str = "llama3"):
        self.endpoint = endpoint or os.environ.get("REELFORGE_OLLAMA_ENDPOINT", "http://127.0.0.1:11434")
        self.model = os.environ.get("REELFORGE_OLLAMA_MODEL", model)
        self._fallback = RuleBasedAdapter()

    @property
    def provider_id(self) -> str:
        return "local_ollama"

    @property
    def display_name(self) -> str:
        return f"Local Ollama ({self.model})"

    def is_available(self) -> bool:
        """Check if Ollama server responds on the configured port."""
        try:
            url = f"{self.endpoint.rstrip('/')}/api/tags"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                return resp.status == 200
        except Exception:
            return False

    def parse_brief(self, text: str | None) -> dict[str, Any]:
        if not text or not self.is_available():
            result = self._fallback.parse_brief(text)
            result["fallback_from"] = self.provider_id
            return result

        prompt = (
            "You are an assistant for an offline desktop video editor. "
            "Extract structured editing parameters from this user brief:\n"
            f"\"{text}\"\n\n"
            "Respond ONLY with valid JSON having these optional keys:\n"
            "- target_duration_seconds: number (e.g. 15, 30, 60)\n"
            "- aspect_ratio: 'vertical' | 'horizontal' | 'square'\n"
            "- shot_duration_seconds: number (1.0 to 6.0)\n"
            "- preserve_original_colors: boolean\n"
            "- audio_priority: 'rhythmic_activity' | 'speech_like_activity' | null\n"
            "- avoid_shake_candidates: boolean\n"
            "- recognized: list of short explanation strings"
        )

        try:
            url = f"{self.endpoint.rstrip('/')}/api/generate"
            body = json.dumps({"model": self.model, "prompt": prompt, "format": "json", "stream": False}).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                parsed_json = json.loads(data.get("response", "{}"))
                parsed_json["adapter_used"] = self.provider_id
                parsed_json.setdefault("recognized", [f"Interpreted by {self.display_name}"])
                parsed_json.setdefault("not_yet_supported", [])
                return parsed_json
        except Exception as exc:
            logger.warning(f"Ollama parsing failed, falling back to rule-based: {exc}")
            result = self._fallback.parse_brief(text)
            result["fallback_from"] = self.provider_id
            result["fallback_reason"] = str(exc)
            return result


class CloudOpenAIAdapter(BaseLLMAdapter):
    """Optional cloud OpenAI-compatible adapter."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model
        self._fallback = RuleBasedAdapter()

    @property
    def provider_id(self) -> str:
        return "cloud_openai"

    @property
    def display_name(self) -> str:
        return f"OpenAI Cloud ({self.model})"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def parse_brief(self, text: str | None) -> dict[str, Any]:
        if not text or not self.is_available():
            result = self._fallback.parse_brief(text)
            result["fallback_from"] = self.provider_id
            return result

        try:
            url = "https://api.openai.com/v1/chat/completions"
            prompt = (
                "Extract structured video editing parameters from this user brief:\n"
                f"\"{text}\"\n"
                "Return JSON with optional keys: target_duration_seconds (number), "
                "aspect_ratio ('vertical'|'horizontal'|'square'), shot_duration_seconds (number), "
                "preserve_original_colors (boolean), audio_priority ('rhythmic_activity'|'speech_like_activity'), "
                "avoid_shake_candidates (boolean), recognized (list of strings)."
            )
            body = json.dumps({
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            }).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]
                parsed_json = json.loads(content)
                parsed_json["adapter_used"] = self.provider_id
                parsed_json.setdefault("recognized", [f"Interpreted by {self.display_name}"])
                parsed_json.setdefault("not_yet_supported", [])
                return parsed_json
        except Exception as exc:
            logger.warning(f"OpenAI brief parse failed: {exc}")
            result = self._fallback.parse_brief(text)
            result["fallback_from"] = self.provider_id
            result["fallback_reason"] = str(exc)
            return result


def get_adapter(provider_id: str | None = None) -> BaseLLMAdapter:
    """Return the requested adapter or the offline rule-based fallback."""
    if provider_id == "local_ollama":
        adapter = LocalOllamaAdapter()
        if adapter.is_available():
            return adapter
    elif provider_id == "cloud_openai":
        adapter = CloudOpenAIAdapter()
        if adapter.is_available():
            return adapter
    return RuleBasedAdapter()


def list_available_adapters() -> list[dict[str, Any]]:
    """List all registered adapters and their real-time readiness status."""
    adapters: list[BaseLLMAdapter] = [
        RuleBasedAdapter(),
        LocalOllamaAdapter(),
        CloudOpenAIAdapter(),
    ]
    return [
        {
            "id": a.provider_id,
            "name": a.display_name,
            "available": a.is_available(),
            "is_default": a.provider_id == "rule_based",
        }
        for a in adapters
    ]
