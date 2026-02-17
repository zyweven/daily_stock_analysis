import React, { useEffect, useState } from 'react';
import { stockApi } from '../api/stocks';
import type { StockInfo } from '../api/stocks';

const StockManagementPage: React.FC = () => {
    const [stocks, setStocks] = useState<StockInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [filterActive, setFilterActive] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Form State
    const [newStockCode, setNewStockCode] = useState('');
    const [newStockTags, setNewStockTags] = useState('');
    const [newStockRemark, setNewStockRemark] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Track refreshing state for individual stocks
    const [refreshingStocks, setRefreshingStocks] = useState<Set<string>>(new Set());

    const loadStocks = async () => {
        setIsLoading(true);
        try {
            const data = await stockApi.list(filterActive);
            setStocks(data);
        } catch (error) {
            console.error("Failed to load stocks", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadStocks();
    }, [filterActive]);

    // 自动刷新逻辑：已移除，改为手动刷新

    const handleSync = async () => {
        setIsLoading(true);
        try {
            const res = await stockApi.sync();
            alert(`同步完成，新增 ${res.addedCount} 只股票`);
            loadStocks();
        } catch (error) {
            alert("同步失败");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshInfo = async (code: string) => {
        setRefreshingStocks(prev => new Set(prev).add(code));
        try {
            await stockApi.refreshInfo(code);
            // 刷新成功后重新加载列表
            await loadStocks();
        } catch (error) {
            console.error("Refresh failed", error);
            alert("刷新失败，请稍后重试");
        } finally {
            setRefreshingStocks(prev => {
                const next = new Set(prev);
                next.delete(code);
                return next;
            });
        }
    };

    const handleAddStock = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        if (!newStockCode) {
            setFormError("请输入股票代码");
            return;
        }

        setIsSubmitting(true);
        try {
            const tags = newStockTags.split(/[,，\s]+/).filter(t => t.trim());
            await stockApi.add({
                code: newStockCode.trim(),
                tags: tags,
                remark: newStockRemark
            });
            setIsAddModalOpen(false);
            setNewStockCode('');
            setNewStockTags('');
            setNewStockRemark('');
            loadStocks();
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || "添加失败";
            setFormError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (code: string) => {
        if (!window.confirm(`确定要删除 ${code} 吗？`)) return;
        try {
            await stockApi.delete(code);
            loadStocks();
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const handleToggleActive = async (stock: StockInfo) => {
        try {
            await stockApi.update(stock.code, { isActive: !stock.isActive });
            loadStocks();
        } catch (error) {
            console.error("Update failed", error);
        }
    };

    // Remove auto-refresh effect that relied on name===code
    // Instead we rely on manual refresh or initial load

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-100">自选股管理</h1>
                    <p className="text-gray-400 text-sm mt-1">管理您的股票资产库与元数据</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSync}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors text-white"
                        disabled={isLoading}
                    >
                        同步配置 (.env)
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm transition-colors text-white font-medium"
                    >
                        + 添加股票
                    </button>
                </div>
            </header>

            {/* Filters */}
            <div className="flex items-center gap-4 bg-[#1e293b]/50 p-4 rounded-lg border border-white/5">
                <label className="flex items-center gap-2 cursor-pointer text-gray-300 select-none">
                    <input
                        type="checkbox"
                        checked={filterActive}
                        onChange={(e) => setFilterActive(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                    />
                    仅显示启用
                </label>
                <div className="text-sm text-gray-500 ml-auto">
                    共 {stocks.length} 只股票
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#1e293b]">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-black/20 text-xs uppercase text-gray-400">
                        <tr>
                            <th className="px-6 py-4 font-medium">代码 / 名称</th>
                            <th className="px-6 py-4 font-medium">行业 / 地区</th>
                            <th className="px-6 py-4 font-medium">标签</th>
                            <th className="px-6 py-4 font-medium">备注</th>
                            <th className="px-6 py-4 font-medium text-center">状态</th>
                            <th className="px-6 py-4 font-medium text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {isLoading && stocks.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    加载中...
                                </td>
                            </tr>
                        ) : stocks.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    暂无数据，请尝试同步或添加
                                </td>
                            </tr>
                        ) : (
                            stocks.map((stock) => (
                                <tr key={stock.code} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="font-mono font-medium text-white">{stock.code}</div>
                                            <div className="text-gray-400 flex items-center gap-2">
                                                {stock.name === stock.code ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-500 italic">待获取名称</span>
                                                        <button
                                                            onClick={() => handleRefreshInfo(stock.code)}
                                                            disabled={refreshingStocks.has(stock.code)}
                                                            className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50 flex items-center gap-1"
                                                            title="手动刷新信息"
                                                        >
                                                            {refreshingStocks.has(stock.code) ? (
                                                                <>
                                                                    <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                                                    获取中
                                                                </>
                                                            ) : (
                                                                '刷新'
                                                            )}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    stock.name || '--'
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span>{stock.industry || '--'}</span>
                                            <span className="text-xs text-gray-500">{stock.area}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {stock.tags.map((tag, i) => (
                                                <span key={i} className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    {tag}
                                                </span>
                                            ))}
                                            {stock.tags.length === 0 && <span className="text-gray-600 italic">无</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 max-w-xs truncate" title={stock.remark || ''}>
                                        {stock.remark || <span className="text-gray-600 italic">--</span>}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => handleToggleActive(stock)}
                                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${stock.isActive
                                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                        >
                                            {stock.isActive ? '启用' : '禁用'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleRefreshInfo(stock.code)}
                                                disabled={refreshingStocks.has(stock.code)}
                                                className="text-blue-400 hover:text-blue-300 text-xs disabled:opacity-50 flex items-center gap-1"
                                                title="刷新股票信息（名称、行业、地区）"
                                            >
                                                {refreshingStocks.has(stock.code) ? (
                                                    <>
                                                        <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                                        刷新中
                                                    </>
                                                ) : (
                                                    '刷新'
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(stock.code)}
                                                className="text-red-400 hover:text-red-300 hover:underline text-xs"
                                            >
                                                删除
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[#1e293b] rounded-lg border border-white/10 shadow-xl w-full max-w-md p-6 animate-fade-in relative">
                        <h2 className="text-xl font-bold text-white mb-4">添加自选股</h2>
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            ✕
                        </button>

                        <form onSubmit={handleAddStock} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">股票代码</label>
                                <input
                                    type="text"
                                    value={newStockCode}
                                    onChange={(e) => setNewStockCode(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                                    placeholder="例如: 600519"
                                    autoFocus
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">标签 (可选)</label>
                                <input
                                    type="text"
                                    value={newStockTags}
                                    onChange={(e) => setNewStockTags(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                                    placeholder="空格或逗号分隔，如: 白酒 龙头"
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">备注 (可选)</label>
                                <textarea
                                    value={newStockRemark}
                                    onChange={(e) => setNewStockRemark(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none h-20 resize-none disabled:opacity-50"
                                    placeholder="写点什么..."
                                    disabled={isSubmitting}
                                />
                            </div>

                            {formError && (
                                <div className="text-red-400 text-sm bg-red-400/10 px-3 py-2 rounded">
                                    {formError}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white disabled:opacity-50"
                                    disabled={isSubmitting}
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            处理中...
                                        </>
                                    ) : (
                                        '确认添加'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockManagementPage;
