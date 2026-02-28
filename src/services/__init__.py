# -*- coding: utf-8 -*-
"""
===================================
服务层模块初始化
===================================

职责：
1. 导出所有服务类
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "AnalysisService",
    "BacktestService",
    "HistoryService",
    "StockService",
    "TaskService",
    "get_task_service",
]


def __getattr__(name: str) -> Any:
    if name == "AnalysisService":
        return import_module("src.services.analysis_service").AnalysisService
    if name == "BacktestService":
        return import_module("src.services.backtest_service").BacktestService
    if name == "HistoryService":
        return import_module("src.services.history_service").HistoryService
    if name == "StockService":
        return import_module("src.services.stock_service").StockService
    if name in {"TaskService", "get_task_service"}:
        module = import_module("src.services.task_service")
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
