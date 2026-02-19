# -*- coding: utf-8 -*-
"""
===================================
Skill Management Service
===================================

Responsibilities:
1. CRUD operations for Skills (both built-in and user-created)
2. Apply skills to Agents (combine prompts and tools)
3. Validate skill combinations
4. Initialize built-in skills on first run

Usage:
    from src.services.skill_service import SkillService
    svc = SkillService()
    skills = svc.get_all_skills()
    config = svc.apply_skills_to_agent(agent, ["stock_news_research"])
"""

import json
import logging
import uuid
from typing import List, Optional, Dict, Any, Set, Tuple

from sqlalchemy import select, desc
from sqlalchemy.orm import joinedload

from src.storage import DatabaseManager, Skill, AgentSkill, AgentProfile
from src.services.skill_presets import (
    BUILTIN_SKILLS,
    get_builtin_skill,
    get_builtin_skills_by_category,
)
from src.services.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)


class SkillService:
    """
    Skill management service.

    Handles both built-in skills (from code) and user-created skills (from database).
    """

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()
        self._ensure_builtin_skills()

    # === Initialization ===

    def _ensure_builtin_skills(self):
        """Ensure all built-in skills are initialized in the database."""
        with self.db.get_session() as session:
            for preset in BUILTIN_SKILLS:
                existing = session.get(Skill, preset.id)
                if not existing:
                    logger.info(f"Initializing built-in skill: {preset.id}")
                    skill = Skill(
                        id=preset.id,
                        name=preset.name,
                        description=preset.description,
                        prompt_template=preset.prompt_template,
                        tool_bindings=json.dumps(preset.tool_bindings),
                        category=preset.category,
                        is_builtin=True,
                        icon=preset.icon,
                        version=preset.version,
                        created_by=None,  # NULL indicates system built-in
                    )
                    session.add(skill)
            session.commit()

    # === Query Methods ===

    def get_all_skills(self, include_builtin: bool = True) -> List[Dict[str, Any]]:
        """
        Get all available skills (both built-in and user-created).

        Args:
            include_builtin: Whether to include built-in skills

        Returns:
            List of skill dictionaries
        """
        with self.db.get_session() as session:
            query = select(Skill)
            if not include_builtin:
                query = query.where(Skill.is_builtin == False)
            query = query.order_by(desc(Skill.is_builtin), Skill.category, Skill.name)

            skills = session.execute(query).scalars().all()
            return [skill.to_dict() for skill in skills]

    def get_skill_by_id(self, skill_id: str) -> Optional[Dict[str, Any]]:
        """Get a skill by ID."""
        with self.db.get_session() as session:
            skill = session.get(Skill, skill_id)
            return skill.to_dict() if skill else None

    def get_skills_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get all skills in a specific category."""
        with self.db.get_session() as session:
            skills = session.execute(
                select(Skill)
                .where(Skill.category == category)
                .order_by(desc(Skill.is_builtin), Skill.name)
            ).scalars().all()
            return [skill.to_dict() for skill in skills]

    def get_categories(self) -> List[Dict[str, str]]:
        """Get all unique categories with counts."""
        with self.db.get_session() as session:
            from sqlalchemy import func

            results = session.execute(
                select(Skill.category, func.count(Skill.id))
                .group_by(Skill.category)
            ).all()

            # Map to category metadata
            category_map = {
                "stock": {"name": "股票分析", "icon": "📈"},
                "travel": {"name": "旅游出行", "icon": "✈️"},
                "code": {"name": "编程开发", "icon": "💻"},
                "general": {"name": "通用能力", "icon": "🔧"},
            }

            categories = []
            for cat_id, count in results:
                meta = category_map.get(cat_id, {"name": cat_id.capitalize(), "icon": "📦"})
                categories.append({
                    "id": cat_id,
                    "name": meta["name"],
                    "icon": meta["icon"],
                    "count": count,
                })

            return categories

    # === CRUD for User-Created Skills ===

    def create_skill(
        self,
        name: str,
        description: str,
        prompt_template: str,
        tool_bindings: List[Dict[str, Any]],
        category: str = "general",
        icon: str = "🔧",
        created_by: str = "user",
    ) -> Dict[str, Any]:
        """
        Create a new user-defined skill.

        Args:
            name: Display name
            description: Brief description
            prompt_template: Instructions for using tools
            tool_bindings: List of tools this skill uses
            category: Category for grouping
            icon: Icon emoji
            created_by: User identifier

        Returns:
            Created skill dictionary
        """
        # Validate tool names
        available_tools = set(ToolRegistry.list_tools())
        for binding in tool_bindings:
            tool_name = binding.get("tool_name")
            if tool_name and tool_name not in available_tools:
                raise ValueError(f"Tool not found: {tool_name}")

        skill_id = f"usr_{uuid.uuid4().hex[:8]}"

        with self.db.get_session() as session:
            skill = Skill(
                id=skill_id,
                name=name,
                description=description,
                prompt_template=prompt_template,
                tool_bindings=json.dumps(tool_bindings),
                category=category,
                is_builtin=False,
                icon=icon,
                created_by=created_by,
            )
            session.add(skill)
            session.commit()
            session.refresh(skill)
            return skill.to_dict()

    def update_skill(
        self,
        skill_id: str,
        created_by: str,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        Update a user-created skill.

        Note: Built-in skills cannot be modified.
        """
        with self.db.get_session() as session:
            skill = session.get(Skill, skill_id)
            if not skill:
                return None

            if skill.is_builtin:
                raise ValueError("Cannot modify built-in skills")

            if skill.created_by != created_by:
                raise ValueError("Can only modify your own skills")

            # Update allowed fields
            allowed_fields = ["name", "description", "prompt_template", "category", "icon"]
            for field in allowed_fields:
                if field in kwargs:
                    setattr(skill, field, kwargs[field])

            # Handle tool_bindings specially (JSON stringify)
            if "tool_bindings" in kwargs:
                bindings = kwargs["tool_bindings"]
                # Validate tool names
                available_tools = set(ToolRegistry.list_tools())
                for binding in bindings:
                    tool_name = binding.get("tool_name")
                    if tool_name and tool_name not in available_tools:
                        raise ValueError(f"Tool not found: {tool_name}")
                skill.tool_bindings = json.dumps(bindings)

            session.commit()
            session.refresh(skill)
            return skill.to_dict()

    def delete_skill(self, skill_id: str, created_by: str) -> bool:
        """Delete a user-created skill."""
        with self.db.get_session() as session:
            skill = session.get(Skill, skill_id)
            if not skill:
                return False

            if skill.is_builtin:
                raise ValueError("Cannot delete built-in skills")

            if skill.created_by != created_by:
                raise ValueError("Can only delete your own skills")

            # Check if any agent is using this skill
            bindings = session.execute(
                select(AgentSkill).where(AgentSkill.skill_id == skill_id)
            ).scalars().all()

            if bindings:
                # Soft delete: just mark relationships as disabled
                for binding in bindings:
                    binding.is_enabled = False
                logger.info(f"Disabled skill {skill_id} for {len(bindings)} agents")

            session.delete(skill)
            session.commit()
            return True

    # === Agent-Skill Relationship ===

    def bind_skill_to_agent(
        self,
        agent_id: str,
        skill_id: str,
        is_enabled: bool = True,
        custom_prompt_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Bind a skill to an agent.

        Args:
            agent_id: Agent ID
            skill_id: Skill ID
            is_enabled: Whether the skill is initially enabled
            custom_prompt_override: Optional custom prompt to override the skill's default

        Returns:
            Binding dictionary
        """
        with self.db.get_session() as session:
            # Verify agent and skill exist
            agent = session.get(AgentProfile, agent_id)
            if not agent:
                raise ValueError(f"Agent not found: {agent_id}")

            skill = session.get(Skill, skill_id)
            if not skill:
                raise ValueError(f"Skill not found: {skill_id}")

            # Check if binding already exists
            existing = session.execute(
                select(AgentSkill).where(
                    AgentSkill.agent_id == agent_id,
                    AgentSkill.skill_id == skill_id
                )
            ).scalars().first()

            if existing:
                # Update existing binding
                existing.is_enabled = is_enabled
                if custom_prompt_override is not None:
                    existing.custom_prompt_override = custom_prompt_override
                session.commit()
                session.refresh(existing)
                return existing.to_dict()
            else:
                # Create new binding
                binding = AgentSkill(
                    agent_id=agent_id,
                    skill_id=skill_id,
                    is_enabled=is_enabled,
                    custom_prompt_override=custom_prompt_override,
                )
                session.add(binding)
                session.commit()
                session.refresh(binding)
                return binding.to_dict()

    def unbind_skill_from_agent(self, agent_id: str, skill_id: str) -> bool:
        """Remove a skill binding from an agent."""
        with self.db.get_session() as session:
            binding = session.execute(
                select(AgentSkill).where(
                    AgentSkill.agent_id == agent_id,
                    AgentSkill.skill_id == skill_id
                )
            ).scalars().first()

            if not binding:
                return False

            session.delete(binding)
            session.commit()
            return True

    def get_agent_skills(self, agent_id: str, only_enabled: bool = True) -> List[Dict[str, Any]]:
        """
        Get all skills bound to an agent.

        Returns:
            List of skill dictionaries with binding metadata
        """
        with self.db.get_session() as session:
            query = (
                select(AgentSkill, Skill)
                .join(Skill, AgentSkill.skill_id == Skill.id)
                .where(AgentSkill.agent_id == agent_id)
            )
            if only_enabled:
                query = query.where(AgentSkill.is_enabled == True)

            results = session.execute(query).all()

            skills = []
            for binding, skill in results:
                skill_dict = skill.to_dict()
                skill_dict["binding_id"] = binding.id
                skill_dict["is_enabled"] = binding.is_enabled
                skill_dict["custom_prompt_override"] = binding.custom_prompt_override
                skills.append(skill_dict)

            return skills

    def update_agent_skill(
        self,
        binding_id: int,
        is_enabled: Optional[bool] = None,
        custom_prompt_override: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update an agent-skill binding."""
        with self.db.get_session() as session:
            binding = session.get(AgentSkill, binding_id)
            if not binding:
                return None

            if is_enabled is not None:
                binding.is_enabled = is_enabled
            if custom_prompt_override is not None:
                binding.custom_prompt_override = custom_prompt_override

            session.commit()
            session.refresh(binding)
            return binding.to_dict()

    # === Skill Application (Core Logic) ===

    def apply_skills_to_agent(
        self,
        agent: AgentProfile,
        skill_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Apply skills to an agent to generate runtime configuration.

        This is the core method that combines:
        1. Agent's base prompt (personality/identity)
        2. Skill prompt templates (capabilities/tool usage guides)
        3. Tool bindings from all skills

        Args:
            agent: AgentProfile instance
            skill_ids: Specific skill IDs to apply (if None, uses agent's bound skills)

        Returns:
            {
                "system_prompt": "Combined prompt with all skill instructions",
                "enabled_tools": ["tool1", "tool2", ...],
                "skills_applied": [skill_dict, ...],
                "tool_to_skills": {"tool1": ["skill1", "skill2"], ...}
            }
        """
        base_prompt = agent.system_prompt or "You are a helpful AI assistant."

        with self.db.get_session() as session:
            # If skill_ids not provided, get from agent's bindings
            if skill_ids is None:
                bindings = session.execute(
                    select(AgentSkill, Skill)
                    .join(Skill, AgentSkill.skill_id == Skill.id)
                    .where(
                        AgentSkill.agent_id == agent.id,
                        AgentSkill.is_enabled == True
                    )
                ).all()
                skills_data = [(binding, skill) for binding, skill in bindings]
            else:
                # Use provided skill IDs
                skills_data = []
                for skill_id in skill_ids:
                    skill = session.get(Skill, skill_id)
                    if skill:
                        skills_data.append((None, skill))

        # Build combined configuration
        skill_prompts = []
        all_tools: Set[str] = set()
        tool_to_skills: Dict[str, List[str]] = {}
        skills_applied = []

        for binding, skill in skills_data:
            # Get effective prompt (custom override or default)
            if binding and binding.custom_prompt_override:
                prompt = binding.custom_prompt_override
            else:
                prompt = skill.prompt_template

            # Add skill section to prompt
            skill_prompts.append(f"## {skill.name}\n{prompt}")

            # Collect tools
            bindings = json.loads(skill.tool_bindings or "[]")
            for tool_binding in bindings:
                tool_name = tool_binding.get("tool_name")
                if tool_name:
                    all_tools.add(tool_name)
                    if tool_name not in tool_to_skills:
                        tool_to_skills[tool_name] = []
                    tool_to_skills[tool_name].append(skill.name)

            skills_applied.append(skill.to_dict())

        # Combine prompts
        if skill_prompts:
            skill_prompts_text = "\n\n".join(skill_prompts)
            full_prompt = f"""{base_prompt}

You have access to the following professional capabilities. When relevant to the user's request, you MUST use the corresponding tools following these guidelines:

{skill_prompts_text}

Important: Select and use appropriate tools based on the user's needs. Always provide specific, actionable insights based on tool results."""
        else:
            full_prompt = base_prompt

        # Merge with agent's manual tools
        manual_tools = json.loads(agent.manual_tools or "[]") if hasattr(agent, "manual_tools") else []
        all_tools.update(manual_tools)

        return {
            "system_prompt": full_prompt,
            "enabled_tools": sorted(list(all_tools)),
            "skills_applied": skills_applied,
            "tool_to_skills": tool_to_skills,
            "base_prompt_length": len(base_prompt),
            "full_prompt_length": len(full_prompt),
        }

    def preview_skill_combination(
        self,
        base_prompt: str,
        skill_ids: List[str],
        manual_tools: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Preview what a skill combination would look like without saving.

        Used by frontend to show real-time preview when configuring agent.
        """
        # Create a temporary agent object
        temp_agent = AgentProfile(
            id="preview",
            name="Preview",
            system_prompt=base_prompt,
            manual_tools=json.dumps(manual_tools or []),
        )

        result = self.apply_skills_to_agent(temp_agent, skill_ids)

        # Add preview-specific metadata
        result["skill_count"] = len(skill_ids)
        result["estimated_tokens"] = len(result["system_prompt"]) // 4  # Rough estimate

        return result

    # === Validation ===

    def validate_skill_combination(self, skill_ids: List[str]) -> Tuple[bool, str]:
        """
        Validate a skill combination.

        Returns:
            (is_valid, message)
        """
        if len(skill_ids) > 10:
            return False, "Maximum 10 skills allowed per agent"

        # Check for duplicates
        if len(skill_ids) != len(set(skill_ids)):
            return False, "Duplicate skills detected"

        # Verify all skills exist
        with self.db.get_session() as session:
            for skill_id in skill_ids:
                skill = session.get(Skill, skill_id)
                if not skill:
                    return False, f"Skill not found: {skill_id}"

        return True, "Valid"
