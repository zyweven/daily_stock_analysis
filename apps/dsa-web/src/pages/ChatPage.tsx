// ... imports
import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import type {
    ChatSession,
    ChatSSEEvent,
} from '../api/chat';
import { toast } from 'react-hot-toast';
import { AgentApi } from '../api/agents';
import type { AgentProfile } from '../api/agents';
import { ToolApi } from '../api/tools';
import type { ToolDefinition } from '../api/tools';
import {
    getChatSessions,
    getChatSessionDetail,
    deleteChatSession,
    sendChatMessage,
    updateChatMessage,
    regenerateAfterMessage,
    TOOL_NAME_MAP,
} from '../api/chat';
import { expertPanelApi } from '../api/expertPanel';
import type { ModelInfo } from '../api/expertPanel';

// 快捷问题
const QUICK_ACTIONS = [
    { icon: '📊', label: '技术分析', prompt: '请分析当前的技术面走势，包括均线、MACD 信号和支撑阻力位' },
    { icon: '📰', label: '最新消息', prompt: '搜索最近的重要新闻和公告' },
    { icon: '🎯', label: '操作建议', prompt: '根据当前行情，给出操作建议和风险提示' },
    { icon: '📈', label: '实时行情', prompt: '查看当前的实时行情数据' },
    { icon: '🔄', label: '对比上次', prompt: '对比上次分析报告，分析趋势变化' },
];

// 消息中的工具调用状态
interface ToolCallStatus {
    name: string;
    args: Record<string, any>;
    status: 'calling' | 'done';
    result?: string;
}

interface DisplayMessage {
    id?: number;
    role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
    content: string;
    toolCalls?: ToolCallStatus[];
    isStreaming?: boolean;
    modelName?: string;
    responseTimeMs?: number;
}

