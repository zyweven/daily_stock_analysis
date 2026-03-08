# 表单开发指南

> 本文档提供项目中表单开发的最佳实践和统一模式

## 目录

1. [表单处理方案对比](#表单处理方案对比)
2. [推荐方案：useForm Hook](#推荐方案useform-hook)
3. [现有方案说明](#现有方案说明)
4. [表单验证](#表单验证)
5. [表单组件选择](#表单组件选择)

---

## 表单处理方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **useForm Hook** | 中小型表单（<20字段） | 简洁、统一、易于测试 | 复杂嵌套表单支持有限 |
| **useSystemConfig** | 系统配置类表单 | 支持草稿模式、版本控制 | 专用于配置场景 |
| **React useState** | 简单表单（<5字段） | 最简单直接 | 代码重复、无验证 |

---

## 推荐方案：useForm Hook

### 基本用法

```tsx
import { useForm } from '../hooks';
import { Button, Card } from '../components/common';

interface LoginForm {
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const form = useForm<LoginForm>({
    initialValues: {
      username: '',
      password: '',
    },
    validate: (values) => {
      const errors: FormErrors<LoginForm> = {};
      if (!values.username) {
        errors.username = '请输入用户名';
      }
      if (!values.password) {
        errors.password = '请输入密码';
      } else if (values.password.length < 6) {
        errors.password = '密码至少6位';
      }
      return errors;
    },
    onSubmit: async (values) => {
      await authApi.login(values);
      toast.success('登录成功');
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <div>
        <input
          value={form.values.username}
          onChange={(e) => form.setValue('username', e.target.value)}
          onBlur={() => form.touch('username')}
          placeholder="用户名"
        />
        {form.touched.username && form.errors.username && (
          <span className="error">{form.errors.username}</span>
        )}
      </div>

      <div>
        <input
          type="password"
          value={form.values.password}
          onChange={(e) => form.setValue('password', e.target.value)}
          onBlur={() => form.touch('password')}
          placeholder="密码"
        />
        {form.touched.password && form.errors.password && (
          <span className="error">{form.errors.password}</span>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        isLoading={form.isSubmitting}
        disabled={!form.isDirty}
      >
        登录
      </Button>
    </form>
  );
};
```

### API 说明

#### `useForm<T>(options)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `initialValues` | `T` | 表单初始值（必填） |
| `validate` | `(values: T) => FormErrors<T>` | 验证函数，返回错误对象 |
| `onSubmit` | `(values: T) => Promise<void> \| void` | 提交处理函数 |

#### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| `values` | `T` | 当前表单值 |
| `errors` | `FormErrors<T>` | 验证错误对象 |
| `touched` | `Partial<Record<keyof T, boolean>>` | 字段是否被触摸过 |
| `isSubmitting` | `boolean` | 是否正在提交 |
| `isDirty` | `boolean` | 表单是否有修改 |
| `setValue` | `(field, value) => void` | 设置单个字段值 |
| `setValues` | `(values: Partial<T>) => void` | 设置多个字段值 |
| `setError` | `(field, message) => void` | 手动设置错误 |
| `clearErrors` | `() => void` | 清空所有错误 |
| `reset` | `(newValues?) => void` | 重置表单 |
| `touch` | `(field) => void` | 标记字段为已触摸 |
| `submit` | `() => Promise<boolean>` | 手动触发提交 |
| `handleSubmit` | `(e: React.FormEvent) => void` | 表单 onSubmit 处理器 |

### 最佳实践

#### 1. 字段级验证

```tsx
const form = useForm<ContactForm>({
  initialValues: { email: '', phone: '' },
  validate: (values) => {
    const errors: FormErrors<ContactForm> = {};

    // 邮箱验证
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      errors.email = '请输入有效的邮箱地址';
    }

    // 手机号验证
    if (values.phone && !/^1[3-9]\d{9}$/.test(values.phone)) {
      errors.phone = '请输入有效的手机号';
    }

    return errors;
  },
});
```

#### 2. 异步验证

```tsx
const form = useForm<RegisterForm>({
  initialValues: { username: '' },
  validate: async (values) => {
    const errors: FormErrors<RegisterForm> = {};

    if (values.username) {
      const exists = await api.checkUsernameExists(values.username);
      if (exists) {
        errors.username = '用户名已被占用';
      }
    }

    return errors;
  },
});
```

#### 3. 嵌套对象处理

```tsx
interface AddressForm {
  address: {
    city: string;
    street: string;
  };
}

const form = useForm<AddressForm>({
  initialValues: {
    address: { city: '', street: '' },
  },
});

// 更新嵌套字段
form.setValue('address', {
  ...form.values.address,
  city: '北京',
});
```

#### 4. 数组字段处理

```tsx
interface SkillsForm {
  skills: string[];
}

const form = useForm<SkillsForm>({
  initialValues: { skills: [] },
});

// 添加技能
const addSkill = (skill: string) => {
  form.setValue('skills', [...form.values.skills, skill]);
};

// 删除技能
const removeSkill = (index: number) => {
  form.setValue(
    'skills',
    form.values.skills.filter((_, i) => i !== index)
  );
};
```

---

## 现有方案说明

### useSystemConfig - 系统配置专用

用于 `SettingsPage` 的系统配置表单，特点：
- 支持草稿模式（dirty check）
- 支持配置版本控制
- 支持批量验证
- 支持重试机制

```tsx
const {
  itemsByCategory,
  hasDirty,
  setDraftValue,
  save,
} = useSystemConfig();
```

### React useState - 简单场景

适用于非常简单（1-3个字段）的表单：

```tsx
const [formData, setFormData] = useState({
  name: '',
  description: '',
});

const handleSubmit = async () => {
  await api.save(formData);
};
```

---

## 表单验证

### 验证规则建议

| 规则 | 实现方式 |
|------|----------|
| 必填 | `if (!value) errors.field = '必填'` |
| 最小长度 | `if (value.length < min) errors.field = '至少${min}位'` |
| 正则匹配 | `if (!pattern.test(value)) errors.field = '格式错误'` |
| 数值范围 | `if (value < min \|\| value > max) errors.field = '范围错误'` |
| 邮箱 | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| 手机号 | `/^1[3-9]\d{9}$/` |

### 错误提示时机

建议采用 **onBlur + onSubmit** 组合策略：

```tsx
<input
  value={form.values.name}
  onChange={(e) => form.setValue('name', e.target.value)}
  onBlur={() => form.touch('name')}  // 失去焦点时标记为 touched
/>

// 只在 touched 后显示错误
{form.touched.name && form.errors.name && (
  <span className="error">{form.errors.name}</span>
)}
```

---

## 表单组件选择

| 场景 | 推荐组件 | 示例 |
|------|----------|------|
| 文本输入 | 原生 `input` | `<input type="text" />` |
| 长文本 | 原生 `textarea` | `<textarea />` |
| 下拉选择 | `Select` | `<Select options={options} />` |
| 开关 | `Switch` | `<Switch checked={value} onChange={...} />` |
| 单选 | 原生 `input[type="radio"]` | 组合使用 |
| 多选 | 原生 `input[type="checkbox"]` | 组合使用 |
| 提交按钮 | `Button` | `<Button type="submit">保存</Button>` |
| 取消按钮 | `Button` | `<Button variant="secondary">取消</Button>` |
| 表单容器 | `Card` | `<Card padding="lg"><form>...</form></Card>` |

---

## 更新记录

| 日期 | 更新内容 |
|------|----------|
| 2026-03-08 | 创建表单开发指南 |
