# -*- coding: utf-8 -*-
"""
===================================
股票数据接口
===================================

职责：
1. 提供 GET /api/v1/stocks/{code}/quote 实时行情接口
2. 提供 GET /api/v1/stocks/{code}/history 历史行情接口
"""

import logging

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks

from api.v1.schemas.stocks import (
    StockQuote,
    StockHistoryResponse,
    KLineData,
)
from api.v1.schemas.common import ErrorResponse
from src.services.stock_service import StockService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{stock_code}/quote",
    response_model=StockQuote,
    responses={
        200: {"description": "行情数据"},
        404: {"description": "股票不存在", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取股票实时行情",
    description="获取指定股票的最新行情数据"
)
def get_stock_quote(stock_code: str) -> StockQuote:
    """
    获取股票实时行情
    
    获取指定股票的最新行情数据
    
    Args:
        stock_code: 股票代码（如 600519、00700、AAPL）
        
    Returns:
        StockQuote: 实时行情数据
        
    Raises:
        HTTPException: 404 - 股票不存在
    """
    try:
        service = StockService()
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_realtime_quote(stock_code)
        
        if result is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "not_found",
                    "message": f"未找到股票 {stock_code} 的行情数据"
                }
            )
        
        return StockQuote(
            stock_code=result.get("stock_code", stock_code),
            stock_name=result.get("stock_name"),
            current_price=result.get("current_price", 0.0),
            change=result.get("change"),
            change_percent=result.get("change_percent"),
            open=result.get("open"),
            high=result.get("high"),
            low=result.get("low"),
            prev_close=result.get("prev_close"),
            volume=result.get("volume"),
            amount=result.get("amount"),
            update_time=result.get("update_time")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取实时行情失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取实时行情失败: {str(e)}"
            }
        )


@router.get(
    "/{stock_code}/history",
    response_model=StockHistoryResponse,
    responses={
        200: {"description": "历史行情数据"},
        422: {"description": "不支持的周期参数", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取股票历史行情",
    description="获取指定股票的历史 K 线数据"
)
def get_stock_history(
    stock_code: str,
    period: str = Query("daily", description="K 线周期", pattern="^(daily|weekly|monthly)$"),
    days: int = Query(30, ge=1, le=365, description="获取天数")
) -> StockHistoryResponse:
    """
    获取股票历史行情
    
    获取指定股票的历史 K 线数据
    
    Args:
        stock_code: 股票代码
        period: K 线周期 (daily/weekly/monthly)
        days: 获取天数
        
    Returns:
        StockHistoryResponse: 历史行情数据
    """
    try:
        service = StockService()
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_history_data(
            stock_code=stock_code,
            period=period,
            days=days
        )
        
        # 转换为响应模型
        data = [
            KLineData(
                date=item.get("date"),
                open=item.get("open"),
                high=item.get("high"),
                low=item.get("low"),
                close=item.get("close"),
                volume=item.get("volume"),
                amount=item.get("amount"),
                change_percent=item.get("change_percent")
            )
            for item in result.get("data", [])
        ]
        
        return StockHistoryResponse(
            stock_code=stock_code,
            stock_name=result.get("stock_name"),
            period=period,
            data=data
        )
    
    except ValueError as e:
        # period 参数不支持的错误（如 weekly/monthly）
        raise HTTPException(
            status_code=422,
            detail={
                "error": "unsupported_period",
                "message": str(e)
            }
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取历史行情失败: {str(e)}"
            }
        )


# ==========================================
# 自选股管理接口 (Stock Knowledge Base)
# ==========================================

from pydantic import BaseModel, Field
from typing import List, Optional, Any

class StockInfoResponse(BaseModel):
    code: str = Field(..., description="股票代码")
    name: Optional[str] = Field(None, description="股票名称")
    industry: Optional[str] = Field(None, description="所属行业")
    area: Optional[str] = Field(None, description="地区")
    tags: List[str] = Field(default_factory=list, description="用户标签")
    remark: Optional[str] = Field(None, description="用户备注")
    is_active: bool = Field(True, description="是否启用")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class CreateStockRequest(BaseModel):
    code: str = Field(..., description="股票代码", min_length=1, max_length=10)
    name: Optional[str] = Field(None, description="股票名称（可选，自动获取）")
    tags: List[str] = Field(default_factory=list, description="标签")
    remark: Optional[str] = Field("", description="备注")

class UpdateStockRequest(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    area: Optional[str] = None
    tags: Optional[List[str]] = None
    remark: Optional[str] = None
    is_active: Optional[bool] = None

@router.get(
    "/list",
    response_model=List[StockInfoResponse],
    summary="获取自选股列表",
    description="获取所有自选股信息"
)
def list_stocks(active_only: bool = Query(False, description="仅返回启用状态")):
    from src.services.stock_manager import StockManageService
    service = StockManageService()
    return service.get_all_stocks(active_only=active_only)

@router.post(
    "/add",
    response_model=StockInfoResponse,
    summary="添加自选股",
    description="添加新的自选股，会自动尝试获取名称"
)
def add_stock(request: CreateStockRequest, background_tasks: BackgroundTasks):
    from src.services.stock_manager import StockManageService
    try:
        service = StockManageService()
        # 先快速添加（不获取详情）
        result = service.add_stock(
            code=request.code,
            name=request.name,
            tags=request.tags,
            remark=request.remark,
            fetch_info=False  # 关键：跳过耗时的信息获取
        )
        
        # 后台异步获取详情
        background_tasks.add_task(service.fetch_and_update_info, request.code)
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"添加股票失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post(
    "/{code}/refresh_info",
    summary="刷新股票信息",
    description="手动触发获取股票名称等元数据"
)
def refresh_stock_info(code: str):
    from src.services.stock_manager import StockManageService
    service = StockManageService()
    
    # 同步调用以获得直接反馈
    name = service.fetch_and_update_info(code)
    
    if name:
        return {"status": "success", "name": name}
    else:
        raise HTTPException(status_code=404, detail="未获取到股票信息，请稍后重试或检查代码")

@router.put(
    "/{code}",
    response_model=StockInfoResponse,
    summary="更新自选股信息",
    description="更新标签、备注、状态等"
)
def update_stock(code: str, request: UpdateStockRequest):
    from src.services.stock_manager import StockManageService
    service = StockManageService()
    
    updates = request.dict(exclude_unset=True)
    result = service.update_stock(code, **updates)
    
    if not result:
        raise HTTPException(status_code=404, detail="股票不存在")
    return result

@router.delete(
    "/{code}",
    summary="删除自选股",
    description="从自选股库中删除"
)
def delete_stock(code: str):
    from src.services.stock_manager import StockManageService
    service = StockManageService()
    success = service.delete_stock(code)
    if not success:
        raise HTTPException(status_code=404, detail="股票不存在")
    return {"status": "success", "message": f"已删除 {code}"}

@router.post(
    "/sync",
    summary="同步环境配置",
    description="从 .env 配置文件同步列表到数据库"
)
def sync_stocks():
    from src.services.stock_manager import StockManageService
    service = StockManageService()
    count = service.sync_from_env()
    return {"status": "success", "added_count": count}

@router.get(
    "/search",
    response_model=List[StockInfoResponse],
    summary="搜索自选股",
    description="支持代码或名称模糊搜索"
)
def search_stocks(q: str = Query(..., min_length=1, description="搜索关键词")):
    from src.services.stock_manager import StockManageService
    service = StockManageService()
    return service.search_stocks(q)
