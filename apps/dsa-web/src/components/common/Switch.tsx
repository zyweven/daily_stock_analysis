import type React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

/**
 * 开关组件
 * 用于强制重跑、状态筛选等场景
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  className = '',
}) => {
  const sizeStyles = {
    sm: {
      track: 'w-8 h-4',
      thumb: 'w-3 h-3',
      translate: 'translate-x-4',
    },
    md: {
      track: 'w-11 h-6',
      thumb: 'w-4 h-4',
      translate: 'translate-x-6',
    },
  };

  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <label
      className={`
        inline-flex items-center gap-2 cursor-pointer
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        ${className}
      `}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleClick}
        disabled={disabled}
        className={`
          ${sizeStyles[size].track}
          rounded-full
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500
          ${checked
            ? 'bg-cyan-600'
            : 'bg-slate-700'
          }
          ${disabled ? '' : 'hover:bg-opacity-80'}
        `}
      >
        <span
          className={`
            ${sizeStyles[size].thumb}
            block
            bg-white
            rounded-full
            shadow-md
            transform
            transition-transform duration-200
            ${checked ? sizeStyles[size].translate : 'translate-x-0.5'}
            m-0.5
          `}
        />
      </button>
      {label && (
        <span className="text-sm text-gray-300 select-none">{label}</span>
      )}
    </label>
  );
};
