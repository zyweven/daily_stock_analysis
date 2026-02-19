# -*- coding: utf-8 -*-
"""
===================================
Agent 管理服务
===================================

职责：
1. AgentProfile 的增删改查
2. 初始化默认 Agent
"""

import json
import logging
import uuid
from typing import List, Optional, Dict, Any

from sqlalchemy import select, desc
from src.storage import DatabaseManager, AgentProfile
from src.services.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

DEFAULT_AGENT_NAME = "股票分析师"
DEFAULT_SYSTEM_PROMPT = """你是一个专业的股票分析师助手，旨在帮助用户分析股票市场数据、解读技术指标和提供投资建议。

请遵循以下原则：
1. **数据驱动**：回答均基于工具获取的实时数据，严禁臆造数据。
2. **风险提示**：在给出操作建议时，必须附带风险提示。
3. **结构化表达**：使用 Markdown 格式清晰地组织回答（如使用表格、列表）。
4. **专业客观**：保持客观中立的态度，不进行情绪化表达。

如果用户询问无法通过工具解答的问题，请诚实告知无法回答。"""

class AgentService:
    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()
        self._ensure_default_agent()

    def _ensure_default_agent(self):
        """确保存在默认 Agent"""
        with self.db.get_session() as session:
            stmt = select(AgentProfile).where(AgentProfile.is_default == True)
            existing = session.execute(stmt).scalars().first()
            
            if not existing:
                logger.info("初始化默认 Agent: 股票分析师")
                # 获取所有可用工具作为默认配置
                all_tools = [t["function"]["name"] for t in ToolRegistry.get_all_tools()]
                
                default_agent = AgentProfile(
                    id=str(uuid.uuid4()),
                    name=DEFAULT_AGENT_NAME,
                    description="系统默认的股票分析助手，集成了全套分析工具。",
                    system_prompt=DEFAULT_SYSTEM_PROMPT,
                    enabled_tools=json.dumps(all_tools),
                    model_config=json.dumps({"temperature": 0.5}),
                    is_default=True,
                    is_system=True
                )
                session.add(default_agent)
                session.commit()

    def get_agent(self, agent_id: str) -> Optional[AgentProfile]:
        """获取指定 Agent"""
        with self.db.get_session() as session:
            return session.get(AgentProfile, agent_id)

    def get_default_agent(self) -> Optional[AgentProfile]:
        """获取默认 Agent"""
        with self.db.get_session() as session:
            stmt = select(AgentProfile).where(AgentProfile.is_default == True)
            return session.execute(stmt).scalars().first()

    def list_agents(self) -> List[AgentProfile]:
        """列出所有 Agent"""
        with self.db.get_session() as session:
            stmt = select(AgentProfile).order_by(desc(AgentProfile.is_default), desc(AgentProfile.updated_at))
            return session.execute(stmt).scalars().all()

    def create_agent(self, name: str, system_prompt: str, description: str = "", 
                    enabled_tools: List[str] = None, model_config: Dict = None) -> AgentProfile:
        """创建新 Agent"""
        enabled_tools = enabled_tools or []
        model_config = model_config or {}
        
        # 验证工具名
        valid_tools = ToolRegistry.validate_tools(enabled_tools)
        
        with self.db.get_session() as session:
            agent = AgentProfile(
                id=str(uuid.uuid4()),
                name=name,
                description=description,
                system_prompt=system_prompt,
                enabled_tools=json.dumps(valid_tools),
                model_config=json.dumps(model_config),
                is_default=False,
                is_system=False
            )
            session.add(agent)
            session.commit()
            session.refresh(agent)
            return agent

    def update_agent(self, agent_id: str, **kwargs) -> Optional[AgentProfile]:
        """更新 Agent"""
        with self.db.get_session() as session:
            agent = session.get(AgentProfile, agent_id)
            if not agent:
                return None
            
            if agent.is_system:
                # 系统 Agent 只允许修改部分字段? 目前暂不限制，为了灵活性
                pass

            if "name" in kwargs:
                agent.name = kwargs["name"]
            if "description" in kwargs:
                agent.description = kwargs["description"]
            if "system_prompt" in kwargs:
                agent.system_prompt = kwargs["system_prompt"]
            if "enabled_tools" in kwargs:
                valid_tools = ToolRegistry.validate_tools(kwargs["enabled_tools"])
                agent.enabled_tools = json.dumps(valid_tools)
            if "model_config" in kwargs:
                agent.model_config = json.dumps(kwargs["model_config"])
            
            session.commit()
            session.refresh(agent)
            return agent

    def delete_agent(self, agent_id: str) -> bool:
        """删除 Agent"""
        with self.db.get_session() as session:
            agent = session.get(AgentProfile, agent_id)
            if not agent:
                return False
            
            if agent.is_system:
                logger.warning(f"尝试删除系统 Agent {agent.name} 被拒绝")
                return False
                
            session.delete(agent)
            session.commit()
            return True
