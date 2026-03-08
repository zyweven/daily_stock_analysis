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

class SystemConfig(Base):
    """
    系统配置模型（混合配置系统）

    当 CONFIG_STORAGE_TYPE=db 时，配置项将存储在此表中。
    支持与 .env 相同的 key-value 结构。
    """
    __tablename__ = 'system_config'

    key = Column(String(100), primary_key=True)
    value = Column(Text, default='')
    description = Column(String(500))  # 可选描述
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<SystemConfig(key={self.key}, value={self.value[:30]}...)>"