export default function ChatPage() {
    // 会话状态
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [stockCode, setStockCode] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [isToolboxOpen, setIsToolboxOpen] = useState(false); // 工具箱状态

    // Agent & Tools State
    const [agents, setAgents] = useState<AgentProfile[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
    const [enabledTools, setEnabledTools] = useState<string[]>([]);

    // 模型选择
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);

    // 复制状态
    const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
    // 确认删除状态
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

    // 编辑消息状态
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);

    const navigate = useNavigate();

    // 加载 Agents、Tools 和模型列表
    useEffect(() => {
        const loadMeta = async () => {
            try {
                const [agentsData, toolsData] = await Promise.all([
                    AgentApi.list(),
                    ToolApi.list()
                ]);
                setAgents(agentsData);
                setAvailableTools(toolsData.tools);

                // 默认选中第一个 Agent (通常是默认 Agent)
                const defaultAgent = agentsData.find((a: AgentProfile) => a.is_default) || agentsData[0];
                if (defaultAgent) {
                    setSelectedAgentId(defaultAgent.id);
                    setEnabledTools(defaultAgent.enabled_tools || []);
                }
            } catch (e) {
                console.error("Failed to load agents/tools", e);
            }

            // 加载可用模型列表
            try {
                const modelsData = await expertPanelApi.getModels();
                setAvailableModels(modelsData.models || []);
            } catch (e) {
                console.debug("Failed to load models", e);
            }
        };
        loadMeta();
    }, []);

    // refs
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 自动滚动到底部
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // 加载会话列表
    const loadSessions = useCallback(async () => {
        try {
            const data = await getChatSessions();
            setSessions(data.sessions);
        } catch (err) {
            console.error('加载会话列表失败:', err);
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    // 加载会话详情
    const loadSession = useCallback(async (sessionId: string) => {
        try {
            const detail = await getChatSessionDetail(sessionId);
            setCurrentSessionId(sessionId);
            setStockCode(detail.stockCode || '');

            if (detail.messages) {
                // 将 tool_call/tool_result 合并到对应 assistant 消息的 toolCalls 中
                const result: DisplayMessage[] = [];
                for (const msg of detail.messages) {
                    if (msg.role === 'user') {
                        result.push({
                            id: msg.id,
                            role: 'user',
                            content: msg.content,
                        });
                    } else if (msg.role === 'assistant') {
                        result.push({
                            id: msg.id,
                            role: 'assistant',
                            content: msg.content,
                            toolCalls: [],
                            modelName: msg.modelName,
                            responseTimeMs: msg.responseTimeMs,
                        });
                    } else if (msg.role === 'tool_call') {
                        // 找到最近的 assistant 消息，追加 toolCall
                        const lastAssistant = [...result].reverse().find(m => m.role === 'assistant');
                        if (lastAssistant) {
                            lastAssistant.toolCalls = [
                                ...(lastAssistant.toolCalls || []),
                                {
                                    name: msg.toolName || msg.content,
                                    args: (() => { try { return JSON.parse(msg.toolArgs || '{}'); } catch { return {}; } })(),
                                    status: 'done' as const,
                                }
                            ];
                        }
                    } else if (msg.role === 'tool_result') {
                        // 找到最近的 assistant 消息，更新最后一个 toolCall 的 result
                        const lastAssistant = [...result].reverse().find(m => m.role === 'assistant');
                        if (lastAssistant && lastAssistant.toolCalls && lastAssistant.toolCalls.length > 0) {
                            // 找到同名且没有 result 的 toolCall
                            const tc = [...lastAssistant.toolCalls].reverse().find(
                                t => t.name === (msg.toolName || '') && !t.result
                            );
                            if (tc) {
                                tc.result = msg.content;
                            } else {
                                // 回退：更新最后一个
                                lastAssistant.toolCalls[lastAssistant.toolCalls.length - 1].result = msg.content;
                            }
                        }
                    }
                }
                setMessages(result);
            }

            // 加载会话的工具配置
            if (detail.currentAgentConfig) {
                try {
                    const config = typeof detail.currentAgentConfig === 'string'
                        ? JSON.parse(detail.currentAgentConfig)
                        : detail.currentAgentConfig;
                    if (config.enabled_tools) {
                        setEnabledTools(config.enabled_tools);
                    }
                    // Update selected agent if session has one
                    if (detail.agentId) {
                        setSelectedAgentId(detail.agentId);
                    }
                } catch (e) {
                    console.error("Error parsing session config", e);
                }
            } else if (detail.agentId) {
                // Fallback to agent config
                const agent = agents.find(a => a.id === detail.agentId);
                if (agent) {
                    setEnabledTools(agent.enabled_tools || []);
                    setSelectedAgentId(agent.id);
                }
            }
        } catch (error) {
            console.error('获取会话详情失败:', error);
        }
    }, [agents]);

    // 新建对话
    const handleNewChat = () => {
        setCurrentSessionId(null);
        setMessages([]);
        // Reset tools to selected agent's default
        const currentAgent = agents.find(a => a.id === selectedAgentId);
        if (currentAgent) {
            setEnabledTools(currentAgent.enabled_tools || []);
        }
        setInputText('');
        inputRef.current?.focus();
    };

    // 删除会话
    const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // 如果已经在确认状态，执行删除
        if (deletingSessionId === sessionId) {
            // 乐观更新：立即从列表中移除
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (currentSessionId === sessionId) {
                handleNewChat();
            }
            setDeletingSessionId(null);

            try {
                await deleteChatSession(sessionId);
                toast.success('对话已删除');
            } catch (err) {
                console.error('删除会话失败:', err);
                toast.error('删除会话失败');
                // 回滚：重新加载列表
                loadSessions();
            }
        } else {
            // 进入确认状态
            setDeletingSessionId(sessionId);
            // 3秒后自动取消确认状态
            setTimeout(() => {
                setDeletingSessionId(current => current === sessionId ? null : current);
            }, 3000);
        }
    }, [currentSessionId, deletingSessionId, handleNewChat, loadSessions]);

    // 发送消息
    const handleSend = useCallback(async (text?: string) => {
        const messageText = text || inputText.trim();
        if (!messageText || isStreaming) return;

        setInputText('');
        setIsStreaming(true);

        // 添加用户消息
        const userMsg: DisplayMessage = { role: 'user', content: messageText };
        setMessages(prev => [...prev, userMsg]);

        // 添加 AI 流式占位
        const aiMsg: DisplayMessage = {
            role: 'assistant',
            content: '',
            toolCalls: [],
            isStreaming: true,
        };
        setMessages(prev => [...prev, aiMsg]);

        let sessionIdToUse = currentSessionId;
        let currentToolCalls: ToolCallStatus[] = [];

        const controller = sendChatMessage(
            {
                session_id: currentSessionId || undefined,
                message: messageText,
                stock_code: stockCode || undefined,
                model_name: selectedModel || undefined,
                agent_id: selectedAgentId || undefined,
            },
            (event: ChatSSEEvent) => {
                switch (event.event) {
                    case 'session':
                        sessionIdToUse = event.data.session_id;
                        setCurrentSessionId(sessionIdToUse);
                        break;

                    case 'tool_call':
                        currentToolCalls = [...currentToolCalls, {
                            name: event.data.name,
                            args: event.data.args,
                            status: 'calling',
                        }];
                        setMessages(prev => {
                            const updated = [...prev];
                            const last = updated[updated.length - 1];
                            if (last?.role === 'assistant') {
                                updated[updated.length - 1] = { ...last, toolCalls: [...currentToolCalls] };
                            }
                            return updated;
                        });
                        break;

                    case 'tool_result':
                        currentToolCalls = currentToolCalls.map(tc =>
                            tc.name === event.data.name && tc.status === 'calling'
                                ? { ...tc, status: 'done' as const, result: event.data.result }
                                : tc
                        );
                        setMessages(prev => {
                            const updated = [...prev];
                            const last = updated[updated.length - 1];
                            if (last?.role === 'assistant') {
                                updated[updated.length - 1] = { ...last, toolCalls: [...currentToolCalls] };
                            }
                            return updated;
                        });
                        break;

                    case 'token':
                        setMessages(prev => {
                            const updated = [...prev];
                            const last = updated[updated.length - 1];
                            if (last?.role === 'assistant') {
                                updated[updated.length - 1] = {
                                    ...last,
                                    content: last.content + event.data.content,
                                };
                            }
                            return updated;
                        });
                        break;

                    case 'done':
                        setMessages(prev => {
                            const updated = [...prev];
                            const last = updated[updated.length - 1];
                            if (last?.role === 'assistant') {
                                updated[updated.length - 1] = {
                                    ...last,
                                    isStreaming: false,
                                    responseTimeMs: event.data.response_time_ms,
                                };
                            }
                            return updated;
                        });
                        setIsStreaming(false);
                        loadSessions();
                        break;

                    case 'error':
                        toast.error(event.data.message || '发送失败');
                        setMessages(prev => {
                            const updated = [...prev];
                            const last = updated[updated.length - 1];
                            if (last?.role === 'assistant') {
                                updated[updated.length - 1] = {
                                    ...last,
                                    content: `❌ ${event.data.message}`,
                                    isStreaming: false,
                                };
                            }
                            return updated;
                        });
                        setIsStreaming(false);
                        break;
                }
            }
        );

        abortRef.current = controller;
    }, [inputText, isStreaming, currentSessionId, stockCode, selectedModel, loadSessions]);

    // 停止生成
    const handleStop = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
        setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.isStreaming) {
                updated[updated.length - 1] = { ...last, isStreaming: false, content: last.content + '\n\n⏹️ 已停止生成' };
            }
            return updated;
        });
    }, []);

    // 重试最后一条 AI 回复
    const handleRetry = useCallback(() => {
        if (isStreaming || messages.length < 2) return;
        // 找到最后一条用户消息
        let lastUserIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        if (lastUserIdx < 0) return;
        const userText = messages[lastUserIdx].content;
        // 移除该用户消息及其后的所有回复
        setMessages(prev => prev.slice(0, lastUserIdx));
        // 重新发送
        handleSend(userText);
    }, [isStreaming, messages, handleSend]);

    // 键盘事件
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] gap-0 bg-gradient-to-br from-gray-900 via-[#111827] to-gray-900 text-gray-100 overflow-hidden relative">
            <div className="absolute inset-0 pointer-events-none bg-[url('/grid.svg')] opacity-[0.03]" />

            {/* 左侧: 会话列表 */}
            <div className="w-72 flex-shrink-0 border-r border-gray-800/50 bg-gray-900/40 backdrop-blur-xl flex flex-col z-20">
                {/* 新建对话按钮 */}
                <div className="p-4 border-b border-gray-800/50">
                    <button
                        onClick={handleNewChat}
                        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all transform hover:-translate-y-0.5 font-medium flex items-center justify-center gap-2 group"
                    >
                        <span className="group-hover:rotate-90 transition-transform duration-300">✨</span>
                        新对话
                    </button>
                </div>

                {/* 会话列表 */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {sessions.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm py-12 flex flex-col items-center gap-3">
                            <span className="text-4xl opacity-20">📭</span>
                            <span>暂无对话记录</span>
                        </div>
                    ) : (
                        sessions.map(s => (
                            <div
                                key={s.id}
                                onClick={() => loadSession(s.id)}
                                className={`group flex items-center px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 border relative overflow-hidden ${currentSessionId === s.id
                                    ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_4px_20px_-5px_rgba(37,99,235,0.2)]'
                                    : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10'
                                    }`}
                            >
                                <div className="flex-1 min-w-0 z-10">
                                    <div className={`truncate font-medium transition-colors ${currentSessionId === s.id ? 'text-blue-100' : 'text-gray-300 group-hover:text-white'}`}>
                                        {s.title}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs mt-1">
                                        {s.stockCode && (
                                            <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">
                                                {s.stockCode}
                                            </span>
                                        )}
                                        <span className="text-gray-500">{s.messageCount} 条消息</span>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteSession(s.id, e)}
                                    className={`ml-2 p-2 rounded-lg transition-all z-30 flex items-center justify-center shrink-0 ${deletingSessionId === s.id
                                        ? 'opacity-100 bg-red-500 text-white scale-110 shadow-lg shadow-red-500/40'
                                        : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 hover:bg-red-500/10'
                                        }`}
                                    title={deletingSessionId === s.id ? "再次点击确认删除" : "删除"}
                                >
                                    {deletingSessionId === s.id ? (
                                        <span className="text-[10px] font-bold px-1 animate-pulse">确认?</span>
                                    ) : (
                                        <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    )}
                                </button>
                                {currentSessionId === s.id && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-transparent pointer-events-none" />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 右侧: 对话区 */}
            <div className="flex-1 flex flex-col min-w-0 bg-white/[0.01] relative z-10">
                {/* 顶部栏 */}
                <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-gray-900/60 backdrop-blur-md sticky top-0 z-50 shadow-sm">
                    {/* 助手选择 */}
                    <div className="flex items-center gap-3 bg-gray-800/50 p-1 pr-3 rounded-xl border border-white/5">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                            🤖
                        </div>
                        <div className="flex flex-col">
                            <select
                                value={selectedAgentId || ''}
                                onChange={(e) => {
                                    const newId = e.target.value;
                                    setSelectedAgentId(newId);
                                    const agent = agents.find(a => a.id === newId);
                                    if (agent) {
                                        setEnabledTools(agent.enabled_tools || []);
                                    }
                                }}
                                className="bg-transparent font-bold text-gray-100 text-sm focus:outline-none cursor-pointer hover:text-blue-400 transition-colors py-0.5"
                            >
                                {agents.map(a => (
                                    <option key={a.id} value={a.id} className="bg-gray-800 text-white">
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 bg-black/20 px-1.5 rounded">
                                    {agents.find(a => a.id === selectedAgentId)?.is_default ? '默认助手' : '自定义助手'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/agents')}
                        className="p-2 text-gray-400 hover:text-blue-400 transition-all hover:bg-blue-500/10 rounded-lg"
                        title="管理 Agent"
                    >
                        <span className="text-lg">⚙️</span>
                    </button>

                    {/* 模型选择 */}
                    {availableModels.length > 0 && (
                        <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-xl border border-white/5">
                            <span className="text-sm">🧠</span>
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="bg-transparent text-gray-300 text-sm focus:outline-none cursor-pointer hover:text-blue-400 transition-colors"
                                title="选择模型"
                            >
                                <option value="" className="bg-gray-800 text-white">默认模型</option>
                                {availableModels.map(m => (
                                    <option key={m.name} value={m.name} className="bg-gray-800 text-white">
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex-1" />

                    {/* Toolbox Toggle */}
                    <button
                        onClick={() => setIsToolboxOpen(!isToolboxOpen)}
                        className={`group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isToolboxOpen
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                            : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/80 border border-white/5 hover:border-white/10'
                            }`}
                        title="打开运行时工具箱"
                    >
                        <span className="text-lg">🧰</span>
                        <span>工具箱</span>
                        {enabledTools.length > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${isToolboxOpen
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : 'bg-gray-700 text-gray-400 border-gray-600'
                                }`}>
                                {enabledTools.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* 消息区 */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 custom-scrollbar scroll-smooth">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 animate-fade-in">
                            <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl flex items-center justify-center mb-8 shadow-2xl border border-white/5">
                                <span className="text-5xl drop-shadow-lg">👋</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-200 mb-2">欢迎使用智能分析助手</h3>
                            <p className="text-sm text-gray-500 mb-10 text-center max-w-md leading-relaxed">
                                我可以协助您进行股票行情查询、技术指标分析和市场资讯解读。<br />
                                尝试点击下方的快捷指令开始对话。
                            </p>

                            {/* 快捷问题 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                                {QUICK_ACTIONS.map((qa, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            const prompt = stockCode
                                                ? `${qa.prompt}（股票: ${stockCode}）`
                                                : qa.prompt;
                                            handleSend(prompt);
                                        }}
                                        className="px-5 py-4 bg-gray-800/40 hover:bg-gray-800/80 border border-white/5 hover:border-blue-500/30 rounded-2xl text-left transition-all hover:-translate-y-1 hover:shadow-lg group"
                                    >
                                        <div className="text-xl mb-1 group-hover:scale-110 transition-transform origin-left">{qa.icon}</div>
                                        <div className="text-sm font-semibold text-gray-300 group-hover:text-blue-300">{qa.label}</div>
                                        <div className="text-xs text-gray-600 group-hover:text-gray-500 mt-1 truncate">{qa.prompt}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                            <div className={`max-w-[85%] lg:max-w-[75%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                                {/* 消息气泡 */}
                                <div className={`px-5 py-4 shadow-lg ${msg.role === 'user'
                                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm'
                                    : 'bg-[#1c2128] text-gray-100 border border-gray-700/50 rounded-2xl rounded-tl-sm'
                                    }`}>
                                    {/* 工具调用展示 */}
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <div className="mb-4 space-y-2">
                                            {msg.toolCalls.map((tc, i) => (
                                                <div key={i} className="rounded-xl bg-black/20 border border-white/5 overflow-hidden">
                                                    {/* 工具调用头部（可点击展开） */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            const detailEl = (e.currentTarget.nextElementSibling as HTMLElement);
                                                            if (detailEl) {
                                                                detailEl.style.display = detailEl.style.display === 'none' ? 'block' : 'none';
                                                            }
                                                        }}
                                                        className="w-full flex items-center gap-3 text-xs px-4 py-2.5 hover:bg-white/5 transition-colors cursor-pointer text-left"
                                                    >
                                                        {tc.status === 'calling' ? (
                                                            <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                                                        ) : (
                                                            <div className="w-4 h-4 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center flex-shrink-0">✓</div>
                                                        )}
                                                        <div className="flex flex-col">
                                                            <span className="text-blue-300 font-mono font-medium">
                                                                {TOOL_NAME_MAP[tc.name] || tc.name}
                                                            </span>
                                                        </div>
                                                        {tc.args?.stock_code && (
                                                            <span className="text-gray-500 bg-gray-800 px-1.5 rounded">{tc.args.stock_code}</span>
                                                        )}
                                                        <span className="ml-auto text-gray-500 hover:text-gray-300">
                                                            ⬇
                                                        </span>
                                                    </button>
                                                    {/* 可折叠的详情区域 */}
                                                    <div style={{ display: 'none' }} className="border-t border-white/5 bg-black/40">
                                                        {/* 根据调用状态和结果显示 */}
                                                        <div className="p-3 space-y-2">
                                                            <div>
                                                                <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-1">Input</div>
                                                                <pre className="text-[11px] text-gray-400 font-mono bg-black/30 rounded p-2 overflow-x-auto">
                                                                    {JSON.stringify(tc.args, null, 2)}
                                                                </pre>
                                                            </div>
                                                            {tc.result && (
                                                                <div>
                                                                    <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-1">Output</div>
                                                                    <pre className="text-[11px] text-green-400/80 font-mono bg-black/30 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto custom-scrollbar">
                                                                        {(() => {
                                                                            try {
                                                                                return JSON.stringify(JSON.parse(tc.result), null, 2);
                                                                            } catch {
                                                                                return tc.result;
                                                                            }
                                                                        })()}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 消息内容：Markdown 渲染 或 编辑框 */}
                                    {editingMessageId === msg.id ? (
                                        <div className="space-y-2">
                                            <textarea
                                                ref={editTextareaRef}
                                                value={editingContent}
                                                onChange={(e) => setEditingContent(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-900/50 border border-blue-500/30 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 resize-none min-h-[80px]"
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={async () => {
                                                        if (!msg.id || !currentSessionId) return;
                                                        try {
                                                            // 更新消息
                                                            await updateChatMessage(msg.id, editingContent);

                                                            // 删除该消息之后的所有消息
                                                            await regenerateAfterMessage(msg.id, currentSessionId, selectedModel);

                                                            // 刷新会话
                                                            await loadSession(currentSessionId);

                                                            setEditingMessageId(null);
                                                            toast.success('消息已更新');
                                                        } catch (error) {
                                                            console.error('更新消息失败:', error);
                                                            toast.error('更新失败');
                                                        }
                                                    }}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                                                >
                                                    保存并重新生成
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingMessageId(null);
                                                        setEditingContent('');
                                                    }}
                                                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                                                >
                                                    取消
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm md:text-base leading-relaxed">
                                            {msg.role === 'assistant' ? (
                                                <div className="markdown-body dark-mode">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                    {msg.isStreaming && <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />}
                                                </div>
                                            ) : (
                                                <div className="whitespace-pre-wrap break-words font-sans">
                                                    {msg.content}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 元信息 + 操作按钮 */}
                                {!msg.isStreaming && (
                                    <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-2 px-2 opacity-60 hover:opacity-100 transition-opacity">
                                        {/* 模型名称 - 仅AI消息显示 */}
                                        {msg.role === 'assistant' && msg.modelName && (
                                            <span className="flex items-center gap-1 text-blue-400/80">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                                </svg>
                                                {msg.modelName}
                                            </span>
                                        )}
                                        {msg.role === 'assistant' && msg.responseTimeMs && (
                                            <>
                                                <span>•</span>
                                                <span className="flex items-center gap-1">⚡ {(msg.responseTimeMs / 1000).toFixed(1)}s</span>
                                            </>
                                        )}
                                        {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="flex items-center gap-1">🛠 {msg.toolCalls.length} tools</span>
                                            </>
                                        )}
                                        {/* 编辑按钮 - 用户和AI消息都显示 */}
                                        <button
                                            onClick={() => {
                                                setEditingMessageId(msg.id || null);
                                                setEditingContent(msg.content);
                                            }}
                                            className="flex items-center gap-1 hover:text-yellow-400 transition-colors"
                                            title="编辑消息"
                                        >
                                            ✏️ 编辑
                                        </button>
                                        {/* 一键复制 - 仅AI消息 */}
                                        {msg.role === 'assistant' && (
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(msg.content).then(() => {
                                                        setCopiedMsgIdx(idx);
                                                        setTimeout(() => setCopiedMsgIdx(null), 2000);
                                                    });
                                                }}
                                                className="flex items-center gap-1 hover:text-green-400 transition-colors"
                                                title="复制内容"
                                            >
                                                {copiedMsgIdx === idx ? '✅ 已复制' : '📋 复制'}
                                            </button>
                                        )}
                                        {/* 重试按钮：仅最后一条 AI 回复显示 */}
                                        {msg.role === 'assistant' && idx === messages.length - 1 && !isStreaming && (
                                            <button
                                                onClick={handleRetry}
                                                className="flex items-center gap-1 hover:text-blue-400 transition-colors"
                                                title="重新生成"
                                            >
                                                🔄 重新生成
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} />
                </div>

                {/* 快捷问题（有消息时缩小） */}
                {messages.length > 0 && !isStreaming && (
                    <div className="px-6 pb-2 pt-2 flex flex-wrap gap-2 overflow-x-auto no-scrollbar mask-gradient-right">
                        {QUICK_ACTIONS.map((qa, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    const prompt = stockCode
                                        ? `${qa.prompt}（股票: ${stockCode}）`
                                        : qa.prompt;
                                    handleSend(prompt);
                                }}
                                className="px-3 py-1.5 bg-gray-800/40 hover:bg-gray-700/60 border border-gray-700/50 rounded-lg text-xs text-gray-400 hover:text-blue-300 transition-colors whitespace-nowrap flex items-center gap-1.5"
                            >
                                <span>{qa.icon}</span> {qa.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* 输入区 */}
                <div className="px-6 py-5 border-t border-white/5 bg-gray-900/60 backdrop-blur-md">
                    <div className="relative flex items-end gap-3 max-w-4xl mx-auto">
                        <div className="flex-1 relative group">
                            <textarea
                                ref={inputRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="输入您的问题... (Enter发送)"
                                rows={1}
                                className="w-full px-5 py-3.5 bg-gray-800/50 border border-gray-700/50 rounded-2xl text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:bg-gray-800/80 focus:ring-4 focus:ring-blue-500/10 resize-none min-h-[52px] max-h-[200px] shadow-inner transition-all"
                                style={{
                                    height: 'auto',
                                    minHeight: '52px',
                                }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                                }}
                            />
                            {/* Focus Glow Effect */}
                            <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10 pointer-events-none group-focus-within:ring-blue-500/30 transition-all" />
                        </div>

                        <div className="flex-shrink-0 pb-1">
                            {isStreaming ? (
                                <button
                                    onClick={handleStop}
                                    className="w-11 h-11 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 ring-1 ring-red-500/20"
                                    title="停止生成"
                                >
                                    <div className="w-3 h-3 bg-current rounded-sm" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleSend()}
                                    disabled={!inputText.trim()}
                                    className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-500 text-white rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center transition-all transform hover:-translate-y-0.5 active:scale-95 disabled:hover:translate-y-0 disabled:shadow-none"
                                >
                                    <svg className="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-gray-600">AI output may be inaccurate. Please verify important information.</span>
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Toolbox */}
            {isToolboxOpen && (
                <div className="w-80 bg-gray-900/95 backdrop-blur-xl border-l border-gray-700/50 flex flex-col transition-all flex-shrink-0 z-20 shadow-[-5px_0_30px_rgba(0,0,0,0.5)]">
                    <div className="p-4 border-b border-gray-700/50 flex justify-between items-center bg-gray-900/50 h-[65px]">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🧰</span>
                            <h3 className="font-bold text-gray-200">运行时工具箱</h3>
                        </div>
                        <button
                            onClick={() => navigate('/agents')}
                            className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 hover:bg-blue-500/10 rounded-lg border border-transparent hover:border-blue-500/20 transition-all font-medium"
                        >
                            配置 Agent
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        <div className="text-xs text-gray-500 mb-2 px-1 font-medium tracking-wide uppercase">
                            Available Tools
                        </div>
                        {availableTools.map(tool => (
                            <div
                                key={tool.function.name}
                                onClick={() => {
                                    const newTools = enabledTools.includes(tool.function.name)
                                        ? enabledTools.filter(t => t !== tool.function.name)
                                        : [...enabledTools, tool.function.name];
                                    setEnabledTools(newTools);
                                }}
                                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-all duration-200 group ${enabledTools.includes(tool.function.name)
                                    ? 'bg-blue-600/10 border-blue-500/40 shadow-sm'
                                    : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
                                    }`}
                            >
                                <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${enabledTools.includes(tool.function.name)
                                    ? 'bg-blue-500 border-blue-500 text-white'
                                    : 'border-gray-600 bg-gray-800 text-transparent group-hover:border-gray-500'
                                    }`}>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium transition-colors ${enabledTools.includes(tool.function.name) ? 'text-blue-100' : 'text-gray-300'}`}>
                                        {tool.function.name}
                                    </div>
                                    <div className="text-xs text-gray-500 line-clamp-2 mt-1 leading-relaxed group-hover:text-gray-400">
                                        {tool.function.description}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div >
    );
}
