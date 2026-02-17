import React, { useState, useEffect } from 'react';
import { Select } from '../common';
import { useSystemConfig } from '../../hooks';
import type { SystemConfigItem } from '../../types/systemConfig';

interface ExtraModel {
    name: string;
    provider: string;
    api_key: string;
    base_url: string;
    model: string;
}

interface ExtraModelsEditorProps {
    item: SystemConfigItem;
    value: string;
    onChange: (key: string, value: string) => void;
    disabled?: boolean;
}

export const ExtraModelsEditor: React.FC<ExtraModelsEditorProps> = ({
    item,
    value,
    onChange,
    disabled = false,
}) => {
    const [models, setModels] = useState<ExtraModel[]>([]);
    const { fetchModels: fetchProviderModels } = useSystemConfig();
    const [fetchingIndex, setFetchingIndex] = useState<number | null>(null);
    const [discoveredModelsByIndex, setDiscoveredModelsByIndex] = useState<Record<number, string[]>>({});

    useEffect(() => {
        try {
            const parsed = JSON.parse(value || '[]');
            if (Array.isArray(parsed)) {
                setModels(parsed);
            }
        } catch (e) {
            // Handle invalid JSON gracefully
            console.error('Failed to parse EXTRA_AI_MODELS', e);
            setModels([]);
        }
    }, [value]);

    const updateModel = (index: number, field: keyof ExtraModel, newVal: string) => {
        const newModels = [...models];
        newModels[index] = { ...newModels[index], [field]: newVal };
        updateValue(newModels);
    };

    const addModel = () => {
        const newModels = [
            ...models,
            { name: '', provider: 'openai', api_key: '', base_url: '', model: '' },
        ];
        updateValue(newModels);
    };

    const removeModel = (index: number) => {
        const newModels = models.filter((_, i) => i !== index);
        updateValue(newModels);
    };

    const updateValue = (newModels: ExtraModel[]) => {
        setModels(newModels);
        onChange(item.key, JSON.stringify(newModels));
    };

    const handleFetchModels = async (index: number) => {
        const model = models[index];
        if (!model.api_key) return;

        setFetchingIndex(index);
        try {
            const discovered = await fetchProviderModels(model.api_key, model.base_url);
            if (discovered.length > 0) {
                setDiscoveredModelsByIndex(prev => ({ ...prev, [index]: discovered }));
            }
        } finally {
            setFetchingIndex(null);
        }
    };

    return (
        <div className="space-y-4">
            {models.map((model, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium text-white">模型配置 #{index + 1}</h4>
                        <button
                            type="button"
                            onClick={() => removeModel(index)}
                            className="text-xs text-red-400 hover:text-red-300"
                            disabled={disabled}
                        >
                            删除
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-secondary mb-1 block">配置名称 (Name)</label>
                            <input
                                type="text"
                                className="input-terminal w-full text-xs"
                                value={model.name}
                                onChange={(e) => updateModel(index, 'name', e.target.value)}
                                placeholder="e.g. DeepSeek-V3"
                                disabled={disabled}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-secondary mb-1 block">提供商 (Provider)</label>
                            <Select
                                value={model.provider}
                                onChange={(val) => updateModel(index, 'provider', val)}
                                options={[{ value: 'openai', label: 'OpenAI Compatible' }]}
                                disabled={disabled}
                                placeholder="Select Provider"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-secondary mb-1 block">API Key</label>
                            <input
                                type="password"
                                className="input-terminal w-full text-xs"
                                value={model.api_key}
                                onChange={(e) => updateModel(index, 'api_key', e.target.value)}
                                placeholder="sk-..."
                                disabled={disabled}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-secondary mb-1 block">Base URL</label>
                            <input
                                type="text"
                                className="input-terminal w-full text-xs"
                                value={model.base_url}
                                onChange={(e) => updateModel(index, 'base_url', e.target.value)}
                                placeholder="https://api.example.com/v1"
                                disabled={disabled}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-secondary mb-1 block">模型 ID (Model)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="input-terminal flex-1 text-xs"
                                    value={model.model}
                                    onChange={(e) => updateModel(index, 'model', e.target.value)}
                                    placeholder="e.g. gpt-4o"
                                    disabled={disabled}
                                />
                                <button
                                    type="button"
                                    className="btn-secondary !px-2 !py-1 text-xs whitespace-nowrap"
                                    disabled={disabled || fetchingIndex === index}
                                    onClick={() => handleFetchModels(index)}
                                >
                                    {fetchingIndex === index ? '...' : '获取列表'}
                                </button>
                            </div>
                            {/* Discovered models tags */}
                            {discoveredModelsByIndex[index]?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {discoveredModelsByIndex[index].map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            className={`rounded px-1.5 py-0.5 text-[10px] transition ${model.model === m
                                                ? 'bg-cyan text-black'
                                                : 'bg-white/5 text-secondary hover:bg-white/12 hover:text-white'
                                                }`}
                                            onClick={() => updateModel(index, 'model', m)}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            <button
                type="button"
                onClick={addModel}
                className="w-full rounded-lg border border-dashed border-white/20 p-2 text-sm text-secondary hover:border-white/40 hover:text-white transition"
                disabled={disabled}
            >
                + 添加新模型配置
            </button>
        </div>
    );
};
