import apiClient from './index';
import { toCamelCase } from './utils';

// ============ 类型定义 ============

export interface EndpointInfo {
    id: string;
    label: string | null;
    sourceName: string | null;
    priority: number;
    enabled: boolean;
}

export interface ModelInfo {
    name: string;
    provider: string;
    modelName: string | null;
    endpointCount?: number;
    enabledEndpointCount?: number;
    endpoints?: EndpointInfo[];
}

export interface ModelListResponse {
    models: ModelInfo[];
    maxModels: number;
}

export interface ExpertPanelRequest {
    stockCode: string;
    models?: string[];
}

export interface ModelResultItem {
    modelName: string;
    success: boolean;
    score: number | null;
    advice: string | null;
    trend: string | null;
    summary: string | null;
    confidence: string | null;
    elapsedSeconds: number;
    error: string | null;
    rawResult?: any;
    endpointTried?: string[];
    endpointUsed?: string | null;
    fallbackCount?: number;
}

export interface ExpertPanelResponse {
    stockCode: string;
    stockName: string;
    modelsUsed: string[];
    consensusScore: number | null;
    consensusAdvice: string | null;
    consensusSummary: string | null;
    consensusStrategy?: any; // Aggregated strategy
    modelResults: ModelResultItem[];
    createdAt: string;
}

// ============ API 接口 ============

export const expertPanelApi = {
    /**
     * 获取已配置的可用模型列表
     * @param expandEndpoints 是否展开返回 endpoint 详情
     */
    getModels: async (expandEndpoints: boolean = false): Promise<ModelListResponse> => {
        const response = await apiClient.get<Record<string, unknown>>(
            '/api/v1/expert-panel/models',
            { params: { expand_endpoints: expandEndpoints } }
        );
        return toCamelCase<ModelListResponse>(response.data);
    },

    /**
     * 触发专家会诊分析
     * @param data 分析请求
     */
    analyze: async (data: ExpertPanelRequest): Promise<ExpertPanelResponse> => {
        const requestData = {
            stock_code: data.stockCode,
            models: data.models,
        };

        const response = await apiClient.post<Record<string, unknown>>(
            '/api/v1/expert-panel/analyze',
            requestData
        );

        return toCamelCase<ExpertPanelResponse>(response.data);
    },
};
