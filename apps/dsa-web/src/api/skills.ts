import { request } from './request';

export interface SkillToolBinding {
    tool_name: string;
    priority?: number;
    [key: string]: any;
}

export interface Skill {
    id: string;
    name: string;
    description?: string;
    icon: string;
    category: string;
    prompt_template?: string | null;
    tool_bindings: SkillToolBinding[];
    is_builtin: boolean;
    version: string;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface SkillCategory {
    id: string;
    name: string;
    icon: string;
    count: number;
}

export interface CreateSkillParams {
    name: string;
    description?: string;
    prompt_template: string;
    tool_bindings?: SkillToolBinding[];
    category?: string;
    icon?: string;
}

export interface UpdateSkillParams {
    name?: string;
    description?: string;
    prompt_template?: string;
    tool_bindings?: SkillToolBinding[];
    category?: string;
    icon?: string;
}

export interface SkillPreviewParams {
    base_prompt: string;
    skill_ids: string[];
    manual_tools?: string[];
}

export interface SkillPreviewResult {
    system_prompt: string;
    enabled_tools: string[];
    skills_applied: Array<Record<string, any>>;
    tool_to_skills: Record<string, string[]>;
    skill_count: number;
    estimated_tokens: number;
    base_prompt_length: number;
    full_prompt_length: number;
}

export interface AgentSkillBinding {
    id: number;
    agent_id: string;
    skill_id: string;
    is_enabled: boolean;
    custom_prompt_override?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface AgentBoundSkill extends Skill {
    binding_id: number;
    is_enabled: boolean;
    custom_prompt_override?: string | null;
}

export interface BindSkillToAgentParams {
    skill_id: string;
    is_enabled?: boolean;
    custom_prompt_override?: string | null;
}

export interface UpdateAgentSkillBindingParams {
    is_enabled?: boolean;
    custom_prompt_override?: string | null;
}

export const SkillApi = {
    list: (params?: { include_builtin?: boolean; category?: string }) =>
        request.get<Skill[]>('/api/v1/skills', { params }),

    listCategories: () => request.get<SkillCategory[]>('/api/v1/skills/categories'),

    get: (id: string) => request.get<Skill>(`/api/v1/skills/${id}`),

    create: (data: CreateSkillParams) => request.post<Skill>('/api/v1/skills', data),

    update: (id: string, data: UpdateSkillParams) => request.put<Skill>(`/api/v1/skills/${id}`, data),

    delete: (id: string) => request.delete<{ success: boolean; message: string }>(`/api/v1/skills/${id}`),

    preview: (data: SkillPreviewParams) => request.post<SkillPreviewResult>('/api/v1/skills/preview', data),

    bindToAgent: (agentId: string, data: BindSkillToAgentParams) =>
        request.post<{ success: boolean; binding: AgentSkillBinding }>(`/api/v1/skills/agents/${agentId}/bind`, data),

    getAgentSkills: (agentId: string, only_enabled = false) =>
        request.get<{ skills: AgentBoundSkill[] }>(`/api/v1/skills/agents/${agentId}/skills`, {
            params: { only_enabled },
        }),

    updateAgentSkillBinding: (agentId: string, bindingId: number, data: UpdateAgentSkillBindingParams) =>
        request.put<{ success: boolean; binding: AgentSkillBinding }>(`/api/v1/skills/agents/${agentId}/skills/${bindingId}`, data),

    unbindFromAgent: (agentId: string, bindingId: number) =>
        request.delete<{ success: boolean; message: string }>(`/api/v1/skills/agents/${agentId}/skills/${bindingId}`),
};
