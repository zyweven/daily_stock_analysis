# -*- coding: utf-8 -*-
"""
===================================
专家会诊接口 (Expert Panel Endpoint)
===================================

职责：
1. POST /expert-panel/analyze - 触发多模型专家会诊分析
2. GET  /expert-panel/models  - 获取已配置的可用模型列表
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import get_config
from src.core.expert_panel import (
    run_expert_panel,
    parse_model_configs,
    ExpertPanelResult,
    MAX_MODELS,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================
# Pydantic 请求/响应模型
# ============================================================

class ExpertPanelRequest(BaseModel):
    """专家会诊请求"""
    stock_code: str = Field(..., description="股票代码", example="600519")
    models: Optional[List[str]] = Field(
        None,
        description=f"选择参与分析的模型名称列表（最多 {MAX_MODELS} 个）。留空则使用全部可用模型。",
        example=["Gemini", "DeepSeek"],
    )

    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "models": ["Gemini", "DeepSeek"],
            }
        }


class EndpointInfo(BaseModel):
    """Endpoint 详细信息"""
    id: str = Field(..., description="endpoint 唯一标识")
    label: Optional[str] = Field(None, description="显示标签（如 OpenAI官方、Azure、代理A）")
    source_name: Optional[str] = Field(None, description="原始配置名称")
    priority: int = Field(0, description="优先级")
    enabled: bool = Field(True, description="是否启用")


class ModelInfo(BaseModel):
    """模型信息"""
    name: str = Field(..., description="模型显示名称")
    provider: str = Field(..., description="模型提供方 (gemini / openai)")
    model_name: Optional[str] = Field(None, description="底层模型标识")
    endpoint_count: int = Field(0, description="endpoint 总数")
    enabled_endpoint_count: int = Field(0, description="可用 endpoint 数")
    endpoints: Optional[List[EndpointInfo]] = Field(None, description="endpoint 详情列表（展开时返回）")


class ModelListResponse(BaseModel):
    """可用模型列表响应"""
    models: List[ModelInfo] = Field(..., description="已配置的模型列表")
    max_models: int = Field(MAX_MODELS, description="最大可同时使用的模型数量")


class ModelResultResponse(BaseModel):
    """单模型分析结果"""
    model_name: str
    success: bool
    score: Optional[int] = None
    advice: Optional[str] = None
    trend: Optional[str] = None
    summary: Optional[str] = None
    confidence: Optional[str] = None
    elapsed_seconds: float = 0.0
    error: Optional[str] = None
    raw_result: Optional[Dict[str, Any]] = None
    endpoint_tried: List[str] = Field(default_factory=list)
    endpoint_used: Optional[str] = None
    fallback_count: int = 0


class ExpertPanelResponse(BaseModel):
    """专家会诊响应"""
    stock_code: str = Field(..., description="股票代码")
    stock_name: str = Field(..., description="股票名称")
    models_used: List[str] = Field(..., description="实际参与分析的模型")
    consensus_score: Optional[int] = Field(None, description="共识评分")
    consensus_advice: Optional[str] = Field(None, description="共识建议")
    consensus_summary: Optional[str] = Field(None, description="共识摘要")
    consensus_strategy: Optional[Dict[str, Any]] = Field(None, description="共识策略点位")
    model_results: List[ModelResultResponse] = Field(..., description="各模型独立结果")
    created_at: str = Field(..., description="分析完成时间")


# ============================================================
# GET /models - 获取已配置的模型列表
# ============================================================

@router.get(
    "/models",
    response_model=ModelListResponse,
    summary="获取已配置的 AI 模型列表",
)
async def get_available_models(
    expand_endpoints: bool = False,
):
    """
    返回当前系统中已配置且可用的 AI 模型列表。

    前端可用此接口展示模型选择勾选框。

    Args:
        expand_endpoints: 是否展开返回 endpoint 详情列表
    """
    from src.core.expert_panel import _extract_host_label

    configs = parse_model_configs()
    models = []
    for c in configs:
        endpoint_infos = None
        if expand_endpoints:
            endpoint_infos = []
            for ep in c.endpoints:
                # 优先使用 source_name 作为 label，其次是 host label，最后是 endpoint id
                label = ep.source_name or _extract_host_label(ep.base_url) or ep.id
                endpoint_infos.append(
                    EndpointInfo(
                        id=ep.id,
                        label=label,
                        source_name=ep.source_name,
                        priority=ep.priority,
                        enabled=ep.enabled,
                    )
                )

        models.append(ModelInfo(
            name=c.name,  # 现在这是 model_name (如 gpt-4)
            provider=c.provider,
            model_name=c.model_name,
            endpoint_count=len(c.endpoints),
            enabled_endpoint_count=len([ep for ep in c.endpoints if ep.enabled]),
            endpoints=endpoint_infos,
        ))

    return ModelListResponse(models=models, max_models=MAX_MODELS)


# ============================================================
# POST /analyze - 触发专家会诊分析
# ============================================================

@router.post(
    "/analyze",
    response_model=ExpertPanelResponse,
    summary="触发多模型专家会诊分析",
)
async def trigger_expert_panel(request: ExpertPanelRequest):
    """
    对指定股票执行多模型并行分析（专家会诊）。

    流程：
    1. 获取股票上下文数据
    2. 并行调用所选模型
    3. 汇总共识结论并返回

    注意：此接口为同步接口，分析时间取决于最慢的模型（通常 30-120 秒）。
    """
    stock_code = request.stock_code.strip()
    if not stock_code:
        raise HTTPException(status_code=400, detail="股票代码不能为空")

    # 检查是否有模型可用
    available = parse_model_configs()
    if not available:
        raise HTTPException(
            status_code=400,
            detail="未配置任何 AI 模型，请在设置中配置至少一个模型的 API Key。",
        )

    logger.info(f"[专家会诊 API] 收到分析请求: {stock_code}, 模型: {request.models or '全部'}")

    try:
        # 获取股票上下文（复用现有的数据获取逻辑）
        from src.storage import get_db
        db = get_db()
        context = db.get_analysis_context(stock_code)

        if not context:
            # 如果数据库没有数据，创建基本上下文
            context = {"code": stock_code}

        # 获取新闻上下文（如果搜索引擎已配置）
        news_context = None
        try:
            config = get_config()
            has_search_keys = (
                config.bocha_api_keys or
                config.tavily_api_keys or
                config.brave_api_keys or
                config.serpapi_keys
            )
            if has_search_keys:
                from src.news_search import NewsSearchManager
                news_manager = NewsSearchManager()
                news_results = news_manager.search_stock_news(stock_code)
                if news_results:
                    news_context = "\n".join(
                        [f"[{n.get('source', '')}] {n.get('title', '')}: {n.get('snippet', '')}"
                         for n in news_results[:5]]
                    )
        except Exception as e:
            logger.warning(f"[专家会诊] 新闻搜索失败，使用纯技术面分析: {e}")

        # 执行专家会诊
        result: ExpertPanelResult = run_expert_panel(
            context=context,
            news_context=news_context,
            selected_models=request.models,
        )

        # 保存到数据库（可选）
        try:
            _save_panel_result_to_db(db, result, stock_code)
        except Exception as e:
            logger.warning(f"[专家会诊] 保存结果失败（不影响返回）: {e}")

        # 构建响应
        return ExpertPanelResponse(
            stock_code=result.stock_code,
            stock_name=result.stock_name,
            models_used=result.models_used,
            consensus_score=result.consensus_score,
            consensus_advice=result.consensus_advice,
            consensus_summary=result.consensus_summary,
            model_results=[
                ModelResultResponse(
                    model_name=r.model_name,
                    success=r.success,
                    score=r.score,
                    advice=r.advice,
                    trend=r.trend,
                    summary=r.summary,
                    confidence=r.confidence,
                    elapsed_seconds=r.elapsed_seconds,
                    error=r.error,
                    raw_result=r.raw_result,
                    endpoint_tried=r.endpoint_tried,
                    endpoint_used=r.endpoint_used,
                    fallback_count=r.fallback_count,
                )
                for r in result.model_results
            ],
            consensus_strategy=result.consensus_strategy,
            created_at=datetime.now().isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[专家会诊 API] 分析失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"专家会诊分析失败: {str(e)[:200]}",
        )


def _save_panel_result_to_db(db, result: ExpertPanelResult, stock_code: str):
    """将专家会诊结果保存到 analysis_history 表"""
    from src.storage import AnalysisHistory

    record = AnalysisHistory(
        query_id=str(uuid.uuid4()),
        code=stock_code,
        name=result.stock_name,
        report_type="expert_panel",
        sentiment_score=result.consensus_score,
        operation_advice=result.consensus_advice,
        analysis_summary=result.consensus_summary,
        model_details=result.to_json(),
        models_used=",".join(result.models_used),
        raw_result=result.to_json(),
    )

    with db.get_session() as session:
        session.add(record)
        session.commit()
        logger.info(f"[专家会诊] 结果已保存 (code={stock_code})")
