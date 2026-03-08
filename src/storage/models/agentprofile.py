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

class AgentProfile(Base):
    """
    Agent 配置档案
    
    定义 Agent 的核心行为参数，用于从单一工具升级为多 Agent 平台。
    """
    __tablename__ = 'agent_profile'
    
    id = Column(String(36), primary_key=True)        # UUID
    name = Column(String(100), nullable=False)       # Agent 名称
    description = Column(String(500))                # 描述
    
    # 核心配置
    system_prompt = Column(Text)                     # 系统提示词模板
    enabled_tools = Column(Text, default='[]')       # JSON List: 默认启用的工具列表
    manual_tools = Column(Text, default='[]')        # JSON List: 用户手动添加的工具列表
    tool_configs = Column(Text, default='{}')        # JSON Dict: 工具配置，如 {"search_news": {"provider": "tavily"}}
    model_config = Column(Text, default='{}')        # JSON Dict: 模型参数 (temperature, etc)
    
    # 状态
    is_default = Column(Boolean, default=False)      # 是否为默认 Agent
    is_system = Column(Boolean, default=False)       # 是否为系统预置（不可删除）
    
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'system_prompt': self.system_prompt,
            'enabled_tools': json.loads(self.enabled_tools) if self.enabled_tools else [],
            'manual_tools': json.loads(self.manual_tools) if self.manual_tools else [],
            'tool_configs': json.loads(self.tool_configs) if self.tool_configs else {},
            'agent_model_config': json.loads(self.model_config) if self.model_config else {},
            'is_default': self.is_default,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

