import type React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

/**
 * 图标按钮组件
 * 用于 Modal X 关闭按钮、工具栏图标按钮等场景
 */
export const IconButton: React.FC<IconButtonProps> = ({
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  title,
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center
    rounded-lg
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const sizeStyles = {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-3',
  };

  const variantStyles = {
    default: `
      bg-slate-700 text-gray-300
      hover:bg-slate-600 hover:text-white
      focus:ring-slate-500
    `,
    ghost: `
      bg-transparent text-gray-400
      hover:bg-white/5 hover:text-white
      focus:ring-gray-500
    `,
    danger: `
      bg-transparent text-red-400
      hover:bg-red-500/10 hover:text-red-300
      focus:ring-red-500
    `,
  };

  return (
    <button
      type="button"
      className={`
        ${baseStyles}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${className}
      `}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
};
