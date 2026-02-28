import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { backtestApi } from '../api/backtest';
import { stockApi } from '../api/stocks';
import { Card, Badge, Pagination } from '../components/common';
import { StockPriceChart, StockChartModal } from '../components/backtest';
import type {
  BacktestResultItem,
  BacktestRunResponse,
  PerformanceMetrics,
} from '../types/backtest';

import { GlobalStockSelector } from '../components/stock/GlobalStockSelector';

// ============ Helpers ============

function pct(value?: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

function outcomeBadge(outcome?: string) {
  if (!outcome) return <Badge variant="default">--</Badge>;
  switch (outcome) {
    case 'win':
      return <Badge variant="success" glow>获利</Badge>;
    case 'loss':
      return <Badge variant="danger" glow>亏损</Badge>;
    case 'neutral':
      return <Badge variant="warning">打平</Badge>;
    default:
      return <Badge variant="default">{outcome}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="success">已完成</Badge>;
    case 'insufficient_data':
      return <Badge variant="warning">数据不足</Badge>;
    case 'error':
      return <Badge variant="danger">错误</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <span className="w-2 h-2 rounded-full bg-emerald-500" title="已完成" />;
    case 'insufficient_data':
      return <span className="w-2 h-2 rounded-full bg-amber-500" title="数据不足" />;
    case 'error':
      return <span className="w-2 h-2 rounded-full bg-red-500" title="错误" />;
    default:
      return <span className="w-2 h-2 rounded-full bg-slate-500" />;
  }
}

// 方向预测文本映射
function directionText(expected?: string): string {
  switch (expected) {
    case 'up': return '看涨';
    case 'down': return '看跌';
    case 'not_down': return '不跌';
    case 'flat': return '震荡';
    default: return expected || '--';
  }
}

// 建议文本映射
function adviceText(advice?: string): string {
  if (!advice) return '--';
  if (advice.includes('买入') || advice.includes('buy')) return '买入';
  if (advice.includes('卖出') || advice.includes('sell')) return '卖出';
  if (advice.includes('持有') || advice.includes('hold')) return '持有';
  if (advice.includes('观望') || advice.includes('wait')) return '观望';
  return advice.slice(0, 6);
}

// ============ Metric Row ============

const MetricRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
    <span className="text-xs text-secondary">{label}</span>
    <span className={`text-sm font-mono font-semibold ${accent ? 'text-cyan' : 'text-white'}`}>{value}</span>
  </div>
);

// ============ Performance Card ============

const PerformanceCard: React.FC<{ metrics: PerformanceMetrics; title: string }> = ({ metrics, title }) => (
  <Card variant="gradient" padding="md" className="animate-fade-in">
    <div className="mb-3">
      <span className="label-uppercase">{title}</span>
    </div>
    <MetricRow label="方向预测准确率" value={pct(metrics.directionAccuracyPct)} accent />
    <MetricRow label="胜率" value={pct(metrics.winRatePct)} accent />
    <MetricRow label="平均模拟收益" value={pct(metrics.avgSimulatedReturnPct)} />
    <MetricRow label="平均个股涨跌" value={pct(metrics.avgStockReturnPct)} />
    <MetricRow label="止损触发率" value={pct(metrics.stopLossTriggerRate)} />
    <MetricRow label="止盈触发率" value={pct(metrics.takeProfitTriggerRate)} />
    <MetricRow label="平均达标天数" value={metrics.avgDaysToFirstHit != null ? metrics.avgDaysToFirstHit.toFixed(1) : '--'} />
    <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
      <span className="text-xs text-muted">评估记录</span>
      <span className="text-xs text-secondary font-mono">
        {Number(metrics.completedCount)} / {Number(metrics.totalEvaluations)}
      </span>
    </div>
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">胜 / 负 / 平</span>
      <span className="text-xs font-mono">
        <span className="text-emerald-400">{metrics.winCount}</span>
        {' / '}
        <span className="text-red-400">{metrics.lossCount}</span>
        {' / '}
        <span className="text-amber-400">{metrics.neutralCount}</span>
      </span>
    </div>
  </Card>
);

// ============ Run Summary ============

