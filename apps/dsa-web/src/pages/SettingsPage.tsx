import React, { useEffect, useState } from 'react';
import './SettingsPage.css';
import { useSystemConfig } from '../hooks';
import { SettingsAlert, SettingsField, SettingsLoading } from '../components/settings';
import { getCategoryDescriptionZh, getCategoryTitleZh } from '../utils/systemConfigI18n';

// 分类图标映射
const CATEGORY_ICONS: Record<string, string> = {
  ai_model: '🤖',
  data_source: '📊',
  system: '⚙️',
  expert_panel: '🔬',
  notification: '🔔',
  default: '⚙️',
};

// 分类分组标题（按逻辑分组显示）
const GROUP_TITLES: Record<string, string> = {
  openai: 'OpenAI 配置',
  gemini: 'Gemini 配置',
  extra: '扩展模型配置',
  stock: '股票数据源',
  analysis: '分析设置',
  general: '通用设置',
};

// 判断配置项属于哪个分组
function getGroupForItem(itemKey: string): string {
  const key = itemKey.toLowerCase();
  if (key.includes('openai')) return 'openai';
  if (key.includes('gemini')) return 'gemini';
  if (key.includes('extra')) return 'extra';
  if (key.includes('stock') || key.includes('tushare')) return 'stock';
  if (key.includes('analysis') || key.includes('panel')) return 'analysis';
  return 'general';
}

// 对配置项按组分组
function groupItems(items: any[]) {
  const groups: Record<string, any[]> = {};
  items.forEach(item => {
    const group = getGroupForItem(item.key);
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  });
  return groups;
}

const SettingsPage: React.FC = () => {
  const {
    categories,
    itemsByCategory,
    issueByKey,
    activeCategory,
    setActiveCategory,
    hasDirty,
    dirtyCount,
    toast,
    clearToast,
    isLoading,
    isSaving,
    loadError,
    saveError,
    retryAction,
    load,
    retry,
    save,
    setDraftValue,
    fetchModels,
  } = useSystemConfig();

  const [discoveredModelsByKey, setDiscoveredModelsByKey] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      clearToast();
    }, 3200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [clearToast, toast]);

  const activeItems = itemsByCategory[activeCategory] || [];
  const groupedItems = groupItems(activeItems);

  const handleFetchModelsForField = async (key: string) => {
    let apiKey = '';
    let baseUrl = '';

    if (key === 'OPENAI_MODEL') {
      apiKey = itemsByCategory.ai_model?.find((i) => i.key === 'OPENAI_API_KEY')?.value || '';
      baseUrl = itemsByCategory.ai_model?.find((i) => i.key === 'OPENAI_BASE_URL')?.value || '';
    }

    if (!apiKey) return;

    const discovered = await fetchModels(apiKey, baseUrl);
    if (discovered.length > 0) {
      setDiscoveredModelsByKey((prev) => ({
        ...prev,
        [key]: discovered,
      }));
    }
  };

  return (
    <div className="sp-page">
      {/* 页面头部 */}
      <header className="sp-header">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="sp-header__title">⚙️ 系统设置</h1>
            <p className="sp-header__subtitle">
              管理 AI 模型、数据源和系统运行参数
            </p>
          </div>

          <div className="sp-header__actions">
            <button
              type="button"
              className="sp-btn sp-btn--secondary"
              onClick={() => void load()}
              disabled={isLoading || isSaving}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              重置
            </button>
            <button
              type="button"
              className="sp-btn sp-btn--primary"
              onClick={() => void save()}
              disabled={!hasDirty || isSaving || isLoading}
            >
              {isSaving ? (
                <>
                  <span className="sp-icon" style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                  保存中...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  保存配置
                  {dirtyCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                      {dirtyCount}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>

        {saveError && (
          <SettingsAlert
            className="mt-4"
            title="保存失败"
            message={saveError}
            actionLabel={retryAction === 'save' ? '重试保存' : undefined}
            onAction={retryAction === 'save' ? () => void retry() : undefined}
          />
        )}
      </header>

      {loadError && (
        <SettingsAlert
          title="加载设置失败"
          message={loadError}
          actionLabel={retryAction === 'load' ? '重试加载' : '重新加载'}
          onAction={() => void retry()}
          className="mb-4"
        />
      )}

      {isLoading ? (
        <SettingsLoading />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          {/* 侧边栏分类导航 */}
          <aside className="sp-sidebar">
            <p className="sp-sidebar__title">配置分类</p>
            <div className="sp-category-list">
              {categories.map((category) => {
                const isActive = category.category === activeCategory;
                const count = (itemsByCategory[category.category] || []).length;
                const title = getCategoryTitleZh(category.category, category.title);
                const description = getCategoryDescriptionZh(category.category, category.description);
                const icon = CATEGORY_ICONS[category.category] || CATEGORY_ICONS.default;

                return (
                  <button
                    key={category.category}
                    type="button"
                    className={`sp-category-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => setActiveCategory(category.category)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="sp-category-btn__icon">{icon}</span>
                      <div className="sp-category-btn__content">
                        <span className="sp-category-btn__title">
                          {title}
                          <span className="sp-category-btn__count">{count}</span>
                        </span>
                        {description && (
                          <span className="sp-category-btn__desc">{description}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* 配置内容区 */}
          <section className="sp-content">
            {activeItems.length ? (
              Object.entries(groupedItems).map(([groupKey, items]) => (
                <div key={groupKey} className="sp-group">
                  <h3 className="sp-group__title">{GROUP_TITLES[groupKey] || '其他设置'}</h3>
                  <div className="sp-group__content">
                    {items.map((item) => (
                      <SettingsField
                        key={item.key}
                        item={item}
                        value={item.value}
                        disabled={isSaving}
                        isFetching={false}
                        discoveredModels={discoveredModelsByKey[item.key]}
                        onFetch={item.key === 'OPENAI_MODEL' ? () => void handleFetchModelsForField(item.key) : undefined}
                        onChange={setDraftValue}
                        issues={issueByKey[item.key] || []}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="sp-empty">
                <div className="text-4xl mb-2">📂</div>
                <p>当前分类下暂无配置项</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Toast 通知 */}
      {toast && (
        <div className="sp-toast">
          <SettingsAlert
            title={toast.type === 'success' ? '操作成功' : '操作失败'}
            message={toast.message}
            variant={toast.type === 'success' ? 'success' : 'error'}
          />
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
