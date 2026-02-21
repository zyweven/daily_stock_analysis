import { request } from './request';

export interface ToolConfigField {
    type: 'select' | 'text' | 'number' | 'boolean';
    label: string;
    description?: string;
    options?: Array<{ value: string; label: string }>;
    default?: any;
    min?: number;
    max?: number;
}

export interface ToolDefinition {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: any;
        config_schema?: Record<string, ToolConfigField>;
    };
}

export const ToolApi = {
    list: (includeConfig = false) =>
        request.get<{ tools: ToolDefinition[] }>('/api/v1/tools', {
            params: { include_config: includeConfig }
        }),
};
