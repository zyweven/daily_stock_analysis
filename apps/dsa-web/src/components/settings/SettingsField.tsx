import { useState } from 'react';
import type React from 'react';
import { Select } from '../common';
import type { ConfigValidationIssue, SystemConfigItem } from '../../types/systemConfig';
import { getFieldDescriptionZh, getFieldTitleZh } from '../../utils/systemConfigI18n';
import { ExtraModelsEditor } from './ExtraModelsEditor';

function isMultiValueField(item: SystemConfigItem): boolean {
  const validation = (item.schema?.validation ?? {}) as Record<string, unknown>;
  return Boolean(validation.multiValue ?? validation.multi_value);
}

function parseMultiValues(value: string): string[] {
  if (!value) {
    return [''];
  }
  const values = value.split(',').map((entry) => entry.trim());
  return values.length ? values : [''];
}

function serializeMultiValues(values: string[]): string {
  return values.map((entry) => entry.trim()).join(',');
}

interface SettingsFieldProps {
  item: SystemConfigItem;
  value: string;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
  onFetch?: () => void;
  isFetching?: boolean;
  discoveredModels?: string[];
  issues?: ConfigValidationIssue[];
}

// 眼睛图标组件
const EyeIcon: React.FC<{ open?: boolean }> = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

// 警告图标
const AlertIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// Sparkles 图标
const SparklesIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3L14.5 8.5L20 11L14.5 13.5L12 19L9.5 13.5L4 11L9.5 8.5L12 3Z" />
    <path d="M5 3L5.5 4.5L7 5L5.5 5.5L5 7L4.5 5.5L3 5L4.5 4.5L5 3Z" />
    <path d="M19 15L19.5 16.5L21 17L19.5 17.5L19 19L18.5 17.5L17 17L18.5 16.5L19 15Z" />
  </svg>
);

// 标签组件
const FieldBadge: React.FC<{ type: 'sensitive' | 'required' | 'readonly' }> = ({ type }) => {
  const config = {
    sensitive: { text: '敏感', className: 'sp-badge--warning' },
    required: { text: '必填', className: 'sp-badge--danger' },
    readonly: { text: '只读', className: 'sp-badge--info' },
  };
  const c = config[type];
  return <span className={`sp-badge ${c.className}`}>{c.text}</span>;
};

