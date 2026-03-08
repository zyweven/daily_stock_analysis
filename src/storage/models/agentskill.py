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

class AgentSkill(Base):
    """
    Agent 与 Skill 的关联表

    支持：
    - 一个 Agent 可以绑定多个 Skill
    - 一个 Skill 可以被多个 Agent 使用
    - 用户可以覆盖 Skill 的默认 prompt
    """
    __tablename__ = 'agent_skills'

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(36), ForeignKey('agent_profile.id'), nullable=False)
    skill_id = Column(String(50), ForeignKey('skills.id'), nullable=False)

    is_enabled = Column(Boolean, default=True)      # 是否启用该 Skill
    # 用户可以覆盖 Skill 的默认 prompt
    custom_prompt_override = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.now)

    __table_args__ = (
        UniqueConstraint('agent_id', 'skill_id', name='uix_agent_skill'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'agent_id': self.agent_id,
            'skill_id': self.skill_id,
            'is_enabled': self.is_enabled,
            'custom_prompt_override': self.custom_prompt_override,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


