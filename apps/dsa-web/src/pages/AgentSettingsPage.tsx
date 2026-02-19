
import React, { useEffect, useState } from 'react';
import { AgentApi, ToolApi } from '../api';
import type { AgentProfile } from '../api/agents';
import type { ToolDefinition } from '../api/tools';
import { toast } from 'react-hot-toast';

// Reuse existing UI components if possible, or build simple ones
// I'll stick to standard HTML/Tailwind for speed

const AgentSettingsPage: React.FC = () => {
    const [agents, setAgents] = useState<AgentProfile[]>([]);
    const [tools, setTools] = useState<ToolDefinition[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        system_prompt: '',
        enabled_tools: [] as string[],
        model_config: { temperature: 0.5 }
    });

    const fetchAgents = async () => {
        try {
            // Fix: import logic or use direct calls
            // I'll assume imports above are correct, but valid import paths might be '../api/agents' 
            // Let's use the imported AgentApiService
            const data = await AgentApi.list();
            setAgents(data);
        } catch (error) {
            console.error('Failed to fetch agents', error);
            toast.error('加载 Agent 列表失败');
        }
    };

    const fetchTools = async () => {
        try {
            const data = await ToolApi.list();
            setTools(data.tools);
        } catch (error) {
            console.error('Failed to fetch tools', error);
        }
    };

    useEffect(() => {
        fetchAgents();
        fetchTools();
    }, []);

    const handleSelectAgent = (agent: AgentProfile) => {
        setSelectedAgentId(agent.id);
        const config = agent.model_config as { temperature: number } | null;
        setFormData({
            name: agent.name,
            description: agent.description || '',
            system_prompt: agent.system_prompt || '',
            enabled_tools: agent.enabled_tools || [],
            model_config: config || { temperature: 0.5 }
        });
    };

    const handleCreateNew = () => {
        setSelectedAgentId(null);
        setFormData({
            name: '新助手',
            description: '',
            system_prompt: '你是一个乐于助人的 AI 助手。',
            enabled_tools: [], // Default empty or select all? Let's start empty
            model_config: { temperature: 0.5 }
        });
    };

    const handleSave = async () => {
        if (!formData.name) {
            toast.error('请输入名称');
            return;
        }
        setIsSaving(true);
        try {
            if (selectedAgentId) {
                // Update
                await AgentApi.update(selectedAgentId, formData);
                toast.success('更新成功');
            } else {
                // Create
                await AgentApi.create(formData);
                toast.success('创建成功');
                handleCreateNew(); // Reset or select the new one?
            }
            fetchAgents();
        } catch (error) {
            console.error(error);
            toast.error('保存失败');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const agent = agents.find(a => a.id === id);
        if (agent?.is_system) {
            toast.error('系统内置助手不支持删除');
            return;
        }

        if (!window.confirm(`确定要删除助手 "${agent?.name}" 吗？`)) return;
        try {
            await AgentApi.delete(id);
            toast.success('删除成功');
            if (selectedAgentId === id) {
                handleCreateNew();
            }
            fetchAgents();
        } catch (error) {
            console.error(error);
            toast.error('删除失败');
        }
    };

    const toggleTool = (toolName: string) => {
        setFormData(prev => {
            const tools = prev.enabled_tools.includes(toolName)
                ? prev.enabled_tools.filter(t => t !== toolName)
                : [...prev.enabled_tools, toolName];
            return { ...prev, enabled_tools: tools };
        });
    };

    return (
        <div className="flex h-full text-gray-100 bg-gradient-to-br from-gray-900 via-[#111827] to-gray-900">
            {/* Sidebar List */}
            <div className="w-80 flex-shrink-0 border-r border-gray-800/50 bg-gray-900/40 backdrop-blur-xl flex flex-col">
                <div className="p-5 border-b border-gray-800/50 flex justify-between items-center bg-gradient-to-r from-gray-900/50 to-transparent">
                    <h2 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                        我的助手
                    </h2>
                    <button
                        onClick={handleCreateNew}
                        className="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-all duration-200 hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] group"
                        title="新建助手"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {agents.map(agent => (
                        <div
                            key={agent.id}
                            onClick={() => handleSelectAgent(agent)}
                            className={`group p-4 rounded-xl cursor-pointer transition-all duration-200 border relative overflow-hidden ${selectedAgentId === agent.id
                                ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_-5px_rgba(37,99,235,0.3)]'
                                : 'bg-gray-800/20 border-white/5 hover:bg-gray-800/40 hover:border-white/10 hover:shadow-lg'
                                }`}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out ${selectedAgentId === agent.id ? 'animate-shimmer' : ''}`} />
                            <div className="relative flex justify-between items-start">
                                <div className={`font-semibold transition-colors ${selectedAgentId === agent.id ? 'text-blue-400' : 'text-gray-200 group-hover:text-white'}`}>
                                    {agent.name}
                                </div>
                                {agent.is_default && (
                                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30 shadow-sm">
                                        Default
                                    </span>
                                )}
                            </div>
                            <div className="relative text-xs text-gray-500 truncate mt-1.5 group-hover:text-gray-400 transition-colors">
                                {agent.description || '暂无描述'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor Panel */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white/[0.02] relative">
                <div className="absolute inset-0 pointer-events-none bg-[url('/grid.svg')] opacity-[0.03]" />

                {/* Header */}
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gray-900/40 backdrop-blur-sm z-10">
                    <h2 className="font-bold text-xl flex items-center gap-2">
                        <span className="text-gray-400 font-normal">设置 /</span>
                        <span className="text-gray-100">{selectedAgentId ? '编辑助手' : '新建助手'}</span>
                    </h2>
                    <div className="flex space-x-3">
                        {selectedAgentId && (
                            <button
                                onClick={() => handleDelete(selectedAgentId)}
                                className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 hover:border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all text-sm font-medium"
                            >
                                删除 Agent
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg shadow-lg hover:shadow-blue-500/30 transition-all transform hover:-translate-y-0.5 text-sm font-medium flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {isSaving ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    保存中...
                                </>
                            ) : (
                                <>
                                    <span>💾</span> 保存配置
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar z-0">
                    {/* Meta Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-300 ml-1">名称</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all group-hover:border-gray-600/50"
                                    placeholder="给你的助手起个名字..."
                                />
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-blue-500 to-purple-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left rounded-b-xl" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-300 ml-1">描述</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all group-hover:border-gray-600/50"
                                    placeholder="简单介绍一下它的功能..."
                                />
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-blue-500 to-purple-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left rounded-b-xl" />
                            </div>
                        </div>
                    </div>

                    {/* Prompt */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-300 ml-1 flex justify-between">
                            <span>系统提示词 (System Prompt)</span>
                            <span className="text-xs text-gray-500 font-normal bg-gray-800/50 px-2 py-0.5 rounded">支持 Markdown</span>
                        </label>
                        <div className="relative group">
                            <textarea
                                value={formData.system_prompt}
                                onChange={e => setFormData({ ...formData, system_prompt: e.target.value })}
                                className="w-full h-80 bg-[#0d1117] border border-gray-700/50 rounded-xl px-5 py-4 text-gray-300 font-mono text-sm leading-relaxed focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none shadow-inner"
                                placeholder="在这里定义助手的行为模式、角色设定和能力边界..."
                            />
                            {/* Decorative highlights */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-transparent rounded-t-xl opacity-50" />
                        </div>
                        <p className="text-xs text-gray-500 ml-1">
                            提示：明确的指令能让助手表现得更好。尝试指明"你是一个..."。
                        </p>
                    </div>

                    {/* Tools Selection - Enhanced */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-semibold text-gray-300 ml-1">
                                工具能力 <span className="text-gray-500 font-normal">({formData.enabled_tools.length} 已启用)</span>
                            </label>
                            {/* Potential "Select All" button could go here */}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {tools.map(tool => {
                                const isEnabled = formData.enabled_tools.includes(tool.function.name);
                                return (
                                    <div
                                        key={tool.function.name}
                                        onClick={() => toggleTool(tool.function.name)}
                                        className={`relative group p-4 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col gap-3 overflow-hidden ${isEnabled
                                            ? 'bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-blue-500/40 shadow-[0_4px_20px_-5px_rgba(37,99,235,0.2)]'
                                            : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800/60 hover:border-gray-600'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isEnabled
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                                    : 'bg-gray-700/50 text-gray-400 group-hover:bg-gray-700'
                                                    }`}>
                                                    {isEnabled ? (
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : (
                                                        <span className="text-xs font-mono">FN</span>
                                                    )}
                                                </div>
                                                <div className="font-semibold text-gray-200 group-hover:text-white transition-colors">
                                                    {tool.function.name}
                                                </div>
                                            </div>
                                            {/* Toggle Switch Visual */}
                                            <div className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${isEnabled ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                        </div>

                                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 h-8">
                                            {tool.function.description}
                                        </p>

                                        {/* Status Indicator Bar */}
                                        <div className={`absolute bottom-0 left-0 h-1 transition-all duration-300 ${isEnabled
                                            ? 'w-full bg-gradient-to-r from-blue-500 to-indigo-500'
                                            : 'w-0 bg-gray-600 group-hover:w-full group-hover:opacity-30'
                                            }`} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentSettingsPage;
