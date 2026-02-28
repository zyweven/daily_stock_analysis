import type React from 'react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { HistoryItem, AnalysisReport, TaskInfo } from '../types/analysis';
import { historyApi } from '../api/history';
import { analysisApi, DuplicateTaskError } from '../api/analysis';
import { stockApi } from '../api/stocks';
import type { StockInfo } from '../api/stocks';
import { validateStockCode } from '../utils/validation';
import { getRecentStartDate, toDateInputValue } from '../utils/format';
import { useAnalysisStore } from '../stores/analysisStore';
import { ReportSummary } from '../components/report';
import { TaskPanel } from '../components/tasks';
import { useTaskStream } from '../hooks';

// ============ 类型定义 ============

interface StockHistory {
  code: string;
  name: string;
  items: HistoryItem[];
  latestScore?: number;
  analysisCount: number;
  lastAnalyzedAt: string;
  isInWatchlist: boolean;
}

// ============ 工具函数 ============

// 按股票分组历史记录
function groupHistoryByStock(items: HistoryItem[], watchlist: StockInfo[] = []): StockHistory[] {
  const stockMap = new Map<string, StockHistory>();
  const watchlistCodes = new Set(watchlist.map(s => s.code));

  items.forEach(item => {
    if (!stockMap.has(item.stockCode)) {
      stockMap.set(item.stockCode, {
        code: item.stockCode,
        name: item.stockName || item.stockCode,
        items: [],
        analysisCount: 0,
        lastAnalyzedAt: item.createdAt,
        latestScore: item.sentimentScore,
        isInWatchlist: watchlistCodes.has(item.stockCode),
      });
    }

    const stock = stockMap.get(item.stockCode)!;
    stock.items.push(item);
    stock.analysisCount++;

    // 更新最新时间和分数
    const itemDate = new Date(item.createdAt);
    const stockDate = new Date(stock.lastAnalyzedAt);
    if (itemDate > stockDate) {
      stock.lastAnalyzedAt = item.createdAt;
      stock.latestScore = item.sentimentScore;
    }
  });

  // 每个股票的内部记录按时间排序（最新的在前）
  stockMap.forEach(stock => {
    stock.items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  // 返回数组，让调用者决定排序方式
  return Array.from(stockMap.values());
}

// 格式化相对时间
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ============ 子组件 ============

// 自选股下拉选择器
const WatchlistDropdown: React.FC<{
  stocks: StockInfo[];
  onSelect: (code: string) => void;
  isLoading: boolean;
  variant?: 'default' | 'compact';
}> = ({ stocks, onSelect, isLoading, variant = 'default' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (stocks.length === 0) return null;

  // 紧凑模式：只有图标和下拉箭头
  if (variant === 'compact') {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          title="选择自选股"
          className="flex items-center gap-1 px-2 py-2 bg-slate-800/60 border border-white/10 rounded-lg text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <svg className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-slate-500">加载中...</div>
            ) : (
              stocks.map(stock => (
                <button
                  key={stock.code}
                  onClick={() => {
                    onSelect(stock.code);
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-sm text-white truncate">{stock.name || stock.code}</span>
                    <span className="text-xs text-slate-500 font-mono flex-shrink-0">{stock.code}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // 默认完整模式
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/60 border border-white/10 rounded-lg text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        自选股
        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-slate-500">加载中...</div>
          ) : (
            stocks.map(stock => (
              <button
                key={stock.code}
                onClick={() => {
                  onSelect(stock.code);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">{stock.name || stock.code}</span>
                  <span className="text-xs text-slate-500 font-mono">{stock.code}</span>
                </div>
                <span className="text-xs text-slate-600 group-hover:text-cyan-400">查看</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// 股票历史列表（左侧主导航）
const StockHistoryList: React.FC<{
  stocks: StockHistory[];
  selectedQueryId?: string;
  selectedStockCode?: string | null;
  onStockClick: (code: string) => void;
  onItemClick: (queryId: string) => void;
  isLoading: boolean;
  onWatchlistChange?: () => void;
}> = ({ stocks, selectedQueryId, selectedStockCode, onStockClick, onItemClick, isLoading, onWatchlistChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'score'>('time');
  const [filterHighScore, setFilterHighScore] = useState(false);
  const [addingCode, setAddingCode] = useState<string | null>(null);

  // 处理添加自选
  const handleAddToWatchlist = async (stock: StockHistory) => {
    setAddingCode(stock.code);
    try {
      await stockApi.add({
        code: stock.code,
        name: stock.name,
        remark: stock.latestScore ? `AI评分: ${stock.latestScore}` : undefined,
      });
      onWatchlistChange?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('已存在')) {
        console.error('Failed to add to watchlist:', err);
      }
    } finally {
      setAddingCode(null);
    }
  };

  // 排序和筛选逻辑
  const filteredStocks = useMemo<StockHistory[]>(() => {
    if (!stocks || stocks.length === 0) return [];

    // 先复制数组避免修改原数组
    let result = [...stocks];

    // 搜索过滤
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (trimmedQuery) {
      result = result.filter(s =>
        s.code.toLowerCase().includes(trimmedQuery) ||
        s.name.toLowerCase().includes(trimmedQuery)
      );
    }

    // 高分筛选 (>= 70分)
    if (filterHighScore) {
      result = result.filter(s => typeof s.latestScore === 'number' && s.latestScore >= 70);
    }

    // 排序逻辑
    if (sortBy === 'score') {
      // 按评分从高到低，无分数的排最后
      result = result.sort((a, b) => {
        const scoreA = typeof a.latestScore === 'number' ? a.latestScore : -1;
        const scoreB = typeof b.latestScore === 'number' ? b.latestScore : -1;
        return scoreB - scoreA;
      });
    } else {
      // 按时间从新到旧
      result = result.sort((a, b) =>
        new Date(b.lastAnalyzedAt).getTime() - new Date(a.lastAnalyzedAt).getTime()
      );
    }

    return result;
  }, [stocks, searchQuery, sortBy, filterHighScore]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索和筛选 */}
      <div className="p-3 border-b border-white/5 space-y-2">
        {/* 搜索框 */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索分析过的股票..."
            className="w-full pl-9 pr-3 py-2 bg-slate-800/60 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan/50"
          />
        </div>

        {/* 排序和筛选 */}
        <div className="flex items-center gap-2">
          {/* 排序选项 */}
          <div className="flex bg-slate-800/60 rounded-lg p-0.5 flex-1">
            <button
              onClick={() => setSortBy('time')}
              className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${
                sortBy === 'time' ? 'bg-cyan/20 text-cyan' : 'text-slate-400 hover:text-white'
              }`}
            >
              按时间
            </button>
            <button
              onClick={() => setSortBy('score')}
              className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${
                sortBy === 'score' ? 'bg-cyan/20 text-cyan' : 'text-slate-400 hover:text-white'
              }`}
            >
              按评分
            </button>
          </div>

          {/* 高分筛选 */}
          <button
            onClick={() => setFilterHighScore(!filterHighScore)}
            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              filterHighScore
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800/60 text-slate-400 border border-white/10 hover:text-white'
            }`}
          >
            高分
          </button>
        </div>

        {/* 统计 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            共 <span className="text-cyan font-medium">{filteredStocks.length}</span> 只
            {filterHighScore && (
              <span className="text-slate-600 ml-1">/ {stocks.length}只</span>
            )}
          </span>
          {filterHighScore && (
            <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
              仅显示高分
            </span>
          )}
        </div>
      </div>

      {/* 股票列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredStocks.length === 0 ? (
          <div className="p-6 text-center">
            {stocks.length === 0 ? (
              <div className="text-slate-500 text-sm">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800 flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                暂无分析记录
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                {filterHighScore ? '没有高分股票 (≥70分)' : '未找到匹配的股票'}
              </div>
            )}
          </div>
        ) : (
          <div className="py-1">
            {filteredStocks.map(stock => {
              const isExpanded = selectedStockCode === stock.code;
              const isStockSelected = stock.items.some(i => i.queryId === selectedQueryId);

              return (
                <div key={stock.code} className={`border-b border-white/5 ${isStockSelected ? 'bg-cyan/5' : ''}`}>
                  {/* 股票标题行 */}
                  <button
                    onClick={() => onStockClick(stock.code)}
                    className="w-full px-3 py-2.5 hover:bg-white/5 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{stock.name}</span>
                      <span className="text-xs text-slate-500 font-mono">{stock.code}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
                        {stock.analysisCount}次
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 自选股状态/按钮 */}
                      {stock.isInWatchlist ? (
                        <span
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400"
                          title="已在自选股"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                          自选
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleAddToWatchlist(stock);
                          }}
                          disabled={addingCode === stock.code}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-400"
                          title="加入自选股"
                        >
                          {addingCode === stock.code ? (
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          )}
                        </button>
                      )}
                      {stock.latestScore !== undefined && (
                        <span
                          className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            color: stock.latestScore >= 70 ? '#10b981' : stock.latestScore >= 40 ? '#f59e0b' : '#ef4444',
                            backgroundColor: `${stock.latestScore >= 70 ? '#10b981' : stock.latestScore >= 40 ? '#f59e0b' : '#ef4444'}15`
                          }}
                        >
                          {stock.latestScore}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* 展开的分析记录 */}
                  {isExpanded && (
                    <div className="bg-slate-900/30">
                      {stock.items
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((item) => (
                          <button
                            key={item.queryId}
                            onClick={() => onItemClick(item.queryId)}
                            className={`w-full px-3 py-2 pl-6 text-left hover:bg-white/5 flex items-center justify-between ${
                              selectedQueryId === item.queryId ? 'bg-cyan/10 border-l-2 border-cyan' : 'border-l-2 border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                              {item.sentimentScore !== undefined && (
                                <span
                                  className="text-xs font-mono"
                                  style={{
                                    color: item.sentimentScore >= 70 ? '#10b981' : item.sentimentScore >= 40 ? '#f59e0b' : '#ef4444'
                                  }}
                                >
                                  {item.sentimentScore}分
                                </span>
                              )}
                            </div>
                            {item.operationAdvice && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[80px]">
                                {item.operationAdvice.slice(0, 8)}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// 市场概览（模拟数据）
const MarketOverview: React.FC = () => {
  const markets = [
    { name: '上证', value: '3,280', change: '+0.52%', up: true },
    { name: '深证', value: '10,520', change: '-0.18%', up: false },
    { name: '创业', value: '2,150', change: '+0.35%', up: true },
  ];

  return (
    <div className="flex items-center gap-3 text-xs">
      {markets.map(m => (
        <div key={m.name} className="flex items-center gap-1">
          <span className="text-slate-500">{m.name}</span>
          <span className={`font-mono ${m.up ? 'text-emerald-400' : 'text-red-400'}`}>
            {m.change}
          </span>
        </div>
      ))}
    </div>
  );
};

// ============ 主页面 ============

const HomePage: React.FC = () => {
  const { setLoading, setError: setStoreError } = useAnalysisStore();

  // 输入状态
  const [stockCode, setStockCode] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputError, setInputError] = useState<string>();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // 历史列表状态
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // 自选股状态
  const [watchlist, setWatchlist] = useState<StockInfo[]>([]);
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState(false);

  // 报告详情状态
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // 任务队列状态
  const [activeTasks, setActiveTasks] = useState<TaskInfo[]>([]);

  // 左侧选中的股票（用于展开时间线）
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);

  const analysisRequestIdRef = useRef<number>(0);

  // 计算按股票分组的历史
  const stockHistories = useMemo(() => groupHistoryByStock(historyItems, watchlist), [historyItems, watchlist]);

  // SSE 任务流
  useTaskStream({
    onTaskCreated: (task) => {
      setActiveTasks(prev => prev.some(t => t.taskId === task.taskId) ? prev : [...prev, task]);
    },
    onTaskStarted: (task) => {
      setActiveTasks(prev => prev.map(t => t.taskId === task.taskId ? task : t));
    },
    onTaskCompleted: (task) => {
      fetchHistory();
      setTimeout(() => setActiveTasks(prev => prev.filter(t => t.taskId !== task.taskId)), 2000);
    },
    onTaskFailed: (task) => {
      setActiveTasks(prev => prev.map(t => t.taskId === task.taskId ? task : t));
      setStoreError(task.error || '分析失败');
      setTimeout(() => setActiveTasks(prev => prev.filter(t => t.taskId !== task.taskId)), 5000);
    },
    onError: () => console.warn('SSE 连接断开'),
    enabled: true,
  });

  // 加载自选股
  const fetchWatchlist = useCallback(async () => {
    setIsLoadingWatchlist(true);
    try {
      const data = await stockApi.list(true);
      setWatchlist(data);
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    } finally {
      setIsLoadingWatchlist(false);
    }
  }, []);

  // 加载历史
  const fetchHistory = useCallback(async (reset = true) => {
    setIsLoadingHistory(true);
    const page = reset ? 1 : currentPage + 1;

    try {
      const response = await historyApi.getList({
        startDate: getRecentStartDate(30),
        endDate: toDateInputValue(new Date()),
        page,
        limit: pageSize,
      });

      if (reset) {
        setHistoryItems(response.items);
        setCurrentPage(1);
      } else {
        setHistoryItems(prev => [...prev, ...response.items]);
        setCurrentPage(page);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [currentPage]);

  // 点击历史项加载报告
  const handleHistoryClick = async (queryId: string) => {
    analysisRequestIdRef.current += 1;
    setIsLoadingReport(true);
    try {
      const report = await historyApi.getDetail(queryId);
      setSelectedReport(report);
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  };

  // 点击股票行
  const handleStockClick = (code: string) => {
    setSelectedStockCode(prev => prev === code ? null : code);
  };

  // 点击自选股 - 加载该股票最新的报告
  const handleWatchlistSelect = async (code: string) => {
    // 先检查是否有该股票的历史分析
    const stockHistory = stockHistories.find(s => s.code === code);
    if (stockHistory && stockHistory.items.length > 0) {
      // 加载最新的一次分析
      const latestItem = stockHistory.items[0];
      await handleHistoryClick(latestItem.queryId);
      // 展开该股票的时间线
      setSelectedStockCode(code);
    } else {
      // 没有历史分析，填充输入框让用户分析
      setStockCode(code);
    }
  };

  // 分析股票
  const handleAnalyze = async () => {
    const { valid, message, normalized } = validateStockCode(stockCode);
    if (!valid) {
      setInputError(message);
      return;
    }

    setInputError(undefined);
    setDuplicateError(null);
    setIsAnalyzing(true);
    setLoading(true);
    setStoreError(null);

    const currentRequestId = ++analysisRequestIdRef.current;

    try {
      const response = await analysisApi.analyzeAsync({
        stockCode: normalized,
        reportType: 'detailed',
      });

      if (currentRequestId === analysisRequestIdRef.current) {
        setStockCode('');
      }

      console.log('Task submitted:', response.taskId);
    } catch (err) {
      console.error('Analysis failed:', err);
      if (currentRequestId === analysisRequestIdRef.current) {
        if (err instanceof DuplicateTaskError) {
          setDuplicateError(`股票 ${err.stockCode} 正在分析中，请等待完成`);
        } else {
          setStoreError(err instanceof Error ? err.message : '分析失败');
        }
      }
    } finally {
      setIsAnalyzing(false);
      setLoading(false);
    }
  };

  // 回车提交
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && stockCode && !isAnalyzing) {
      handleAnalyze();
    }
  };

  // 初始加载
  useEffect(() => {
    fetchHistory(true);
    fetchWatchlist();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部输入栏 */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-white/5 bg-slate-900/50">
        <div className="flex items-center gap-3">
          {/* 市场概览 */}
          <MarketOverview />

          <div className="w-px h-6 bg-white/10" />

          {/* 自选股下拉 */}
          <WatchlistDropdown
            stocks={watchlist}
            onSelect={handleWatchlistSelect}
            isLoading={isLoadingWatchlist}
            variant="default"
          />

          <div className="flex-1" />

          {/* 输入区域 */}
          <div className="flex items-center gap-2 max-w-lg flex-1">
            {/* 自选股快速选择 */}
            <div className="relative" id="input-watchlist-dropdown">
              <WatchlistDropdown
                stocks={watchlist}
                onSelect={(code) => setStockCode(code)}
                isLoading={isLoadingWatchlist}
                variant="compact"
              />
            </div>

            <div className="flex-1 relative">
              <input
                type="text"
                value={stockCode}
                onChange={(e) => {
                  setStockCode(e.target.value.toUpperCase());
                  setInputError(undefined);
                }}
                onKeyDown={handleKeyDown}
                placeholder="输入股票代码或选择自选..."
                disabled={isAnalyzing}
                className={`input-terminal w-full ${inputError ? 'border-danger/50' : ''}`}
              />
              {inputError && (
                <p className="absolute -bottom-5 left-0 text-xs text-danger">{inputError}</p>
              )}
              {duplicateError && (
                <p className="absolute -bottom-5 left-0 text-xs text-warning">{duplicateError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!stockCode || isAnalyzing}
              className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
            >
              {isAnalyzing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  分析中
                </>
              ) : (
                '分析'
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 flex overflow-hidden">
        {/* 左侧：任务 + 股票历史列表 */}
        <div className="flex flex-col w-72 flex-shrink-0 border-r border-white/5 bg-slate-900/30">
          {/* 任务面板 */}
          <TaskPanel tasks={activeTasks} />

          {/* 股票历史列表 */}
          <div className="flex-1 overflow-hidden">
            <StockHistoryList
              stocks={stockHistories}
              selectedQueryId={selectedReport?.meta.queryId}
              selectedStockCode={selectedStockCode}
              onStockClick={handleStockClick}
              onItemClick={handleHistoryClick}
              isLoading={isLoadingHistory}
              onWatchlistChange={fetchWatchlist}
            />
          </div>
        </div>

        {/* 右侧报告详情 */}
        <section className="flex-1 overflow-y-auto p-4">
          {isLoadingReport ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-10 h-10 border-3 border-cyan/20 border-t-cyan rounded-full animate-spin" />
              <p className="mt-3 text-secondary text-sm">加载报告中...</p>
            </div>
          ) : selectedReport ? (
            <div className="max-w-4xl mx-auto">
              <ReportSummary data={selectedReport} isHistory />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 mb-3 rounded-xl bg-elevated flex items-center justify-center">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-base font-medium text-white mb-1.5">开始分析</h3>
              <p className="text-xs text-muted max-w-xs">
                从左侧选择股票查看历史报告，或输入股票代码开始新分析
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default HomePage;
