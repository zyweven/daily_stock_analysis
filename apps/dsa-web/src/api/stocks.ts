import apiClient from './index';
import { toCamelCase } from './utils';

// Interfaces
export interface StockInfo {
    code: string;
    name: string | null;
    industry: string | null;
    area: string | null;
    tags: string[];
    remark: string | null;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateStockRequest {
    code: string;
    name?: string;
    tags?: string[];
    remark?: string;
}

export interface UpdateStockRequest {
    name?: string;
    industry?: string;
    area?: string;
    tags?: string[];
    remark?: string;
    isActive?: boolean;
}

// API Implementation
export const stockApi = {
    /**
     * 获取自选股列表
     * @param activeOnly 是否只返回启用状态的股票
     */
    list: async (activeOnly: boolean = false): Promise<StockInfo[]> => {
        const response = await apiClient.get<unknown[]>(
            `/api/v1/stocks/list`,
            { params: { active_only: activeOnly } }
        );
        return response.data.map(item => toCamelCase<StockInfo>(item));
    },

    /**
     * 添加自选股
     */
    add: async (request: CreateStockRequest): Promise<StockInfo> => {
        const response = await apiClient.post<unknown>(
            `/api/v1/stocks/add`,
            request
        );
        return toCamelCase<StockInfo>(response.data);
    },

    /**
     * 更新自选股
     */
    update: async (code: string, request: UpdateStockRequest): Promise<StockInfo> => {
        // Map camelCase to snake_case for backend if needed, but backend uses Pydantic which might accept both if configured with alias
        // But usually best to send snake_case or rely on backend handling.
        // Let's manually map for safety as backend is Pydantic default (snake_case usually unless camelCase middleware used)
        // Actually, backend Pydantic models use snake_case fields but FastAPI docs might show camelCase if configured?
        // Checking `api/v1/endpoints/stocks.py`, models are standard Pydantic.
        // Let's send what the backend expects. My `CreateStockRequest` in backend expects `code`, `name`, `tags` (snake_case default for Python is same as camelCase for single words).
        // `is_active` is snake_case.

        const body: any = { ...request };
        if (request.isActive !== undefined) {
            body.is_active = request.isActive;
            delete body.isActive;
        }

        const response = await apiClient.put<unknown>(
            `/api/v1/stocks/${code}`,
            body
        );
        return toCamelCase<StockInfo>(response.data);
    },

    /**
     * 删除自选股
     */
    delete: async (code: string): Promise<void> => {
        await apiClient.delete(
            `/api/v1/stocks/${code}`
        );
    },

    /**
     * 同步环境配置
     */
    sync: async (): Promise<{ status: string; addedCount: number }> => {
        const response = await apiClient.post<unknown>(
            `/api/v1/stocks/sync`
        );
        return toCamelCase<{ status: string; addedCount: number }>(response.data);
    },

    /**
     * 搜索自选股
     */
    search: async (query: string): Promise<StockInfo[]> => {
        if (!query) return [];
        const response = await apiClient.get<unknown[]>(
            `/api/v1/stocks/search`,
            { params: { q: query } }
        );
        return response.data.map(item => toCamelCase<StockInfo>(item));
    },

    /**
     * 手动刷新股票信息
     */
    refreshInfo: async (code: string): Promise<{ status: string; name: string }> => {
        const response = await apiClient.post<unknown>(
            `/api/v1/stocks/${code}/refresh_info`
        );
        return toCamelCase<{ status: string; name: string }>(response.data);
    },

    /**
     * 获取股票历史行情数据
     */
    getHistory: async (code: string, days: number = 30): Promise<{
        stockCode: string;
        stockName?: string;
        period: string;
        data: Array<{
            date: string;
            open: number;
            high: number;
            low: number;
            close: number;
            volume?: number;
            amount?: number;
            changePercent?: number;
        }>;
    }> => {
        const response = await apiClient.get<{
            stock_code: string;
            stock_name?: string;
            period: string;
            data: Array<{
                date: string;
                open: number;
                high: number;
                low: number;
                close: number;
                volume?: number;
                amount?: number;
                change_percent?: number;
            }>;
        }>(
            `/api/v1/stocks/${encodeURIComponent(code)}/history`,
            { params: { period: 'daily', days } }
        );
        return {
            stockCode: response.data.stock_code,
            stockName: response.data.stock_name,
            period: response.data.period,
            data: response.data.data.map(item => ({
                date: item.date,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
                volume: item.volume,
                amount: item.amount,
                changePercent: item.change_percent,
            })),
        };
    },
};
