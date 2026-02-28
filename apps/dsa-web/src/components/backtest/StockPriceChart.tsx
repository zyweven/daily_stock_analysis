import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { stockApi } from '../../api/stocks';

interface StockPriceChartProps {
  code: string;
  analysisDate?: string;
  stopLoss?: number;
  takeProfit?: number;
  width?: number;
  height?: number;
  onClick?: () => void;
}

interface PriceData {
  date: string;
  close: number;
  high: number;
  low: number;
}

export const StockPriceChart: React.FC<StockPriceChartProps> = ({
  code,
  analysisDate,
  stopLoss,
  takeProfit,
  width = 300,
  height = 120,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!code) return;
      setLoading(true);
      setError(null);
      try {
        const response = await stockApi.getHistory(code, 60); // 获取60天数据
        const priceData = response.data.map(d => ({
          date: d.date,
          close: d.close,
          high: d.high,
          low: d.low,
        }));
        setData(priceData);
      } catch (err) {
        setError('获取数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [code]);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置canvas尺寸（考虑设备像素比）
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // 边距
    const padding = { top: 10, right: 10, bottom: 25, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 计算价格范围
    const prices = data.map(d => d.close);
    const minPrice = Math.min(...prices, ...(stopLoss ? [stopLoss] : []), ...(takeProfit ? [takeProfit] : []));
    const maxPrice = Math.max(...prices, ...(stopLoss ? [stopLoss] : []), ...(takeProfit ? [takeProfit] : []));
    const priceRange = maxPrice - minPrice || 1;
    const priceScale = chartHeight / priceRange;

    // 计算日期范围
    const dates = data.map(d => new Date(d.date).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const dateRange = maxDate - minDate || 1;
    const dateScale = chartWidth / dateRange;

    // 辅助函数：价格转Y坐标
    const priceToY = (price: number) => padding.top + (maxPrice - price) * priceScale;
    // 辅助函数：日期转X坐标
    const dateToX = (date: number) => padding.left + (date - minDate) * dateScale;

    // 绘制网格线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // 绘制价格曲线
    ctx.strokeStyle = '#06b6d4'; // cyan-500
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = dateToX(new Date(d.date).getTime());
      const y = priceToY(d.close);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 绘制分析日期标记
    if (analysisDate) {
      const analysisTime = new Date(analysisDate).getTime();
      const analysisX = dateToX(analysisTime);

      // 绘制垂直虚线
      ctx.strokeStyle = '#f59e0b'; // amber-500
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(analysisX, padding.top);
      ctx.lineTo(analysisX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // 标记文字
      ctx.fillStyle = '#f59e0b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('分析日', analysisX, padding.top + 10);
    }

    // 绘制止损线
    if (stopLoss) {
      const y = priceToY(stopLoss);
      ctx.strokeStyle = '#ef4444'; // red-500
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`止损 ${stopLoss.toFixed(2)}`, width - padding.right - 2, y - 2);
    }

    // 绘制止盈线
    if (takeProfit) {
      const y = priceToY(takeProfit);
      ctx.strokeStyle = '#10b981'; // emerald-500
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`止盈 ${takeProfit.toFixed(2)}`, width - padding.right - 2, y - 2);
    }

    // 绘制X轴日期标签
    ctx.fillStyle = '#64748b';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    const dateLabels = [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]];
    dateLabels.forEach(d => {
      const x = dateToX(new Date(d.date).getTime());
      const dateStr = d.date.slice(5); // MM-DD
      ctx.fillText(dateStr, x, height - 8);
    });

    // 绘制当前价格标签
    const lastPrice = data[data.length - 1]?.close;
    if (lastPrice) {
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(lastPrice.toFixed(2), width - padding.right - 35, padding.top + 10);
    }
  }, [data, analysisDate, stopLoss, takeProfit, width, height]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-slate-800/50 rounded" style={{ width, height }}>
        <div className="w-4 h-4 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (error || data.length === 0) {
    return (
      <div className="flex items-center justify-center bg-slate-800/50 rounded text-[10px] text-slate-500" style={{ width, height }}>
        暂无数据
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className={`bg-slate-800/30 rounded transition-colors ${onClick ? 'cursor-pointer hover:bg-slate-800/50 hover:ring-1 hover:ring-cyan/50' : ''}`}
      style={{ width, height }}
      title={`${code} 股价走势 | 蓝线:收盘价 | 黄线:分析日 | 绿线:止盈 | 红线:止损${onClick ? ' | 点击查看大图' : ''}`}
    />
  );
};
