import React, { useEffect, useState } from 'react';
import { Select } from '../common';
import { useSystemConfig } from '../../hooks';
import type { SystemConfigItem } from '../../types/systemConfig';

interface ExtraModelEndpoint {
    id: string;
    api_key: string;
    base_url: string;
    priority: number;
    enabled: boolean;
    verify_ssl: boolean;
    temperature?: number;
}

interface ExtraModelPool {
    name: string;
    provider: string;
    model: string;
    endpoints: ExtraModelEndpoint[];
}

interface ExtraModelsEditorProps {
    item: SystemConfigItem;
    value: string;
    onChange: (key: string, value: string) => void;
    disabled?: boolean;
}

const buildEndpointId = () => `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeBool = (val: unknown, fallback = true): boolean => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
        const s = val.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(s)) return true;
        if (['false', '0', 'no', 'off'].includes(s)) return false;
    }
    return fallback;
};

const normalizeNumber = (val: unknown, fallback: number): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
};

const hostLabel = (baseUrl?: string): string => {
    if (!baseUrl) return '';
    try {
        const normalized = baseUrl.startsWith('http://') || baseUrl.startsWith('https://') ? baseUrl : `https://${baseUrl}`;
        const url = new URL(normalized);
        let host = url.hostname.toLowerCase();
        host = host.replace(/^www\./, '').replace(/^api\./, '').replace(/^gateway\./, '');
        return host;
    } catch {
        return '';
    }
};

const providerDefaultName = (provider: string) => {
    if (provider === 'gemini') return 'Gemini';
    if (provider === 'openai') return 'OpenAI-Compatible';
    return 'Extra-Model';
};

const autoName = (pool: ExtraModelPool) => {
    if (pool.model?.trim()) return pool.model.trim();
    const endpointHost = pool.endpoints.map((ep) => hostLabel(ep.base_url)).find(Boolean);
    if (endpointHost) return endpointHost;
    return providerDefaultName(pool.provider);
};

const normalizeModels = (rawValue: string): ExtraModelPool[] => {
    try {
        const parsed = JSON.parse(rawValue || '[]');
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            .map((item, index) => {
                const provider = typeof item.provider === 'string' && item.provider ? item.provider : 'openai';
                const model = typeof item.model === 'string' ? item.model : typeof item.model_name === 'string' ? item.model_name : '';
                const inheritedBaseUrl = typeof item.base_url === 'string' ? item.base_url : '';
                const inheritedTemperature = item.temperature;
                const inheritedVerifySsl = item.verify_ssl;

                const rawEndpoints = Array.isArray(item.endpoints) ? item.endpoints : null;
                const endpoints: ExtraModelEndpoint[] = rawEndpoints
                    ? rawEndpoints
                        .filter((ep): ep is Record<string, unknown> => !!ep && typeof ep === 'object')
                        .map((ep, epIndex) => ({
                            id: typeof ep.id === 'string' && ep.id ? ep.id : `ep-${index + 1}-${epIndex + 1}`,
                            api_key: typeof ep.api_key === 'string' ? ep.api_key : '',
                            base_url: typeof ep.base_url === 'string' ? ep.base_url : inheritedBaseUrl,
                            priority: normalizeNumber(ep.priority, 0),
                            enabled: normalizeBool(ep.enabled, true),
                            verify_ssl: normalizeBool(ep.verify_ssl, normalizeBool(inheritedVerifySsl, true)),
                            temperature: ep.temperature == null || ep.temperature === '' ? undefined : normalizeNumber(ep.temperature, 0.7),
                        }))
                    : [{
                        id: `ep-${index + 1}-1`,
                        api_key: typeof item.api_key === 'string' ? item.api_key : '',
                        base_url: inheritedBaseUrl,
                        priority: 0,
                        enabled: true,
                        verify_ssl: normalizeBool(inheritedVerifySsl, true),
                        temperature: inheritedTemperature == null || inheritedTemperature === '' ? undefined : normalizeNumber(inheritedTemperature, 0.7),
                    }];

                const basePool: ExtraModelPool = {
                    name: typeof item.name === 'string' ? item.name : '',
                    provider,
                    model,
                    endpoints: endpoints.length > 0 ? endpoints : [{
                        id: buildEndpointId(),
                        api_key: '',
                        base_url: '',
                        priority: 0,
                        enabled: true,
                        verify_ssl: true,
                    }],
                };

                if (!basePool.name.trim()) {
                    return { ...basePool, name: autoName(basePool) };
                }
                return basePool;
            });
    } catch {
        return [];
    }
};

