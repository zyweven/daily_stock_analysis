# -*- coding: utf-8 -*-
"""
===================================
工具管理接口
===================================

职责：
1. 提供系统可用工具列表查询
"""

from fastapi import APIRouter
from src.services.tool_registry import ToolRegistry

router = APIRouter()

@router.get("")
async def list_tools(include_config: bool = False):
    """获取系统所有可用工具

    Args:
        include_config: 是否包含工具配置模式 (config_schema)
    """
    if include_config:
        return {
            "tools": ToolRegistry.get_all_tools_with_config()
        }
    return {
        "tools": ToolRegistry.get_all_tools()
    }
