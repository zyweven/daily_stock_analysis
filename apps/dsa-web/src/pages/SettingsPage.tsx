import React, { useEffect, useState } from 'react';
import { useSystemConfig } from '../hooks';
import { SettingsAlert, SettingsField, SettingsLoading } from '../components/settings';
import { getCategoryDescriptionZh, getCategoryTitleZh } from '../utils/systemConfigI18n';

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
    isFetchingModels,
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
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearToast();
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearToast, toast]);

  const activeItems = itemsByCategory[activeCategory] || [];

  const handleFetchModelsForField = async (key: string) => {
    // Determine which credentials to use based on the field key
    let apiKey = '';
    let baseUrl = '';

    if (key === 'OPENAI_MODEL') {
      apiKey = itemsByCategory.ai_model?.find((i) => i.key === 'OPENAI_API_KEY')?.value || '';
      baseUrl = itemsByCategory.ai_model?.find((i) => i.key === 'OPENAI_BASE_URL')?.value || '';
    }

    if (!apiKey || apiKey.includes('***')) {
      toast?.message !== '请先填写并保存有效的 API Key' &&
        setActiveCategory('ai_model'); // Ensure we are in the right tab
      // Actually we can't easily tell if it's masked or just empty here without rawValueExists check
      // But usually if it's masked and we haven't changed it, we might need to use the server value.
      // useSystemConfig provides 'serverItems' or 'itemsByCategory' which already has 'value' (draft or server).
    }

    if (!apiKey) {
      // Show error via toast
      return;
    }

    const discovered = await fetchModels(apiKey, baseUrl);
    if (discovered.length > 0) {
      setDiscoveredModelsByKey((prev) => ({
        ...prev,
        [key]: discovered,
      }));
    }
  };

  return (
    <div className="min-h-screen px-4 pb-6 pt-4 md:px-6">
      <header className="mb-4 rounded-2xl border border-white/8 bg-card/80 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">系统设置</h1>
            <p className="text-sm text-secondary">
              默认使用 .env 中的配置
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={isLoading || isSaving}>
              重置
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void save()}
              disabled={!hasDirty || isSaving || isLoading}
            >
              {isSaving ? '保存中...' : `保存配置${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </button>
          </div>
        </div>

        {saveError ? (
          <SettingsAlert
            className="mt-3"
            title="保存失败"
            message={saveError}
            actionLabel={retryAction === 'save' ? '重试保存' : undefined}
            onAction={retryAction === 'save' ? () => void retry() : undefined}
          />
        ) : null}
      </header>

      {loadError ? (
        <SettingsAlert
          title="加载设置失败"
          message={loadError}
          actionLabel={retryAction === 'load' ? '重试加载' : '重新加载'}
          onAction={() => void retry()}
          className="mb-4"
        />
      ) : null}

      {isLoading ? (
        <SettingsLoading />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-white/8 bg-card/60 p-3 backdrop-blur-sm">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">配置分类</p>
            <div className="space-y-2">
              {categories.map((category) => {
                const isActive = category.category === activeCategory;
                const count = (itemsByCategory[category.category] || []).length;
                const title = getCategoryTitleZh(category.category, category.title);
                const description = getCategoryDescriptionZh(category.category, category.description);

                return (
                  <button
                    key={category.category}
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${isActive
                      ? 'border-accent bg-cyan/10 text-white'
                      : 'border-white/8 bg-elevated/40 text-secondary hover:border-white/16 hover:text-white'
                      }`}
                    onClick={() => setActiveCategory(category.category)}
                  >
                    <span className="flex items-center justify-between text-sm font-medium">
                      {title}
                      <span className="text-xs text-muted">{count}</span>
                    </span>
                    {description ? <span className="mt-1 block text-xs text-muted">{description}</span> : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-3 rounded-2xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm">
            {activeItems.length ? (
              activeItems.map((item) => (
                <SettingsField
                  key={item.key}
                  item={item}
                  value={item.value}
                  disabled={isSaving}
                  isFetching={isFetchingModels}
                  discoveredModels={discoveredModelsByKey[item.key]}
                  onFetch={item.key === 'OPENAI_MODEL' ? () => void handleFetchModelsForField(item.key) : undefined}
                  onChange={setDraftValue}
                  issues={issueByKey[item.key] || []}
                />
              ))
            ) : (
              <div className="rounded-xl border border-white/8 bg-elevated/40 p-5 text-sm text-secondary">
                当前分类下暂无配置项。
              </div>
            )}
          </section>
        </div>
      )}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 w-[320px] max-w-[calc(100vw-24px)]">
          <SettingsAlert
            title={toast.type === 'success' ? '操作成功' : '操作失败'}
            message={toast.message}
            variant={toast.type === 'success' ? 'success' : 'error'}
          />
        </div>
      ) : null}
    </div>
  );
};

export default SettingsPage;
