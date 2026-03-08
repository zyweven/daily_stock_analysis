# -*- coding: utf-8 -*-
"""
===================================
存储模块 - 数据模型
===================================

定义 SQLAlchemy ORM 数据模型。
"""

import hashlib
import json
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any, TYPE_CHECKING

from sqlalchemy import (
    Column,
    String,
    Float,
    Boolean,
    Date,
    DateTime,
    Integer,
    ForeignKey,
    Index,
    UniqueConstraint,
    Text,
)

from src.storage.base import Base

if TYPE_CHECKING:
    from src.search_service import SearchResponse

logger = logging.getLogger(__name__)

class PortfolioPosition(Base):
    """
    持仓记录模型（多用户预留版本）

    记录用户的持仓股票、成本价、数量等信息
    支持多个持仓分组（如"核心持仓"、"观察仓"等）

    注意：当前为单用户模式，user_id 默认使用 "default_user"
    未来启用多用户时，只需传入真实用户ID即可
    """
    __tablename__ = 'portfolio_position'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 用户隔离字段（预留，当前默认 default_user）
    user_id = Column(String(36), nullable=False, default='default_user', index=True)

    # 股票信息
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))

    # 持仓数据
    quantity = Column(Float, nullable=False)  # 持仓数量（股）
    cost_price = Column(Float, nullable=False)  # 成本价（元）

    # 分组标签（如"核心持仓"、"短线仓"）
    group_name = Column(String(50), default='默认分组')

    # 用户备注
    remark = Column(Text)

    # 状态
    is_active = Column(Boolean, default=True)  # 是否仍持有

    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        # 同一用户同一股票同一分组只能有一条活跃记录
        UniqueConstraint('user_id', 'code', 'group_name', 'is_active',
                        name='uix_portfolio_user_code_group_active'),
        Index('ix_portfolio_user_code', 'user_id', 'code'),
        Index('ix_portfolio_user_group', 'user_id', 'group_name'),
    )

    def __repr__(self):
        return f"<PortfolioPosition(user={self.user_id}, code={self.code}, qty={self.quantity})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        cost_value = self.quantity * self.cost_price
        return {
            'id': self.id,
            'user_id': self.user_id,
            'code': self.code,
            'name': self.name,
            'quantity': self.quantity,
            'cost_price': self.cost_price,
            'cost_value': round(cost_value, 2),
            'group_name': self.group_name,
            'remark': self.remark,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def calculate_profit(self, current_price: float, total_principal: float = None) -> Dict[str, float]:
        """
        计算盈亏情况

        Args:
            current_price: 当前股价
            total_principal: 总本金（全局配置，用于计算仓位比例）

        Returns:
            包含市值、盈亏金额、盈亏比例、仓位比例的字典
        """
        market_value = self.quantity * current_price
        cost_value = self.quantity * self.cost_price
        profit_loss = market_value - cost_value
        profit_loss_pct = (profit_loss / cost_value * 100) if cost_value > 0 else 0

        result = {
            'market_value': round(market_value, 2),
            'cost_value': round(cost_value, 2),
            'profit_loss': round(profit_loss, 2),
            'profit_loss_pct': round(profit_loss_pct, 2),
        }

        # 如果提供了总本金，计算仓位比例
        if total_principal and total_principal > 0:
            position_ratio = (cost_value / total_principal * 100)
            result['position_ratio'] = round(position_ratio, 2)

        return result


