import React, { useState, useEffect } from 'react';
import './ExpertPanelPage.css';
import { expertPanelApi } from '../api/expertPanel';
import type { ModelInfo, ExpertPanelResponse } from '../api/expertPanel';
import { ExpertPanelReportView } from '../components/expert-panel/ExpertPanelReportView';

// ============ 子组件 ============

/** 模型选择勾选框 */
const ModelSelector: React.FC<{
    models: ModelInfo[];
    selected: string[];
    onToggle: (name: string) => void;
    maxModels: number;
}> = ({ models, selected, onToggle, maxModels }) => (
    <div className="ep-model-selector">
        <h3 className="ep-section-title">选择分析模型（最多 {maxModels} 个）</h3>
        <div className="ep-model-grid">
            {models.map((m) => {
                const isChecked = selected.includes(m.name);
                const isDisabled = !isChecked && selected.length >= maxModels;
                return (
                    <label
                        key={m.name}
                        className={`ep-model-chip ${isChecked ? 'is-active' : ''} ${isDisabled ? 'is-disabled' : ''}`}
                    >
                        <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => onToggle(m.name)}
                        />
                        <span className="ep-chip-name">{m.name}</span>
                        <span className="ep-chip-provider">{m.provider}</span>
                    </label>
                );
            })}
        </div>
        {models.length === 0 && (
            <p className="ep-empty-hint">
                暂未配置任何 AI 模型，请前往<a href="/settings">设置页面</a>配置 API Key。
            </p>
        )}
    </div>
);



// ============ 主页面 ============

const ExpertPanelPage: React.FC = () => {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [maxModels, setMaxModels] = useState(5);
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [stockCode, setStockCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ExpertPanelResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 加载可用模型列表
    useEffect(() => {
        expertPanelApi
            .getModels()
            .then((res) => {
                setModels(res.models);
                setMaxModels(res.maxModels);
                setSelectedModels(res.models.map((m) => m.name)); // 默认全选
            })
            .catch((err) => {
                console.error('加载模型列表失败', err);
            });
    }, []);

    const toggleModel = (name: string) => {
        setSelectedModels((prev) =>
            prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
        );
    };

    const handleAnalyze = async () => {
        if (!stockCode.trim()) {
            setError('请输入股票代码');
            return;
        }
        if (selectedModels.length === 0) {
            setError('请至少选择一个分析模型');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await expertPanelApi.analyze({
                stockCode: stockCode.trim(),
                models: selectedModels,
            });
            setResult(res);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '分析请求失败';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ep-page">
            <header className="ep-header">
                <h1 className="ep-title">🩺 专家会诊</h1>
                <p className="ep-subtitle">多 AI 模型并行分析，对比不同模型观点，形成共识结论</p>
            </header>

            {/* 输入区域 */}
            <div className="ep-input-area">
                <div className="ep-stock-input">
                    <input
                        id="ep-stock-code"
                        type="text"
                        placeholder="输入股票代码（如 600519）"
                        value={stockCode}
                        onChange={(e) => setStockCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !loading && handleAnalyze()}
                        disabled={loading}
                    />
                    <button
                        className="ep-analyze-btn"
                        onClick={handleAnalyze}
                        disabled={loading || selectedModels.length === 0}
                    >
                        {loading ? (
                            <span className="ep-spinner" />
                        ) : (
                            '开始会诊'
                        )}
                    </button>
                </div>

                <ModelSelector
                    models={models}
                    selected={selectedModels}
                    onToggle={toggleModel}
                    maxModels={maxModels}
                />
            </div>

            {/* 错误提示 */}
            {error && <div className="ep-error">{error}</div>}

            {/* 加载状态 */}
            {loading && (
                <div className="ep-loading">
                    <div className="ep-loading-spinner" />
                    <p>正在执行专家会诊，请稍候（通常需要 30-120 秒）...</p>
                </div>
            )}

            {/* 结果展示 */}
            {result && (
                <ExpertPanelReportView result={result} />
            )}
        </div>
    );
};

export default ExpertPanelPage;