const RunSummary: React.FC<{ data: BacktestRunResponse }> = ({ data }) => (
  <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-elevated border border-white/5 text-xs font-mono animate-fade-in">
    <span className="text-secondary">已处理: <span className="text-white">{data.processed}</span></span>
    <span className="text-secondary">已保存: <span className="text-cyan">{data.saved}</span></span>
    <span className="text-secondary">已评估: <span className="text-emerald-400">{data.completed}</span></span>
    {data.insufficient > 0 && (
      <span className="text-secondary">数据不足: <span className="text-amber-400">{data.insufficient}</span></span>
    )}
    {data.errors > 0 && (
      <span className="text-secondary">错误: <span className="text-red-400">{data.errors}</span></span>
    )}
  </div>
);

// ============ Help Panel ============

const HelpPanel: React.FC = () => (
  <div className="text-xs text-slate-400 space-y-3">
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <span className="text-cyan font-mono">1.</span>
        <span>在"智能诊股"页面分析股票</span>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-cyan font-mono">2.</span>
        <span>回到本页，输入代码点击"开始回测"</span>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-cyan font-mono">3.</span>
        <span>查看AI建议的准确率</span>
      </div>
    </div>

    <div className="pt-2 border-t border-white/5">
      <p className="font-medium text-slate-400 mb-2">回测评估逻辑：</p>
      <div className="space-y-1.5 text-[10px]">
        <p>• <span className="text-emerald-400">买入</span>: 涨则对，跌则错</p>
        <p>• <span className="text-red-400">卖出</span>: 跌则对，涨则错</p>
        <p>• <span className="text-amber-400">持有</span>: 不跌则对，大跌则错</p>
        <p>• <span className="text-slate-400">观望</span>: 横盘则对，大涨跌则错</p>
      </div>
    </div>

    <div className="pt-2 border-t border-white/5">
      <p className="font-medium text-slate-400 mb-2">状态说明：</p>
      <div className="space-y-1 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>已完成 - 成功评估</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>数据不足 - 需下载股价数据</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>错误 - 评估过程出错</span>
        </div>
      </div>
    </div>
  </div>
);

// ============ Main Page ============

