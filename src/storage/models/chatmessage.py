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

class ChatMessage(Base):
    """
    AI 对话消息
    
    支持 4 种角色类型：
    - user: 用户消息
    - assistant: AI 回复
    - tool_call: AI 发起的工具调用
    - tool_result: 工具执行结果
    """
    __tablename__ = 'chat_message'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey('chat_session.id', ondelete='CASCADE'),
                        nullable=False)
    role = Column(String(15), nullable=False)     # 'user' | 'assistant' | 'tool_call' | 'tool_result'
    content = Column(Text, nullable=False)        # 消息内容 / JSON
    
    # 工具调用元数据
    tool_name = Column(String(50), nullable=True)   # 工具名称
    tool_args = Column(Text, nullable=True)         # JSON: 工具参数
    
    # AI 响应元数据
    model_name = Column(String(100), nullable=True)   # 生成回复的模型
    token_count = Column(Integer, nullable=True)      # Token 数估算
    response_time_ms = Column(Integer, nullable=True) # 响应耗时(ms)
    
    created_at = Column(DateTime, default=datetime.now)
    
    __table_args__ = (
        Index('ix_chat_msg_session', 'session_id', 'created_at'),
    )
    
    def __repr__(self):
        preview = self.content[:30] if self.content else ''
        return f"<ChatMessage(id={self.id}, role={self.role}, content={preview}...)>"
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        result = {
            'id': self.id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if self.tool_name:
            result['tool_name'] = self.tool_name
            result['tool_args'] = self.tool_args
        if self.model_name:
            result['model_name'] = self.model_name
        if self.token_count is not None:
            result['token_count'] = self.token_count
        if self.response_time_ms is not None:
            result['response_time_ms'] = self.response_time_ms
        return result


