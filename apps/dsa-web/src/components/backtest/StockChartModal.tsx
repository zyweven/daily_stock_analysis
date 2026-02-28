import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';

interface StockChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  name?: string;
  data: Array<{
    date: string;
    close: number;
    high: number;
    low: number;
  }>;
  analysisDate?: string;
  stopLoss?: number;
  takeProfit?: number;
  operationAdvice?: string;
  directionExpected?: string;
  outcome?: string;
  simulatedReturnPct?: number;
}

interface HoverInfo {
  x: number;
  y: number;
  date: string;
  price: number;
  index: number;
}

export const StockChartModal: React.FC<StockChartModalProps> = ({
  isOpen,
  onClose,
  code,
  name,
  data,
  analysisDate,
  stopLoss,
  takeProfit,
  operationAdvice,
  outcome,
  simulatedReturnPct,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // 响应式调整尺寸
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = Math.min(900, rect.width - 32);
        setDimensions({ width, height: Math.floor(width * 0.5) });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isOpen]);

  // 绘制图表
  const drawChart = useCallback(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // 边距
    const padding = { top: 50, right: 100, bottom: 60, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 清空画布
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 计算价格范围（留出边距）
    const prices = data.map(d => d.close);
    const rawMinPrice = Math.min(...prices, ...(stopLoss ? [stopLoss] : []), ...(takeProfit ? [takeProfit] : []));
    const rawMaxPrice = Math.max(...prices, ...(stopLoss ? [stopLoss] : []), ...(takeProfit ? [takeProfit] : []));
    const priceRange = rawMaxPrice - rawMinPrice || 1;
    const pricePadding = priceRange * 0.1;
    const minPrice = rawMinPrice - pricePadding;
    const maxPrice = rawMaxPrice + pricePadding;
    const adjustedPriceRange = maxPrice - minPrice;


    // 辅助函数
    const priceToY = (price: number) => padding.top + (maxPrice - price) / adjustedPriceRange * chartHeight;
    const indexToX = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;

    // 绘制网格线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;

    // 水平网格线 + Y轴标签
    const priceSteps = 5;
    for (let i = 0; i <= priceSteps; i++) {
      const y = padding.top + (chartHeight / priceSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const price = maxPrice - (adjustedPriceRange / priceSteps) * i;
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(2), padding.left - 10, y + 4);
    }

    // 垂直网格线 + X轴标签
    const dateSteps = Math.min(6, data.length);
    for (let i = 0; i < dateSteps; i++) {
      const index = Math.floor((data.length - 1) * i / (dateSteps - 1));
      const x = indexToX(index);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();

      const d = data[index];
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.date.slice(5), x, height - padding.bottom + 20);
    }

    // 绘制价格区域填充
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.beginPath();
    ctx.moveTo(indexToX(0), priceToY(data[0].close));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(indexToX(i), priceToY(data[i].close));
    }
    ctx.lineTo(indexToX(data.length - 1), height - padding.bottom);
    ctx.lineTo(indexToX(0), height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // 绘制价格曲线
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = indexToX(i);
      const y = priceToY(data[i].close);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // 绘制数据点
    for (let i = 0; i < data.length; i += Math.ceil(data.length / 20)) {
      const x = indexToX(i);
      const y = priceToY(data[i].close);
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制分析日期标记
    if (analysisDate) {
      const analysisTime = new Date(analysisDate).getTime();
      // 找到最接近的索引
      let closestIndex = 0;
      let minDiff = Infinity;
      for (let i = 0; i < data.length; i++) {
        const diff = Math.abs(new Date(data[i].date).getTime() - analysisTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
      const analysisX = indexToX(closestIndex);

      // 垂直虚线
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(analysisX, padding.top);
      ctx.lineTo(analysisX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // 标签背景
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(analysisX - 35, padding.top - 30, 70, 22);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('分析日', analysisX, padding.top - 14);

      // 在曲线上标记点
      const analysisY = priceToY(data[closestIndex].close);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(analysisX, analysisY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 绘制止损线
    if (stopLoss) {
      const y = priceToY(stopLoss);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`止损 ${stopLoss.toFixed(2)}`, width - padding.right + 5, y + 4);
    }

    // 绘制止盈线
    if (takeProfit) {
      const y = priceToY(takeProfit);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`止盈 ${takeProfit.toFixed(2)}`, width - padding.right + 5, y + 4);
    }

    // 标题
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${code} ${name || ''}`, padding.left, 30);

    // 当前价格
    const lastPrice = data[data.length - 1]?.close;
    if (lastPrice) {
      const change = data.length > 1 ? lastPrice - data[data.length - 2].close : 0;
      const changePct = data.length > 1 ? (change / data[data.length - 2].close) * 100 : 0;
      ctx.fillStyle = change >= 0 ? '#10b981' : '#ef4444';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${lastPrice.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct.toFixed(2)}%)`,
        width - padding.right,
        30
      );
    }

    // 绘制悬停十字线
    if (hoverInfo) {
      const { x, y } = hoverInfo;

      // 垂直线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();

      // 水平线
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 交点高亮
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    return { indexToX, priceToY };
  }, [data, analysisDate, stopLoss, takeProfit, code, name, dimensions, hoverInfo]);

  useEffect(() => {
    if (isOpen) {
      drawChart();
    }
  }, [isOpen, drawChart]);

  // 鼠标移动处理
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width / window.devicePixelRatio);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height / window.devicePixelRatio);

    const padding = { top: 50, right: 100, bottom: 60, left: 60 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    // 检查是否在图表区域内
    if (x < padding.left || x > dimensions.width - padding.right ||
        y < padding.top || y > dimensions.height - padding.bottom) {
      setHoverInfo(null);
      return;
    }

    // 计算最近的数据点
    const relativeX = x - padding.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(index, data.length - 1));
    const dataPoint = data[clampedIndex];

    // 计算价格
    const prices = data.map(d => d.close);
    const rawMinPrice = Math.min(...prices, ...(stopLoss ? [stopLoss] : []), ...(takeProfit ? [takeProfit] : []));
    const rawMaxPrice = Math.max(...prices, ...(stopLoss ? [stopLoss] : []), ...(takeProfit ? [takeProfit] : []));
    const priceRange = rawMaxPrice - rawMinPrice || 1;
    const pricePadding = priceRange * 0.1;
    const minPrice = rawMinPrice - pricePadding;
    const maxPrice = rawMaxPrice + pricePadding;
    const adjustedPriceRange = maxPrice - minPrice;

    const dataX = padding.left + (clampedIndex / (data.length - 1)) * chartWidth;
    const dataY = padding.top + (maxPrice - dataPoint.close) / adjustedPriceRange * chartHeight;

    setHoverInfo({
      x: dataX,
      y: dataY,
      date: dataPoint.date,
      price: dataPoint.close,
      index: clampedIndex,
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative bg-slate-900 rounded-xl border border-white/10 shadow-2xl p-4 w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Chart */}
        {data.length > 0 ? (
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="rounded-lg cursor-crosshair"
              style={{ width: dimensions.width, height: dimensions.height }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />

            {/* 悬停信息提示框 */}
            {hoverInfo && (
              <div
                className="absolute pointer-events-none bg-slate-800/95 border border-white/10 rounded-lg px-3 py-2 shadow-lg"
                style={{
                  left: Math.min(hoverInfo.x + 10, dimensions.width - 150),
                  top: Math.max(hoverInfo.y - 50, 10),
                }}
              >
                <div className="text-xs text-slate-400">{hoverInfo.date}</div>
                <div className="text-sm font-mono font-semibold text-cyan">
                  ¥{hoverInfo.price.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center bg-slate-800/50 rounded-lg" style={{ width: dimensions.width, height: dimensions.height }}>
            <p className="text-slate-500">暂无数据</p>
          </div>
        )}

        {/* 底部信息栏 */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* 图例 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cyan-500" />
              <span className="text-slate-400">收盘价</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500" />
              <span className="text-slate-400">分析日</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500" />
              <span className="text-slate-400">止盈</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500" />
              <span className="text-slate-400">止损</span>
            </div>
          </div>

          {/* 回测信息 */}
          {operationAdvice && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">AI建议:</span>
              <span className="text-amber-400 font-medium">{operationAdvice}</span>
            </div>
          )}
          {outcome && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">结果:</span>
              <span className={`font-medium ${
                outcome === 'win' ? 'text-emerald-400' :
                outcome === 'loss' ? 'text-red-400' : 'text-amber-400'
              }`}>
                {outcome === 'win' ? '盈利' : outcome === 'loss' ? '亏损' : '持平'}
                {simulatedReturnPct !== undefined && ` ${simulatedReturnPct > 0 ? '+' : ''}${simulatedReturnPct.toFixed(1)}%`}
              </span>
            </div>
          )}
        </div>

        {/* 提示 */}
        <p className="mt-3 text-[10px] text-slate-500 text-center">
          鼠标悬停查看详细数据 | 滚轮可缩放（暂不支持）
        </p>
      </div>
    </div>
  );
};
