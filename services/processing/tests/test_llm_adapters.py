from __future__ import annotations

from app.editing_planner.llm_adapters import (
    BaseLLMAdapter,
    CloudOpenAIAdapter,
    LocalOllamaAdapter,
    RuleBasedAdapter,
    get_adapter,
    list_available_adapters,
)


def test_rule_based_adapter_parsing():
    adapter = RuleBasedAdapter()
    assert adapter.is_available() is True
    assert adapter.provider_id == "rule_based"

    res = adapter.parse_brief("Create a 15-second vertical reel with quick cuts and avoid shaky footage")
    assert res["target_duration_seconds"] == 15.0
    assert res["aspect_ratio"] == "vertical"
    assert res["shot_duration_seconds"] == 1.5
    assert res["avoid_shake_candidates"] is True
    assert res["adapter_used"] == "rule_based"


def test_adapter_alternatives_generation():
    adapter = RuleBasedAdapter()
    alternatives = adapter.generate_alternatives("Create a travel reel", count=3)
    assert len(alternatives) == 3
    assert alternatives[0]["name"] == "Dynamic & Upbeat"
    assert alternatives[0]["shot_duration_seconds"] == 1.5
    assert alternatives[1]["name"] == "Cinematic Flow"
    assert alternatives[1]["shot_duration_seconds"] == 4.0
    assert alternatives[2]["name"] == "Balanced Showcase"
    assert alternatives[2]["shot_duration_seconds"] == 2.5


def test_local_ollama_fallback_when_offline():
    # Points to non-existent endpoint to guarantee offline fallback behavior
    adapter = LocalOllamaAdapter(endpoint="http://127.0.0.1:54321")
    assert adapter.is_available() is False

    # Parsing gracefully falls back to rule-based without raising an exception
    res = adapter.parse_brief("30 seconds landscape")
    assert res["target_duration_seconds"] == 30.0
    assert res["aspect_ratio"] == "horizontal"
    assert res["fallback_from"] == "local_ollama"


def test_cloud_openai_fallback_when_no_key():
    adapter = CloudOpenAIAdapter(api_key="")
    assert adapter.is_available() is False

    res = adapter.parse_brief("10 seconds square")
    assert res["target_duration_seconds"] == 10.0
    assert res["aspect_ratio"] == "square"
    assert res["fallback_from"] == "cloud_openai"


def test_list_and_get_adapters():
    adapters = list_available_adapters()
    assert len(adapters) >= 3
    ids = [a["id"] for a in adapters]
    assert "rule_based" in ids
    assert "local_ollama" in ids
    assert "cloud_openai" in ids

    # Default lookup falls back to rule_based
    adapter = get_adapter(None)
    assert isinstance(adapter, RuleBasedAdapter)

    # Unknown provider falls back to rule_based
    adapter = get_adapter("unknown_provider")
    assert isinstance(adapter, RuleBasedAdapter)
