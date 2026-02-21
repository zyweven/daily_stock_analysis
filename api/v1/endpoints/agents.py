# -*- coding: utf-8 -*-
"""
===================================
Agent 管理接口
===================================

职责：
1. Agent 的增删改查
"""

import json
from typing import List, Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field

from src.services.agent_service import AgentService

router = APIRouter()

# === 请求/响应模型 ===

class AgentResponse(BaseModel):
    model_config = {"populate_by_name": True}

    id: str
    name: str
    description: Optional[str] = ""
    system_prompt: Optional[str] = ""
    enabled_tools: List[str] = []
    manual_tools: List[str] = []
    tool_configs: Dict[str, Any] = {}
    agent_model_config: Dict[str, Any] = Field(default={}, alias="model_config")
    is_default: bool
    is_system: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class AgentCreateRequest(BaseModel):
    model_config = {"populate_by_name": True}

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = ""
    system_prompt: Optional[str] = ""
    enabled_tools: List[str] = []
    manual_tools: List[str] = []
    tool_configs: Dict[str, Any] = {}
    agent_model_config: Dict[str, Any] = Field(default={}, alias="model_config")

class AgentUpdateRequest(BaseModel):
    model_config = {"populate_by_name": True}

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    enabled_tools: Optional[List[str]] = None
    manual_tools: Optional[List[str]] = None
    tool_configs: Optional[Dict[str, Any]] = None
    agent_model_config: Optional[Dict[str, Any]] = Field(None, alias="model_config")

# === 接口实现 ===

@router.get("", response_model=List[AgentResponse])
async def list_agents():
    """获取所有 Agent"""
    svc = AgentService()
    agents = svc.list_agents()
    return [AgentResponse(**a.to_dict()) for a in agents]

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    """获取指定 Agent"""
    svc = AgentService()
    agent = svc.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return AgentResponse(**agent.to_dict())

@router.post("", response_model=AgentResponse)
async def create_agent(request: AgentCreateRequest):
    """创建新 Agent"""
    svc = AgentService()
    agent = svc.create_agent(
        name=request.name,
        description=request.description,
        system_prompt=request.system_prompt,
        enabled_tools=request.enabled_tools,
        manual_tools=request.manual_tools,
        tool_configs=request.tool_configs,
        model_config=request.agent_model_config
    )
    return AgentResponse(**agent.to_dict())

@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, request: AgentUpdateRequest):
    """更新 Agent"""
    svc = AgentService()

    update_data = request.model_dump(exclude_none=True)
    # 处理 alias 字段
    if "agent_model_config" in update_data:
        update_data["model_config"] = update_data.pop("agent_model_config")
    if not update_data:
        raise HTTPException(status_code=400, detail="无更新内容")

    agent = svc.update_agent(agent_id, **update_data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
        
    return AgentResponse(**agent.to_dict())

@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    """删除 Agent"""
    svc = AgentService()
    success = svc.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent 不存在或无法删除")
    return {"success": True, "message": "Agent 已删除"}
