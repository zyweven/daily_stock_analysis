import React, { useEffect, useMemo, useState } from 'react';
import { SkillApi, AgentApi } from '../api';
import type { Skill, SkillCategory, SkillPreviewResult } from '../api/skills';
import type { AgentProfile } from '../api/agents';
import { toast } from 'react-hot-toast';
import { Drawer, Badge, Select, Button } from '../components/common';

type SkillFormData = {
    name: string;
    description: string;
    prompt_template: string;
    category: string;
    icon: string;
    tool_bindings: Array<{ tool_name: string; priority?: number }>;
};

const DEFAULT_FORM_DATA: SkillFormData = {
    name: '',
    description: '',
    prompt_template: '',
    category: 'general',
    icon: '🔧',
    tool_bindings: [],
};

const SKILL_TEMPLATES: Array<{
    id: string;
    name: string;
    icon: string;
    description: string;
    skillIds: string[];
}> = [
    {
        id: 'day_trading',
        name: '日内交易',
        icon: '📊',
        description: '专注于日内短线操作、技术指标和实时行情',
        skillIds: ['stock_technical_analysis', 'stock_realtime_quote'],
    },
    {
        id: 'value_investing',
        name: '价值投资',
        icon: '💰',
        description: '基本面分析、财报解读和长期价值评估',
        skillIds: ['stock_fundamental_analysis', 'stock_research_report'],
    },
    {
        id: 'news_driven',
        name: '新闻驱动',
        icon: '📰',
        description: '新闻追踪、事件分析和舆情监控',
        skillIds: ['stock_news_research', 'stock_sentiment_analysis'],
    },
];

