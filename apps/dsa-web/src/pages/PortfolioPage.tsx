import React, { useEffect, useState } from 'react';
import { portfolioApi } from '../api/portfolio';
import { userConfigApi } from '../api/userConfig';
import { stockApi } from '../api/stocks';
import type { PositionWithProfit, PortfolioSummary, CreatePositionRequest } from '../api/portfolio';
import type { StockInfo } from '../api/stocks';
import toast from 'react-hot-toast';
import { Button } from '../components/common';

const PortfolioPage: React.FC = () => {
    const [positions, setPositions] = useState<PositionWithProfit[]>([]);
    const [summary, setSummary] = useState<PortfolioSummary | null>(null);
    const [groups, setGroups] = useState<string[]>([]);
    const [stockList, setStockList] = useState<StockInfo[]>([]);
    const [totalPrincipal, setTotalPrincipal] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSettingModalOpen, setIsSettingModalOpen] = useState(false);

    // 表单状态
    const [formData, setFormData] = useState<CreatePositionRequest>({
        code: '',
        name: '',
        quantity: 0,
        costPrice: 0,
        groupName: '默认分组',
        remark: ''
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 本金设置表单
    const [principalInput, setPrincipalInput] = useState<string>('');

    // 加载持仓数据（基础数据，不含实时行情）
    const loadPositions = async () => {
        setIsLoading(true);
        try {
            const [positionData, summaryData, groupData, principalData] = await Promise.all([
                portfolioApi.list(selectedGroup || undefined).catch(err => {
                    console.error('加载持仓列表失败:', err);
                    return [];
                }),
                portfolioApi.getSummary().catch(err => {
                    console.error('加载汇总失败:', err);
                    return {
                        totalPositions: 0,
                        totalCostValue: 0,
                        totalQuantity: 0,
                        groups: [],
                        codes: []
                    };
                }),
                portfolioApi.getGroups().catch(err => {
                    console.error('加载分组失败:', err);
                    return [];
                }),
                userConfigApi.getPrincipal().catch(err => {
                    console.error('加载本金失败:', err);
                    return { totalPrincipal: null };
                })
            ]);

            // 确保数据有效
            setPositions(Array.isArray(positionData) ? positionData : []);
            setSummary(summaryData || {
                totalPositions: 0,
                totalCostValue: 0,
                totalQuantity: 0,
                groups: [],
                codes: []
            });
            setGroups(Array.isArray(groupData) ? groupData : []);
            setTotalPrincipal(principalData?.totalPrincipal ?? null);
        } catch (error) {
            console.error('加载持仓失败:', error);
            toast.error('加载持仓数据失败，请检查后端服务是否启动');
            setPositions([]);
            setSummary({
                totalPositions: 0,
                totalCostValue: 0,
                totalQuantity: 0,
                groups: [],
                codes: []
            });
            setGroups([]);
        } finally {
            setIsLoading(false);
        }
    };

    // 刷新实时行情（按需调用）
    const refreshQuotes = async () => {
        setIsRefreshingQuotes(true);
        try {
            const positionData = await portfolioApi.listWithProfit(selectedGroup || undefined);
            setPositions(Array.isArray(positionData) ? positionData : []);
            toast.success('行情已更新');
        } catch (error) {
            console.error('刷新行情失败:', error);
            toast.error('刷新行情失败');
        } finally {
            setIsRefreshingQuotes(false);
        }
    };

    // 加载自选股列表
    const loadStockList = async () => {
        try {
            const data = await stockApi.list(true);
            setStockList(data);
        } catch (error) {
            console.error('加载自选股失败:', error);
        }
    };

    useEffect(() => {
        loadPositions();
        loadStockList();
    }, [selectedGroup]);

    // 当选择自选股时自动填充名称
    const handleStockSelect = (code: string) => {
        const stock = stockList.find(s => s.code === code);
        if (stock) {
            setFormData({
                ...formData,
                code: stock.code,
                name: stock.name || stock.code
            });
        }
    };

    // 添加持仓
    const handleAddPosition = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!formData.code || !formData.name || formData.quantity <= 0 || formData.costPrice <= 0) {
            setFormError('请填写完整信息（代码、名称、数量、成本价）');
            return;
        }

        setIsSubmitting(true);
        try {
            await portfolioApi.addOrUpdate(formData);
            toast.success('添加持仓成功');
            setIsAddModalOpen(false);
            setFormData({
                code: '',
                name: '',
                quantity: 0,
                costPrice: 0,
                groupName: '默认分组',
                remark: ''
            });
            loadPositions();
        } catch (error: any) {
            const msg = error.response?.data?.message || error.response?.data?.detail || error.message || '添加失败';
            setFormError(msg);
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // 设置本金
    const handleSetPrincipal = async () => {
        const amount = parseFloat(principalInput);
        if (!amount || amount <= 0) {
            toast.error('请输入有效的本金金额');
            return;
        }

        try {
            await userConfigApi.setPrincipal(amount);
            toast.success(`总本金已设置为 ¥${amount.toLocaleString()}`);
            setTotalPrincipal(amount);
            setIsSettingModalOpen(false);
            setPrincipalInput('');
            loadPositions(); // 重新加载持仓以更新仓位比例
        } catch (error: any) {
            const msg = error.response?.data?.message || error.response?.data?.detail || error.message || '设置失败';
            toast.error(msg);
        }
    };

    // 删除持仓
    const handleDelete = async (code: string, groupName: string) => {
        if (!window.confirm(`确定要删除 ${code} 的持仓吗？`)) return;

        try {
            await portfolioApi.delete(code, groupName);
            toast.success('删除成功');
            loadPositions();
        } catch (error: any) {
            const msg = error.response?.data?.message || error.response?.data?.detail || error.message || '删除失败';
            toast.error(msg);
        }
    };

    // 平仓
    const handleClose = async (code: string, groupName: string) => {
        if (!window.confirm(`确定要平仓 ${code} 吗？（记录将保留，状态变为已卖出）`)) return;

        try {
            await portfolioApi.close(code, groupName);
            toast.success('平仓成功');
            loadPositions();
        } catch (error: any) {
            const msg = error.response?.data?.message || error.response?.data?.detail || error.message || '平仓失败';
            toast.error(msg);
        }
    };

    // 格式化金额
    const formatMoney = (value: number | undefined | null) => {
        if (value === undefined || value === null || isNaN(value)) return '--';
        return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // 格式化百分比
    const formatPercent = (value: number | undefined | null) => {
        if (value === undefined || value === null || isNaN(value)) return '--';
        const prefix = value >= 0 ? '+' : '';
        return `${prefix}${value.toFixed(2)}%`;
    };

    // 计算总市值和总盈亏
    const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalCostValue = positions.reduce((sum, p) => sum + (p.costValue || (p.quantity * p.costPrice) || 0), 0);
    const totalProfitLoss = totalMarketValue - totalCostValue;
    const totalPositionRatio = totalPrincipal ? (totalCostValue / totalPrincipal * 100) : null;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* 标题和操作 */}
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-100">我的持仓</h1>
                    <p className="text-gray-400 text-sm mt-1">管理您的股票持仓和成本</p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="secondary"
                        onClick={refreshQuotes}
                        disabled={isRefreshingQuotes}
                    >
                        {isRefreshingQuotes ? '刷新中...' : '🔄 刷新行情'}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => setIsSettingModalOpen(true)}
                    >
                        ⚙️ 设置本金
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => setIsAddModalOpen(true)}
                    >
                        + 添加持仓
                    </Button>
                </div>
            </header>

            {/* 汇总卡片 */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-[#1e293b] rounded-lg p-4 border border-white/10">
                        <div className="text-gray-400 text-sm">持仓数量</div>
                        <div className="text-2xl font-bold text-white mt-1">{summary.totalPositions}</div>
                    </div>
                    <div className="bg-[#1e293b] rounded-lg p-4 border border-white/10">
                        <div className="text-gray-400 text-sm">总本金</div>
                        <div className="text-2xl font-bold text-white mt-1">
                            {totalPrincipal ? formatMoney(totalPrincipal) : (
                                <span className="text-gray-500 text-base">未设置</span>
                            )}
                        </div>
                    </div>
                    <div className="bg-[#1e293b] rounded-lg p-4 border border-white/10">
                        <div className="text-gray-400 text-sm">总投入</div>
                        <div className="text-2xl font-bold text-white mt-1">{formatMoney(totalCostValue)}</div>
                    </div>
                    <div className="bg-[#1e293b] rounded-lg p-4 border border-white/10">
                        <div className="text-gray-400 text-sm">总市值</div>
                        <div className="text-2xl font-bold text-white mt-1">
                            {totalMarketValue > 0 ? formatMoney(totalMarketValue) : '加载中...'}
                        </div>
                    </div>
                    <div className="bg-[#1e293b] rounded-lg p-4 border border-white/10">
                        <div className="text-gray-400 text-sm">总盈亏</div>
                        <div className={`text-2xl font-bold mt-1 ${totalProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {totalMarketValue > 0 ? (
                                <>
                                    <div>{formatMoney(totalProfitLoss)}</div>
                                    <div className="text-sm">{formatPercent(totalCostValue > 0 ? (totalProfitLoss / totalCostValue * 100) : 0)}</div>
                                </>
                            ) : '--'}
                        </div>
                    </div>
                </div>
            )}

            {/* 仓位提示 */}
            {totalPrincipal && totalCostValue > 0 && (
                <div className={`rounded-lg p-4 border ${
                    totalPositionRatio && totalPositionRatio > 100
                        ? 'bg-red-500/10 border-red-500/20'
                        : totalPositionRatio && totalPositionRatio > 80
                        ? 'bg-yellow-500/10 border-yellow-500/20'
                        : 'bg-blue-500/10 border-blue-500/20'
                }`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-medium text-white">
                                总仓位：{totalPositionRatio?.toFixed(1)}%
                                {totalPositionRatio && totalPositionRatio > 100 && ' ⚠️ 已超过本金'}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                可用资金：{formatMoney(Math.max(0, totalPrincipal - totalCostValue))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 筛选 */}
            <div className="flex items-center gap-4 bg-[#1e293b]/50 p-4 rounded-lg border border-white/5">
                <label className="flex items-center gap-2 cursor-pointer text-gray-300 select-none">
                    <span className="text-sm">分组：</span>
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded px-3 py-1.5 text-white focus:border-blue-500 focus:outline-none"
                    >
                        <option value="">全部分组</option>
                        {groups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                </label>
                <div className="text-sm text-gray-500 ml-auto">
                    共 {positions.length} 条持仓
                </div>
            </div>

            {/* 持仓表格 */}
            <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#1e293b]">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-black/20 text-xs uppercase text-gray-400">
                        <tr>
                            <th className="px-6 py-4 font-medium">股票</th>
                            <th className="px-6 py-4 font-medium text-right">持仓数量</th>
                            <th className="px-6 py-4 font-medium text-right">成本价</th>
                            <th className="px-6 py-4 font-medium text-right">现价</th>
                            <th className="px-6 py-4 font-medium text-right">市值</th>
                            <th className="px-6 py-4 font-medium text-right">盈亏</th>
                            <th className="px-6 py-4 font-medium text-right">仓位</th>
                            <th className="px-6 py-4 font-medium">分组</th>
                            <th className="px-6 py-4 font-medium text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {isLoading && positions.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                                    加载中...
                                </td>
                            </tr>
                        ) : positions.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                                    暂无持仓数据，点击右上角"添加持仓"开始
                                </td>
                            </tr>
                        ) : (
                            positions.map((position) => {
                                const profitColor = position.profitLossPct
                                    ? position.profitLossPct >= 0 ? 'text-green-400' : 'text-red-400'
                                    : 'text-gray-400';

                                return (
                                    <tr key={`${position.code}-${position.groupName}`} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <div className="font-mono font-medium text-white">{position.code}</div>
                                                <div className="text-xs text-gray-400">{position.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {position.quantity}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {formatMoney(position.costPrice)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {position.currentPrice ? formatMoney(position.currentPrice) : '--'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {position.marketValue ? formatMoney(position.marketValue) : '--'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {position.profitLoss !== undefined ? (
                                                <div>
                                                    <div className={profitColor}>{formatMoney(position.profitLoss)}</div>
                                                    <div className={`text-xs ${profitColor}`}>
                                                        {formatPercent(position.profitLossPct)}
                                                    </div>
                                                </div>
                                            ) : '--'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {position.positionRatio != null ? (
                                                <div className="text-blue-400">
                                                    {position.positionRatio.toFixed(1)}%
                                                </div>
                                            ) : '--'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                {position.groupName}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleClose(position.code, position.groupName)}
                                                    title="标记为已卖出"
                                                    className="text-yellow-400 hover:text-yellow-300"
                                                >
                                                    平仓
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(position.code, position.groupName)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    删除
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 添加持仓弹窗 */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[#1e293b] rounded-lg border border-white/10 shadow-xl w-full max-w-md p-6 animate-fade-in relative">
                        <h2 className="text-xl font-bold text-white mb-4">添加持仓</h2>
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            ✕
                        </button>

                        <form onSubmit={handleAddPosition} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    从自选股选择
                                </label>
                                <select
                                    value=""
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleStockSelect(e.target.value);
                                        }
                                    }}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none mb-2"
                                    disabled={isSubmitting}
                                >
                                    <option value="">-- 选择自选股快速填充 --</option>
                                    {stockList.map(stock => (
                                        <option key={stock.code} value={stock.code}>
                                            {stock.code} - {stock.name || '未知'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">
                                        股票代码 <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                                        placeholder="例如: 600519"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">
                                        股票名称 <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                                        placeholder="例如: 贵州茅台"
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">
                                        持仓数量 <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.quantity || ''}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                                        placeholder="100"
                                        min="0"
                                        step="1"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">
                                        成本价 <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.costPrice || ''}
                                        onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                                        placeholder="1600.00"
                                        min="0"
                                        step="0.01"
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">分组</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={formData.groupName}
                                        onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                                        className="flex-1 bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                                        placeholder="默认分组"
                                        disabled={isSubmitting}
                                        list="group-list"
                                    />
                                    <datalist id="group-list">
                                        {groups.map(group => (
                                            <option key={group} value={group} />
                                        ))}
                                    </datalist>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">可输入新分组或选择现有分组</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">备注</label>
                                <textarea
                                    value={formData.remark}
                                    onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none h-20 resize-none"
                                    placeholder="可选备注（如：长线持有、目标价2000等）..."
                                    disabled={isSubmitting}
                                />
                            </div>

                            {formError && (
                                <div className="text-red-400 text-sm bg-red-400/10 px-3 py-2 rounded">
                                    {formError}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsAddModalOpen(false)}
                                    disabled={isSubmitting}
                                >
                                    取消
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    isLoading={isSubmitting}
                                >
                                    {isSubmitting ? '处理中...' : '确认添加'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 设置本金弹窗 */}
            {isSettingModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[#1e293b] rounded-lg border border-white/10 shadow-xl w-full max-w-md p-6 animate-fade-in relative">
                        <h2 className="text-xl font-bold text-white mb-4">设置总本金</h2>
                        <button
                            onClick={() => setIsSettingModalOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            ✕
                        </button>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    总本金金额
                                </label>
                                <input
                                    type="number"
                                    value={principalInput}
                                    onChange={(e) => setPrincipalInput(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                                    placeholder="例如：100000（10万元）"
                                    min="0"
                                    step="0.01"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    设置后可用于计算仓位比例和可用资金
                                </p>
                            </div>

                            {totalPrincipal && (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3">
                                    <div className="text-sm text-gray-400">当前本金</div>
                                    <div className="text-lg font-bold text-white mt-1">
                                        ¥{totalPrincipal.toLocaleString()}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsSettingModalOpen(false)}
                                >
                                    取消
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSetPrincipal}
                                >
                                    确认设置
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 使用提示 */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <h3 className="text-blue-400 font-medium mb-2">💡 在AI对话中使用持仓</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                    <li>• 在AI对话中输入："我持仓什么股票？"可以查看持仓列表和盈亏</li>
                    <li>• 输入："帮我看看持仓的股票最近分析"可以获取持仓股票的AI分析</li>
                    <li>• 输入："贵州茅台历史分析"可以查看该股票的历史分析记录</li>
                </ul>
            </div>
        </div>
    );
};

export default PortfolioPage;
