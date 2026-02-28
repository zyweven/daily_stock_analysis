# -*- coding: utf-8 -*-
"""
多模型专家会诊管理器 (Expert Panel Manager)

支持同时调用多个 AI 模型对同一只股票进行独立分析，
并汇总各模型观点生成"专家会诊"报告。

特性：
- 支持最多 10 个逻辑模型并行分析
- 逻辑模型内支持 endpoint 池轮转与故障切换
- 自动生成对比汇总和综合结论
- 仅在用户手动触发时执行（定时任务不支持）
"""

from __future__ import annotations

import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from src.config import get_config

logger = logging.getLogger(__name__)

# 最大并行逻辑模型数量
MAX_MODELS = 10


@dataclass
class ModelEndpoint:
    """逻辑模型下的单个 endpoint 配置。"""

    id: str
    api_key: str
    base_url: Optional[str] = None
    priority: int = 0
    enabled: bool = True
    temperature: Optional[float] = None
    verify_ssl: bool = True
    source_name: Optional[str] = None  # 原始配置名称（如 "OpenAI代理A"）


@dataclass
class ModelConfig:
    """逻辑模型配置（同模型可含多个 endpoint）。"""

    name: str
    provider: str
    model_name: Optional[str] = None
    endpoints: List[ModelEndpoint] = field(default_factory=list)


@dataclass
class ModelResult:
    """单个逻辑模型的分析结果。"""

    model_name: str
    success: bool
    score: Optional[int] = None
    advice: Optional[str] = None
    trend: Optional[str] = None
    summary: Optional[str] = None
    confidence: Optional[str] = None
    raw_result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    elapsed_seconds: float = 0.0
    endpoint_tried: List[str] = field(default_factory=list)
    endpoint_used: Optional[str] = None
    fallback_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_name": self.model_name,
            "success": self.success,
            "score": self.score,
            "advice": self.advice,
            "trend": self.trend,
            "summary": self.summary,
            "confidence": self.confidence,
            "elapsed_seconds": round(self.elapsed_seconds, 2),
            "raw_result": self.raw_result,
            "error": self.error,
            "endpoint_tried": self.endpoint_tried,
            "endpoint_used": self.endpoint_used,
            "fallback_count": self.fallback_count,
        }


@dataclass
class ExpertPanelResult:
    """专家会诊汇总结果。"""

    stock_code: str
    stock_name: str
    models_used: List[str]
    model_results: List[ModelResult]
    consensus_score: Optional[int] = None
    consensus_advice: Optional[str] = None
    consensus_summary: Optional[str] = None
    consensus_strategy: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stock_code": self.stock_code,
            "stock_name": self.stock_name,
            "models_used": self.models_used,
            "consensus_score": self.consensus_score,
            "consensus_advice": self.consensus_advice,
            "consensus_summary": self.consensus_summary,
            "consensus_strategy": self.consensus_strategy,
            "model_results": [r.to_dict() for r in self.model_results],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


def _safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return default


def _extract_host_label(base_url: Optional[str]) -> Optional[str]:
    if not base_url:
        return None

    raw = base_url.strip()
    if not raw:
        return None

    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"

    try:
        host = (urlparse(raw).hostname or "").lower()
    except Exception:
        return None

    if not host:
        return None

    prefixes = ["api.", "openai.", "gateway.", "chat."]
    for prefix in prefixes:
        if host.startswith(prefix):
            host = host[len(prefix):]
            break

    if host.startswith("www."):
        host = host[4:]

    return host or None


def _provider_default_name(provider: str) -> str:
    provider_lower = (provider or "openai").strip().lower()
    if provider_lower == "gemini":
        return "Gemini"
    if provider_lower == "openai":
        return "OpenAI-Compatible"
    return provider or "Extra-Model"


def _build_auto_name(
    provider: str,
    model_name: Optional[str],
    endpoints: List[ModelEndpoint],
) -> str:
    if model_name:
        return model_name

    for endpoint in endpoints:
        host = _extract_host_label(endpoint.base_url)
        if host:
            return host

    return _provider_default_name(provider)


