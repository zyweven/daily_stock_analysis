import React, { useState, useMemo } from 'react';
import type { ExpertPanelResponse, ModelResultItem } from '../../api/expertPanel';
import { stockApi } from '../../api/stocks';
import '../../pages/ExpertPanelPage.css';
import { ReportStrategy } from '../report/ReportStrategy';

// ============ Helper Functions ============

function getScoreClass(score: number | null): string {
    if (score === null) return '';
    if (score >= 70) return 'ep-score-high';
    if (score >= 40) return 'ep-score-mid';
    return 'ep-score-low';
}

function getScoreColor(score: number | null): string {
    if (score === null) return '#64748b';
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
}

function formatAdviceClass(advice: string | null): string {
    if (!advice) return '';
    const normalized = advice.replace(/\s/g, '');
    if (['买入', '加仓', '强烈推荐'].includes(normalized)) return 'ep-advice-买入';
    if (['卖出', '减仓', '减持'].includes(normalized)) return 'ep-advice-卖出';
    if (['持有', '观望', '中性'].includes(normalized)) return 'ep-advice-持有';
    return '';
}

function formatConfidence(confidence: string | null): string {
    if (!confidence) return '--';
    const normalized = confidence.toLowerCase();
    if (normalized.includes('high') || normalized.includes('高')) return '高';
    if (normalized.includes('medium') || normalized.includes('中')) return '中';
    if (normalized.includes('low') || normalized.includes('低')) return '低';
    return confidence;
}

// ============ Metrics Bar 组件 ============

interface MetricsBarProps {
    results: ModelResultItem[];
}

const MetricsBar: React.FC<MetricsBarProps> = ({ results }) => {
    const metrics = useMemo(() => {
        const total = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = total - successful;
        const avgTime = results.length > 0
            ? results.reduce((sum, r) => sum + (r.elapsedSeconds || 0), 0) / results.length
            : 0;

        return { total, successful, failed, avgTime };
    }, [results]);

    return (
        <div className="ep-metrics-bar">
            <div className="ep-metric">
                <span className="ep-metric__value" style={{ color: '#10b981' }}>
                    {metrics.successful}
                </span>
                <span className="ep-metric__label">成功模型</span>
            </div>
            <div className="ep-metric">
                <span className="ep-metric__value" style={{ color: metrics.failed > 0 ? '#ef4444' : '#94a3b8' }}>
                    {metrics.failed}
                </span>
                <span className="ep-metric__label">失败</span>
            </div>
            <div className="ep-metric">
                <span className="ep-metric__value">
                    {metrics.avgTime.toFixed(1)}s
                </span>
                <span className="ep-metric__label">平均耗时</span>
            </div>
        </div>
    );
};

// ============ Consensus Summary Card ============

interface ConsensusCardProps {
    result: ExpertPanelResponse;
}

