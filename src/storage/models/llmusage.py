# -*- coding: utf-8 -*-
"""
===================================
存储模块 - LLM 用量追踪模型
===================================

定义 SQLAlchemy ORM 数据模型，用于追踪 LLM Token 使用情况。
"""

from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import Column, String, Integer, DateTime, Index

from src.storage.base import Base


class LLMUsage(Base):
    """
    LLM Token 使用记录模型

    每条记录对应一次 LLM API 调用，用于成本审计和用量统计。
    """
    __tablename__ = 'llm_usage'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 调用类型: 'analysis' | 'agent' | 'chat' | 'market_review'
    call_type = Column(String(32), nullable=False, index=True)

    # 使用的模型名称，例如 'gemini/gemini-2.5-flash' 或 'openai/gpt-4o'
    model = Column(String(128), nullable=False)

    # 关联的股票代码（可选，主要用于 analysis 类型）
    stock_code = Column(String(16), nullable=True)

    # Token 统计
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)

    # 调用时间
    called_at = Column(DateTime, default=datetime.now, index=True)

    __table_args__ = (
        Index('ix_llm_usage_type_time', 'call_type', 'called_at'),
        Index('ix_llm_usage_model_time', 'model', 'called_at'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'call_type': self.call_type,
            'model': self.model,
            'stock_code': self.stock_code,
            'prompt_tokens': self.prompt_tokens,
            'completion_tokens': self.completion_tokens,
            'total_tokens': self.total_tokens,
            'called_at': self.called_at.isoformat() if self.called_at else None,
        }
