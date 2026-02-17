# -*- coding: utf-8 -*-
"""
多模型专家会诊管理器 (Expert Panel Manager)

支持同时调用多个 AI 模型对同一只股票进行独立分析，
并汇总各模型观点生成"专家会诊"报告。

特性：
- 支持最多 5 个模型并行分析
- 自动生成对比汇总和综合结论
- 仅在用户手动触发时执行（定时任务不支持）
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from src.config import get_config

logger = logging.getLogger(__name__)

# 最大并行模型数量
MAX_MODELS = 10


@dataclass
class ModelConfig:
    """单个模型的配置信息"""
    name: str           # 显示名称 (如 "Gemini", "DeepSeek")
    provider: str       # 提供方类型: "gemini" 或 "openai"
    api_key: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    temperature: float = 0.7
    verify_ssl: bool = True


@dataclass
class ModelResult:
    """单个模型的分析结果"""
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
            "error": self.error,
        }


@dataclass
class ExpertPanelResult:
    """专家会诊汇总结果"""
    stock_code: str
    stock_name: str
    models_used: List[str]
    model_results: List[ModelResult]
    consensus_score: Optional[int] = None
    consensus_advice: Optional[str] = None
    consensus_summary: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stock_code": self.stock_code,
            "stock_name": self.stock_name,
            "models_used": self.models_used,
            "consensus_score": self.consensus_score,
            "consensus_advice": self.consensus_advice,
            "consensus_summary": self.consensus_summary,
            "model_results": [r.to_dict() for r in self.model_results],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


def parse_model_configs() -> List[ModelConfig]:
    """
    解析所有可用的模型配置。
    支持顺序：
    1. Gemini (主配置)
    2. OpenAI (主配置)
    3. EXTRA_AI_MODELS (JSON 批量配置)
    4. MODEL_N_... (命名配置，支持 1-10)
    """
    import os
    configs: List[ModelConfig] = []
    config = get_config()

    # 1. Gemini
    gemini_key = config.gemini_api_key
    if gemini_key and not gemini_key.startswith("your_") and len(gemini_key) > 10:
        configs.append(ModelConfig(
            name="Gemini",
            provider="gemini",
            api_key=gemini_key,
            model_name=config.gemini_model,
            temperature=config.gemini_temperature,
        ))

    # 2. OpenAI (官方或兼容)
    openai_key = config.openai_api_key
    if openai_key and not openai_key.startswith("your_") and len(openai_key) > 10:
        display_name = "OpenAI"
        if config.openai_base_url and "deepseek" in config.openai_base_url.lower():
            display_name = "DeepSeek"
        elif config.openai_base_url and "openai" not in config.openai_base_url.lower():
            display_name = config.openai_model or "OpenAI-Compatible"
        configs.append(ModelConfig(
            name=display_name,
            provider="openai",
            api_key=openai_key,
            base_url=config.openai_base_url,
            model_name=config.openai_model,
            temperature=config.openai_temperature,
            verify_ssl=config.openai_verify_ssl,
        ))

    # 3. EXTRA_AI_MODELS (JSON 批量)
    if config.extra_ai_models:
        try:
            extra_list = json.loads(config.extra_ai_models)
            if isinstance(extra_list, list):
                for item in extra_list:
                    if isinstance(item, dict) and item.get("api_key"):
                        configs.append(ModelConfig(
                            name=item.get("name", item.get("model", "Extra-Model")),
                            provider=item.get("provider", "openai"),
                            api_key=item.get("api_key"),
                            base_url=item.get("base_url"),
                            model_name=item.get("model"),
                            temperature=float(item.get("temperature", 0.7)),
                            verify_ssl=item.get("verify_ssl", True) if isinstance(item.get("verify_ssl"), bool) else True,
                        ))
        except Exception as e:
            logger.warning(f"解析 EXTRA_AI_MODELS 失败: {e}")

    # 4. MODEL_N_... (支持 1-10)
    # 排除已经添加过的（通过 API Key 简单判重）
    existing_keys = {c.api_key for c in configs}

    for i in range(1, 11):
        key = os.getenv(f"MODEL_{i}_API_KEY", "").strip()
        if key and not key.startswith("your_") and len(key) > 10 and key not in existing_keys:
            configs.append(ModelConfig(
                name=os.getenv(f"MODEL_{i}_DISPLAY_NAME", f"Model-{i}"),
                provider=os.getenv(f"MODEL_{i}_PROVIDER", "openai"),
                api_key=key,
                base_url=os.getenv(f"MODEL_{i}_BASE_URL"),
                model_name=os.getenv(f"MODEL_{i}_NAME", "gpt-4o-mini"),
                temperature=float(os.getenv(f"MODEL_{i}_TEMPERATURE", "0.7")),
            ))
            existing_keys.add(key)

    return configs[:MAX_MODELS]


def _run_single_model(
    model_config: ModelConfig,
    context: Dict[str, Any],
    news_context: Optional[str],
) -> ModelResult:
    """
    使用单个模型执行分析。
    """
    start = time.time()
    try:
        from src.analyzer import GeminiAnalyzer
        
        # 构造显式模型参数
        params = {
            "name": model_config.name,
            "provider": model_config.provider,
            "api_key": model_config.api_key,
            "base_url": model_config.base_url,
            "model": model_config.model_name,
            "temperature": model_config.temperature,
            "verify_ssl": model_config.verify_ssl,
        }
        
        # 创建分析器实例，传入显式参数
        # 这样无需环境变量切换，支持真正的并行
        analyzer = GeminiAnalyzer(model_params=params)

        if not analyzer.is_available():
            return ModelResult(
                model_name=model_config.name,
                success=False,
                error="分析器初始化失败或 API Key 无效",
            )

        result = analyzer.analyze(context, news_context)
        elapsed = time.time() - start

        return ModelResult(
            model_name=model_config.name,
            success=result.success if hasattr(result, 'success') else True,
            score=result.sentiment_score,
            advice=result.operation_advice,
            trend=result.trend_prediction,
            summary=result.analysis_summary,
            confidence=result.confidence_level if hasattr(result, 'confidence_level') else None,
            raw_result=result.to_dict() if hasattr(result, 'to_dict') else None,
            elapsed_seconds=elapsed,
        )

    except Exception as e:
        elapsed = time.time() - start
        logger.error(f"[专家会诊] {model_config.name} 分析失败: {e}")
        return ModelResult(
            model_name=model_config.name,
            success=False,
            error=str(e)[:200],
            elapsed_seconds=elapsed,
        )




def _compute_consensus(results: List[ModelResult]) -> Dict[str, Any]:
    """
    计算多模型共识结论。

    算法：
    1. 评分：取成功模型评分的平均值
    2. 建议：多数票制（出现次数最多的建议）
    3. 摘要：汇总各模型观点
    """
    successful = [r for r in results if r.success and r.score is not None]
    if not successful:
        return {
            "score": None,
            "advice": "数据不足",
            "summary": "所有模型分析均失败，无法生成共识结论。",
        }

    # 平均评分
    avg_score = round(sum(r.score for r in successful) / len(successful))

    # 建议投票
    advice_counts: Dict[str, int] = {}
    for r in successful:
        if r.advice:
            advice_counts[r.advice] = advice_counts.get(r.advice, 0) + 1
    top_advice = max(advice_counts, key=advice_counts.get) if advice_counts else "观望"

    # 生成共识摘要
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

    # 评分区间描述
    scores = [r.score for r in successful]
    score_range = f"评分区间: {min(scores)}-{max(scores)}, 均值: {avg_score}"

    summary = f"📊 {consensus_text}。{score_range}。"

    return {
        "score": avg_score,
        "advice": top_advice,
        "summary": summary,
    }


def run_expert_panel(
    context: Dict[str, Any],
    news_context: Optional[str] = None,
    selected_models: Optional[List[str]] = None,
    max_workers: int = 3,
) -> ExpertPanelResult:
    """
    执行专家会诊分析。

    Args:
        context: 股票分析上下文
        news_context: 新闻内容
        selected_models: 用户选择的模型名称列表（如 ["Gemini", "DeepSeek"]）
        max_workers: 最大并行线程数

    Returns:
        ExpertPanelResult 汇总结果
    """
    stock_code = context.get("code", "Unknown")
    stock_name = context.get("stock_name", stock_code)

    # 获取所有可用模型
    all_configs = parse_model_configs()
    if not all_configs:
        return ExpertPanelResult(
            stock_code=stock_code,
            stock_name=stock_name,
            models_used=[],
            model_results=[],
            consensus_summary="未配置任何 AI 模型，无法执行专家会诊。",
        )

    # 如果用户指定了模型列表，则过滤
    if selected_models:
        selected_lower = [m.lower() for m in selected_models]
        configs = [c for c in all_configs if c.name.lower() in selected_lower]
        if not configs:
            configs = all_configs  # 匹配失败，使用全部
    else:
        configs = all_configs

    configs = configs[:MAX_MODELS]
    model_names = [c.name for c in configs]

    logger.info(f"[专家会诊] 开始分析 {stock_name}({stock_code}), 模型: {model_names}")

    # 并行执行
    model_results: List[ModelResult] = []
    with ThreadPoolExecutor(max_workers=min(max_workers, len(configs))) as executor:
        future_to_model = {
            executor.submit(_run_single_model, cfg, context, news_context): cfg.name
            for cfg in configs
        }
        for future in as_completed(future_to_model):
            model_name = future_to_model[future]
            try:
                result = future.result(timeout=300)
                model_results.append(result)
                status = "✅" if result.success else "❌"
                logger.info(f"[专家会诊] {status} {model_name}: score={result.score}, advice={result.advice}")
            except Exception as e:
                logger.error(f"[专家会诊] {model_name} 异常: {e}")
                model_results.append(ModelResult(
                    model_name=model_name,
                    success=False,
                    error=str(e)[:200],
                ))

    # 按模型名称排序（保持一致的展示顺序）
    model_results.sort(key=lambda r: model_names.index(r.model_name) if r.model_name in model_names else 999)

    # 计算共识
    consensus = _compute_consensus(model_results)

    panel_result = ExpertPanelResult(
        stock_code=stock_code,
        stock_name=stock_name,
        models_used=model_names,
        model_results=model_results,
        consensus_score=consensus["score"],
        consensus_advice=consensus["advice"],
        consensus_summary=consensus["summary"],
    )

    logger.info(f"[专家会诊] 分析完成: {consensus['summary']}")
    return panel_result
