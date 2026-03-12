# -*- coding: utf-8 -*-
"""
===================================
存储模块
===================================

职责：
1. 管理 SQLite 数据库连接（单例模式）
2. 定义 ORM 数据模型
3. 提供数据存取接口
4. 实现智能更新逻辑（断点续传）
"""

from src.storage.base import Base
from src.storage.manager import DatabaseManager, get_db, persist_llm_usage

# 导出所有模型
from src.storage.models import (
    SystemConfig,
    AgentProfile,
    StockDaily,
    StockInfo,
    ChatSession,
    ChatMessage,
    NewsIntel,
    AnalysisHistory,
    BacktestResult,
    BacktestSummary,
    Skill,
    AgentSkill,
    PortfolioPosition,
)

__all__ = [
    # 基础
    'Base',
    'DatabaseManager',
    'get_db',
    'persist_llm_usage',
    # 模型
    'SystemConfig',
    'AgentProfile',
    'StockDaily',
    'StockInfo',
    'ChatSession',
    'ChatMessage',
    'NewsIntel',
    'AnalysisHistory',
    'BacktestResult',
    'BacktestSummary',
    'Skill',
    'AgentSkill',
    'PortfolioPosition',
]
