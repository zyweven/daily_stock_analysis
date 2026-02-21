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
from src.services.skill_service import SkillService

logger = logging.getLogger(__name__)

DEFAULT_AGENT_NAME = "股票分析师"
DEFAULT_SYSTEM_PROMPT = """你是一个专业的股票分析师助手，旨在帮助用户分析股票市场数据、解读技术指标和提供投资建议。

请遵循以下原则：
1. **数据驱动**：回答均基于工具获取的实时数据，严禁臆造数据。
2. **风险提示**：在给出操作建议时，必须附带风险提示。
3. **结构化表达**：使用 Markdown 格式清晰地组织回答（如使用表格、列表）。
4. **专业客观**：保持客观中立的态度，不进行情绪化表达。

如果用户询问无法通过工具解答的问题，请诚实告知无法回答。"""

# Default skills for the default agent
DEFAULT_AGENT_SKILLS = [
    "stock_technical_analysis",
    "stock_news_research",
    "stock_chip_analysis",
    "stock_risk_management",
]

class AgentService:
    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()
        self._ensure_default_agent()

    def _ensure_default_agent(self):
        """Ensure default Agent exists with default skills."""
        with self.db.get_session() as session:
            stmt = select(AgentProfile).where(AgentProfile.is_default == True)
            existing = session.execute(stmt).scalars().first()

            if not existing:
                logger.info("Initializing default Agent: 股票分析师")

                default_agent = AgentProfile(
                    id=str(uuid.uuid4()),
                    name=DEFAULT_AGENT_NAME,
                    description="系统默认的股票分析助手，集成了全套分析工具。",
                    system_prompt=DEFAULT_SYSTEM_PROMPT,
                    manual_tools=json.dumps([]),
                    model_config=json.dumps({"temperature": 0.5}),
                    is_default=True,
                    is_system=True
                )
                session.add(default_agent)
                session.commit()
                session.refresh(default_agent)

                # Bind default skills
                skill_svc = SkillService(self.db)
                for skill_id in DEFAULT_AGENT_SKILLS:
                    try:
                        skill_svc.bind_skill_to_agent(
                            agent_id=default_agent.id,
                            skill_id=skill_id,
                            is_enabled=True
                        )
                        logger.info(f"  Bound skill: {skill_id}")
                    except ValueError as e:
                        logger.warning(f"  Could not bind skill {skill_id}: {e}")

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

    def create_agent(
        self,
        name: str,
        system_prompt: str,
        description: str = "",
        manual_tools: List[str] = None,
        tool_configs: Dict[str, Dict] = None,
        model_config: Dict = None,
        skill_ids: List[str] = None,
    ) -> AgentProfile:
        """
        Create a new Agent.

        Args:
            name: Agent name
            system_prompt: Base system prompt (personality/identity)
            description: Agent description
            manual_tools: Additional tools not provided by skills
            tool_configs: Tool-specific configurations
            model_config: Model parameters (temperature, etc.)
            skill_ids: Skill IDs to bind to this agent
        """
        manual_tools = manual_tools or []
        tool_configs = tool_configs or {}
        model_config = model_config or {}
        skill_ids = skill_ids or []

        # Validate tool names
        valid_tools = ToolRegistry.validate_tools(manual_tools)

        with self.db.get_session() as session:
            agent = AgentProfile(
                id=str(uuid.uuid4()),
                name=name,
                description=description,
                system_prompt=system_prompt,
                manual_tools=json.dumps(valid_tools),
                tool_configs=json.dumps(tool_configs),
                model_config=json.dumps(model_config),
                is_default=False,
                is_system=False
            )
            session.add(agent)
            session.commit()
            session.refresh(agent)

            # Bind skills if provided
            if skill_ids:
                skill_svc = SkillService(self.db)
                for skill_id in skill_ids:
                    try:
                        skill_svc.bind_skill_to_agent(
                            agent_id=agent.id,
                            skill_id=skill_id,
                            is_enabled=True
                        )
                    except ValueError as e:
                        logger.warning(f"Could not bind skill {skill_id}: {e}")

            return agent

    def update_agent(self, agent_id: str, **kwargs) -> Optional[AgentProfile]:
        """Update Agent"""
        with self.db.get_session() as session:
            agent = session.get(AgentProfile, agent_id)
            if not agent:
                return None

            if agent.is_system:
                # System agents allow limited modifications
                pass

            if "name" in kwargs:
                agent.name = kwargs["name"]
            if "description" in kwargs:
                agent.description = kwargs["description"]
            if "system_prompt" in kwargs:
                agent.system_prompt = kwargs["system_prompt"]
            if "manual_tools" in kwargs:
                valid_tools = ToolRegistry.validate_tools(kwargs["manual_tools"])
                agent.manual_tools = json.dumps(valid_tools)
            # Backward compatibility
            if "enabled_tools" in kwargs:
                valid_tools = ToolRegistry.validate_tools(kwargs["enabled_tools"])
                agent.manual_tools = json.dumps(valid_tools)
            if "tool_configs" in kwargs:
                agent.tool_configs = json.dumps(kwargs["tool_configs"])
            if "model_config" in kwargs:
                agent.model_config = json.dumps(kwargs["model_config"])

            session.commit()
            session.refresh(agent)
            return agent

    def delete_agent(self, agent_id: str) -> bool:
        """Delete Agent"""
        with self.db.get_session() as session:
            agent = session.get(AgentProfile, agent_id)
            if not agent:
                return False

            if agent.is_system:
                logger.warning(f"Attempt to delete system Agent {agent.name} rejected")
                return False

            # Delete associated skill bindings first
            from src.storage import AgentSkill
            bindings = session.execute(
                select(AgentSkill).where(AgentSkill.agent_id == agent_id)
            ).scalars().all()
            for binding in bindings:
                session.delete(binding)

            session.delete(agent)
            session.commit()
            return True

    def get_agent_full_config(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the full runtime configuration for an Agent.

        This combines:
        1. Agent's base identity (name, description, system_prompt)
        2. Skills (capabilities and tool usage guides)
        3. Manual tools (additional tools beyond skills)
        4. Model configuration

        Returns:
            Full configuration dict for runtime use, or None if agent not found
        """
        with self.db.get_session() as session:
            agent = session.get(AgentProfile, agent_id)
            if not agent:
                return None

            # Use SkillService to apply skills
            skill_svc = SkillService(self.db)
            skill_config = skill_svc.apply_skills_to_agent(agent)

            # Get agent's bound skills for metadata
            agent_skills = skill_svc.get_agent_skills(agent_id, only_enabled=True)

            return {
                "agent_id": agent_id,
                "name": agent.name,
                "description": agent.description,
                "system_prompt": skill_config["system_prompt"],
                "enabled_tools": skill_config["enabled_tools"],
                "tool_configs": json.loads(agent.tool_configs) if agent.tool_configs else {},
                "skills": agent_skills,
                "model_config": json.loads(agent.model_config) if agent.model_config else {},
                "is_default": agent.is_default,
                "is_system": agent.is_system,
            }
