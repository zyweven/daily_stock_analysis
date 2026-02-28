# -*- coding: utf-8 -*-
"""Unit tests for expert panel model pool behavior."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from src.core.expert_panel import (
    ModelConfig,
    ModelEndpoint,
    parse_model_configs,
    run_expert_panel,
)


class _FakeAnalysisResult:
    def __init__(self, success: bool = True):
        self.success = success
        self.sentiment_score = 72
        self.operation_advice = "买入"
        self.trend_prediction = "看多"
        self.analysis_summary = "测试摘要"
        self.confidence_level = "高"

    def to_dict(self):
        return {
            "success": self.success,
            "sentiment_score": self.sentiment_score,
            "operation_advice": self.operation_advice,
            "trend_prediction": self.trend_prediction,
            "analysis_summary": self.analysis_summary,
            "confidence_level": self.confidence_level,
        }


class ExpertPanelModelPoolTestCase(unittest.TestCase):
    def _build_config(self, extra_ai_models: str = "[]"):
        return SimpleNamespace(
            gemini_api_key="",
            gemini_model="gemini-2.0-flash",
            gemini_temperature=0.7,
            openai_api_key="",
            openai_base_url="",
            openai_model="",
            openai_temperature=0.7,
            openai_verify_ssl=True,
            extra_ai_models=extra_ai_models,
        )

    def test_parse_extra_ai_models_legacy_format_compatible(self):
        cfg = self._build_config(
            """
            [
              {
                "name": "DeepSeek-legacy",
                "provider": "openai",
                "api_key": "sk-legacy-key",
                "base_url": "https://api.deepseek.com/v1",
                "model": "deepseek-chat"
              }
            ]
            """.strip()
        )

        with patch("src.core.expert_panel.get_config", return_value=cfg), patch(
            "src.core.expert_panel.os.getenv", return_value=""
        ):
            models = parse_model_configs()

        self.assertEqual(len(models), 1)
        self.assertEqual(models[0].name, "deepseek-chat")  # 优先使用 model_name
        self.assertEqual(models[0].provider, "openai")
        self.assertEqual(models[0].model_name, "deepseek-chat")
        self.assertEqual(len(models[0].endpoints), 1)
        self.assertEqual(models[0].endpoints[0].api_key, "sk-legacy-key")
        self.assertEqual(models[0].endpoints[0].source_name, "DeepSeek-legacy")  # source_name 保留配置名称

    def test_parse_extra_ai_models_pool_format(self):
        cfg = self._build_config(
            """
            [
              {
                "name": "Pool-A",
                "provider": "openai",
                "model": "gpt-4o-mini",
                "endpoints": [
                  {"id": "e1", "api_key": "sk-a", "base_url": "https://a.example.com/v1", "priority": 10, "enabled": true},
                  {"id": "e2", "api_key": "sk-b", "base_url": "https://b.example.com/v1", "priority": 5, "enabled": false}
                ]
              }
            ]
            """.strip()
        )

        with patch("src.core.expert_panel.get_config", return_value=cfg), patch(
            "src.core.expert_panel.os.getenv", return_value=""
        ):
            models = parse_model_configs()

        self.assertEqual(len(models), 1)
        model = models[0]
        self.assertEqual(model.name, "gpt-4o-mini")  # 优先使用 model_name
        self.assertEqual(len(model.endpoints), 2)
        self.assertEqual(model.endpoints[0].id, "e1")
        self.assertEqual(model.endpoints[1].enabled, False)
        self.assertEqual(model.endpoints[0].source_name, "Pool-A")  # source_name 保留配置名称

    def test_parse_extra_ai_models_auto_name_fallback(self):
        cfg = self._build_config(
            """
            [
              {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "endpoints": [{"api_key": "sk-a", "base_url": "https://api.foo.com/v1"}]
              },
              {
                "provider": "openai",
                "endpoints": [{"api_key": "sk-b", "base_url": "https://bar.example.com/v1"}]
              },
              {
                "provider": "gemini",
                "endpoints": [{"api_key": "sk-c"}]
              }
            ]
            """.strip()
        )

        with patch("src.core.expert_panel.get_config", return_value=cfg), patch(
            "src.core.expert_panel.os.getenv", return_value=""
        ):
            models = parse_model_configs()

        self.assertEqual([m.name for m in models], ["gpt-4o-mini", "bar.example.com", "Gemini"])

    def test_run_expert_panel_endpoint_failover_success(self):
        pool = ModelConfig(
            name="Pool-A",
            provider="openai",
            model_name="gpt-4o-mini",
            endpoints=[
                ModelEndpoint(id="primary", api_key="bad-key", base_url="https://a.example.com/v1", priority=10),
                ModelEndpoint(id="backup", api_key="good-key", base_url="https://b.example.com/v1", priority=5),
            ],
        )

        class FakeAnalyzer:
            def __init__(self, model_params=None):
                self.api_key = (model_params or {}).get("api_key")

            def is_available(self):
                return True

            def analyze(self, context, news_context):
                if self.api_key == "bad-key":
                    raise RuntimeError("503 service unavailable")
                return _FakeAnalysisResult(success=True)

        with patch("src.core.expert_panel._get_gemini_analyzer_cls", return_value=FakeAnalyzer), patch(
            "src.core.expert_panel.parse_model_configs", return_value=[pool]
        ):
            result = run_expert_panel(context={"code": "600519", "stock_name": "贵州茅台"}, selected_models=["Pool-A"])

        self.assertEqual(result.models_used, ["Pool-A"])
        self.assertEqual(len(result.model_results), 1)
        model_result = result.model_results[0]
        self.assertTrue(model_result.success)
        self.assertEqual(model_result.endpoint_used, "backup")
        self.assertEqual(model_result.endpoint_tried, ["primary", "backup"])
        self.assertEqual(model_result.fallback_count, 1)

    def test_run_expert_panel_all_endpoints_fail_returns_single_failure(self):
        pool = ModelConfig(
            name="Pool-B",
            provider="openai",
            model_name="gpt-4o-mini",
            endpoints=[
                ModelEndpoint(id="p1", api_key="bad-1", base_url="https://a.example.com/v1", priority=10),
                ModelEndpoint(id="p2", api_key="bad-2", base_url="https://b.example.com/v1", priority=8),
            ],
        )

        class FakeAnalyzer:
            def __init__(self, model_params=None):
                pass

            def is_available(self):
                return True

            def analyze(self, context, news_context):
                raise RuntimeError("429 Too Many Requests")

        with patch("src.core.expert_panel._get_gemini_analyzer_cls", return_value=FakeAnalyzer), patch(
            "src.core.expert_panel.parse_model_configs", return_value=[pool]
        ):
            result = run_expert_panel(context={"code": "600519", "stock_name": "贵州茅台"}, selected_models=["Pool-B"])

        self.assertEqual(result.models_used, ["Pool-B"])
        self.assertEqual(len(result.model_results), 1)
        self.assertFalse(result.model_results[0].success)
        self.assertEqual(result.model_results[0].endpoint_tried, ["p1", "p2"])


if __name__ == "__main__":
    unittest.main()
