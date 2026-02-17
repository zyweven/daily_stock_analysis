import apiClient from './index';
import { toCamelCase } from './utils';
import { API_BASE_URL } from '../utils/constants';

// === 类型定义 ===

export interface ChatSession {
    id: string;
    title: string;
    stockCode: string | null;
    modelName: string | null;
    messageCount: number;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface ChatMessage {
    id: number;
    sessionId: string;
    role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
    content: string;
    toolName?: string;
    toolArgs?: string;
    modelName?: string;
    tokenCount?: number;
    responseTimeMs?: number;
    createdAt: string | null;
}

export interface ChatSessionDetail extends ChatSession {
    messages: ChatMessage[];
}

export interface ChatSendRequest {
    session_id?: string;  // snake_case for API
    message: string;
    stock_code?: string;
    model_name?: string;
}

// SSE 事件类型
export type ChatSSEEvent =
    | { event: 'session'; data: { session_id: string; is_new: boolean } }
    | { event: 'tool_call'; data: { name: string; args: Record<string, any>; round: number } }
    | { event: 'tool_result'; data: { name: string; result: string } }
    | { event: 'token'; data: { content: string } }
    | { event: 'done'; data: { session_id: string; message_id: number; tool_calls_count: number; response_time_ms: number } }
    | { event: 'error'; data: { message: string } };


// === 会话管理 API ===

export async function getChatSessions(limit = 50, offset = 0): Promise<{ sessions: ChatSession[]; total: number }> {
    const response = await apiClient.get('/api/v1/chat/sessions', { params: { limit, offset } });
    return toCamelCase(response.data);
}

export async function getChatSessionDetail(sessionId: string): Promise<ChatSessionDetail> {
    const response = await apiClient.get(`/api/v1/chat/sessions/${sessionId}`);
    return toCamelCase(response.data);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/api/v1/chat/sessions/${sessionId}`);
}

export async function updateChatSession(sessionId: string, data: { title?: string; stock_code?: string }): Promise<ChatSession> {
    const response = await apiClient.patch(`/api/v1/chat/sessions/${sessionId}`, data);
    return toCamelCase(response.data);
}


// === SSE 流式对话 ===

/**
 * 发送聊天消息并通过 SSE 接收流式回复
 * 
 * @param request 对话请求参数
 * @param onEvent SSE 事件回调
 * @returns AbortController 用于取消请求
 */
export function sendChatMessage(
    request: ChatSendRequest,
    onEvent: (event: ChatSSEEvent) => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/chat/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                onEvent({ event: 'error', data: { message: `HTTP ${response.status}: ${errorText}` } });
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                onEvent({ event: 'error', data: { message: '无法获取响应流' } });
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';  // 保留未完成的行

                let currentEvent = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ') && currentEvent) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            onEvent({ event: currentEvent, data } as ChatSSEEvent);
                        } catch (e) {
                            console.warn('SSE JSON 解析失败:', line);
                        }
                        currentEvent = '';
                    }
                }
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                onEvent({ event: 'error', data: { message: err.message || '请求失败' } });
            }
        }
    })();

    return controller;
}


// === 工具名称中文映射 ===

export const TOOL_NAME_MAP: Record<string, string> = {
    get_realtime_quote: '获取实时行情',
    get_technical_summary: '分析技术面',
    get_latest_report: '查看分析报告',
    search_news: '搜索新闻',
    get_chip_distribution: '获取筹码分布',
};
