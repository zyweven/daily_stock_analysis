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

class AnalysisHistory(Base):
    """
    分析结果历史记录模型（多用户预留版本）

    保存每次分析结果，支持按 query_id/股票代码检索
    当前为单用户模式，user_id 默认使用 "default_user"
    """
    __tablename__ = 'analysis_history'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 用户隔离字段（预留，当前默认 default_user）
    user_id = Column(String(36), nullable=False, default='default_user', index=True)

    # 关联查询链路
    query_id = Column(String(64), index=True)

    # 股票信息
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))
    report_type = Column(String(16), index=True)

    # 核心结论
    sentiment_score = Column(Integer)
    operation_advice = Column(String(20))
    trend_prediction = Column(String(50))
    analysis_summary = Column(Text)

    # 详细数据
    raw_result = Column(Text)
    news_content = Column(Text)
    context_snapshot = Column(Text)

    # 多模型专家会诊详情（JSON 格式）
    # 格式: {"gemini": {"score": 85, "advice": "买入", ...}, "deepseek": {...}}
    model_details = Column(Text)  # JSON 存储各模型的独立分析结果
    models_used = Column(String(200))  # 使用的模型列表，逗号分隔

    # 狙击点位（用于回测）
    ideal_buy = Column(Float)
    secondary_buy = Column(Float)
    stop_loss = Column(Float)
    take_profit = Column(Float)

    created_at = Column(DateTime, default=datetime.now, index=True)

    __table_args__ = (
        Index('ix_analysis_code_time', 'code', 'created_at'),
        Index('ix_analysis_user_code', 'user_id', 'code'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'query_id': self.query_id,
            'code': self.code,
            'name': self.name,
            'report_type': self.report_type,
            'sentiment_score': self.sentiment_score,
            'operation_advice': self.operation_advice,
            'trend_prediction': self.trend_prediction,
            'analysis_summary': self.analysis_summary,
            'raw_result': self.raw_result,
            'news_content': self.news_content,
            'context_snapshot': self.context_snapshot,
            'ideal_buy': self.ideal_buy,
            'secondary_buy': self.secondary_buy,
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit,
            'model_details': self.model_details,
            'models_used': self.models_used,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


