import React, { useState } from 'react';
import type { ExpertPanelResponse, ModelResultItem } from '../../api/expertPanel';
import '../../pages/ExpertPanelPage.css'; // Reuse existing styles
import { ReportStrategy } from '../report/ReportStrategy';

// ============ Helper Functions ============

function getScoreClass(score: number | null): string {
    if (score === null) return '';
    if (score >= 70) return 'ep-score-high';
    if (score >= 40) return 'ep-score-mid';
    return 'ep-score-low';
}

// ============ Sub-Components ============

/** Consensus Summary Card */
export const ConsensusCard: React.FC<{ result: ExpertPanelResponse }> = ({ result }) => {
    const scoreColor = (result.consensusScore ?? 50) >= 60 ? '#10b981' : (result.consensusScore ?? 50) >= 40 ? '#f59e0b' : '#ef4444';
    return (
        <div className="ep-consensus-card">
            <div className="ep-consensus-header">
                <div className="ep-consensus-score" style={{ borderColor: scoreColor }}>
                    <span className="ep-score-value" style={{ color: scoreColor }}>
                        {result.consensusScore ?? '--'}
                    </span>
                    <span className="ep-score-label">共识评分</span>
                </div>
                <div className="ep-consensus-info">
                    <h3 className="ep-stock-title">{result.stockName} ({result.stockCode})</h3>
                    <div className="ep-consensus-advice">
                        <span className={`ep-advice-badge ep-advice-${(result.consensusAdvice ?? '').replace(/\s/g, '')}`}>
                            {result.consensusAdvice ?? '未知'}
                        </span>
                    </div>
                    <p className="ep-consensus-summary">{result.consensusSummary}</p>
                </div>
            </div>
            {/* Consensus Strategy */}
            {result.consensusStrategy && (
                <div className="mt-4 border-t border-white/10 pt-4 px-4 pb-4">
                    <ReportStrategy strategy={result.consensusStrategy} />
                </div>
            )}
        </div>
    );
};

/** Comparison Table */
export const ComparisonTable: React.FC<{ results: ModelResultItem[] }> = ({ results }) => (
    <div className="ep-comparison">
        <h3 className="ep-section-title">模型对比</h3>
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
                    {results.map((r) => (
                        <tr key={r.modelName} className={r.success ? '' : 'ep-row-error'}>
                            <td className="ep-cell-model">{r.modelName}</td>
                            <td>
                                <span className={`ep-score-pill ${getScoreClass(r.score)}`}>
                                    {r.score ?? '--'}
                                </span>
                            </td>
                            <td>{r.advice ?? '--'}</td>
                            <td>{r.trend ?? '--'}</td>
                            <td>{r.confidence ?? '--'}</td>
                            <td>{r.elapsedSeconds?.toFixed(1) || '0.0'}s</td>
                            <td>{r.success ? '✅' : `❌ ${r.error ?? ''}`}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

/** Detailed Report Tabs */
export const DetailTabs: React.FC<{ results: ModelResultItem[] }> = ({ results }) => {
    const [activeTab, setActiveTab] = useState(0);
    const successful = results.filter((r) => r.success);

    if (successful.length === 0) return null;

    // Ensure activeTab is valid
    const current = successful[activeTab] || successful[0];

    return (
        <div className="ep-details">
            <h3 className="ep-section-title">详细报告</h3>
            <div className="ep-tabs">
                {successful.map((r, idx) => (
                    <button
                        key={r.modelName}
                        className={`ep-tab ${idx === activeTab ? 'is-active' : ''}`}
                        onClick={() => setActiveTab(idx)}
                    >
                        {r.modelName}
                    </button>
                ))}
            </div>
            <div className="ep-tab-content">
                <div className="ep-detail-header">
                    <span className="ep-detail-model">{current.modelName}</span>
                    <span className={`ep-score-pill ${getScoreClass(current.score)}`}>
                        评分: {current.score ?? '--'}
                    </span>
                    <span className="ep-detail-advice">建议: {current.advice}</span>
                </div>
                <div className="ep-detail-body">
                    {/* Strategy Points */}
                    {current.rawResult?.dashboard?.battle_plan?.sniper_points && (
                        <div className="mb-6">
                            <ReportStrategy strategy={current.rawResult.dashboard.battle_plan.sniper_points} />
                        </div>
                    )}
                    {current.summary ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{current.summary}</div>
                    ) : (
                        <div className="text-secondary italic">无详细分析内容</div>
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
        <div className="ep-results animate-fade-in">
            <ConsensusCard result={result} />
            <ComparisonTable results={result.modelResults} />
            <DetailTabs results={result.modelResults} />
        </div>
    );
};
