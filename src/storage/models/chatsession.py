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

class ChatSession(Base):
    """
    AI 对话会话（多用户预留版本）

    存储每个对话会话的基本信息，支持关联股票和模型选择。
    当前为单用户模式，user_id 默认使用 "default_user"
    """
    __tablename__ = 'chat_session'

    id = Column(String(36), primary_key=True)        # UUID

    # 用户隔离字段（预留，当前默认 default_user）
    user_id = Column(String(36), nullable=False, default='default_user', index=True)

    title = Column(String(200), default='新对话')      # 会话标题（首条消息自动生成）
    stock_code = Column(String(10), nullable=True)    # 当前关联股票（可空）
    model_name = Column(String(100), nullable=True)   # 使用的模型名称
    message_count = Column(Integer, default=0)        # 消息计数

    # Agent 关联与配置快照
    agent_id = Column(String(36), ForeignKey('agent_profile.id'), nullable=True)
    current_agent_config = Column(Text, nullable=True) # JSON: 当前会话生效的 Agent 配置（支持会话级覆盖）

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index('ix_chat_session_user', 'user_id', 'updated_at'),
        Index('ix_chat_session_user_stock', 'user_id', 'stock_code'),
    )
    
    def __repr__(self):
        return f"<ChatSession(id={self.id}, title={self.title})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'stock_code': self.stock_code,
            'model_name': self.model_name,
            'message_count': self.message_count,
            'agent_id': self.agent_id,
            'current_agent_config': json.loads(self.current_agent_config) if self.current_agent_config else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


