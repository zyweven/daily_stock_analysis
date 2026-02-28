import React, { useState, useEffect } from 'react';
import './ExpertPanelPage.css';
import { expertPanelApi } from '../api/expertPanel';
import type { ModelInfo, ExpertPanelResponse, EndpointInfo } from '../api/expertPanel';
import { ExpertPanelReportView } from '../components/expert-panel/ExpertPanelReportView';
import { GlobalStockSelector } from '../components/stock/GlobalStockSelector';

// ============ 子组件 ============

/** 空状态提示 */
const EmptyState: React.FC = () => (
    <div className="ep-state-empty">
        <div className="ep-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2v4m0 12v4m-4-8H4m16 0h-4M5.6 5.6l2.8 2.8m8 8l2.8 2.8M5.6 18.4l2.8-2.8m8-8l2.8-2.8" strokeLinecap="round"/>
            </svg>
        </div>
        <h3 className="ep-state-title">开始专家会诊</h3>
        <p className="ep-state-desc">
            选择股票代码和 AI 模型，获取多维度专业分析
        </p>
    </div>
);

/** 错误状态 */
const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
    <div className="ep-state-error">
        <div className="ep-state-icon ep-state-icon--error">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        </div>
        <div className="ep-state-content">
            <h3 className="ep-state-title">分析出错</h3>
            <p className="ep-state-desc">{message}</p>
        </div>
        {onRetry && (
            <button className="ep-btn ep-btn--secondary" onClick={onRetry}>
                重试
            </button>
        )}
    </div>
);

/** 加载状态 */
const LoadingState: React.FC = () => (
    <div className="ep-state-loading">
        <div className="ep-loading-animation">
            <div className="ep-loading-ring" />
            <div className="ep-loading-ring" />
            <div className="ep-loading-ring" />
        </div>
        <h3 className="ep-state-title">正在分析中</h3>
        <p className="ep-state-desc">多模型并行会诊，请稍候...</p>
        <div className="ep-loading-progress">
            <div className="ep-loading-bar" />
        </div>
    </div>
);

/** Endpoint 标签 */
const EndpointTag: React.FC<{ endpoint: EndpointInfo }> = ({ endpoint }) => (
    <span
        className={`ep-endpoint-tag ${endpoint.enabled ? '' : 'is-disabled'}`}
        title={endpoint.enabled ? `渠道: ${endpoint.label || endpoint.id}` : '已禁用'}
    >
        <span className={`ep-endpoint-dot ${endpoint.enabled ? 'is-active' : ''}`} />
        {endpoint.label || endpoint.id}
    </span>
);