export const ExtraModelsEditor: React.FC<ExtraModelsEditorProps> = ({
    item,
    value,
    onChange,
    disabled = false,
}) => {
    const [models, setModels] = useState<ExtraModelPool[]>([]);
    const [nameTouched, setNameTouched] = useState<Record<number, boolean>>({});
    const { fetchModels: fetchProviderModels } = useSystemConfig();
    const [fetchingKey, setFetchingKey] = useState<string | null>(null);
    const [discoveredModelsByKey, setDiscoveredModelsByKey] = useState<Record<string, string[]>>({});
    const [fetchErrorByKey, setFetchErrorByKey] = useState<Record<string, string>>({});

    useEffect(() => {
        const normalized = normalizeModels(value || '[]');
        setModels(normalized);

        const touchedMap: Record<number, boolean> = {};
        normalized.forEach((m, idx) => {
            touchedMap[idx] = Boolean(m.name?.trim());
        });
        setNameTouched(touchedMap);
    }, [value]);

    const updateValue = (nextModels: ExtraModelPool[]) => {
        setModels(nextModels);
        onChange(item.key, JSON.stringify(nextModels));
    };

    const maybeAutofillName = (nextModels: ExtraModelPool[], modelIndex: number) => {
        const touched = nameTouched[modelIndex];
        if (touched) return nextModels;

        const next = [...nextModels];
        const pool = next[modelIndex];
        if (!pool) return next;
        next[modelIndex] = { ...pool, name: autoName(pool) };
        return next;
    };

    const updatePoolField = (index: number, field: keyof Omit<ExtraModelPool, 'endpoints'>, newVal: string) => {
        const nextModels = [...models];
        nextModels[index] = { ...nextModels[index], [field]: newVal };
        const withAutoName = maybeAutofillName(nextModels, index);
        updateValue(withAutoName);
    };

    const updateName = (index: number, newVal: string) => {
        const nextModels = [...models];
        nextModels[index] = { ...nextModels[index], name: newVal };
        setNameTouched((prev) => ({ ...prev, [index]: true }));
        updateValue(nextModels);
    };

    const updateEndpointField = (
        modelIndex: number,
        endpointIndex: number,
        field: keyof ExtraModelEndpoint,
        value: string | number | boolean | undefined
    ) => {
        const nextModels = [...models];
        const pool = nextModels[modelIndex];
        const endpoints = [...pool.endpoints];
        endpoints[endpointIndex] = { ...endpoints[endpointIndex], [field]: value };
        nextModels[modelIndex] = { ...pool, endpoints };
        const withAutoName = maybeAutofillName(nextModels, modelIndex);
        updateValue(withAutoName);
    };

    const addModel = () => {
        const nextModels = [
            ...models,
            {
                name: '',
                provider: 'openai',
                model: '',
                endpoints: [{
                    id: buildEndpointId(),
                    api_key: '',
                    base_url: '',
                    priority: 0,
                    enabled: true,
                    verify_ssl: true,
                }],
            },
        ];
        const idx = nextModels.length - 1;
        setNameTouched((prev) => ({ ...prev, [idx]: false }));
        updateValue(maybeAutofillName(nextModels, idx));
    };

    const removeModel = (index: number) => {
        const nextModels = models.filter((_, i) => i !== index);
        const nextTouched: Record<number, boolean> = {};
        nextModels.forEach((_, i) => {
            nextTouched[i] = i < index ? nameTouched[i] ?? false : nameTouched[i + 1] ?? false;
        });
        setNameTouched(nextTouched);
        updateValue(nextModels);
    };

    const addEndpoint = (modelIndex: number) => {
        const nextModels = [...models];
        const pool = nextModels[modelIndex];
        nextModels[modelIndex] = {
            ...pool,
            endpoints: [
                ...pool.endpoints,
                {
                    id: buildEndpointId(),
                    api_key: '',
                    base_url: '',
                    priority: 0,
                    enabled: true,
                    verify_ssl: true,
                },
            ],
        };
        updateValue(maybeAutofillName(nextModels, modelIndex));
    };

    const copyEndpoint = (modelIndex: number, endpointIndex: number) => {
        const nextModels = [...models];
        const pool = nextModels[modelIndex];
        const source = pool.endpoints[endpointIndex];
        nextModels[modelIndex] = {
            ...pool,
            endpoints: [
                ...pool.endpoints,
                { ...source, id: buildEndpointId() },
            ],
        };
        updateValue(nextModels);
    };

    const removeEndpoint = (modelIndex: number, endpointIndex: number) => {
        const nextModels = [...models];
        const pool = nextModels[modelIndex];
        const endpoints = pool.endpoints.filter((_, idx) => idx !== endpointIndex);
        nextModels[modelIndex] = {
            ...pool,
            endpoints: endpoints.length > 0 ? endpoints : [{
                id: buildEndpointId(),
                api_key: '',
                base_url: '',
                priority: 0,
                enabled: true,
                verify_ssl: true,
            }],
        };
        updateValue(maybeAutofillName(nextModels, modelIndex));
    };

    const modelKey = (modelIndex: number, endpointIndex: number) => `${modelIndex}-${endpointIndex}`;

    const handleFetchModels = async (modelIndex: number, endpointIndex: number) => {
        const endpoint = models[modelIndex]?.endpoints?.[endpointIndex];
        if (!endpoint?.api_key) return;

        const key = modelKey(modelIndex, endpointIndex);
        setFetchingKey(key);
        setFetchErrorByKey((prev) => ({ ...prev, [key]: '' }));
        try {
            const discovered = await fetchProviderModels(endpoint.api_key, endpoint.base_url);
            if (discovered.length > 0) {
                setDiscoveredModelsByKey((prev) => ({ ...prev, [key]: discovered }));
            } else {
                setFetchErrorByKey((prev) => ({ ...prev, [key]: '未找到可用模型，请检查配置' }));
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '获取模型列表失败';
            setFetchErrorByKey((prev) => ({ ...prev, [key]: message }));
        } finally {
            setFetchingKey(null);
        }
    };

    const selectDiscoveredModel = (modelIndex: number, selectedModel: string) => {
        const nextModels = [...models];
        nextModels[modelIndex] = { ...nextModels[modelIndex], model: selectedModel };
        if (!nameTouched[modelIndex]) {
            nextModels[modelIndex] = { ...nextModels[modelIndex], name: selectedModel };
        }
        updateValue(nextModels);
    };

    return (
        <div className="space-y-4">
            {models.map((model, modelIndex) => (
                <div key={modelIndex} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-4 shadow-sm">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-700/50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                                {modelIndex + 1}
                            </div>
                            <h4 className="text-sm font-semibold text-slate-200">逻辑模型配置</h4>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeModel(modelIndex)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            disabled={disabled}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            删除模型
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">配置名称</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                value={model.name}
                                onChange={(e) => updateName(modelIndex, e.target.value)}
                                placeholder="留空时自动命名"
                                disabled={disabled}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">提供商</label>
                            <Select
                                value={model.provider}
                                onChange={(val) => updatePoolField(modelIndex, 'provider', val)}
                                options={[
                                    { value: 'openai', label: 'OpenAI Compatible' },
                                    { value: 'gemini', label: 'Gemini' },
                                ]}
                                disabled={disabled}
                                placeholder="选择提供商"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">模型 ID</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                value={model.model}
                                onChange={(e) => updatePoolField(modelIndex, 'model', e.target.value)}
                                placeholder="例如: gpt-4o"
                                disabled={disabled}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        {model.endpoints.map((endpoint, endpointIndex) => {
                            const key = modelKey(modelIndex, endpointIndex);
                            return (
                                <div key={endpoint.id} className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4 space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-700/30">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded bg-slate-700/50 flex items-center justify-center text-xs text-slate-400">
                                                {endpointIndex + 1}
                                            </div>
                                            <h5 className="text-xs font-medium text-slate-300">Endpoint</h5>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-md transition-colors"
                                                onClick={() => copyEndpoint(modelIndex, endpointIndex)}
                                                disabled={disabled}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                                </svg>
                                                复制
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
                                                onClick={() => removeEndpoint(modelIndex, endpointIndex)}
                                                disabled={disabled}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="3 6 5 6 21 6"/>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                                </svg>
                                                删除
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">ID</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                                value={endpoint.id}
                                                onChange={(e) => updateEndpointField(modelIndex, endpointIndex, 'id', e.target.value)}
                                                placeholder="ep-1"
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">优先级</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                                value={endpoint.priority}
                                                onChange={(e) => updateEndpointField(modelIndex, endpointIndex, 'priority', Number(e.target.value || 0))}
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">启用状态</label>
                                            <Select
                                                value={endpoint.enabled ? 'true' : 'false'}
                                                onChange={(val) => updateEndpointField(modelIndex, endpointIndex, 'enabled', val === 'true')}
                                                options={[{ value: 'true', label: '启用' }, { value: 'false', label: '禁用' }]}
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">SSL 验证</label>
                                            <Select
                                                value={endpoint.verify_ssl ? 'true' : 'false'}
                                                onChange={(val) => updateEndpointField(modelIndex, endpointIndex, 'verify_ssl', val === 'true')}
                                                options={[{ value: 'true', label: '开启' }, { value: 'false', label: '关闭' }]}
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">API Key</label>
                                            <input
                                                type="password"
                                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                                value={endpoint.api_key}
                                                onChange={(e) => updateEndpointField(modelIndex, endpointIndex, 'api_key', e.target.value)}
                                                placeholder="sk-..."
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Base URL</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                                value={endpoint.base_url}
                                                onChange={(e) => updateEndpointField(modelIndex, endpointIndex, 'base_url', e.target.value)}
                                                placeholder="https://api.example.com/v1"
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Temperature</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                max="2"
                                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                                value={endpoint.temperature ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    updateEndpointField(modelIndex, endpointIndex, 'temperature', v === '' ? undefined : Number(v));
                                                }}
                                                placeholder="0.7"
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 block">模型发现</label>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={disabled || fetchingKey === key || !endpoint.api_key}
                                                onClick={() => handleFetchModels(modelIndex, endpointIndex)}
                                            >
                                                {fetchingKey === key ? (
                                                    <>
                                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                                        </svg>
                                                        获取中...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <polyline points="23 4 23 10 17 10"/>
                                                            <polyline points="1 20 1 14 7 14"/>
                                                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                                                        </svg>
                                                        获取列表
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* 发现的模型列表 */}
                                    {discoveredModelsByKey[key]?.length > 0 && (
                                        <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/30">
                                            <div className="text-xs font-medium text-slate-400 mb-2">发现可用模型：</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {discoveredModelsByKey[key].map((m) => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${model.model === m
                                                            ? 'bg-indigo-500 text-white shadow-sm'
                                                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                                                            }`}
                                                        onClick={() => selectDiscoveredModel(modelIndex, m)}
                                                        disabled={disabled}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 错误提示 */}
                                    {fetchErrorByKey[key] && (
                                        <div className="mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                                            <div className="flex items-start gap-2">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 flex-shrink-0 mt-0.5">
                                                    <circle cx="12" cy="12" r="10"/>
                                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                                </svg>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-red-400 mb-0.5">获取失败</div>
                                                    <div className="text-xs text-red-300/80 break-words">{fetchErrorByKey[key]}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleFetchModels(modelIndex, endpointIndex)}
                                                    className="text-xs text-red-400 hover:text-red-300 underline flex-shrink-0"
                                                >
                                                    重试
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <button
                            type="button"
                            onClick={() => addEndpoint(modelIndex)}
                            className="w-full rounded-lg border-2 border-dashed border-slate-700/50 p-3 text-xs font-medium text-slate-400 hover:border-slate-600 hover:text-slate-300 hover:bg-slate-800/50 transition-all"
                            disabled={disabled}
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                                添加 Endpoint
                            </span>
                        </button>
                    </div>
                </div>
            ))}

            <button
                type="button"
                onClick={addModel}
                className="w-full rounded-xl border-2 border-dashed border-slate-700/50 p-4 text-sm font-medium text-slate-400 hover:border-indigo-500/50 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all"
                disabled={disabled}
            >
                <span className="inline-flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </div>
                    添加逻辑模型
                </span>
            </button>
        </div>
    );
};
