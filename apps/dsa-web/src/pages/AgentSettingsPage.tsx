import React, { useEffect, useMemo, useState } from 'react';
import { AgentApi, SkillApi, ToolApi } from '../api';
import type { AgentProfile } from '../api/agents';
import type { AgentBoundSkill, Skill, SkillPreviewResult } from '../api/skills';
import type { ToolDefinition } from '../api/tools';
import { toast } from 'react-hot-toast';

type SkillSelectionState = {
    bindingId?: number;
    isEnabled: boolean;
    customPromptOverride: string;
};

type SkillSelectionMap = Record<string, SkillSelectionState>;

// 工具配置：记录每个工具的配置项值
type ToolConfigMap = Record<string, Record<string, any>>;

const DEFAULT_FORM_DATA = {
    name: '',
    description: '',
    system_prompt: '',
    enabled_tools: [] as string[],
    model_config: { temperature: 0.5 } as Record<string, any>,
};

// 从工具的 config_schema 生成默认配置
const getToolDefaultConfig = (tool: ToolDefinition): Record<string, any> => {
    const defaults: Record<string, any> = {};
    const schema = tool.function.config_schema;
    if (schema) {
        for (const [key, field] of Object.entries(schema)) {
            defaults[key] = field.default;
        }
    }
    return defaults;
};

const createEmptySkillSelectionMap = (skills: Skill[]): SkillSelectionMap => {
    const initial: SkillSelectionMap = {};
    for (const skill of skills) {
        initial[skill.id] = {
            isEnabled: false,
            customPromptOverride: '',
        };
    }
    return initial;
};

const buildSkillSelectionMap = (skills: Skill[], boundSkills: AgentBoundSkill[]): SkillSelectionMap => {
    const result = createEmptySkillSelectionMap(skills);
    for (const bound of boundSkills) {
        result[bound.id] = {
            bindingId: bound.binding_id,
            isEnabled: bound.is_enabled,
            customPromptOverride: bound.custom_prompt_override || '',
        };
    }
    return result;
};