// 渲染字段控件
function renderFieldControl(
  item: SystemConfigItem,
  value: string,
  disabled: boolean,
  onChange: (nextValue: string) => void,
  isSecretVisible: boolean,
  onToggleSecretVisible: () => void,
  onFetch?: () => void,
  isFetching?: boolean,
) {
  const schema = item.schema;
  const controlType = schema?.uiControl ?? 'text';
  const isMultiValue = isMultiValueField(item);

  // Extra Models 编辑器
  if (item.key === 'EXTRA_AI_MODELS') {
    return (
      <ExtraModelsEditor
        item={item}
        value={value}
        onChange={(_, v) => onChange(v)}
        disabled={disabled || !schema?.isEditable}
      />
    );
  }

  // Textarea
  if (controlType === 'textarea') {
    return (
      <textarea
        className="sp-input min-h-[92px] resize-y"
        value={value}
        disabled={disabled || !schema?.isEditable}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`请输入 ${getFieldTitleZh(item.key, item.key)}`}
      />
    );
  }

  // Select
  if (controlType === 'select' && schema?.options?.length) {
    return (
      <Select
        value={value}
        onChange={onChange}
        options={schema.options.map((option) => ({ value: option, label: option }))}
        disabled={disabled || !schema.isEditable}
        placeholder="请选择"
      />
    );
  }

  // Switch
  if (controlType === 'switch') {
    const checked = value.trim().toLowerCase() === 'true';
    return (
      <label className="sp-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || !schema?.isEditable}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          className="sp-switch__input"
        />
        <span className="sp-switch__label">{checked ? '已启用' : '未启用'}</span>
      </label>
    );
  }

  // Password (含多值支持)
  if (controlType === 'password') {
    if (isMultiValue) {
      const values = parseMultiValues(value);
      return (
        <div className="sp-multi-value">
          {values.map((entry, index) => (
            <div className="sp-multi-value__row" key={`${item.key}-${index}`}>
              <div className="sp-input__wrapper">
                <input
                  type={isSecretVisible ? 'text' : 'password'}
                  className="sp-input sp-input--password"
                  value={entry}
                  disabled={disabled || !schema?.isEditable}
                  onChange={(event) => {
                    const nextValues = [...values];
                    nextValues[index] = event.target.value;
                    onChange(serializeMultiValues(nextValues));
                  }}
                  placeholder={`密钥 ${index + 1}`}
                />
                <button
                  type="button"
                  className="sp-input__toggle"
                  onClick={onToggleSecretVisible}
                  tabIndex={-1}
                >
                  <EyeIcon open={isSecretVisible} />
                </button>
              </div>
              <button
                type="button"
                className="sp-btn sp-btn--ghost sp-btn--sm"
                disabled={disabled || !schema?.isEditable || values.length <= 1}
                onClick={() => {
                  const nextValues = values.filter((_, rowIndex) => rowIndex !== index);
                  onChange(serializeMultiValues(nextValues.length ? nextValues : ['']));
                }}
              >
                删除
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sp-btn sp-btn--secondary sp-btn--sm"
              disabled={disabled || !schema?.isEditable}
              onClick={() => onChange(serializeMultiValues([...values, '']))}
            >
              + 添加 Key
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <div className="sp-input__wrapper">
          <input
            type={isSecretVisible ? 'text' : 'password'}
            className="sp-input sp-input--password"
            value={value}
            disabled={disabled || !schema?.isEditable}
            onChange={(event) => onChange(event.target.value)}
            placeholder={`请输入 ${getFieldTitleZh(item.key, item.key)}`}
          />
          <button
            type="button"
            className="sp-input__toggle"
            onClick={onToggleSecretVisible}
            tabIndex={-1}
          >
            <EyeIcon open={isSecretVisible} />
          </button>
        </div>
      </div>
    );
  }

  // 普通输入框
  const inputType = controlType === 'number' ? 'number' : controlType === 'time' ? 'time' : 'text';

  return (
    <div className="flex items-center gap-2">
      <input
        type={inputType}
        className="sp-input flex-1"
        value={value}
        disabled={disabled || !schema?.isEditable}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`请输入 ${getFieldTitleZh(item.key, item.key)}`}
      />
      {onFetch && (
        <button
          type="button"
          className="sp-btn sp-btn--secondary sp-btn--sm whitespace-nowrap"
          disabled={disabled || isFetching || !schema?.isEditable}
          onClick={onFetch}
        >
          {isFetching ? (
            <>
              <span className="sp-icon" style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
              获取中...
            </>
          ) : (
            <>
              <SparklesIcon />
              获取列表
            </>
          )}
        </button>
      )}
    </div>
  );
}

export const SettingsField: React.FC<SettingsFieldProps> = ({
  item,
  value,
  disabled = false,
  onChange,
  onFetch,
  isFetching = false,
  discoveredModels = [],
  issues = [],
}) => {
  const schema = item.schema;
  const isMultiValue = isMultiValueField(item);
  const title = getFieldTitleZh(item.key, item.key);
  const description = getFieldDescriptionZh(item.key);
  const hasError = issues.some((issue) => issue.severity === 'error');
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  // 判断字段状态
  const isConfigured = value && value.trim().length > 0;
  const isMasked = value && value.includes('***');

  return (
    <div className={`sp-field ${hasError ? 'has-error' : ''}`}>
      {/* 头部：标题 + 标签 + 状态 */}
      <div className="sp-field__header">
        <div className="sp-field__title">
          <label className="sp-field__label" htmlFor={`setting-${item.key}`}>
            {title}
          </label>
          {schema?.isSensitive && <FieldBadge type="sensitive" />}
          {schema?.isRequired && <FieldBadge type="required" />}
          {!schema?.isEditable && <FieldBadge type="readonly" />}
        </div>
        {isConfigured && (
          <span className="sp-field__status">
            <span className="sp-field__status-dot" />
            {isMasked ? '已配置' : '已填写'}
          </span>
        )}
      </div>

      {/* 描述 */}
      {description && (
        <p className="sp-field__desc" title={description}>
          {description}
        </p>
      )}

      {/* 输入控件 */}
      <div id={`setting-${item.key}`}>
        {renderFieldControl(
          item,
          value,
          disabled,
          (nextValue) => onChange(item.key, nextValue),
          isSecretVisible,
          () => setIsSecretVisible((prev) => !prev),
          onFetch,
          isFetching,
        )}
      </div>

      {/* 发现模型独立区块 */}
      {discoveredModels.length > 0 && (
        <div className="sp-discovered">
          <div className="sp-discovered__header">
            <span className="sp-discovered__title">
              <SparklesIcon />
              发现 {discoveredModels.length} 个可用模型
            </span>
            <button
              type="button"
              className="sp-btn sp-btn--ghost sp-btn--sm"
              onClick={onFetch}
            >
              刷新
            </button>
          </div>
          <div className="sp-discovered__grid">
            {discoveredModels.map((model) => (
              <button
                key={model}
                type="button"
                className={`sp-discovered__item ${value === model ? 'is-selected' : ''}`}
                onClick={() => onChange(item.key, model)}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 敏感字段提示 */}
      {schema?.isSensitive && (
        <p className="mt-2 text-xs text-slate-500">
          密钥默认隐藏，可点击眼睛图标查看明文。
          {isMultiValue ? ' 支持添加多个 Key。' : ''}
        </p>
      )}

      {/* 验证错误 */}
      {issues.length > 0 && (
        <div className="sp-field__error">
          <AlertIcon />
          <div className="sp-field__error-text">
            {issues.map((issue, index) => (
              <div key={`${issue.code}-${issue.key}-${index}`}>
                {issue.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
