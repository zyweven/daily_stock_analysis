# -*- coding: utf-8 -*-
"""
===================================
持仓管理 API 端点
===================================

职责：
1. 提供持仓CRUD接口
2. 预留多用户支持（当前使用default_user）
3. 支持分组管理、持仓统计
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.repositories.portfolio_repo import PortfolioRepository

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Portfolio"])


# ========== 请求/响应模型 ==========

class PositionCreate(BaseModel):
    """创建/更新持仓请求"""
    code: str = Field(..., description="股票代码", min_length=1, max_length=10)
    name: str = Field(..., description="股票名称", min_length=1, max_length=50)
    quantity: float = Field(..., description="持仓数量", gt=0)
    cost_price: float = Field(..., description="成本价", gt=0)
    group_name: str = Field(default="默认分组", description="分组名称", max_length=50)
    remark: Optional[str] = Field(None, description="备注", max_length=500)


class PositionUpdate(BaseModel):
    """更新持仓请求"""
    quantity: Optional[float] = Field(None, description="持仓数量", gt=0)
    cost_price: Optional[float] = Field(None, description="成本价", gt=0)
    name: Optional[str] = Field(None, description="股票名称", max_length=50)
    group_name: Optional[str] = Field(None, description="分组名称", max_length=50)
    remark: Optional[str] = Field(None, description="备注", max_length=500)


class PositionResponse(BaseModel):
    """持仓响应"""
    id: int
    user_id: str
    code: str
    name: str
    quantity: float
    cost_price: float
    group_name: str
    remark: Optional[str]
    is_active: bool
    cost_value: float = Field(..., description="成本市值 = 数量 × 成本价")
    created_at: str
    updated_at: str


class PositionWithProfit(BaseModel):
    """持仓响应（含实时盈亏）"""
    id: int
    user_id: str
    code: str
    name: str
    quantity: float
    cost_price: float
    group_name: str
    remark: Optional[str]
    is_active: bool
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_pct: Optional[float] = None
    position_ratio: Optional[float] = None  # 仓位比例（需要前端传入总本金计算）
    created_at: str
    updated_at: str


class PortfolioSummary(BaseModel):
    """持仓汇总"""
    total_positions: int
    total_cost_value: float
    total_quantity: float
    groups: List[str]
    codes: List[str]


# ========== 持仓管理端点 ==========

@router.get("/positions", response_model=List[PositionResponse])
async def get_positions(
    group: Optional[str] = Query(None, description="分组名称筛选")
):
    """
    获取持仓列表（基础数据，不含实时行情）

    当前为单用户模式，返回默认用户的持仓
    """
    repo = PortfolioRepository()
    positions = repo.get_all_positions(group_name=group)

    # 添加 cost_value 字段
    result = []
    for pos in positions:
        pos_dict = pos.to_dict()
        pos_dict['cost_value'] = round(pos.quantity * pos.cost_price, 2)
        result.append(pos_dict)

    return result


@router.get("/positions/detail", response_model=List[PositionWithProfit])
async def get_positions_with_profit(
    group: Optional[str] = Query(None, description="分组名称筛选")
):
    """
    获取持仓列表（含实时盈亏计算）

    会调用实时行情接口获取当前价格（并发获取以提升性能）
    注意：仓位比例需要在前端传入总本金后计算，或在AI工具中自动获取
    """
    from concurrent.futures import ThreadPoolExecutor
    from src.services.stock_service import StockService
    from src.services.user_config_service import UserConfigService

    repo = PortfolioRepository()
    config_svc = UserConfigService()

    # 获取全局本金
    total_principal = config_svc.get_total_principal()

    positions = repo.get_all_positions(group_name=group)

    # 定义获取单个持仓详情的函数
    def get_position_detail(pos):
        """获取单个持仓的详情（包括实时行情）"""
        pos_dict = pos.to_dict()

        # 始终计算成本市值（即使无法获取实时行情）
        cost_value = pos.quantity * pos.cost_price
        pos_dict['cost_value'] = round(cost_value, 2)

        # 获取实时行情
        try:
            stock_svc = StockService()
            quote = stock_svc.get_realtime_quote(pos.code)
            current_price = quote.get('price') if quote else None

            if current_price:
                # 计算盈亏（传入总本金）
                profit_data = pos.calculate_profit(current_price, total_principal)
                pos_dict.update(profit_data)
                pos_dict['current_price'] = current_price
        except Exception as e:
            logger.warning(f"获取 {pos.code} 行情失败: {str(e)}")
            pos_dict['error'] = f"获取行情失败: {str(e)}"

        return pos_dict

    # 使用线程池并发获取行情（最多5个并发，避免过度占用资源）
    with ThreadPoolExecutor(max_workers=5) as executor:
        result = list(executor.map(get_position_detail, positions))

    return result


@router.post("/positions", response_model=PositionResponse)
async def create_or_update_position(position: PositionCreate):
    """
    添加或更新持仓

    如果同一股票同一分组已存在，则更新；否则创建新记录
    """
    repo = PortfolioRepository()

    result = repo.save_position(
        code=position.code,
        name=position.name,
        quantity=position.quantity,
        cost_price=position.cost_price,
        group_name=position.group_name,
        remark=position.remark
    )

    if not result:
        raise HTTPException(status_code=500, detail="保存持仓失败")

    return result.to_dict()


@router.get("/positions/{code}", response_model=PositionWithProfit)
async def get_position_detail(
    code: str,
    group: str = Query("默认分组", description="分组名称")
):
    """
    获取单只股票持仓详情（含实时盈亏）
    """
    from src.services.stock_service import StockService
    from src.services.user_config_service import UserConfigService

    repo = PortfolioRepository()
    stock_svc = StockService()
    config_svc = UserConfigService()

    # 获取全局本金
    total_principal = config_svc.get_total_principal()

    position = repo.get_position(code=code, group_name=group)
    if not position:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")

    pos_dict = position.to_dict()

    # 获取实时行情
    try:
        quote = stock_svc.get_realtime_quote(code)
        current_price = quote.get('price') if quote else None

        if current_price:
            profit_data = position.calculate_profit(current_price, total_principal)
            pos_dict.update(profit_data)
            pos_dict['current_price'] = current_price
    except Exception as e:
        pos_dict['error'] = f"获取行情失败: {str(e)}"

    return pos_dict


@router.patch("/positions/{code}")
async def update_position(
    code: str,
    updates: PositionUpdate,
    group: str = Query("默认分组", description="分组名称")
):
    """
    更新持仓字段

    支持部分更新（只更新传入的字段）
    """
    repo = PortfolioRepository()

    # 过滤掉None值
    update_data = {k: v for k, v in updates.dict().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")

    result = repo.update_position(code=code, group_name=group, **update_data)

    if not result:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")

    return result.to_dict()


@router.delete("/positions/{code}")
async def delete_position(
    code: str,
    group: str = Query("默认分组", description="分组名称")
):
    """
    彻底删除持仓记录
    """
    repo = PortfolioRepository()
    success = repo.delete_position(code=code, group_name=group)

    if not success:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")

    return {"message": f"持仓 {code} 已删除"}


@router.post("/positions/{code}/close")
async def close_position(
    code: str,
    group: str = Query("默认分组", description="分组名称")
):
    """
    平仓（标记为已卖出，记录保留）
    """
    repo = PortfolioRepository()
    success = repo.close_position(code=code, group_name=group)

    if not success:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")

    return {"message": f"持仓 {code} 已平仓"}


@router.get("/summary", response_model=PortfolioSummary)
async def get_portfolio_summary():
    """
    获取持仓汇总统计
    """
    repo = PortfolioRepository()
    return repo.get_portfolio_summary()


@router.get("/groups")
async def get_groups():
    """
    获取所有分组名称
    """
    repo = PortfolioRepository()
    return {"groups": repo.get_groups()}


@router.get("/codes")
async def get_codes():
    """
    获取持仓中的所有股票代码

    用于批量查询行情、分析等场景
    """
    repo = PortfolioRepository()
    return {"codes": repo.get_codes_in_portfolio()}