const BacktestPage: React.FC = () => {
  // Input state
  const [codeFilter, setCodeFilter] = useState('');
  const [evalDays, setEvalDays] = useState('10');
  const [forceRerun, setForceRerun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<BacktestRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Results state
  const [results, setResults] = useState<BacktestResultItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const pageSize = 20;

  // Performance state
  const [overallPerf, setOverallPerf] = useState<PerformanceMetrics | null>(null);
  const [stockPerf, setStockPerf] = useState<PerformanceMetrics | null>(null);
  const [isLoadingPerf, setIsLoadingPerf] = useState(false);

  // Refresh data state
  const [refreshingCode, setRefreshingCode] = useState<string | null>(null);

  // Modal state for enlarged chart
  const [selectedChart, setSelectedChart] = useState<{
    code: string;
    data: Array<{ date: string; close: number; high: number; low: number }>;
    analysisDate?: string;
    stopLoss?: number;
    takeProfit?: number;
    operationAdvice?: string;
    directionExpected?: string;
    outcome?: string;
    simulatedReturnPct?: number;
  } | null>(null);

  // Fetch results
  const fetchResults = useCallback(async (page = 1, code?: string, windowDays?: number) => {
    setIsLoadingResults(true);
    try {
      const response = await backtestApi.getResults({ code: code || undefined, evalWindowDays: windowDays, page, limit: pageSize });
      setResults(response.items);
      setTotalResults(response.total);
      setCurrentPage(response.page);
    } catch (err) {
      console.error('Failed to fetch backtest results:', err);
    } finally {
      setIsLoadingResults(false);
    }
  }, []);

  // Fetch performance
  const fetchPerformance = useCallback(async (code?: string, windowDays?: number) => {
    setIsLoadingPerf(true);
    try {
      const overall = await backtestApi.getOverallPerformance(windowDays);
      setOverallPerf(overall);

      if (code) {
        const stock = await backtestApi.getStockPerformance(code, windowDays);
        setStockPerf(stock);
      } else {
        setStockPerf(null);
      }
    } catch (err) {
      console.error('Failed to fetch performance:', err);
    } finally {
      setIsLoadingPerf(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const overall = await backtestApi.getOverallPerformance();
      setOverallPerf(overall);
      const windowDays = overall?.evalWindowDays;
      if (windowDays && !evalDays) {
        setEvalDays(String(windowDays));
      }
      fetchResults(1, undefined, windowDays);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered results
  const filteredResults = useMemo(() => {
    if (statusFilter === 'all') return results;
    return results.filter(r => r.evalStatus === statusFilter);
  }, [results, statusFilter]);

  // Count by status
  const statusCounts = useMemo(() => {
    return {
      all: results.length,
      completed: results.filter(r => r.evalStatus === 'completed').length,
      insufficient: results.filter(r => r.evalStatus === 'insufficient_data').length,
      error: results.filter(r => r.evalStatus === 'error').length,
    };
  }, [results]);

  // Run backtest
  const handleRun = async () => {
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const code = codeFilter.trim() || undefined;
      const evalWindowDays = evalDays ? parseInt(evalDays, 10) : undefined;
      const response = await backtestApi.run({
        code,
        force: forceRerun || undefined,
        minAgeDays: 0,
        evalWindowDays,
      });
      setRunResult(response);
      fetchResults(1, codeFilter.trim() || undefined, evalWindowDays);
      fetchPerformance(codeFilter.trim() || undefined, evalWindowDays);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : '回测失败');
    } finally {
      setIsRunning(false);
    }
  };

  // Refresh stock data
  const handleRefreshData = async (code: string) => {
    setRefreshingCode(code);
    try {
      await stockApi.refreshInfo(code);
      // Re-run backtest for this stock after refreshing
      const evalWindowDays = evalDays ? parseInt(evalDays, 10) : undefined;
      await backtestApi.run({
        code,
        force: true,
        minAgeDays: 0,
        evalWindowDays,
      });
      // Refresh results
      fetchResults(currentPage, codeFilter.trim() || undefined, evalWindowDays);
      fetchPerformance(codeFilter.trim() || undefined, evalWindowDays);
    } catch (err) {
      console.error('Failed to refresh stock data:', err);
    } finally {
      setRefreshingCode(null);
    }
  };

  // Filter by code
  const handleFilter = () => {
    const code = codeFilter.trim() || undefined;
    const windowDays = evalDays ? parseInt(evalDays, 10) : undefined;
    setCurrentPage(1);
    fetchResults(1, code, windowDays);
    fetchPerformance(code, windowDays);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFilter();
    }
  };

  // Pagination
  const totalPages = Math.ceil(totalResults / pageSize);
  const handlePageChange = (page: number) => {
    const windowDays = evalDays ? parseInt(evalDays, 10) : undefined;
    fetchResults(page, codeFilter.trim() || undefined, windowDays);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative max-w-md">
            <GlobalStockSelector
              value={codeFilter}
              onChange={(code) => setCodeFilter(code.toUpperCase())}
              placeholder="输入股票代码 (留空查询所有)"
              className="w-full"
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            type="button"
            onClick={handleFilter}
            disabled={isLoadingResults}
            className="btn-secondary flex items-center gap-1.5 whitespace-nowrap"
          >
            筛选
          </button>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-xs text-muted">窗口</span>
            <input
              type="number"
              min={1}
              max={120}
              value={evalDays}
              onChange={(e) => setEvalDays(e.target.value)}
              placeholder="10"
              disabled={isRunning}
              className="input-terminal w-14 text-center text-xs py-2"
              title="评估窗口天数：分析后多少天内评估建议有效性"
            />
            <span className="text-[10px] text-slate-500">天</span>
          </div>
          <button
            type="button"
            onClick={() => setForceRerun(!forceRerun)}
            disabled={isRunning}
            className={`
              flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
              transition-all duration-200 whitespace-nowrap border cursor-pointer
              ${forceRerun
                ? 'border-cyan/40 bg-cyan/10 text-cyan shadow-[0_0_8px_rgba(0,212,255,0.15)]'
                : 'border-white/10 bg-transparent text-muted hover:border-white/20 hover:text-secondary'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <span className={`
              inline-block w-1.5 h-1.5 rounded-full transition-colors duration-200
              ${forceRerun ? 'bg-cyan shadow-[0_0_4px_rgba(0,212,255,0.6)]' : 'bg-white/20'}
            `} />
            强制重跑
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
          >
            {isRunning ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                运行中...
              </>
            ) : (
              '开始回测'
            )}
          </button>
        </div>

        {/* Run Result & Tips */}
        {runResult && (
          <div className="mt-2 max-w-4xl space-y-2">
            <RunSummary data={runResult} />
            {runResult.processed === 0 && (
              <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                <span className="font-medium">提示：</span>
                未找到可回测的分析记录。可能原因：
                1) 该股票暂无分析记录，请先进行"智能诊股"分析
                2) 分析记录已回测过，勾选"强制重跑"可重新评估
              </div>
            )}
            {runResult.insufficient > 0 && (
              <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                <span className="font-medium">数据不足说明：</span>
                有 {runResult.insufficient} 条记录缺少股价数据（分析当天或后续{evalDays || 10}天的日线数据）。
                可在结果列表中点击"补全数据"按钮尝试下载。
              </div>
            )}
          </div>
        )}
        {runError && (
          <p className="mt-2 text-xs text-danger">{runError}</p>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Left sidebar */}
        <div className="flex flex-col gap-3 w-64 flex-shrink-0 overflow-y-auto">
          {/* Help Panel */}
          <Card padding="md" className="flex-shrink-0">
            <div className="mb-2">
              <span className="label-uppercase">使用指南</span>
            </div>
            <HelpPanel />
          </Card>

          {/* Performance */}
          {isLoadingPerf ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
            </div>
          ) : overallPerf ? (
            <PerformanceCard metrics={overallPerf} title="总体回测表现" />
          ) : (
            <Card padding="md">
              <div className="text-center py-4">
                <p className="text-xs text-muted mb-2">暂无回测数据</p>
                <p className="text-[10px] text-slate-500">
                  需要先运行回测才能看到表现指标
                </p>
              </div>
            </Card>
          )}

          {stockPerf && (
            <PerformanceCard metrics={stockPerf} title={`${stockPerf.code || codeFilter}`} />
          )}
        </div>

        {/* Right content - Results table */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {/* Status Filter */}
          {results.length > 0 && (
            <div className="flex items-center gap-1 mb-2 flex-shrink-0">
              {[
                { key: 'all', label: '全部', count: statusCounts.all },
                { key: 'completed', label: '已完成', count: statusCounts.completed },
                { key: 'insufficient_data', label: '数据不足', count: statusCounts.insufficient },
                { key: 'error', label: '错误', count: statusCounts.error },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setStatusFilter(item.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === item.key
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                  <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] ${
                    statusFilter === item.key ? 'bg-cyan/30' : 'bg-slate-700'
                  }`}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingResults ? (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="w-10 h-10 border-3 border-cyan/20 border-t-cyan rounded-full animate-spin" />
                <p className="mt-3 text-secondary text-sm">载入数据中...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-12 h-12 mb-3 rounded-xl bg-elevated flex items-center justify-center">
                  <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white mb-1.5">无回测记录</h3>
                <p className="text-xs text-muted max-w-xs mb-4">
                  {codeFilter
                    ? `未找到 ${codeFilter} 的回测记录。先前往"智能诊股"页面分析该股票，然后再回来运行回测。`
                    : '开始回测以评估历史分析的准确性。需要先有一些分析记录才能进行回测。'}
                </p>
                {codeFilter && (
                  <a
                    href="/"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan/10 text-cyan text-xs hover:bg-cyan/20 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    去分析股票
                  </a>
                )}
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <p className="text-xs text-muted">
                  当前筛选条件下无记录
                </p>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-elevated text-left">
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">状态</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">代码</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">分析日期</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">股价走势</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">AI建议</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">预测 vs 实际</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">盈亏结果</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider text-right">收益率</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-secondary uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((row) => {
                        const isCorrect = row.directionCorrect === true;
                        const isWrong = row.directionCorrect === false;
                        return (
                          <tr
                            key={row.analysisHistoryId}
                            className="border-t border-white/5 hover:bg-hover transition-colors"
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {statusIcon(row.evalStatus)}
                                {statusBadge(row.evalStatus)}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-mono text-cyan text-xs">{row.code}</td>
                            <td className="px-3 py-2 text-xs text-secondary">{row.analysisDate || '--'}</td>
                            <td className="px-2 py-2">
                              <StockPriceChart
                                code={row.code}
                                analysisDate={row.analysisDate}
                                stopLoss={row.stopLoss}
                                takeProfit={row.takeProfit}
                                width={120}
                                height={60}
                                onClick={() => {
                                  // Fetch data for modal
                                  stockApi.getHistory(row.code, 60).then(response => {
                                    setSelectedChart({
                                      code: row.code,
                                      data: response.data.map(d => ({
                                        date: d.date,
                                        close: d.close,
                                        high: d.high,
                                        low: d.low,
                                      })),
                                      analysisDate: row.analysisDate,
                                      stopLoss: row.stopLoss,
                                      takeProfit: row.takeProfit,
                                      operationAdvice: row.operationAdvice,
                                      directionExpected: row.directionExpected,
                                      outcome: row.outcome,
                                      simulatedReturnPct: row.simulatedReturnPct,
                                    });
                                  });
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-xs text-white bg-slate-700 px-2 py-0.5 rounded">
                                {adviceText(row.operationAdvice)}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500">预测:</span>
                                  <span className="text-xs text-white">{directionText(row.directionExpected)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500">实际:</span>
                                  <span className={`text-xs font-medium ${
                                    (row.stockReturnPct || 0) > 0 ? 'text-emerald-400' : (row.stockReturnPct || 0) < 0 ? 'text-red-400' : 'text-slate-400'
                                  }`}>
                                    {(row.stockReturnPct || 0) > 0 ? '↑ ' : (row.stockReturnPct || 0) < 0 ? '↓ ' : '— '}
                                    {pct(row.stockReturnPct)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-slate-500">对错:</span>
                                  {isCorrect && <span className="text-xs text-emerald-400">✓ 正确</span>}
                                  {isWrong && <span className="text-xs text-red-400">✗ 错误</span>}
                                  {!isCorrect && !isWrong && <span className="text-xs text-slate-500">--</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">{outcomeBadge(row.outcome)}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-0.5 text-right">
                                <span className={`text-sm font-mono font-semibold ${
                                  row.simulatedReturnPct != null
                                    ? row.simulatedReturnPct > 0 ? 'text-emerald-400' : row.simulatedReturnPct < 0 ? 'text-red-400' : 'text-secondary'
                                    : 'text-muted'
                                }`}>
                                  {pct(row.simulatedReturnPct)}
                                </span>
                                {row.hitStopLoss && <span className="text-[10px] text-red-400">已止损</span>}
                                {row.hitTakeProfit && <span className="text-[10px] text-emerald-400">已止盈</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {row.evalStatus === 'insufficient_data' && (
                                <button
                                  onClick={() => handleRefreshData(row.code)}
                                  disabled={refreshingCode === row.code}
                                  className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                >
                                  {refreshingCode === row.code ? '补全中...' : '补全数据'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="mt-4">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>

                <p className="text-xs text-muted text-center mt-2">
                  共 {totalResults} 条回测记录
                  {statusFilter !== 'all' && ` (已筛选: ${filteredResults.length} 条)`}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Chart Modal */}
      {selectedChart && (
        <StockChartModal
          isOpen={true}
          onClose={() => setSelectedChart(null)}
          code={selectedChart.code}
          data={selectedChart.data}
          analysisDate={selectedChart.analysisDate}
          stopLoss={selectedChart.stopLoss}
          takeProfit={selectedChart.takeProfit}
          operationAdvice={selectedChart.operationAdvice}
          directionExpected={selectedChart.directionExpected}
          outcome={selectedChart.outcome}
          simulatedReturnPct={selectedChart.simulatedReturnPct}
        />
      )}
    </div>
  );
};

export default BacktestPage;
