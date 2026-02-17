import React, { useState, useEffect, useRef } from 'react';
import { stockApi } from '../../api/stocks';
import type { StockInfo } from '../../api/stocks';

interface GlobalStockSelectorProps {
    value: string;
    onChange: (code: string) => void;
    placeholder?: string;
    className?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const GlobalStockSelector: React.FC<GlobalStockSelectorProps> = ({
    value,
    onChange,
    placeholder = "输入股票代码或名称...",
    className = "",
    onKeyDown
}) => {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<StockInfo[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync query with value changes from parent (e.g. form reset, initial load)
    useEffect(() => {
        setQuery(value);
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // Search logic with debounce
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (!isOpen) return;

            setIsLoading(true);
            try {
                if (query.trim().length >= 1) {
                    // Search
                    const data = await stockApi.search(query);
                    setResults(data);
                } else {
                    // Empty query: load default (active) stocks
                    const data = await stockApi.list(true);
                    setResults(data.slice(0, 20)); // Increase limit slightly
                }
            } catch (error) {
                console.error("Fetch failed", error);
                // Don't clear results on error to prevent flashing if partial data exists?
                // Or clear. Let's clear for now to show "no results" state if needed.
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query, isOpen]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setIsOpen(true);
        onChange(e.target.value); // Allow free text input too
    };

    const handleSelect = (stock: StockInfo) => {
        setQuery(stock.code); // Or "code - name"
        onChange(stock.code);
        setIsOpen(false);
    };

    const handleFocus = async () => {
        setIsOpen(true);
        // The useEffect will trigger fetch if needed
    };

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={onKeyDown}
                />
                {isLoading && (
                    <div className="absolute right-3 top-2.5">
                        <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                )}
            </div>

            {/* Dropdown Results */}
            {isOpen && results.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 bg-[#1e293b] border border-white/10 rounded-md shadow-lg max-h-60 overflow-auto py-1">
                    {results.map((stock) => (
                        <li
                            key={stock.code}
                            className="px-4 py-2 hover:bg-white/5 cursor-pointer flex justify-between items-center group"
                            onClick={() => handleSelect(stock)}
                        >
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-200">
                                    {stock.code}
                                    {stock.name && <span className="ml-2 text-gray-400">- {stock.name}</span>}
                                </span>
                                {(stock.industry || stock.remark) && (
                                    <span className="text-xs text-gray-500 truncate max-w-[200px]">
                                        {stock.industry} {stock.remark ? `| ${stock.remark}` : ''}
                                    </span>
                                )}
                            </div>
                            {stock.tags && stock.tags.length > 0 && (
                                <div className="flex gap-1">
                                    {stock.tags.slice(0, 2).map((tag, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