def _parse_endpoint(
    endpoint_data: Dict[str, Any],
    fallback_id: str,
    inherited_base_url: Optional[str] = None,
    inherited_temperature: Optional[float] = None,
    inherited_verify_ssl: Optional[bool] = None,
    source_name: Optional[str] = None,
) -> Optional[ModelEndpoint]:
    api_key = (endpoint_data.get("api_key") or "").strip()
    if not api_key:
        return None

    endpoint_id = (endpoint_data.get("id") or fallback_id).strip() or fallback_id
    return ModelEndpoint(
        id=endpoint_id,
        api_key=api_key,
        base_url=(endpoint_data.get("base_url") or inherited_base_url),
        priority=_safe_int(endpoint_data.get("priority"), 0),
        enabled=_normalize_bool(endpoint_data.get("enabled"), True),
        temperature=_safe_float(endpoint_data.get("temperature"), inherited_temperature),
        verify_ssl=_normalize_bool(endpoint_data.get("verify_ssl"), inherited_verify_ssl if inherited_verify_ssl is not None else True),
        source_name=source_name,
    )


def _parse_extra_model_entry(item: Dict[str, Any], index: int) -> Optional[ModelConfig]:
    provider = (item.get("provider") or "openai").strip().lower() or "openai"
    model_name = (item.get("model") or item.get("model_name") or "").strip() or None

    # 原始配置名称（用于显示在UI中标识channel来源）
    source_name = (item.get("name") or "").strip() or None

    endpoints: List[ModelEndpoint] = []
    inherited_base_url = item.get("base_url")
    inherited_temperature = _safe_float(item.get("temperature"), None)
    inherited_verify_ssl = _normalize_bool(item.get("verify_ssl"), True)

    raw_endpoints = item.get("endpoints")
    if isinstance(raw_endpoints, list):
        for ep_idx, endpoint_item in enumerate(raw_endpoints):
            if not isinstance(endpoint_item, dict):
                continue
            endpoint = _parse_endpoint(
                endpoint_item,
                fallback_id=f"ep-{index + 1}-{ep_idx + 1}",
                inherited_base_url=inherited_base_url,
                inherited_temperature=inherited_temperature,
                inherited_verify_ssl=inherited_verify_ssl,
                source_name=source_name,
            )
            if endpoint:
                endpoints.append(endpoint)
    else:
        endpoint = _parse_endpoint(
            item,
            fallback_id=f"ep-{index + 1}-1",
            inherited_base_url=inherited_base_url,
            inherited_temperature=inherited_temperature,
            inherited_verify_ssl=inherited_verify_ssl,
            source_name=source_name,
        )
        if endpoint:
            endpoints.append(endpoint)

    if not endpoints:
        return None

    raw_name = (item.get("name") or "").strip()
    # 优先使用 model_name 作为显示名称，其次才是配置名称
    logical_name = model_name or raw_name or _build_auto_name(provider=provider, model_name=model_name, endpoints=endpoints)

    return ModelConfig(
        name=logical_name,
        provider=provider,
        model_name=model_name,
        endpoints=endpoints,
    )


def _create_single_endpoint_model(
    name: Optional[str],
    provider: str,
    model_name: Optional[str],
    api_key: str,
    base_url: Optional[str] = None,
    temperature: Optional[float] = None,
    verify_ssl: bool = True,
    endpoint_id: str = "primary",
) -> ModelConfig:
    source_name = (name or "").strip()

    # 先创建 endpoint，然后再确定 logical_name
    endpoint = ModelEndpoint(
        id=endpoint_id,
        api_key=api_key,
        base_url=base_url,
        priority=0,
        enabled=True,
        temperature=temperature,
        verify_ssl=verify_ssl,
        source_name=source_name or None,
    )

    # 优先使用 model_name 作为显示名称，其次才是 source_name 或自动生成
    logical_name = model_name or source_name or _build_auto_name(provider=provider, model_name=model_name, endpoints=[endpoint])

    return ModelConfig(
        name=logical_name,
        provider=provider,
        model_name=model_name,
        endpoints=[endpoint],
    )


