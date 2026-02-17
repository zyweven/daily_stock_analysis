import type React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import BacktestPage from './pages/BacktestPage';
import SettingsPage from './pages/SettingsPage';
import ExpertPanelPage from './pages/ExpertPanelPage';
import StockManagementPage from './pages/StockManagementPage';
import ChatPage from './pages/ChatPage';
import NotFoundPage from './pages/NotFoundPage';
import './App.css';

// 侧边导航图标
const HomeIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

const StockIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const BacktestIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
);

const SettingsIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const ExpertPanelIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const ChatIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
);

type DockItem = {
    key: string;
    label: string;
    to: string;
    icon: React.FC<{ active?: boolean }>;
};

const NAV_ITEMS: DockItem[] = [
    {
        key: 'home',
        label: '首页',
        to: '/',
        icon: HomeIcon,
    },
    {
        key: 'stocks',
        label: '自选',
        to: '/stocks',
        icon: StockIcon,
    },
    {
        key: 'backtest',
        label: '回测',
        to: '/backtest',
        icon: BacktestIcon,
    },
    {
        key: 'settings',
        label: '设置',
        to: '/settings',
        icon: SettingsIcon,
    },
    {
        key: 'expert-panel',
        label: '会诊',
        to: '/expert-panel',
        icon: ExpertPanelIcon,
    },
    {
        key: 'chat',
        label: 'AI',
        to: '/chat',
        icon: ChatIcon,
    },
];

// Dock 导航栏
const DockNav: React.FC = () => {
    return (
        <aside className="dock-nav" aria-label="主导航">
            <div className="dock-surface">
                <NavLink to="/" className="dock-logo" title="首页" aria-label="首页">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </NavLink>

                <nav className="dock-items" aria-label="页面">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.key}
                                to={item.to}
                                end={item.to === '/'}
                                title={item.label}
                                aria-label={item.label}
                                className={({ isActive }) => `dock-item${isActive ? ' is-active' : ''}`}
                            >
                                {({ isActive }) => <Icon active={isActive} />}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="dock-footer" />
            </div>
        </aside>
    );
};

const App: React.FC = () => {
    return (
        <Router>
            <div className="flex min-h-screen bg-base">
                {/* Dock 导航 */}
                <DockNav />

                {/* 主内容区 */}
                <main className="flex-1 dock-safe-area">
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/backtest" element={<BacktestPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/expert-panel" element={<ExpertPanelPage />} />
                        <Route path="/stocks" element={<StockManagementPage />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
};

export default App;
