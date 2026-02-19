import { request } from './request';

export interface AgentProfile {
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    enabled_tools: string[];
    model_config: Record<string, any>;
    is_default: boolean;
    is_system: boolean;
    created_at: string;
    updated_at: string;
}

export interface CreateAgentParams {
    name: string;
    description?: string;
    system_prompt?: string;
    enabled_tools?: string[];
    model_config?: Record<string, any>;
}

export interface UpdateAgentParams {
    name?: string;
    description?: string;
    system_prompt?: string;
    enabled_tools?: string[];
    model_config?: Record<string, any>;
}

export const AgentApi = {
    list: () => request.get<AgentProfile[]>('/api/v1/agents'),
    get: (id: string) => request.get<AgentProfile>(`/api/v1/agents/${id}`),
    create: (data: CreateAgentParams) => request.post<AgentProfile>('/api/v1/agents', data),
    update: (id: string, data: UpdateAgentParams) => request.put<AgentProfile>(`/api/v1/agents/${id}`, data),
    delete: (id: string) => request.delete(`/api/v1/agents/${id}`),
};