const SkillLibraryPage: React.FC = () => {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [categories, setCategories] = useState<SkillCategory[]>([]);
    const [agents, setAgents] = useState<AgentProfile[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
    const [formData, setFormData] = useState<SkillFormData>(DEFAULT_FORM_DATA);
    const [isSaving, setIsSaving] = useState(false);

    const [previewSkillIds, setPreviewSkillIds] = useState<string[]>([]);
    const [previewBasePrompt, setPreviewBasePrompt] = useState('');
    const [previewResult, setPreviewResult] = useState<SkillPreviewResult | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [targetAgentId, setTargetAgentId] = useState<string>('');
    const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [skillsData, categoriesData, agentsData] = await Promise.all([
                SkillApi.list({ include_builtin: true }),
                SkillApi.listCategories(),
                AgentApi.list(),
            ]);
            setSkills(skillsData);
            setCategories(categoriesData);
            setAgents(agentsData);
        } catch (error) {
            console.error('Failed to load skills data', error);
            toast.error('加载技能数据失败');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const filteredSkills = useMemo(() => {
        if (selectedCategory === 'all') return skills;
        return skills.filter((skill) => skill.category === selectedCategory);
    }, [skills, selectedCategory]);

    const handleOpenDetail = (skill: Skill) => {
        setSelectedSkill(skill);
        setIsDetailOpen(true);
    };

    const handleCloseDetail = () => {
        setIsDetailOpen(false);
        setSelectedSkill(null);
    };

    const handleCreateNew = () => {
        setEditingSkill(null);
        setFormData(DEFAULT_FORM_DATA);
        setIsFormOpen(true);
    };

    const handleEdit = (skill: Skill, e: React.MouseEvent) => {
        e.stopPropagation();
        if (skill.is_builtin) {
            toast.error('内置技能无法编辑');
            return;
        }
        setEditingSkill(skill);
        setFormData({
            name: skill.name,
            description: skill.description || '',
            prompt_template: skill.prompt_template || '',
            category: skill.category,
            icon: skill.icon,
            tool_bindings: skill.tool_bindings || [],
        });
        setIsFormOpen(true);
    };

    const handleDelete = async (skill: Skill, e: React.MouseEvent) => {
        e.stopPropagation();
        if (skill.is_builtin) {
            toast.error('内置技能无法删除');
            return;
        }
        if (!window.confirm(`确定要删除技能 "${skill.name}" 吗？`)) return;

        try {
            await SkillApi.delete(skill.id);
            toast.success('删除成功');
            void loadData();
        } catch (error) {
            console.error(error);
            toast.error('删除失败');
        }
    };

    const handleSaveForm = async () => {
        if (!formData.name.trim()) {
            toast.error('请输入技能名称');
            return;
        }
        if (!formData.prompt_template.trim() || formData.prompt_template.length < 10) {
            toast.error('提示词模板至少需要 10 个字符');
            return;
        }

        setIsSaving(true);
        try {
            if (editingSkill) {
                await SkillApi.update(editingSkill.id, formData);
                toast.success('更新成功');
            } else {
                await SkillApi.create(formData);
                toast.success('创建成功');
            }
            setIsFormOpen(false);
            void loadData();
        } catch (error: any) {
            console.error(error);
            toast.error(error?.response?.data?.detail || '保存失败');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTogglePreviewSkill = (skillId: string) => {
        setPreviewSkillIds((prev) =>
            prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
        );
    };

    const handleRunPreview = async () => {
        if (previewSkillIds.length === 0) {
            toast.error('请至少选择一个技能');
            return;
        }
        setIsPreviewLoading(true);
        try {
            const result = await SkillApi.preview({
                base_prompt: previewBasePrompt,
                skill_ids: previewSkillIds,
                manual_tools: [],
            });
            setPreviewResult(result);
        } catch (error: any) {
            toast.error(error?.response?.data?.detail || '预览失败');
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleOpenTemplateModal = () => {
        setSelectedTemplateId(SKILL_TEMPLATES[0]?.id || '');
        const defaultAgent = agents.find((a) => a.is_default) || agents[0];
        setTargetAgentId(defaultAgent?.id || '');
        setIsTemplateModalOpen(true);
    };

    const handleApplyTemplate = async () => {
        const template = SKILL_TEMPLATES.find((t) => t.id === selectedTemplateId);
        if (!template || !targetAgentId) {
            toast.error('请选择模板和目标 Agent');
            return;
        }

        setIsApplyingTemplate(true);
        try {
            const currentBindings = await SkillApi.getAgentSkills(targetAgentId, false);
            const currentBySkillId = new Map(currentBindings.skills.map((s) => [s.id, s]));

            const operations: Promise<any>[] = [];

            for (const skillId of template.skillIds) {
                const current = currentBySkillId.get(skillId);
                if (current) {
                    if (!current.is_enabled) {
                        operations.push(
                            SkillApi.updateAgentSkillBinding(targetAgentId, current.binding_id, {
                                is_enabled: true,
                            })
                        );
                    }
                } else {
                    operations.push(
                        SkillApi.bindToAgent(targetAgentId, {
                            skill_id: skillId,
                            is_enabled: true,
                        })
                    );
                }
            }

            for (const [skillId, bound] of currentBySkillId.entries()) {
                if (bound.is_enabled && !template.skillIds.includes(skillId)) {
                    operations.push(
                        SkillApi.updateAgentSkillBinding(targetAgentId, bound.binding_id, {
                            is_enabled: false,
                        })
                    );
                }
            }

            await Promise.all(operations);
            toast.success(`模板 "${template.name}" 已应用到目标 Agent`);
            setIsTemplateModalOpen(false);
        } catch (error: any) {
            console.error(error);
            toast.error(error?.response?.data?.detail || '应用模板失败');
        } finally {
            setIsApplyingTemplate(false);
        }
    };

    return (
        <div className="min-h-screen px-4 pb-6 pt-4 md:px-6 text-gray-100">
            <header className="mb-4 rounded-2xl border border-white/8 bg-card/80 p-4 backdrop-blur-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-white">技能库</h1>
                        <p className="text-sm text-secondary">
                            管理内置技能，创建自定义技能，组合应用到 Agent
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="secondary"
                            onClick={handleOpenTemplateModal}
                            disabled={isLoading || agents.length === 0}
                        >
                            🚀 应用模板
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleCreateNew}
                            disabled={isLoading}
                        >
                            + 新建技能
                        </Button>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
                <aside className="rounded-2xl border border-white/8 bg-card/60 p-3 backdrop-blur-sm h-fit">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted">分类筛选</p>
                    <div className="space-y-1">
                        <button
                            type="button"
                            className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                                selectedCategory === 'all'
                                    ? 'border-accent bg-cyan/10 text-white'
                                    : 'border-white/8 bg-elevated/40 text-secondary hover:border-white/16 hover:text-white'
                            }`}
                            onClick={() => setSelectedCategory('all')}
                        >
                            <span className="flex items-center justify-between text-sm font-medium">
                                <span>全部</span>
                                <span className="text-xs text-muted">{skills.length}</span>
                            </span>
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                                    selectedCategory === cat.id
                                        ? 'border-accent bg-cyan/10 text-white'
                                        : 'border-white/8 bg-elevated/40 text-secondary hover:border-white/16 hover:text-white'
                                }`}
                                onClick={() => setSelectedCategory(cat.id)}
                            >
                                <span className="flex items-center justify-between text-sm font-medium">
                                    <span>
                                        {cat.icon} {cat.name}
                                    </span>
                                    <span className="text-xs text-muted">{cat.count}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="space-y-4">
                    {isLoading ? (
                        <div className="rounded-2xl border border-white/8 bg-card/60 p-8 text-center text-secondary">
                            加载中...
                        </div>
                    ) : filteredSkills.length === 0 ? (
                        <div className="rounded-2xl border border-white/8 bg-card/60 p-8 text-center text-secondary">
                            暂无技能数据
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredSkills.map((skill) => (
                                <div
                                    key={skill.id}
                                    onClick={() => handleOpenDetail(skill)}
                                    className="group rounded-xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm cursor-pointer hover:border-white/16 hover:bg-card/80 transition-all"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl shrink-0">
                                                {skill.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-white truncate">{skill.name}</h3>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <Badge variant="default" size="sm">
                                                        {skill.category}
                                                    </Badge>
                                                    {skill.is_builtin ? (
                                                        <Badge variant="info" size="sm">
                                                            Built-in
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="success" size="sm">
                                                            Custom
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-xs text-muted shrink-0">v{skill.version}</span>
                                    </div>

                                    <p className="mt-3 text-sm text-secondary line-clamp-2">
                                        {skill.description || '暂无描述'}
                                    </p>

                                    <div className="mt-4 flex items-center justify-between">
                                        <div className="text-xs text-muted">
                                            {skill.tool_bindings?.length || 0} 个工具绑定
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!skill.is_builtin && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => handleEdit(skill, e)}
                                                    >
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        variant="danger"
                                                        size="sm"
                                                        onClick={(e) => handleDelete(skill, e)}
                                                    >
                                                        删除
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="rounded-2xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm">
                        <h3 className="font-semibold text-white mb-3">组合预览</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-muted mb-1">选择技能（可多选）</label>
                                <div className="flex flex-wrap gap-2">
                                    {skills.map((skill) => (
                                        <button
                                            key={skill.id}
                                            type="button"
                                            onClick={() => handleTogglePreviewSkill(skill.id)}
                                            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                                                previewSkillIds.includes(skill.id)
                                                    ? 'bg-blue-600/30 border-blue-500/50 text-blue-200'
                                                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600'
                                            }`}
                                        >
                                            {skill.icon} {skill.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-muted mb-1">Base Prompt（可选）</label>
                                <textarea
                                    value={previewBasePrompt}
                                    onChange={(e) => setPreviewBasePrompt(e.target.value)}
                                    className="w-full h-20 bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300"
                                    placeholder="输入 Agent 的基础系统提示词..."
                                />
                            </div>

                            <Button
                                variant="primary"
                                onClick={handleRunPreview}
                                disabled={isPreviewLoading || previewSkillIds.length === 0}
                                isLoading={isPreviewLoading}
                            >
                                {isPreviewLoading ? '计算中...' : '生成预览'}
                            </Button>

                            {previewResult && (
                                <div className="mt-4 space-y-3 rounded-xl border border-gray-700/50 bg-gray-900/40 p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2">
                                            Skills: <span className="text-gray-200">{previewResult.skill_count}</span>
                                        </div>
                                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2">
                                            Tools: <span className="text-gray-200">{previewResult.enabled_tools.length}</span>
                                        </div>
                                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2">
                                            Tokens: <span className="text-gray-200">~{previewResult.estimated_tokens}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs text-muted mb-1">启用工具</div>
                                        <div className="flex flex-wrap gap-2">
                                            {previewResult.enabled_tools.map((toolName) => (
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
                                        <div className="text-xs text-muted mb-1">组合后 System Prompt</div>
                                        <pre className="text-xs text-gray-300 bg-[#0d1117] border border-gray-700/50 rounded-lg p-3 max-h-64 overflow-auto whitespace-pre-wrap">
                                            {previewResult.system_prompt}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            <Drawer isOpen={isDetailOpen} onClose={handleCloseDetail} title={selectedSkill?.name} width="max-w-3xl">
                {selectedSkill && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-3xl">
                                {selectedSkill.icon}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">{selectedSkill.name}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="default">{selectedSkill.category}</Badge>
                                    {selectedSkill.is_builtin ? (
                                        <Badge variant="info">Built-in</Badge>
                                    ) : (
                                        <Badge variant="success">Custom</Badge>
                                    )}
                                    <span className="text-xs text-muted">v{selectedSkill.version}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-white mb-2">描述</h3>
                            <p className="text-sm text-secondary">{selectedSkill.description || '暂无描述'}</p>
                        </div>

                        {selectedSkill.prompt_template && (
                            <div>
                                <h3 className="text-sm font-semibold text-white mb-2">Prompt Template</h3>
                                <pre className="text-xs text-gray-300 bg-[#0d1117] border border-gray-700/50 rounded-lg p-4 overflow-auto whitespace-pre-wrap">
                                    {selectedSkill.prompt_template}
                                </pre>
                            </div>
                        )}

                        <div>
                            <h3 className="text-sm font-semibold text-white mb-2">工具绑定</h3>
                            {selectedSkill.tool_bindings?.length ? (
                                <div className="space-y-2">
                                    {selectedSkill.tool_bindings.map((binding, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-700/50 bg-gray-800/30"
                                        >
                                            <span className="text-sm text-gray-300 font-mono">{binding.tool_name}</span>
                                            {binding.priority !== undefined && (
                                                <Badge variant="default" size="sm">
                                                    优先级: {binding.priority}
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-secondary">无工具绑定</p>
                            )}
                        </div>

                        {!selectedSkill.is_builtin && (
                            <div className="flex gap-3 pt-4 border-t border-white/5">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        handleCloseDetail();
                                        setTimeout(() => handleEdit(selectedSkill, { stopPropagation: () => {} } as any), 100);
                                    }}
                                >
                                    编辑
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={(e) => handleDelete(selectedSkill, e)}
                                >
                                    删除
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </Drawer>

            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-card shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <h2 className="text-lg font-semibold text-white">
                                {editingSkill ? '编辑技能' : '新建技能'}
                            </h2>
                            <Button
                                variant="ghost"
                                onClick={() => setIsFormOpen(false)}
                            >
                                ✕
                            </Button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-muted mb-1">名称 *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white"
                                        placeholder="技能名称"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-muted mb-1">图标</label>
                                    <input
                                        type="text"
                                        value={formData.icon}
                                        onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white"
                                        placeholder="🔧"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-muted mb-1">分类</label>
                                <Select
                                    value={formData.category}
                                    onChange={(val) => setFormData({ ...formData, category: val })}
                                    options={[
                                        ...categories.map((cat) => ({ value: cat.id, label: `${cat.icon} ${cat.name}` })),
                                        { value: 'general', label: '🔧 通用能力' }
                                    ]}
                                    placeholder="请选择分类"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-muted mb-1">描述</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white"
                                    placeholder="简短描述技能用途..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-muted mb-1">Prompt Template * (最少 10 字符)</label>
                                <textarea
                                    value={formData.prompt_template}
                                    onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
                                    className="w-full h-40 bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white font-mono text-sm"
                                    placeholder="定义该技能如何使用工具、处理输入..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-muted mb-1">工具绑定 (JSON 数组)</label>
                                <textarea
                                    value={JSON.stringify(formData.tool_bindings, null, 2)}
                                    onChange={(e) => {
                                        try {
                                            const parsed = JSON.parse(e.target.value);
                                            setFormData({ ...formData, tool_bindings: parsed });
                                        } catch {
                                            // ignore invalid JSON while typing
                                        }
                                    }}
                                    className="w-full h-24 bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white font-mono text-xs"
                                    placeholder={`[\n  {"tool_name": "get_realtime_quote", "priority": 1}\n]`}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
                            <Button
                                variant="ghost"
                                onClick={() => setIsFormOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => void handleSaveForm()}
                                disabled={isSaving}
                                isLoading={isSaving}
                            >
                                保存
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isTemplateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-card shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <h2 className="text-lg font-semibold text-white">应用技能模板</h2>
                            <Button
                                variant="ghost"
                                onClick={() => setIsTemplateModalOpen(false)}
                            >
                                ✕
                            </Button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs text-muted mb-2">选择模板</label>
                                <div className="space-y-2">
                                    {SKILL_TEMPLATES.map((template) => (
                                        <label
                                            key={template.id}
                                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                                                selectedTemplateId === template.id
                                                    ? 'bg-blue-600/10 border-blue-500/40'
                                                    : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="template"
                                                value={template.id}
                                                checked={selectedTemplateId === template.id}
                                                onChange={() => setSelectedTemplateId(template.id)}
                                                className="mt-1"
                                            />
                                            <div>
                                                <div className="font-medium text-gray-200">
                                                    {template.icon} {template.name}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {template.description}
                                                </div>
                                                <div className="text-xs text-gray-600 mt-1">
                                                    包含技能: {template.skillIds.length} 个
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-muted mb-1">目标 Agent</label>
                                <Select
                                    value={targetAgentId}
                                    onChange={(val) => setTargetAgentId(val)}
                                    options={agents.map((agent) => ({
                                        value: agent.id,
                                        label: `${agent.name} ${agent.is_default ? '(默认)' : ''}`
                                    }))}
                                    placeholder="请选择目标Agent"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
                            <Button
                                variant="ghost"
                                onClick={() => setIsTemplateModalOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => void handleApplyTemplate()}
                                disabled={isApplyingTemplate || !targetAgentId}
                                isLoading={isApplyingTemplate}
                            >
                                应用
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SkillLibraryPage;