def parse_model_configs() -> List[ModelConfig]:
    """
    解析所有可用的逻辑模型配置。

    支持顺序：
    1. Gemini (主配置)
    2. OpenAI (主配置)
    3. EXTRA_AI_MODELS (JSON 批量配置，兼容旧格式与新 endpoints 池格式)
    4. MODEL_N_... (命名配置，支持 1-10)

    按照 model_name 聚合，相同模型的不同 endpoint 合并为一个逻辑模型。
    """
    configs: List[ModelConfig] = []
    config = get_config()

    # 用于按 model_name 聚合的临时字典
    model_groups: Dict[str, List[ModelConfig]] = {}

    # 用于按 model_name 聚合的临时字典
    model_groups: Dict[str, List[ModelConfig]] = {}

    def add_to_group(cfg: ModelConfig):
        """将配置添加到对应的 model_name 分组"""
        key = cfg.model_name or cfg.name  # 如果没有 model_name，用 name 作为 key
        if key not in model_groups:
            model_groups[key] = []
        model_groups[key].append(cfg)

    # 1. Gemini
    gemini_key = config.gemini_api_key
    if gemini_key and not gemini_key.startswith("your_") and len(gemini_key) > 10:
        add_to_group(_create_single_endpoint_model(
            name="Gemini",
            provider="gemini",
            model_name=config.gemini_model or "gemini-pro",
            api_key=gemini_key,
            temperature=config.gemini_temperature,
            endpoint_id="gemini-primary",
        ))

    # 2. OpenAI (官方或兼容)
    openai_key = config.openai_api_key
    if openai_key and not openai_key.startswith("your_") and len(openai_key) > 10:
        model_name = config.openai_model or "gpt-4o-mini"
        add_to_group(_create_single_endpoint_model(
            name="OpenAI",
            provider="openai",
            model_name=model_name,
            api_key=openai_key,
            base_url=config.openai_base_url,
            temperature=config.openai_temperature,
            verify_ssl=config.openai_verify_ssl,
            endpoint_id="openai-primary",
        ))

    # 3. EXTRA_AI_MODELS (JSON 批量)
    if config.extra_ai_models:
        try:
            extra_list = json.loads(config.extra_ai_models)
            if isinstance(extra_list, list):
                for index, item in enumerate(extra_list):
                    if not isinstance(item, dict):
                        continue
                    parsed = _parse_extra_model_entry(item, index=index)
                    if parsed:
                        add_to_group(parsed)
        except Exception as e:
            logger.warning(f"解析 EXTRA_AI_MODELS 失败: {e}")

    # 4. MODEL_N_... (支持 1-10)
    for i in range(1, 11):
        key = os.getenv(f"MODEL_{i}_API_KEY", "").strip()
        if not key or key.startswith("your_") or len(key) <= 10:
            continue

        provider = os.getenv(f"MODEL_{i}_PROVIDER", "openai").strip().lower() or "openai"
        model_name = os.getenv(f"MODEL_{i}_NAME", "gpt-4o-mini").strip() or "gpt-4o-mini"
        base_url = os.getenv(f"MODEL_{i}_BASE_URL") or None

        add_to_group(_create_single_endpoint_model(
            name=os.getenv(f"MODEL_{i}_DISPLAY_NAME", f"Model-{i}"),
            provider=provider,
            model_name=model_name,
            api_key=key,
            base_url=base_url,
            temperature=_safe_float(os.getenv(f"MODEL_{i}_TEMPERATURE", "0.7"), 0.7),
            endpoint_id=f"model-{i}-primary",
        ))

    # 5. 按 model_name 聚合合并
    merged_configs: List[ModelConfig] = []
    for model_name, group in model_groups.items():
        if len(group) == 1:
            # 只有一个配置，直接使用
            merged_configs.append(group[0])
        else:
            # 多个配置，合并 endpoints
            all_endpoints: List[ModelEndpoint] = []
            for cfg in group:
                all_endpoints.extend(cfg.endpoints)

            # 按优先级排序
            all_endpoints.sort(key=lambda ep: ep.priority, reverse=True)

            # 使用第一个配置的信息作为基础
            primary = group[0]
            merged = ModelConfig(
                name=model_name,  # 使用 model_name 作为显示名称
                provider=primary.provider,
                model_name=model_name,
                endpoints=all_endpoints,
            )
            merged_configs.append(merged)

    return merged_configs[:MAX_MODELS]


def _is_endpoint_switchable_error(error_text: str) -> bool:
    lowered = (error_text or "").lower()
    if any(code in lowered for code in ["401", "403", "429"]):
        return True
    if any(marker in lowered for marker in ["500", "502", "503", "504"]):
        return True
    if any(marker in lowered for marker in ["timeout", "timed out", "connect", "connection", "network", "ssl"]):
        return True
    return False


def _get_gemini_analyzer_cls():
    from src.analyzer import GeminiAnalyzer

    return GeminiAnalyzer


