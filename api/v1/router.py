# -*- coding: utf-8 -*-
"""
===================================
API v1 路由聚合
===================================

职责：
1. 聚合 v1 版本的所有 endpoint 路由
2. 统一添加 /api/v1 前缀
"""

from fastapi import APIRouter

from api.v1.endpoints import analysis, history, stocks, backtest, system_config, expert_panel, chat, agents, tools, skills, portfolio, user_config, usage

# 创建 v1 版本主路由
router = APIRouter(prefix="/api/v1")

router.include_router(
    analysis.router,
    prefix="/analysis",
    tags=["Analysis"]
)

router.include_router(
    history.router,
    prefix="/history",
    tags=["History"]
)

router.include_router(
    stocks.router,
    prefix="/stocks",
    tags=["Stocks"]
)

router.include_router(
    backtest.router,
    prefix="/backtest",
    tags=["Backtest"]
)

router.include_router(
    system_config.router,
    prefix="/system",
    tags=["SystemConfig"]
)

router.include_router(
    expert_panel.router,
    prefix="/expert-panel",
    tags=["ExpertPanel"]
)

router.include_router(
    chat.router,
    prefix="/chat",
    tags=["Chat"]
)

router.include_router(
    agents.router,
    prefix="/agents",
    tags=["Agents"]
)

router.include_router(
    tools.router,
    prefix="/tools",
    tags=["Tools"]
)

router.include_router(
    skills.router,
    prefix="/skills",
    tags=["Skills"]
)

router.include_router(
    portfolio.router,
    prefix="/portfolio",
    tags=["Portfolio"]
)

router.include_router(
    user_config.router,
    prefix="/user-config",
    tags=["UserConfig"]
)

router.include_router(
    usage.router,
    prefix="/usage",
    tags=["Usage"]
)

