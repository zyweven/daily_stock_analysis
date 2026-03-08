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

class Skill(Base):
    """
    Skill (能力模块/技能预设)

    Skill 是"工具使用指南"的模块化封装，可以组合到 Agent 中。
    相同的工具在不同 Skill 中有不同的使用方式和专业指令。
    """
    __tablename__ = 'skills'

    id = Column(String(50), primary_key=True)      # 唯一标识: "stock_news_research" 或 "usr_{uuid}"
    name = Column(String(100), nullable=False)     # 显示名称: "股票舆情分析"
    description = Column(String(500))              # 简介: "搜索并解读股票相关新闻"

    # 核心：告诉 AI 如何使用工具完成特定任务
    prompt_template = Column(Text, nullable=False)  # 专业指令模板

    # 工具绑定：JSON 格式，支持参数预设
    # [{"tool_name": "search_news", "description": "搜索新闻"}]
    tool_bindings = Column(Text, default='[]')

    # 分类：用于前端分组展示
    category = Column(String(50), default='general')  # stock/travel/code/general

    # 来源标识
    is_builtin = Column(Boolean, default=False)     # 系统内置 vs 用户自定义
    created_by = Column(String(36), nullable=True)  # 用户ID，NULL表示系统内置

    # 元数据
    icon = Column(String(50), default='🔧')          # 图标 emoji 或 URL
    version = Column(String(10), default='1.0')      # 版本号

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'prompt_template': self.prompt_template,
            'tool_bindings': json.loads(self.tool_bindings) if self.tool_bindings else [],
            'category': self.category,
            'is_builtin': self.is_builtin,
            'icon': self.icon,
            'version': self.version,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