def _run_single_model(
    model_config: ModelConfig,
    context: Dict[str, Any],
    news_context: Optional[str],
) -> ModelResult:
    """使用单个逻辑模型执行分析（在 endpoint 池内轮转）。"""
    start = time.time()
    endpoint_tried: List[str] = []

    endpoints = sorted(
        [endpoint for endpoint in model_config.endpoints if endpoint.enabled],
        key=lambda item: item.priority,
        reverse=True,
    )

    if not endpoints:
        elapsed = time.time() - start
        return ModelResult(
            model_name=model_config.name,
            success=False,
            error="没有可用 endpoint（全部被禁用或未配置）",
            elapsed_seconds=elapsed,
            endpoint_tried=[],
            fallback_count=0,
        )

    last_error: Optional[str] = None

    for index, endpoint in enumerate(endpoints):
        endpoint_tried.append(endpoint.id)
        params = {
            "name": model_config.name,
            "provider": model_config.provider,
            "api_key": endpoint.api_key,
            "base_url": endpoint.base_url,
            "model": model_config.model_name,
            "temperature": endpoint.temperature if endpoint.temperature is not None else 0.7,
            "verify_ssl": endpoint.verify_ssl,
        }

        try:
            analyzer_cls = _get_gemini_analyzer_cls()
            analyzer = analyzer_cls(model_params=params)
            if not analyzer.is_available():
                error_text = "分析器初始化失败或 API Key 无效"
                last_error = error_text
                logger.warning("[专家会诊] %s endpoint=%s 初始化失败", model_config.name, endpoint.id)
                continue

            result = analyzer.analyze(context, news_context)
            if getattr(result, "success", True):
                elapsed = time.time() - start
                return ModelResult(
                    model_name=model_config.name,
                    success=True,
                    score=result.sentiment_score,
                    advice=result.operation_advice,
                    trend=result.trend_prediction,
                    summary=result.analysis_summary,
                    confidence=result.confidence_level if hasattr(result, "confidence_level") else None,
                    raw_result=result.to_dict() if hasattr(result, "to_dict") else None,
                    elapsed_seconds=elapsed,
                    endpoint_tried=endpoint_tried,
                    endpoint_used=endpoint.id,
                    fallback_count=index,
                )

            error_text = getattr(result, "error_message", None) or "模型返回失败"
            last_error = error_text
            if _is_endpoint_switchable_error(error_text):
                logger.warning(
                    "[专家会诊] %s endpoint=%s 失败，切换下一 endpoint: %s",
                    model_config.name,
                    endpoint.id,
                    error_text,
                )
                continue

            elapsed = time.time() - start
            return ModelResult(
                model_name=model_config.name,
                success=False,
                error=str(error_text)[:200],
                elapsed_seconds=elapsed,
                endpoint_tried=endpoint_tried,
                endpoint_used=endpoint.id,
                fallback_count=index,
            )

        except Exception as e:
            error_text = str(e)[:400]
            last_error = error_text
            logger.warning(
                "[专家会诊] %s endpoint=%s 异常，准备切换: %s",
                model_config.name,
                endpoint.id,
                error_text,
            )
            if not _is_endpoint_switchable_error(error_text):
                elapsed = time.time() - start
                return ModelResult(
                    model_name=model_config.name,
                    success=False,
                    error=error_text[:200],
                    elapsed_seconds=elapsed,
                    endpoint_tried=endpoint_tried,
                    endpoint_used=endpoint.id,
                    fallback_count=index,
                )

    elapsed = time.time() - start
    return ModelResult(
        model_name=model_config.name,
        success=False,
        error=(last_error or "所有 endpoint 均失败")[:200],
        elapsed_seconds=elapsed,
        endpoint_tried=endpoint_tried,
        endpoint_used=None,
        fallback_count=max(0, len(endpoint_tried) - 1),
    )


