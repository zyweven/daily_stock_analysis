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

class StockInfo(Base):
    """
    自选股基本信息表
    
    存储股票的基础信息及用户自定义的元数据（标签、备注等）。
    替代原有的 .env STOCK_LIST 配置。
    """
    __tablename__ = 'stock_info'
    
    code = Column(String(10), primary_key=True)
    name = Column(String(50))
    industry = Column(String(50))  # 细分行业
    area = Column(String(50))      # 地区
    
    # 用户自定义元数据
    tags = Column(String(500))     # JSON 列表: ["AI", "核心持仓"]
    remark = Column(Text)          # 用户备注
    
    # 状态
    is_active = Column(Boolean, default=True)  # 是否启用（参与自动分析）
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    def __repr__(self):
        return f"<StockInfo(code={self.code}, name={self.name})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        tags_list = []
        if self.tags:
            try:
                tags_list = json.loads(self.tags)
            except Exception:
                tags_list = []
                
        return {
            'code': self.code,
            'name': self.name,
            'industry': self.industry,
            'area': self.area,
            'tags': tags_list,
            'remark': self.remark,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


