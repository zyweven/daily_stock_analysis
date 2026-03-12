import React, { useState, useRef } from 'react';
import { Button } from '../common';
import toast from 'react-hot-toast';
import { stockImportApi, type StockImportItem } from '../../api/stockImport';

type ImportMode = 'text' | 'file' | 'image';

interface IntelligentImportProps {
  onImportComplete?: (items: StockImportItem[]) => void;
}

const UploadIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ImageIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const TextIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

export const IntelligentImport: React.FC<IntelligentImportProps> = ({ onImportComplete }) => {
  const [mode, setMode] = useState<ImportMode>('text');
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<StockImportItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleTextParse = async () => {
    if (!textInput.trim()) {
      toast.error('请输入股票代码或名称');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await stockImportApi.parseImport({
        content: textInput,
        content_type: 'text',
      });
      setResults(response.items);
      setSelectedItems(new Set(response.items.map((_, idx) => idx)));
      toast.success(`识别到 ${response.items.length} 只股票`);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || '解析失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileParse = async (file: File) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const base64Content = content.split(',')[1];

        const contentType = file.name.endsWith('.csv') ? 'csv' :
                           file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'excel' : 'text';

        const response = await stockImportApi.parseImport({
          content: base64Content,
          content_type: contentType,
          filename: file.name,
        });

        setResults(response.items);
        setSelectedItems(new Set(response.items.map((_, idx) => idx)));
        toast.success(`从文件中识别到 ${response.items.length} 只股票`);
        setIsProcessing(false);
      };
      reader.onerror = () => {
        toast.error('文件读取失败');
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || '文件解析失败');
      setIsProcessing(false);
    }
  };

  const handleImageParse = async (file: File) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const base64Content = content.split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        const response = await stockImportApi.extractFromImage({
          image_data: base64Content,
          mime_type: mimeType,
        });

        setResults(response.items);
        setSelectedItems(new Set(response.items.map((_, idx) => idx)));
        toast.success(`从图片中识别到 ${response.items.length} 只股票`);
        setIsProcessing(false);
      };
      reader.onerror = () => {
        toast.error('图片读取失败');
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || '图片识别失败');
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileParse(file);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageParse(file);
    }
  };

  const toggleSelection = (index: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleConfirmImport = () => {
    const selected = results.filter((_, idx) => selectedItems.has(idx));
    if (selected.length === 0) {
      toast.error('请至少选择一只股票');
      return;
    }
    onImportComplete?.(selected);
    setResults([]);
    setSelectedItems(new Set());
    setTextInput('');
  };

  const getConfidenceBadge = (confidence: string) => {
    const config = {
      high: { text: '高', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
      medium: { text: '中', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      low: { text: '低', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    };
    const c = config[confidence as keyof typeof config] || config.medium;
    return (
      <span className={`px-2 py-0.5 text-xs rounded border ${c.className}`}>
        {c.text}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
            mode === 'text'
              ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
              : 'bg-slate-800/50 border-slate-700 text-gray-400 hover:border-slate-600'
          }`}
          onClick={() => setMode('text')}
        >
          <TextIcon />
          <span>文本输入</span>
        </button>
        <button
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
            mode === 'file'
              ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
              : 'bg-slate-800/50 border-slate-700 text-gray-400 hover:border-slate-600'
          }`}
          onClick={() => setMode('file')}
        >
          <UploadIcon />
          <span>文件导入</span>
        </button>
        <button
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
            mode === 'image'
              ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
              : 'bg-slate-800/50 border-slate-700 text-gray-400 hover:border-slate-600'
          }`}
          onClick={() => setMode('image')}
        >
          <ImageIcon />
          <span>图片识别</span>
        </button>
      </div>

      {/* Input Area */}
      {mode === 'text' && (
        <div className="space-y-3">
          <textarea
            className="w-full min-h-[120px] px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-y"
            placeholder="输入股票代码或名称，支持多种格式：&#10;• 600519 贵州茅台&#10;• 000858,五粮液&#10;• 平安银行 招商银行"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isProcessing}
          />
          <Button
            variant="primary"
            onClick={handleTextParse}
            isLoading={isProcessing}
            disabled={!textInput.trim()}
          >
            解析股票
          </Button>
        </div>
      )}

      {mode === 'file' && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
            <p className="mt-2 text-gray-400">点击上传文件</p>
            <p className="mt-1 text-xs text-gray-500">支持 CSV、Excel、TXT 格式</p>
          </div>
        </div>
      )}

      {mode === 'image' && (
        <div className="space-y-3">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
          <div
            className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/30 transition-all"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon />
            <p className="mt-2 text-gray-400">点击上传图片</p>
            <p className="mt-1 text-xs text-gray-500">支持 JPG、PNG 等常见格式</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">
              识别结果 ({selectedItems.size}/{results.length})
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-cyan-400 hover:text-cyan-300"
                onClick={() => setSelectedItems(new Set(results.map((_, idx) => idx)))}
              >
                全选
              </button>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-300"
                onClick={() => setSelectedItems(new Set())}
              >
                清空
              </button>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 bg-slate-800/30 rounded-lg p-3">
            {results.map((item, index) => (
              <label
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedItems.has(index)
                    ? 'bg-cyan-500/10 border-cyan-500/50'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.has(index)}
                  onChange={() => toggleSelection(index)}
                  className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">
                      {item.code || '未知代码'}
                    </span>
                    {item.name && (
                      <span className="text-sm text-gray-400">{item.name}</span>
                    )}
                  </div>
                </div>
                {getConfidenceBadge(item.confidence)}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handleConfirmImport}
              disabled={selectedItems.size === 0}
              className="flex-1"
            >
              确认导入 ({selectedItems.size})
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResults([]);
                setSelectedItems(new Set());
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
