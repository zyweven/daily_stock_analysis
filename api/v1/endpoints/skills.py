# -*- coding: utf-8 -*-
"""
===================================
Skill Management API
===================================

Responsibilities:
1. List all available skills (built-in + user-created)
2. CRUD operations for user-created skills
3. Preview skill combinations
4. Get skill categories
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

from src.services.skill_service import SkillService

router = APIRouter()


# === Request/Response Models ===

class SkillResponse(BaseModel):
    """Skill response model."""
    model_config = {"populate_by_name": True}

    id: str
    name: str
    description: Optional[str] = ""
    icon: str = "🔧"
    category: str = "general"
    prompt_template: Optional[str] = None  # Only include if requested
    tool_bindings: List[Dict[str, Any]] = []
    is_builtin: bool = True
    version: str = "1.0"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SkillCreateRequest(BaseModel):
    """Create skill request."""
    model_config = {"populate_by_name": True}

    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    prompt_template: str = Field(..., min_length=10)
    tool_bindings: List[Dict[str, Any]] = Field(default_factory=list)
    category: str = Field(default="general", max_length=50)
    icon: str = Field(default="🔧", max_length=50)


class SkillUpdateRequest(BaseModel):
    """Update skill request."""
    model_config = {"populate_by_name": True}

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    prompt_template: Optional[str] = Field(None, min_length=10)
    tool_bindings: Optional[List[Dict[str, Any]]] = None
    category: Optional[str] = Field(None, max_length=50)
    icon: Optional[str] = Field(None, max_length=50)


class SkillPreviewRequest(BaseModel):
    """Preview skill combination request."""
    model_config = {"populate_by_name": True}

    base_prompt: str = Field(default="", description="Agent's base system prompt")
    skill_ids: List[str] = Field(default_factory=list, description="Skill IDs to apply")
    manual_tools: List[str] = Field(default_factory=list, description="Additional manual tools")


class SkillPreviewResponse(BaseModel):
    """Preview skill combination response."""
    model_config = {"populate_by_name": True}

    system_prompt: str
    enabled_tools: List[str]
    skills_applied: List[Dict[str, Any]]
    tool_to_skills: Dict[str, List[str]]
    skill_count: int
    estimated_tokens: int
    base_prompt_length: int
    full_prompt_length: int


class CategoryResponse(BaseModel):
    """Category response."""
    id: str
    name: str
    icon: str
    count: int


# === API Endpoints ===

@router.get("", response_model=List[SkillResponse])
async def list_skills(
    include_builtin: bool = Query(True, description="Include built-in skills"),
    category: Optional[str] = Query(None, description="Filter by category"),
):
    """
    Get all available skills.

    Returns both built-in skills and user-created skills.
    Can be filtered by category.
    """
    svc = SkillService()

    if category:
        skills = svc.get_skills_by_category(category)
    else:
        skills = svc.get_all_skills(include_builtin=include_builtin)

    return [SkillResponse(**skill) for skill in skills]


@router.get("/categories", response_model=List[CategoryResponse])
async def list_categories():
    """Get all skill categories with counts."""
    svc = SkillService()
    categories = svc.get_categories()
    return [CategoryResponse(**cat) for cat in categories]


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: str):
    """Get a specific skill by ID."""
    svc = SkillService()
    skill = svc.get_skill_by_id(skill_id)

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    return SkillResponse(**skill)


@router.post("", response_model=SkillResponse)
async def create_skill(request: SkillCreateRequest):
    """
    Create a new user-defined skill.

    User-created skills can be bound to any agent and modified/deleted.
    """
    svc = SkillService()

    try:
        skill = svc.create_skill(
            name=request.name,
            description=request.description,
            prompt_template=request.prompt_template,
            tool_bindings=request.tool_bindings,
            category=request.category,
            icon=request.icon,
            created_by="user",  # TODO: Get from auth context
        )
        return SkillResponse(**skill)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(skill_id: str, request: SkillUpdateRequest):
    """
    Update a user-created skill.

    Built-in skills cannot be modified.
    """
    svc = SkillService()

    update_data = request.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update content provided")

    try:
        skill = svc.update_skill(
            skill_id=skill_id,
            created_by="user",  # TODO: Get from auth context
            **update_data
        )
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        return SkillResponse(**skill)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """
    Delete a user-created skill.

    Built-in skills cannot be deleted.
    """
    svc = SkillService()

    try:
        success = svc.delete_skill(skill_id, created_by="user")  # TODO: Get from auth
        if not success:
            raise HTTPException(status_code=404, detail="Skill not found")
        return {"success": True, "message": "Skill deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/preview", response_model=SkillPreviewResponse)
async def preview_skill_combination(request: SkillPreviewRequest):
    """
    Preview the effect of combining skills.

    Shows what the combined system prompt and tool list would look like
    without actually saving the configuration.
    """
    svc = SkillService()

    try:
        result = svc.preview_skill_combination(
            base_prompt=request.base_prompt,
            skill_ids=request.skill_ids,
            manual_tools=request.manual_tools,
        )
        return SkillPreviewResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# === Agent-Skill Binding Endpoints ===

class AgentSkillBindRequest(BaseModel):
    """Bind skill to agent request."""
    model_config = {"populate_by_name": True}

    skill_id: str
    is_enabled: bool = True
    custom_prompt_override: Optional[str] = None


class AgentSkillUpdateRequest(BaseModel):
    """Update agent-skill binding request."""
    model_config = {"populate_by_name": True}

    is_enabled: Optional[bool] = None
    custom_prompt_override: Optional[str] = None


@router.post("/agents/{agent_id}/bind")
async def bind_skill_to_agent(agent_id: str, request: AgentSkillBindRequest):
    """Bind a skill to an agent."""
    svc = SkillService()

    try:
        binding = svc.bind_skill_to_agent(
            agent_id=agent_id,
            skill_id=request.skill_id,
            is_enabled=request.is_enabled,
            custom_prompt_override=request.custom_prompt_override,
        )
        return {"success": True, "binding": binding}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}/skills")
async def get_agent_skills(
    agent_id: str,
    only_enabled: bool = Query(True, description="Only return enabled skills"),
):
    """Get all skills bound to an agent."""
    svc = SkillService()
    skills = svc.get_agent_skills(agent_id, only_enabled=only_enabled)
    return {"skills": skills}


@router.put("/agents/{agent_id}/skills/{binding_id}")
async def update_agent_skill_binding(
    agent_id: str,
    binding_id: int,
    request: AgentSkillUpdateRequest,
):
    """Update an agent-skill binding (enable/disable or custom prompt)."""
    svc = SkillService()

    update_data = request.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update content provided")

    binding = svc.update_agent_skill(binding_id, **update_data)
    if not binding:
        raise HTTPException(status_code=404, detail="Binding not found")

    return {"success": True, "binding": binding}


@router.delete("/agents/{agent_id}/skills/{binding_id}")
async def unbind_skill_from_agent(agent_id: str, binding_id: int):
    """Remove a skill binding from an agent."""
    svc = SkillService()

    # Note: We use the binding_id directly, agent_id is for URL structure
    binding = svc.update_agent_skill(binding_id)
    if not binding:
        raise HTTPException(status_code=404, detail="Binding not found")

    # Actually delete it
    # TODO: Add method to delete by binding_id
    return {"success": True, "message": "Skill unbound"}