def _compute_consensus(results: List[ModelResult]) -> Dict[str, Any]:
    """计算多模型共识结论。"""
    successful = [r for r in results if r.success and r.score is not None]
    if not successful:
        return {
            "score": None,
            "advice": "数据不足",
            "summary": "所有模型分析均失败，无法生成共识结论。",
            "strategy": None,
        }

    avg_score = round(sum(r.score for r in successful) / len(successful))

    advice_counts: Dict[str, int] = {}
    valid_strategies: List[Dict[str, Any]] = []

    for r in successful:
        if r.advice:
            advice_counts[r.advice] = advice_counts.get(r.advice, 0) + 1

        if r.raw_result and r.raw_result.get("dashboard") and r.raw_result["dashboard"].get("battle_plan"):
            strategies = r.raw_result["dashboard"]["battle_plan"].get("sniper_points")
            if strategies:
                valid_strategies.append(strategies)

    top_advice = max(advice_counts, key=advice_counts.get) if advice_counts else "观望"

    consensus_strategy = None
    if valid_strategies:
        matching_models = [
            r
            for r in successful
            if r.advice == top_advice and r.raw_result and r.raw_result.get("dashboard")
        ]
        if matching_models:
            best_model = max(matching_models, key=lambda x: x.score or 0)
            if best_model.raw_result:
                consensus_strategy = best_model.raw_result["dashboard"]["battle_plan"].get("sniper_points")

        if not consensus_strategy:
            consensus_strategy = valid_strategies[0]

    agree_count = advice_counts.get(top_advice, 0)
    total = len(successful)
    if agree_count == total:
        consensus_text = f"全部 {total} 位专家一致建议【{top_advice}】"
    else:
        consensus_text = f"{agree_count}/{total} 位专家建议【{top_advice}】"
        dissenting = [r for r in successful if r.advice != top_advice]
        if dissenting:
            alt_views = ", ".join(f"{r.model_name}建议{r.advice}" for r in dissenting)
            consensus_text += f"，但 {alt_views}"

    scores = [r.score for r in successful if r.score is not None]
    score_range = f"评分区间: {min(scores)}-{max(scores)}, 均值: {avg_score}"

    summary = f"📊 {consensus_text}。{score_range}。"

    return {
        "score": avg_score,
        "advice": top_advice,
        "summary": summary,
        "strategy": consensus_strategy,
    }


def run_expert_panel(
    context: Dict[str, Any],
    news_context: Optional[str] = None,
    selected_models: Optional[List[str]] = None,
    max_workers: int = 3,
) -> ExpertPanelResult:
    """执行专家会诊分析。"""
    stock_code = context.get("code", "Unknown")
    stock_name = context.get("stock_name", stock_code)

    all_configs = parse_model_configs()
    if not all_configs:
        return ExpertPanelResult(
            stock_code=stock_code,
            stock_name=stock_name,
            models_used=[],
            model_results=[],
            consensus_summary="未配置任何 AI 模型，无法执行专家会诊。",
        )

    if selected_models:
        selected_lower = [m.lower() for m in selected_models]
        configs = [c for c in all_configs if c.name.lower() in selected_lower]
        if not configs:
            configs = all_configs
    else:
        configs = all_configs

    configs = configs[:MAX_MODELS]
    model_names = [c.name for c in configs]

    logger.info(f"[专家会诊] 开始分析 {stock_name}({stock_code}), 模型: {model_names}")

    model_results: List[ModelResult] = []
    with ThreadPoolExecutor(max_workers=min(max_workers, len(configs))) as executor:
        future_to_model = {
            executor.submit(_run_single_model, cfg, context, news_context): cfg.name for cfg in configs
        }
        for future in as_completed(future_to_model):
            model_name = future_to_model[future]
            try:
                result = future.result(timeout=300)
                model_results.append(result)
                status = "✅" if result.success else "❌"
                logger.info(
                    "[专家会诊] %s %s: score=%s, advice=%s, endpoint=%s, fallback_count=%s",
                    status,
                    model_name,
                    result.score,
                    result.advice,
                    result.endpoint_used,
                    result.fallback_count,
                )
            except Exception as e:
                logger.error(f"[专家会诊] {model_name} 异常: {e}")
                model_results.append(
                    ModelResult(
                        model_name=model_name,
                        success=False,
                        error=str(e)[:200],
                    )
                )

    model_results.sort(key=lambda r: model_names.index(r.model_name) if r.model_name in model_names else 999)

    consensus = _compute_consensus(model_results)

    panel_result = ExpertPanelResult(
        stock_code=stock_code,
        stock_name=stock_name,
        models_used=model_names,
        model_results=model_results,
        consensus_score=consensus["score"],
        consensus_advice=consensus["advice"],
        consensus_summary=consensus["summary"],
        consensus_strategy=consensus["strategy"],
    )

    logger.info(f"[专家会诊] 分析完成: {consensus['summary']}")
    return panel_result
