import { request } from './request';

export interface ToolDefinition {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: any;
    };
}

export const ToolApi = {
    list: () => request.get<{ tools: ToolDefinition[] }>('/api/v1/tools'),
};