const AgentSettingsPage: React.FC = () => {
    const [agents, setAgents] = useState<AgentProfile[]>([]);
    const [tools, setTools] = useState<ToolDefinition[]>([]);
    const [skills, setSkills] = useState<Skill[]>([]);

    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingMeta, setIsLoadingMeta] = useState(false);
    const [isLoadingBindings, setIsLoadingBindings] = useState(false);

    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [skillSelectionMap, setSkillSelectionMap] = useState<SkillSelectionMap>({});
    const [toolConfigs, setToolConfigs] = useState<ToolConfigMap>({});

    const [preview, setPreview] = useState<SkillPreviewResult | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

    const selectedSkillIds = useMemo(
        () => skills.filter((skill) => skillSelectionMap[skill.id]?.isEnabled).map((skill) => skill.id),
        [skills, skillSelectionMap],
    );

    const enabledSkillCount = selectedSkillIds.length;

    const applyAgentToForm = (agent: AgentProfile) => {
        setFormData({
            name: agent.name,
            description: agent.description || '',
            system_prompt: agent.system_prompt || '',
            enabled_tools: agent.enabled_tools || [],
            model_config: agent.model_config || { temperature: 0.5 },
        });
    };

    const loadAgentBindings = async (agentId: string, currentSkills: Skill[]) => {
        setIsLoadingBindings(true);
        try {
            const response = await SkillApi.getAgentSkills(agentId, false);
            setSkillSelectionMap(buildSkillSelectionMap(currentSkills, response.skills));
        } catch (error) {
            console.error('Failed to load agent bindings', error);
            toast.error('加载 Agent 技能绑定失败');
            setSkillSelectionMap(createEmptySkillSelectionMap(currentSkills));
        } finally {
            setIsLoadingBindings(false);
        }
    };

    const loadInitialData = async () => {
        setIsLoadingMeta(true);
        try {
            const [agentList, toolData, skillList] = await Promise.all([
                AgentApi.list(),
                ToolApi.list(true), // 包含 config_schema
                SkillApi.list({ include_builtin: true }),
            ]);

            setAgents(agentList);
            setTools(toolData.tools);
            setSkills(skillList);

            // 初始化所有工具的默认配置
            const defaultConfigs: ToolConfigMap = {};
            for (const tool of toolData.tools) {
                defaultConfigs[tool.function.name] = getToolDefaultConfig(tool);
            }
            setToolConfigs(defaultConfigs);

            const defaultAgent = agentList.find((agent) => agent.is_default) || agentList[0];
            if (defaultAgent) {
                setSelectedAgentId(defaultAgent.id);
                applyAgentToForm(defaultAgent);
                // 加载 Agent 的工具配置
                if (defaultAgent.tool_configs) {
                    setToolConfigs((prev) => ({
                        ...prev,
                        ...defaultAgent.tool_configs,
                    }));
                }
                await loadAgentBindings(defaultAgent.id, skillList);
            } else {
                setSkillSelectionMap(createEmptySkillSelectionMap(skillList));
            }
        } catch (error) {
            console.error('Failed to load initial data', error);
            toast.error('加载页面数据失败');
        } finally {
            setIsLoadingMeta(false);
        }
    };

    useEffect(() => {
        void loadInitialData();
    }, []);

    useEffect(() => {
        // 只有在技能列表加载完成后才进行预览
        if (skills.length === 0) return;

        const timer = window.setTimeout(async () => {
            setIsPreviewLoading(true);
            setPreviewError(null);
            try {
                const data = await SkillApi.preview({
                    base_prompt: formData.system_prompt || '',
                    skill_ids: selectedSkillIds,
                    manual_tools: formData.enabled_tools,
                });
                setPreview(data);
            } catch (error: any) {
                console.error('Preview error:', error);
                setPreview(null);
                setPreviewError(error?.response?.data?.detail || error?.message || '预览失败');
            } finally {
                setIsPreviewLoading(false);
            }
        }, 350);

        return () => window.clearTimeout(timer);
    }, [formData.system_prompt, formData.enabled_tools, selectedSkillIds, skills.length]);

    const handleSelectAgent = async (agent: AgentProfile) => {
        setSelectedAgentId(agent.id);
        applyAgentToForm(agent);
        // 加载 Agent 的工具配置
        const defaultConfigs: ToolConfigMap = {};
        for (const tool of tools) {
            defaultConfigs[tool.function.name] = getToolDefaultConfig(tool);
        }
        setToolConfigs(agent.tool_configs ? { ...defaultConfigs, ...agent.tool_configs } : defaultConfigs);
        await loadAgentBindings(agent.id, skills);
    };

    const handleCreateNew = () => {
        setSelectedAgentId(null);
        setFormData({
            name: '新助手',
            description: '',
            system_prompt: '你是一个乐于助人的 AI 助手。',
            enabled_tools: [],
            model_config: { temperature: 0.5 },
        });
        setSkillSelectionMap(createEmptySkillSelectionMap(skills));
    };

    const toggleTool = (toolName: string) => {
        setFormData((prev) => {
            const enabledTools = prev.enabled_tools.includes(toolName)
                ? prev.enabled_tools.filter((name) => name !== toolName)
                : [...prev.enabled_tools, toolName];
            return { ...prev, enabled_tools: enabledTools };
        });
    };

    const toggleSkill = (skillId: string) => {
        const currentEnabled = !!skillSelectionMap[skillId]?.isEnabled;
        if (!currentEnabled && enabledSkillCount >= 10) {
            toast.error('最多只能启用 10 个技能');
            return;
        }

        setSkillSelectionMap((prev) => ({
            ...prev,
            [skillId]: {
                ...prev[skillId],
                isEnabled: !currentEnabled,
                customPromptOverride: prev[skillId]?.customPromptOverride || '',
            },
        }));
    };

    const handleSkillOverrideChange = (skillId: string, value: string) => {
        setSkillSelectionMap((prev) => ({
            ...prev,
            [skillId]: {
                ...prev[skillId],
                customPromptOverride: value,
                isEnabled: prev[skillId]?.isEnabled ?? false,
            },
        }));
    };

    const syncAgentSkillBindings = async (agentId: string) => {
        const currentBindingsResponse = await SkillApi.getAgentSkills(agentId, false);
        const currentBySkillId = new Map(currentBindingsResponse.skills.map((skill) => [skill.id, skill]));

        const operations: Promise<any>[] = [];

        for (const skill of skills) {
            const target = skillSelectionMap[skill.id] || {
                isEnabled: false,
                customPromptOverride: '',
            };
            const current = currentBySkillId.get(skill.id);
            const overrideValue = target.customPromptOverride.trim() || null;

            if (target.isEnabled) {
                if (current) {
                    operations.push(
                        SkillApi.updateAgentSkillBinding(agentId, current.binding_id, {
                            is_enabled: true,
                            custom_prompt_override: overrideValue,
                        }),
                    );
                } else {
                    operations.push(
                        SkillApi.bindToAgent(agentId, {
                            skill_id: skill.id,
                            is_enabled: true,
                            custom_prompt_override: overrideValue,
                        }),
                    );
                }
            } else if (current) {
                operations.push(
                    SkillApi.updateAgentSkillBinding(agentId, current.binding_id, {
                        is_enabled: false,
                    }),
                );
            }
        }

        await Promise.all(operations);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toast.error('请输入名称');
            return;
        }

        if (selectedSkillIds.length > 10) {
            toast.error('最多只能启用 10 个技能');
            return;
        }

        setIsSaving(true);
        try {
            // 只保存已启用工具的配置
            const enabledToolConfigs: ToolConfigMap = {};
            for (const toolName of formData.enabled_tools) {
                if (toolConfigs[toolName]) {
                    enabledToolConfigs[toolName] = toolConfigs[toolName];
                }
            }

            const payload = {
                name: formData.name,
                description: formData.description,
                system_prompt: formData.system_prompt,
                enabled_tools: formData.enabled_tools,
                manual_tools: formData.enabled_tools,
                tool_configs: enabledToolConfigs,
                model_config: formData.model_config,
            };

            let activeAgentId = selectedAgentId;
            if (activeAgentId) {
                await AgentApi.update(activeAgentId, payload);
            } else {
                const created = await AgentApi.create(payload);
                activeAgentId = created.id;
                setSelectedAgentId(created.id);
            }

            if (!activeAgentId) {
                throw new Error('Invalid agent id after save');
            }

            await syncAgentSkillBindings(activeAgentId);

            const latestAgents = await AgentApi.list();
            setAgents(latestAgents);
            const activeAgent = latestAgents.find((item) => item.id === activeAgentId);
            if (activeAgent) {
                applyAgentToForm(activeAgent);
                await loadAgentBindings(activeAgent.id, skills);
            }

            toast.success(selectedAgentId ? '更新成功' : '创建成功');
        } catch (error: any) {
            console.error(error);
            toast.error(error?.response?.data?.detail || '保存失败');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const agent = agents.find((item) => item.id === id);
        if (agent?.is_system) {
            toast.error('系统内置助手不支持删除');
            return;
        }

        if (!window.confirm(`确定要删除助手 "${agent?.name}" 吗？`)) {
            return;
        }

        try {
            await AgentApi.delete(id);
            const latestAgents = await AgentApi.list();
            setAgents(latestAgents);

            const fallback = latestAgents.find((item) => item.is_default) || latestAgents[0];
            if (fallback) {
                await handleSelectAgent(fallback);
            } else {
                handleCreateNew();
            }

            toast.success('删除成功');
        } catch (error) {
            console.error(error);
            toast.error('删除失败');
        }
    };

    return (
        <div className="flex h-full text-gray-100 bg-gradient-to-br from-gray-900 via-[#111827] to-gray-900">
            <div className="w-80 flex-shrink-0 border-r border-gray-800/50 bg-gray-900/40 backdrop-blur-xl flex flex-col">
                <div className="p-5 border-b border-gray-800/50 flex justify-between items-center bg-gradient-to-r from-gray-900/50 to-transparent">
                    <h2 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                        我的助手
                    </h2>
                    <button
                        onClick={handleCreateNew}
                        className="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-all duration-200"
                        title="新建助手"
                    >
                        +
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {agents.map((agent) => (
                        <div
                            key={agent.id}
                            onClick={() => {
                                void handleSelectAgent(agent);
                            }}
                            className={`group p-4 rounded-xl cursor-pointer transition-all duration-200 border ${
                                selectedAgentId === agent.id
                                    ? 'bg-blue-600/10 border-blue-500/50'
                                    : 'bg-gray-800/20 border-white/5 hover:bg-gray-800/40 hover:border-white/10'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className={`font-semibold ${selectedAgentId === agent.id ? 'text-blue-400' : 'text-gray-200'}`}>
                                    {agent.name}
                                </div>
                                {agent.is_default && (
                                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                                        Default
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-gray-500 truncate mt-1.5">{agent.description || '暂无描述'}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white/[0.02] relative">
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gray-900/40 backdrop-blur-sm z-10">
                    <h2 className="font-bold text-xl">
                        <span className="text-gray-400 font-normal">设置 / </span>
                        <span className="text-gray-100">{selectedAgentId ? '编辑助手' : '新建助手'}</span>
                    </h2>
                    <div className="flex space-x-3">
                        {selectedAgentId && (
                            <button
                                onClick={() => {
                                    void handleDelete(selectedAgentId);
                                }}
                                className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all text-sm font-medium"
                            >
                                删除 Agent
                            </button>
                        )}
                        <button
                            onClick={() => {
                                void handleSave();
                            }}
                            disabled={isSaving || isLoadingMeta}
                            className={`px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg transition-all text-sm font-medium ${
                                isSaving ? 'opacity-70 cursor-wait' : ''
                            }`}
                        >
                            {isSaving ? '保存中...' : '保存配置'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar z-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-300 ml-1">名称</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white"
                                placeholder="给你的助手起个名字..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-300 ml-1">描述</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white"
                                placeholder="简单介绍一下它的功能..."
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-300 ml-1">系统提示词 (Base Prompt)</label>
                        <textarea
                            value={formData.system_prompt}
                            onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                            className="w-full h-56 bg-[#0d1117] border border-gray-700/50 rounded-xl px-5 py-4 text-gray-300 font-mono text-sm leading-relaxed"
                            placeholder="在这里定义助手身份与行为边界..."
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-gray-300 ml-1">
                            手动工具 <span className="text-gray-500 font-normal">({formData.enabled_tools.length} 已启用)</span>
                        </label>
                        <div className="space-y-3">
                            {tools.map((tool) => {
                                const isEnabled = formData.enabled_tools.includes(tool.function.name);
                                const isExpanded = expandedTools.has(tool.function.name);
                                const configSchema = tool.function.config_schema;
                                const hasConfig = configSchema && Object.keys(configSchema).length > 0;

                                return (
                                    <div
                                        key={tool.function.name}
                                        className={`rounded-xl border transition-all ${
                                            isEnabled
                                                ? 'bg-blue-900/10 border-blue-500/30'
                                                : 'bg-gray-800/30 border-gray-700/50'
                                        }`}
                                    >
                                        {/* 工具头部 */}
                                        <div className="p-4 flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-gray-200">{tool.function.name}</h3>
                                                    {hasConfig && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setExpandedTools(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(tool.function.name)) {
                                                                        next.delete(tool.function.name);
                                                                    } else {
                                                                        next.add(tool.function.name);
                                                                    }
                                                                    return next;
                                                                });
                                                            }}
                                                            className="text-xs text-blue-400 hover:text-blue-300"
                                                        >
                                                            {isExpanded ? '收起配置' : '配置'}
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{tool.function.description}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggleTool(tool.function.name)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                                                    isEnabled
                                                        ? 'bg-blue-600/30 text-blue-200 border-blue-500/40'
                                                        : 'bg-gray-800 text-gray-300 border-gray-600'
                                                }`}
                                            >
                                                {isEnabled ? '已启用' : '启用'}
                                            </button>
                                        </div>

                                        {/* 工具配置面板 */}
                                        {isExpanded && hasConfig && isEnabled && (
                                            <div className="px-4 pb-4 border-t border-gray-700/50 pt-3">
                                                <div className="text-xs text-gray-500 mb-2">工具配置</div>
                                                <div className="space-y-3">
                                                    {Object.entries(configSchema).map(([key, field]) => {
                                                        const value = toolConfigs[tool.function.name]?.[key] ?? field.default;

                                                        return (
                                                            <div key={key}>
                                                                <label className="block text-xs text-gray-400 mb-1">
                                                                    {field.label}
                                                                </label>
                                                                {field.type === 'select' && field.options && (
                                                                    <select
                                                                        value={value}
                                                                        onChange={(e) => {
                                                                            setToolConfigs(prev => ({
                                                                                ...prev,
                                                                                [tool.function.name]: {
                                                                                    ...prev[tool.function.name],
                                                                                    [key]: e.target.value
                                                                                }
                                                                            }));
                                                                        }}
                                                                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300"
                                                                    >
                                                                        {field.options.map((opt) => (
                                                                            <option key={opt.value} value={opt.value}>
                                                                                {opt.label}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                                {field.type === 'text' && (
                                                                    <input
                                                                        type="text"
                                                                        value={value}
                                                                        onChange={(e) => {
                                                                            setToolConfigs(prev => ({
                                                                                ...prev,
                                                                                [tool.function.name]: {
                                                                                    ...prev[tool.function.name],
                                                                                    [key]: e.target.value
                                                                                }
                                                                            }));
                                                                        }}
                                                                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300"
                                                                        placeholder={field.description}
                                                                    />
                                                                )}
                                                                {field.type === 'number' && (
                                                                    <input
                                                                        type="number"
                                                                        min={field.min}
                                                                        max={field.max}
                                                                        value={value}
                                                                        onChange={(e) => {
                                                                            setToolConfigs(prev => ({
                                                                                ...prev,
                                                                                [tool.function.name]: {
                                                                                    ...prev[tool.function.name],
                                                                                    [key]: Number(e.target.value)
                                                                                }
                                                                            }));
                                                                        }}
                                                                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300"
                                                                    />
                                                                )}
                                                                {field.description && (
                                                                    <p className="text-xs text-gray-600 mt-0.5">{field.description}</p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-semibold text-gray-300 ml-1">
                                技能组合 <span className="text-gray-500 font-normal">({enabledSkillCount}/10 已启用)</span>
                            </label>
                            {isLoadingBindings && <span className="text-xs text-gray-500">加载绑定中...</span>}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {skills.map((skill) => {
                                const selected = !!skillSelectionMap[skill.id]?.isEnabled;
                                const override = skillSelectionMap[skill.id]?.customPromptOverride || '';

                                return (
                                    <div
                                        key={skill.id}
                                        className={`p-4 rounded-xl border transition-all ${
                                            selected ? 'bg-indigo-900/20 border-indigo-500/40' : 'bg-gray-800/30 border-gray-700/50'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-gray-200 truncate">{skill.name}</h3>
                                                    <span className="text-[10px] px-2 py-0.5 rounded border border-gray-600 text-gray-400">
                                                        {skill.category}
                                                    </span>
                                                    {skill.is_builtin && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded border border-blue-500/30 text-blue-300">
                                                            Built-in
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{skill.description || '暂无描述'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggleSkill(skill.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                                                    selected
                                                        ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/40'
                                                        : 'bg-gray-800 text-gray-300 border-gray-600'
                                                }`}
                                            >
                                                {selected ? '已启用' : '启用'}
                                            </button>
                                        </div>

                                        <div className="mt-3">
                                            <label className="block text-xs text-gray-500 mb-1">
                                                custom_prompt_override（可选）
                                            </label>
                                            <textarea
                                                value={override}
                                                onChange={(e) => handleSkillOverrideChange(skill.id, e.target.value)}
                                                disabled={!selected}
                                                className="w-full h-20 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-40"
                                                placeholder="覆盖该技能的默认提示词（仅对当前 Agent 生效）"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-gray-700/50 bg-gray-900/40 p-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-200">组合预览</h3>
                            {isPreviewLoading && <span className="text-xs text-gray-500">预览计算中...</span>}
                        </div>

                        {previewError && <div className="text-sm text-red-400">{previewError}</div>}

                        {!preview && !previewError && !isPreviewLoading && (
                            <div className="text-sm text-gray-500">
                                选择技能或手动工具以查看组合预览
                            </div>
                        )}

                        {preview && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                    <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2">
                                        Skills: <span className="text-gray-200">{preview.skill_count}</span>
                                    </div>
                                    <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2">
                                        Tools: <span className="text-gray-200">{preview.enabled_tools.length}</span>
                                    </div>
                                    <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2">
                                        Estimated Tokens: <span className="text-gray-200">{preview.estimated_tokens}</span>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-1">启用工具</div>
                                    <div className="flex flex-wrap gap-2">
                                        {preview.enabled_tools.map((toolName) => (
                                            <span
                                                key={toolName}
                                                className="text-[11px] px-2 py-1 rounded border border-gray-600 text-gray-300"
                                            >
                                                {toolName}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-1">组合后 System Prompt</div>
                                    <pre className="text-xs text-gray-300 bg-[#0d1117] border border-gray-700/50 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                                        {preview.system_prompt}
                                    </pre>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentSettingsPage;
