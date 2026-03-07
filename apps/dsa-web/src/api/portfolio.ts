import apiClient from './index';
import { toCamelCase, toSnakeCase } from './utils';

// 持仓接口
export interface PortfolioPosition {
    id: number;
    userId: string;
    code: string;
    name: string;
    quantity: number;
    costPrice: number;
    groupName: string;
    remark: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    currentPrice?: number;
    marketValue?: number;
    profitLoss?: number;
    profitLossPct?: number;
    positionRatio?: number;
    costValue?: number;
}

export interface PositionWithProfit extends PortfolioPosition {
    currentPrice?: number;
    marketValue?: number;
    profitLoss?: number;
    profitLossPct?: number;
    positionRatio?: number;
    costValue?: number;
}

export interface CreatePositionRequest {
    code: string;
    name: string;
    quantity: number;
    costPrice: number;
    groupName?: string;
    remark?: string;
}

export interface UpdatePositionRequest {
    quantity?: number;
    costPrice?: number;
    name?: string;
    groupName?: string;
    remark?: string;
}

export interface PortfolioSummary {
    totalPositions: number;
    totalCostValue: number;
    totalQuantity: number;
    groups: string[];
    codes: string[];
}

// 持仓管理 API
export const portfolioApi = {
    /**
     * 获取持仓列表
     */
    list: async (group?: string): Promise<PortfolioPosition[]> => {
        const params = group ? { group } : {};
        const response = await apiClient.get<unknown[]>('/api/v1/portfolio/positions', { params });
        return response.data.map(item => toCamelCase<PortfolioPosition>(item));
    },

    /**
     * 获取持仓列表（含实时盈亏）
     */
    listWithProfit: async (group?: string): Promise<PositionWithProfit[]> => {
        const params = group ? { group } : {};
        const response = await apiClient.get<unknown[]>('/api/v1/portfolio/positions/detail', { params });
        return response.data.map(item => toCamelCase<PositionWithProfit>(item));
    },

    /**
     * 添加或更新持仓
     */
    addOrUpdate: async (request: CreatePositionRequest): Promise<PortfolioPosition> => {
        const response = await apiClient.post<unknown>('/api/v1/portfolio/positions', toSnakeCase(request));
        return toCamelCase<PortfolioPosition>(response.data);
    },

    /**
     * 获取单只股票持仓详情
     */
    getDetail: async (code: string, group: string = '默认分组'): Promise<PositionWithProfit> => {
        const response = await apiClient.get<unknown>(`/api/v1/portfolio/positions/${code}`, {
            params: { group }
        });
        return toCamelCase<PositionWithProfit>(response.data);
    },

    /**
     * 更新持仓
     */
    update: async (code: string, updates: UpdatePositionRequest, group: string = '默认分组'): Promise<PortfolioPosition> => {
        const response = await apiClient.patch<unknown>(`/api/v1/portfolio/positions/${code}`, toSnakeCase(updates), {
            params: { group }
        });
        return toCamelCase<PortfolioPosition>(response.data);
    },

    /**
     * 删除持仓
     */
    delete: async (code: string, group: string = '默认分组'): Promise<void> => {
        await apiClient.delete(`/api/v1/portfolio/positions/${code}`, {
            params: { group }
        });
    },

    /**
     * 平仓
     */
    close: async (code: string, group: string = '默认分组'): Promise<void> => {
        await apiClient.post(`/api/v1/portfolio/positions/${code}/close`, null, {
            params: { group }
        });
    },

    /**
     * 获取持仓汇总
     */
    getSummary: async (): Promise<PortfolioSummary> => {
        const response = await apiClient.get<unknown>('/api/v1/portfolio/summary');
        return toCamelCase<PortfolioSummary>(response.data);
    },

    /**
     * 获取所有分组
     */
    getGroups: async (): Promise<string[]> => {
        const response = await apiClient.get<{ groups: string[] }>('/api/v1/portfolio/groups');
        return response.data.groups;
    },

    /**
     * 获取持仓代码列表
     */
    getCodes: async (): Promise<string[]> => {
        const response = await apiClient.get<{ codes: string[] }>('/api/v1/portfolio/codes');
        return response.data.codes;
    },
};