/** 模型选择卡片 */
const ModelSelector: React.FC<{
    models: ModelInfo[];
    selected: string[];
    onToggle: (name: string) => void;
    maxModels: number;
}> = ({ models, selected, onToggle, maxModels }) => {
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

    if (models.length === 0) {
        return (
            <div className="ep-model-empty">
                <div className="ep-model-empty-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 15v-2m0-6v4" strokeLinecap="round"/>
                    </svg>
                </div>
                <p className="ep-model-empty-text">
                    暂未配置任何 AI 模型
                </p>
                <a href="/settings" className="ep-link">
                    前往设置页面配置
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </a>
            </div>
        );
    }

    const toggleExpand = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedModels(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    return (
        <div className="ep-model-selector">
            <div className="ep-model-header">
                <h3 className="ep-section-title">选择分析模型</h3>
                <div className="ep-model-counter">
                    <span className={`ep-counter-badge ${selected.length >= maxModels ? 'is-limit' : ''}`}>
                        {selected.length}/{maxModels}
                    </span>
                    {selected.length >= maxModels && (
                        <span className="ep-limit-hint">已达上限</span>
                    )}
                </div>
            </div>
            <div className="ep-model-grid">
                {models.map((m) => {
                    const isChecked = selected.includes(m.name);
                    const isDisabled = !isChecked && selected.length >= maxModels;
                    const isExpanded = expandedModels.has(m.name);
                    const hasMultipleEndpoints = (m.endpointCount || 0) > 1;
                    const enabledCount = m.enabledEndpointCount || 0;

                    return (
                        <div
                            key={m.name}
                            className={`ep-model-card ${isChecked ? 'is-active' : ''} ${isDisabled ? 'is-disabled' : ''} ${isExpanded ? 'is-expanded' : ''}`}
                        >
                            <div
                                className="ep-model-card__main"
                                onClick={() => !isDisabled && onToggle(m.name)}
                                role="checkbox"
                                aria-checked={isChecked}
                                aria-disabled={isDisabled}
                                tabIndex={isDisabled ? -1 : 0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        !isDisabled && onToggle(m.name);
                                    }
                                }}
                            >
                                <div className="ep-model-card__check">
                                    <div className="ep-check-indicator">
                                        {isChecked && (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                        )}
                                    </div>
                                </div>
                                <div className="ep-model-card__info">
                                    <div className="ep-model-card__name">{m.name}</div>
                                    <div className="ep-model-card__meta">
                                        <span className="ep-model-card__provider">{m.provider}</span>
                                        {hasMultipleEndpoints ? (
                                            <button
                                                className="ep-endpoints-toggle"
                                                onClick={(e) => toggleExpand(m.name, e)}
                                                title="查看渠道详情"
                                            >
                                                <span className="ep-endpoint-dot" />
                                                {enabledCount} 个渠道
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    className={isExpanded ? 'is-expanded' : ''}
                                                >
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </button>
                                        ) : (
                                            <span className="ep-model-card__endpoints">
                                                <span className="ep-endpoint-dot is-active" />
                                                {enabledCount > 0 ? '1 个渠道' : '无可用渠道'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 展开的 Endpoint 列表 */}
                            {isExpanded && m.endpoints && m.endpoints.length > 0 && (
                                <div className="ep-model-card__endpoints-list">
                                    {m.endpoints.map((ep) => (
                                        <div key={ep.id} className="ep-endpoint-item">
                                            <EndpointTag endpoint={ep} />
                                            <span className="ep-endpoint-priority">优先级: {ep.priority}</span>
                                        </div>
                                    ))}
                                    <p className="ep-endpoints-hint">
                                        系统将自动选择优先级最高的可用渠道
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/** API 连接状态徽章 */
const ApiStatusBadge: React.FC<{ status: ApiStatus; errorMsg?: string | null }> = ({ status, errorMsg }) => {
    const config = {
        loading: { text: '连接中...', type: 'loading', icon: 'spinner' },
        connected: { text: '服务正常', type: 'success', icon: 'check' },
        error: { text: errorMsg || '连接失败', type: 'error', icon: 'error' },
    } as const;

    const c = config[status];

    return (
        <div className={`ep-api-status ep-api-status--${c.type}`} title={errorMsg || undefined}>
            {c.icon === 'spinner' && <span className="ep-api-spinner" />}
            {c.icon === 'check' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            )}
            {c.icon === 'error' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            )}
            <span className="ep-api-status__text">{c.text}</span>
        </div>
    );
};

/** 顶部 Hero 区域 */
const HeroSection: React.FC<{
    selectedModelsCount: number;
    stockCode: string;
    apiStatus: ApiStatus;
    apiError: string | null;
}> = ({ selectedModelsCount, stockCode, apiStatus, apiError }) => {
    const getStatus = () => {
        if (apiStatus === 'error') return { text: '服务异常', type: 'error' as const };
        if (apiStatus === 'loading') return { text: '初始化中...', type: 'pending' as const };
        if (!stockCode && selectedModelsCount === 0) return { text: '请设置股票和模型', type: 'pending' as const };
        if (!stockCode) return { text: '请输入股票代码', type: 'pending' as const };
        if (selectedModelsCount === 0) return { text: '请选择分析模型', type: 'pending' as const };
        return { text: '准备就绪', type: 'ready' as const };
    };

    const status = getStatus();

    return (
        <header className="ep-hero">
            <div className="ep-hero__main">
                <div className="ep-hero__icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                </div>
                <div className="ep-hero__text">
                    <h1 className="ep-hero__title">专家会诊</h1>
                    <p className="ep-hero__subtitle">
                        多 AI 模型并行分析，对比不同模型观点，形成共识结论
                    </p>
                </div>
            </div>
            <div className="ep-hero__badges">
                <ApiStatusBadge status={apiStatus} errorMsg={apiError} />
                <div className={`ep-hero__status ep-hero__status--${status.type}`}>
                    <span className="ep-status-dot" />
                    {status.text}
                </div>
            </div>
        </header>
    );
};

// ============ 主页面 ============

type ApiStatus = 'loading' | 'connected' | 'error';

const ExpertPanelPage: React.FC = () => {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [maxModels, setMaxModels] = useState(5);
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [stockCode, setStockCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ExpertPanelResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
    const [apiError, setApiError] = useState<string | null>(null);

    // 加载可用模型列表
    const loadModels = async () => {
        setApiStatus('loading');
        setApiError(null);

        try {
            // 展开获取 endpoint 详情
            const res = await expertPanelApi.getModels(true);
            setModels(res.models);
            setMaxModels(res.maxModels);
            setSelectedModels(res.models.map((m) => m.name));
            setApiStatus('connected');
        } catch (err: unknown) {
            console.error('加载模型列表失败', err);
            setApiStatus('error');

            // 解析错误信息
            let errorMsg = '无法连接到服务器';
            if (err && typeof err === 'object') {
                if ('code' in err && err.code === 'ECONNABORTED') {
                    errorMsg = '连接超时，请检查网络';
                } else if ('message' in err && typeof err.message === 'string') {
                    if (err.message.includes('Network Error')) {
                        errorMsg = '网络错误，请检查服务器是否运行';
                    } else {
                        errorMsg = err.message;
                    }
                }
            }
            setApiError(errorMsg);
        }
    };

    useEffect(() => {
        loadModels();
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

    const canAnalyze = stockCode.trim() && selectedModels.length > 0 && !loading && apiStatus === 'connected';
    const showEmptyState = !loading && !error && !result;

    return (
        <div className="ep-page">
            {/* 1. Hero 区域 */}
            <HeroSection
                selectedModelsCount={selectedModels.length}
                stockCode={stockCode}
                apiStatus={apiStatus}
                apiError={apiError}
            />

            {/* 2. 输入与模型选择区 */}
            <section className="ep-controls">
                <div className="ep-controls__card">
                    {/* API 错误提示 */}
                    {apiStatus === 'error' && (
                        <div className="ep-api-error-banner">
                            <div className="ep-api-error__icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <div className="ep-api-error__content">
                                <div className="ep-api-error__title">无法连接到服务</div>
                                <div className="ep-api-error__desc">{apiError}</div>
                            </div>
                            <button
                                className="ep-btn ep-btn--secondary ep-btn--sm"
                                onClick={loadModels}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <polyline points="1 20 1 14 7 14"/>
                                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                                </svg>
                                重试连接
                            </button>
                        </div>
                    )}

                    {/* 股票输入 */}
                    <div className={`ep-input-section ${apiStatus !== 'connected' ? 'is-disabled' : ''}`}>
                        <label className="ep-input-label">
                            股票代码
                            <span className="ep-input-required">*</span>
                        </label>
                        <div className="ep-input-group">
                            <GlobalStockSelector
                                value={stockCode}
                                onChange={(code) => setStockCode(code)}
                                placeholder={apiStatus === 'connected' ? "输入股票代码（如 600519）" : "请先修复连接问题"}
                                className="ep-stock-selector"
                            />
                            <button
                                className="ep-btn ep-btn--primary"
                                onClick={handleAnalyze}
                                disabled={!canAnalyze}
                                aria-label="开始专家会诊分析"
                            >
                                {loading ? (
                                    <>
                                        <span className="ep-btn-spinner" />
                                        分析中...
                                    </>
                                ) : (
                                    <>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polygon points="5 3 19 12 5 21 5 3"/>
                                        </svg>
                                        开始会诊
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* 分隔线 */}
                    <div className="ep-divider" />

                    {/* 模型选择 */}
                    <ModelSelector
                        models={models}
                        selected={selectedModels}
                        onToggle={toggleModel}
                        maxModels={maxModels}
                    />
                </div>
            </section>

            {/* 3. 状态区 */}
            <section className="ep-state">
                {error && (
                    <ErrorState
                        message={error}
                        onRetry={canAnalyze ? handleAnalyze : undefined}
                    />
                )}
                {loading && <LoadingState />}
                {showEmptyState && apiStatus === 'connected' && <EmptyState />}
            </section>

            {/* 4. 结果区 */}
            {result && (
                <section className="ep-results">
                    <ExpertPanelReportView result={result} />
                </section>
            )}
        </div>
    );
};

export default ExpertPanelPage;
