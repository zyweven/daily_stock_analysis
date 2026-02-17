import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
    ChatSession,
    ChatSSEEvent,
} from '../api/chat';
import {
    getChatSessions,
    getChatSessionDetail,
    deleteChatSession,
    sendChatMessage,
    TOOL_NAME_MAP,
} from '../api/chat';
import type { ModelInfo } from '../api/expertPanel';
import { expertPanelApi } from '../api/expertPanel';

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
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<DisplayMessage[]>([]);

    // 输入状态
    const [inputText, setInputText] = useState('');
    const [stockCode, setStockCode] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);

    // 模型选择
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');

    // refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
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

    // 加载可用模型列表
    useEffect(() => {
        (async () => {
            try {
                const data = await expertPanelApi.getModels();
                setModels(data.models);
                if (data.models.length > 0 && !selectedModel) {
                    setSelectedModel(data.models[0].name);
                }
            } catch (err) {
                console.error('加载模型列表失败:', err);
            }
        })();
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    // 加载会话详情
    const loadSession = useCallback(async (sessionId: string) => {
        try {
            const detail = await getChatSessionDetail(sessionId);
            setActiveSessionId(sessionId);
            setStockCode(detail.stockCode || '');

            // 将 ChatMessage 转为 DisplayMessage，合并 tool_call 和 tool_result
            const displayMsgs: DisplayMessage[] = [];
            for (const msg of detail.messages) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    displayMsgs.push({
                        id: msg.id,
                        role: msg.role,
                        content: msg.content,
                        modelName: msg.modelName || undefined,
                        responseTimeMs: msg.responseTimeMs || undefined,
                    });
                }
                // tool_call/tool_result 不单独显示
            }
            setMessages(displayMsgs);
        } catch (err) {
            console.error('加载会话详情失败:', err);
        }
    }, []);

    // 新建对话
    const handleNewChat = useCallback(() => {
        setActiveSessionId(null);
        setMessages([]);
        setInputText('');
        inputRef.current?.focus();
    }, []);

    // 删除会话
    const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('确定删除这个对话吗？')) return;
        try {
            await deleteChatSession(sessionId);
            if (activeSessionId === sessionId) {
                handleNewChat();
            }
            loadSessions();
        } catch (err) {
            console.error('删除会话失败:', err);
        }
    }, [activeSessionId, handleNewChat, loadSessions]);

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

        let currentSessionId = activeSessionId;
        let currentToolCalls: ToolCallStatus[] = [];

        const controller = sendChatMessage(
            {
                session_id: currentSessionId || undefined,
                message: messageText,
                stock_code: stockCode || undefined,
                model_name: selectedModel || undefined,
            },
            (event: ChatSSEEvent) => {
                switch (event.event) {
                    case 'session':
                        currentSessionId = event.data.session_id;
                        setActiveSessionId(currentSessionId);
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
    }, [inputText, isStreaming, activeSessionId, stockCode, selectedModel, loadSessions]);

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
        <div className="flex h-[calc(100vh-4rem)] gap-0">
            {/* 左侧: 会话列表 */}
            <div className="w-64 flex-shrink-0 bg-gray-900/50 border-r border-gray-700/50 flex flex-col">
                {/* 新建对话按钮 */}
                <div className="p-3 border-b border-gray-700/50">
                    <button
                        onClick={handleNewChat}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <span>✨</span> 新对话
                    </button>
                </div>

                {/* 会话列表 */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm py-8">
                            暂无对话记录
                        </div>
                    ) : (
                        sessions.map(s => (
                            <div
                                key={s.id}
                                onClick={() => loadSession(s.id)}
                                className={`group flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${activeSessionId === s.id
                                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                    : 'hover:bg-gray-800 text-gray-300'
                                    }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="truncate font-medium">{s.title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {s.stockCode && <span className="text-blue-400/60">{s.stockCode} · </span>}
                                        {s.messageCount} 条消息
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteSession(s.id, e)}
                                    className="opacity-0 group-hover:opacity-100 ml-2 text-gray-500 hover:text-red-400 transition-opacity"
                                    title="删除"
                                >
                                    🗑
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 右侧: 对话区 */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* 顶部栏 */}
                <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-700/50 bg-gray-900/30">
                    <span className="text-lg">💬</span>
                    <h2 className="text-base font-semibold text-white">AI 投研助手</h2>
                    <div className="flex-1" />
                    <div className="flex items-center gap-3">
                        {/* 模型选择器 */}
                        {models.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <label className="text-xs text-gray-400">模型:</label>
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className="px-2 py-1 bg-gray-800/80 border border-gray-600/50 rounded text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                                >
                                    {models.map(m => (
                                        <option key={m.name} value={m.name}>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs text-gray-400">股票:</label>
                            <input
                                type="text"
                                value={stockCode}
                                onChange={(e) => setStockCode(e.target.value)}
                                placeholder="如 01810"
                                className="w-24 px-2 py-1 bg-gray-800/80 border border-gray-600/50 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                            />
                        </div>
                    </div>
                </div>

                {/* 消息区 */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <div className="text-6xl mb-6">🤖</div>
                            <h3 className="text-xl font-semibold text-white mb-2">AI 投研助手</h3>
                            <p className="text-sm text-gray-500 mb-8 text-center max-w-md">
                                可以询问股票行情、技术分析、最新消息等。<br />
                                AI 会自动调用工具获取实时数据来回答你的问题。
                            </p>
                            {/* 快捷问题 */}
                            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                                {QUICK_ACTIONS.map((qa, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            const prompt = stockCode
                                                ? `${qa.prompt}（股票: ${stockCode}）`
                                                : qa.prompt;
                                            handleSend(prompt);
                                        }}
                                        className="px-3 py-2 bg-gray-800/60 hover:bg-gray-700/80 border border-gray-600/30 rounded-lg text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1.5"
                                    >
                                        <span>{qa.icon}</span> {qa.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                                {/* 消息气泡 */}
                                <div className={`rounded-2xl px-4 py-3 ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800/80 text-gray-100 border border-gray-700/30'
                                    }`}>
                                    {/* 工具调用展示 */}
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <div className="mb-3 space-y-1.5">
                                            {msg.toolCalls.map((tc, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-gray-900/50 border border-gray-600/20">
                                                    {tc.status === 'calling' ? (
                                                        <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                                    ) : (
                                                        <span className="text-green-400">✓</span>
                                                    )}
                                                    <span className="text-blue-300">
                                                        🔧 {TOOL_NAME_MAP[tc.name] || tc.name}
                                                    </span>
                                                    {tc.args?.stock_code && (
                                                        <span className="text-gray-500">({tc.args.stock_code})</span>
                                                    )}
                                                    {tc.args?.query && (
                                                        <span className="text-gray-500">({tc.args.query})</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 消息内容：Markdown 渲染 */}
                                    <div className="text-sm leading-relaxed">
                                        {msg.role === 'assistant' ? (
                                            <div className="markdown-body">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                                {msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse" />}
                                            </div>
                                        ) : (
                                            <div className="whitespace-pre-wrap break-words">
                                                {msg.content}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 元信息 + 重试按钮 */}
                                {msg.role === 'assistant' && !msg.isStreaming && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 px-2">
                                        {msg.responseTimeMs && (
                                            <span>⏱ {(msg.responseTimeMs / 1000).toFixed(1)}s</span>
                                        )}
                                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                                            <span>· 🔧 {msg.toolCalls.length} 次工具调用</span>
                                        )}
                                        {/* 重试按钮：仅最后一条 AI 回复显示 */}
                                        {idx === messages.length - 1 && !isStreaming && (
                                            <button
                                                onClick={handleRetry}
                                                className="ml-1 text-gray-500 hover:text-blue-400 transition-colors"
                                                title="重新生成"
                                            >
                                                🔄 重试
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
                    <div className="px-6 pt-2 flex flex-wrap gap-1.5">
                        {QUICK_ACTIONS.map((qa, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    const prompt = stockCode
                                        ? `${qa.prompt}（股票: ${stockCode}）`
                                        : qa.prompt;
                                    handleSend(prompt);
                                }}
                                className="px-2.5 py-1 bg-gray-800/40 hover:bg-gray-700/60 border border-gray-700/30 rounded-full text-xs text-gray-400 hover:text-white transition-colors"
                            >
                                {qa.icon} {qa.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* 输入区 */}
                <div className="px-6 py-3 border-t border-gray-700/50 bg-gray-900/30">
                    <div className="flex items-end gap-3">
                        <textarea
                            ref={inputRef}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
                            rows={1}
                            className="flex-1 px-4 py-2.5 bg-gray-800/80 border border-gray-600/50 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 resize-none min-h-[40px] max-h-[120px]"
                            style={{
                                height: 'auto',
                                minHeight: '40px',
                            }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                            }}
                        />
                        {isStreaming ? (
                            <button
                                onClick={handleStop}
                                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
                            >
                                ⏹ 停止
                            </button>
                        ) : (
                            <button
                                onClick={() => handleSend()}
                                disabled={!inputText.trim()}
                                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
                            >
                                发送 ↑
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