export const ConsensusCard: React.FC<ConsensusCardProps> = ({ result }) => {
    const scoreColor = getScoreColor(result.consensusScore);
    const [addingToWatchlist, setAddingToWatchlist] = useState(false);
    const [watchlistStatus, setWatchlistStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [watchlistMessage, setWatchlistMessage] = useState('');

    const handleAddToWatchlist = async () => {
        if (!result.stockCode) return;

        setAddingToWatchlist(true);
        setWatchlistStatus('idle');
        setWatchlistMessage('');

        try {
            await stockApi.add({
                code: result.stockCode,
                name: result.stockName || undefined,
                remark: `AI评分: ${result.consensusScore ?? '--'}, 建议: ${result.consensusAdvice ?? '未知'}`,
            });
            setWatchlistStatus('success');
            setWatchlistMessage('已添加到自选股');
            setTimeout(() => setWatchlistStatus('idle'), 3000);
        } catch (err: unknown) {
            setWatchlistStatus('error');
            const message = err instanceof Error ? err.message : '添加失败';
            setWatchlistMessage(message.includes('已存在') ? '该股票已在自选股中' : message);
        } finally {
            setAddingToWatchlist(false);
        }
    };

    return (
        <div className="ep-consensus-card">
            <div className="ep-consensus-header">
                <div
                    className="ep-consensus-score"
                    style={{ borderColor: scoreColor }}
                    role="img"
                    aria-label={`共识评分 ${result.consensusScore ?? '未知'}`}
                >
                    <span className="ep-score-value" style={{ color: scoreColor }}>
                        {result.consensusScore ?? '--'}
                    </span>
                    <span className="ep-score-label">共识评分</span>
                </div>
                <div className="ep-consensus-info">
                    <div className="flex items-start justify-between gap-4">
                        <h3 className="ep-stock-title">
                            {result.stockName || '未知股票'} ({result.stockCode})
                        </h3>
                        {/* 添加到自选股按钮 */}
                        <div className="flex flex-col items-end gap-2">
                            <button
                                onClick={handleAddToWatchlist}
                                disabled={addingToWatchlist || watchlistStatus === 'success'}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    watchlistStatus === 'success'
                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        : watchlistStatus === 'error'
                                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                        : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20'
                                }`}
                            >
                                {addingToWatchlist ? (
                                    <>
                                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        添加中...
                                    </>
                                ) : watchlistStatus === 'success' ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        已添加
                                    </>
                                ) : (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                        加入自选
                                    </>
                                )}
                            </button>
                            {watchlistStatus === 'error' && watchlistMessage && (
                                <span className="text-xs text-red-400">{watchlistMessage}</span>
                            )}
                        </div>
                    </div>
                    <div className="ep-consensus-advice">
                        <span className={`ep-advice-badge ${formatAdviceClass(result.consensusAdvice)}`}>
                            {result.consensusAdvice || '未知'}
                        </span>
                    </div>
                    <p className="ep-consensus-summary">
                        {result.consensusSummary || '暂无共识摘要'}
                    </p>
                </div>
            </div>
            {/* Consensus Strategy */}
            {result.consensusStrategy && (
                <div className="ep-consensus-strategy">
                    <div className="mb-3">
                        <span className="text-xs uppercase tracking-wider text-secondary font-semibold">
                            共识策略
                        </span>
                    </div>
                    <ReportStrategy strategy={result.consensusStrategy} />
                </div>
            )}
        </div>
    );
};

// ============ Comparison Table ============

interface ComparisonTableProps {
    results: ModelResultItem[];
    showOnlySuccess?: boolean;
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
    results,
    showOnlySuccess = false
}) => {
    const [onlySuccess, setOnlySuccess] = useState(showOnlySuccess);

    const displayResults = useMemo(() => {
        return onlySuccess ? results.filter(r => r.success) : results;
    }, [results, onlySuccess]);

    const hasFailed = results.some(r => !r.success);

    return (
        <div className="ep-comparison">
            <div className="ep-comparison-header">
                <h3 className="ep-section-title">模型对比</h3>
                {hasFailed && (
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-secondary hover:text-primary transition-colors">
                        <input
                            type="checkbox"
                            checked={onlySuccess}
                            onChange={(e) => setOnlySuccess(e.target.checked)}
                            className="rounded border-border bg-surface-input text-accent focus:ring-accent"
                        />
                        仅看成功模型
                    </label>
                )}
            </div>

            {/* 桌面端表格 */}
            <div className="ep-table-wrapper">
                <table className="ep-table">
                    <thead>
                        <tr>
                            <th>模型</th>
                            <th>评分</th>
                            <th>建议</th>
                            <th>趋势</th>
                            <th>置信度</th>
                            <th>耗时</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayResults.map((r) => (
                            <tr
                                key={r.modelName}
                                className={r.success ? '' : 'ep-row-error'}
                            >
                                <td className="ep-cell-model">
                                    {r.modelName}
                                </td>
                                <td>
                                    {r.success ? (
                                        <span className={`ep-score-pill ${getScoreClass(r.score)}`}>
                                            {r.score ?? '--'}
                                        </span>
                                    ) : (
                                        <span className="ep-score-pill">--</span>
                                    )}
                                </td>
                                <td>{r.advice || '--'}</td>
                                <td>{r.trend || '--'}</td>
                                <td>{formatConfidence(r.confidence)}</td>
                                <td>{r.elapsedSeconds?.toFixed(1) || '0.0'}s</td>
                                <td>
                                    {r.success ? (
                                        <span className="flex items-center gap-1" style={{ color: '#10b981' }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            成功
                                        </span>
                                    ) : (
                                        <span className="ep-error-text">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                            </svg>
                                            {r.error || '失败'}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 移动端卡片视图 */}
            <div className="ep-comparison-cards">
                {displayResults.map((r) => (
                    <div
                        key={r.modelName}
                        className={`ep-comparison-card ${!r.success ? 'opacity-60' : ''}`}
                    >
                        <div className="ep-comparison-card__header">
                            <span className="ep-comparison-card__model">{r.modelName}</span>
                            {r.success ? (
                                <span className={`ep-score-pill ${getScoreClass(r.score)}`}>
                                    {r.score ?? '--'}
                                </span>
                            ) : (
                                <span className="ep-score-pill" style={{ color: '#ef4444' }}>失败</span>
                            )}
                        </div>
                        <div className="ep-comparison-card__grid">
                            <div className="ep-comparison-card__item">
                                <span className="ep-comparison-card__label">建议</span>
                                <span className="ep-comparison-card__value">{r.advice || '--'}</span>
                            </div>
                            <div className="ep-comparison-card__item">
                                <span className="ep-comparison-card__label">趋势</span>
                                <span className="ep-comparison-card__value">{r.trend || '--'}</span>
                            </div>
                            <div className="ep-comparison-card__item">
                                <span className="ep-comparison-card__label">置信度</span>
                                <span className="ep-comparison-card__value">{formatConfidence(r.confidence)}</span>
                            </div>
                            <div className="ep-comparison-card__item">
                                <span className="ep-comparison-card__label">耗时</span>
                                <span className="ep-comparison-card__value">{r.elapsedSeconds?.toFixed(1) || '0.0'}s</span>
                            </div>
                        </div>
                        {!r.success && r.error && (
                            <div className="mt-2 text-xs text-red-400">
                                {r.error}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ============ Detail Tabs ============

interface DetailTabsProps {
    results: ModelResultItem[];
}

export const DetailTabs: React.FC<DetailTabsProps> = ({ results }) => {
    const [activeTab, setActiveTab] = useState(0);

    const successfulResults = useMemo(() => results.filter(r => r.success), [results]);

    if (successfulResults.length === 0) {
        return (
            <div className="ep-details">
                <div className="ep-detail-empty">
                    没有成功的模型结果可供查看
                </div>
            </div>
        );
    }

    // Ensure activeTab is valid
    const safeIndex = Math.min(activeTab, successfulResults.length - 1);
    const current = successfulResults[safeIndex];

    // Sync state if needed
    if (safeIndex !== activeTab) {
        setActiveTab(safeIndex);
    }

    return (
        <div className="ep-details">
            <div className="ep-details-header">
                <h3 className="ep-section-title">详细报告</h3>
            </div>

            <div className="ep-tabs" role="tablist">
                {successfulResults.map((r, idx) => (
                    <button
                        key={r.modelName}
                        role="tab"
                        aria-selected={idx === safeIndex}
                        aria-controls={`tab-panel-${r.modelName}`}
                        id={`tab-${r.modelName}`}
                        className={`ep-tab ${idx === safeIndex ? 'is-active' : ''}`}
                        onClick={() => setActiveTab(idx)}
                    >
                        {r.modelName}
                    </button>
                ))}
            </div>

            <div
                role="tabpanel"
                id={`tab-panel-${current.modelName}`}
                aria-labelledby={`tab-${current.modelName}`}
                className="ep-tab-content"
            >
                <div className="ep-detail-header">
                    <span className="ep-detail-model">{current.modelName}</span>
                    {current.score !== null && current.score !== undefined && (
                        <span className={`ep-score-pill ${getScoreClass(current.score)}`}>
                            评分: {current.score}
                        </span>
                    )}
                    {current.advice && (
                        <span className="ep-detail-advice">
                            建议: {current.advice}
                        </span>
                    )}
                </div>

                <div className="ep-detail-body">
                    {/* Strategy Points */}
                    {current.rawResult?.dashboard?.battle_plan?.sniper_points && (
                        <div className="mb-6">
                            <div className="mb-3">
                                <span className="text-xs uppercase tracking-wider text-secondary font-semibold">
                                    策略要点
                                </span>
                            </div>
                            <ReportStrategy
                                strategy={current.rawResult.dashboard.battle_plan.sniper_points}
                            />
                        </div>
                    )}

                    {/* Summary */}
                    {current.summary ? (
                        <div className="prose prose-invert max-w-none">
                            {current.summary.split('\n').map((paragraph, idx) => (
                                paragraph.trim() ? (
                                    <p key={idx} className="mb-4 last:mb-0">
                                        {paragraph}
                                    </p>
                                ) : null
                            ))}
                        </div>
                    ) : (
                        <div className="ep-detail-empty">
                            无详细分析内容
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============ Main Component ============

interface ExpertPanelReportViewProps {
    result: ExpertPanelResponse;
}

/**
 * Reusable view for expert panel results.
 * Used in both the ExpertPanelPage (live results) and History (ReportDetails).
 */
export const ExpertPanelReportView: React.FC<ExpertPanelReportViewProps> = ({ result }) => {
    return (
        <div className="ep-results">
            <ConsensusCard result={result} />
            <MetricsBar results={result.modelResults} />
            <ComparisonTable results={result.modelResults} />
            <DetailTabs results={result.modelResults} />
        </div>
    );
};
