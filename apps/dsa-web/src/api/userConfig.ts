import apiClient from './index';
import { toCamelCase } from './utils';

// 用户配置接口
export interface UserConfig {
    totalPrincipal?: number;
}

// 用户配置 API
export const userConfigApi = {
    /**
     * 获取用户配置
     */
    get: async (): Promise<UserConfig> => {
        const response = await apiClient.get<unknown>('/api/v1/user-config');
        return toCamelCase<UserConfig>(response.data);
    },

    /**
     * 更新用户配置
     */
    update: async (config: UserConfig): Promise<UserConfig> => {
        const response = await apiClient.put<unknown>('/api/v1/user-config', {
            total_principal: config.totalPrincipal
        });
        return toCamelCase<UserConfig>(response.data);
    },

    /**
     * 获取总本金
     */
    getPrincipal: async (): Promise<{ totalPrincipal: number | null; message?: string }> => {
        const response = await apiClient.get<{ total_principal: number | null; message?: string }>('/api/v1/user-config/principal');
        return {
            totalPrincipal: response.data.total_principal,
            message: response.data.message
        };
    },

    /**
     * 设置总本金
     */
    setPrincipal: async (amount: number): Promise<{ totalPrincipal: number; message: string }> => {
        const response = await apiClient.put<{ total_principal: number; message: string }>(
            `/api/v1/user-config/principal?amount=${amount}`
        );
        return {
            totalPrincipal: response.data.total_principal,
            message: response.data.message
        };
    },
};
