# -*- coding: utf-8 -*-
"""
===================================
工具注册服务
===================================

职责：
1. 发现并注册系统中的可用工具
2. 提供工具元数据查询（供前端“实时工具箱”使用）
"""

import logging
from typing import List, Dict, Any, Optional
from src.services.chat_tools import CHAT_TOOLS

logger = logging.getLogger(__name__)

class ToolRegistry:
    """
    工具注册表
    
    目前直接通过静态配置管理工具，未来可扩展为动态扫描 @tool 装饰器
    """
    
    @staticmethod
    def get_all_tools() -> List[Dict[str, Any]]:
        """
        获取所有可用工具的元数据
        
        Returns:
            List[Dict]: 工具定义列表 (OpenAI Function Calling 格式)
        """
        return CHAT_TOOLS
    
    @staticmethod
    def get_tool_map() -> Dict[str, Dict[str, Any]]:
        """
        获取工具字典映射
        
        Returns:
            Dict[str, Dict]: {tool_name: tool_definition}
        """
        return {tool["function"]["name"]: tool for tool in CHAT_TOOLS}

    @staticmethod
    def validate_tools(tool_names: List[str]) -> List[str]:
        """
        验证工具名称列表是否有效
        
        Returns:
            List[str]: 有效的工具名称列表
        """
        valid_names = set(tool["function"]["name"] for tool in CHAT_TOOLS)
        return [name for name in tool_names if name in valid_names]
