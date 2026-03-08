# UI组件使用指南

> 本文档说明项目中可用的通用UI组件及其正确使用方法。

## 目录

- [快速开始](#快速开始)
- [组件列表](#组件列表)
  - [Button](#button) - 按钮
  - [Select](#select) - 下拉选择
  - [Card](#card) - 卡片
  - [Badge](#badge) - 标签
  - [Drawer](#drawer) - 抽屉
- [组件映射表](#组件映射表)
- [样式规范](#样式规范)
- [常见错误](#常见错误)

---

## 快速开始

### 导入方式

```tsx
// ✅ 正确 - 从 common 目录导入
import { Button, Select, Card, Badge, Drawer } from '../components/common';

// ❌ 错误 - 直接从文件导入（除非使用特定组件）
import { Button } from '../components/common/Button';
```

### 文件位置

所有通用组件位于：
```
apps/dsa-web/src/components/common/
├── index.ts          # 统一导出
├── Button.tsx        # 按钮组件
├── Select.tsx        # 下拉选择
├── Card.tsx          # 卡片
├── Badge.tsx         # 标签
├── Drawer.tsx        # 侧边抽屉
├── Collapsible.tsx   # 折叠面板
├── JsonViewer.tsx    # JSON查看器
├── Loading.tsx       # 加载状态
├── Pagination.tsx    # 分页
└── ScoreGauge.tsx    # 分数仪表盘
```

---

## 组件列表

### Button

**用途**：所有可点击的按钮

**Props**：
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `variant` | `'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'gradient' \| 'danger'` | `'primary'` | 按钮样式变体 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 按钮尺寸 |
| `isLoading` | `boolean` | `false` | 是否显示加载状态 |
| `glow` | `boolean` | `false` | 是否显示发光效果 |

**使用示例**：

```tsx
import { Button } from '../components/common';

// 主按钮 - 保存操作
<Button variant="primary" onClick={handleSave}>
  保存配置
</Button>

// 次要按钮 - 取消操作
<Button variant="secondary" onClick={handleCancel}>
  取消
</Button>

// 危险按钮 - 删除操作
<Button variant="danger" onClick={handleDelete}>
  删除
</Button>

// 加载状态
<Button variant="primary" isLoading onClick={handleSave}>
  保存中...
</Button>

// 幽灵按钮 - 工具栏
<Button variant="ghost" size="sm" onClick={handleEdit}>
  编辑
</Button>
```

**错误示例**：
```tsx
// ❌ 错误 - 使用原生 button
<button className="px-4 py-2 bg-blue-600" onClick={handleSave}>
  保存
</button>

// ❌ 错误 - 使用 SettingsPage 的 sp-btn
<button className="sp-btn sp-btn--primary" onClick={handleSave}>
  保存
</button>
```

---

### Select

**用途**：下拉选择框，用于选择选项

**Props**：
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | `string` | - | 当前选中的值 |
| `onChange` | `(value: string) => void` | - | 选择变化回调 |
| `options` | `Array<{value: string, label: string}>` | - | 选项列表 |
| `label` | `string` | - | 标签文本 |
| `placeholder` | `string` | `'请选择'` | 占位提示 |
| `disabled` | `boolean` | `false` | 是否禁用 |

**使用示例**：

```tsx
import { Select } from '../components/common';

// 基础用法
<Select
  value={selectedValue}
  onChange={(val) => setSelectedValue(val)}
  options={[
    { value: 'option1', label: '选项1' },
    { value: 'option2', label: '选项2' },
  ]}
/>

// 带标签
<Select
  label="选择分类"
  value={category}
  onChange={(val) => setCategory(val)}
  options={categories.map(c => ({ value: c.id, label: c.name }))}
  placeholder="请选择分类"
/>

// 在表单中使用
const [config, setConfig] = useState({ provider: 'openai' });

<Select
  value={config.provider}
  onChange={(val) => setConfig(prev => ({ ...prev, provider: val }))}
  options={[
    { value: 'openai', label: 'OpenAI' },
    { value: 'gemini', label: 'Gemini' },
  ]}
/>
```

**错误示例**：
```tsx
// ❌ 错误 - 使用原生 select
<select
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="w-full bg-gray-900/50..."
>
  <option value="1">选项1</option>
</select>
```

**特殊情况**：

ChatPage 顶部栏的 select 有特殊样式需求（透明背景、无边框），作为导航控件可保留原生 select。

---

### Card

**用途**：内容容器，用于组织相关信息

**Props**：
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `variant` | `'default' \| 'bordered' \| 'gradient'` | `'default'` | 卡片样式 |
| `glow` | `boolean` | `false` | 是否显示发光效果 |
| `className` | `string` | - | 额外的CSS类 |

**使用示例**：

```tsx
import { Card } from '../components/common';

// 默认卡片
<Card>
  <h3>标题</h3>
  <p>内容...</p>
</Card>

// 带边框的卡片
<Card variant="bordered">
  <h3>标题</h3>
  <p>内容...</p>
</Card>

// 发光效果
<Card glow>
  <h3>重要内容</h3>
</Card>
```

---

### Badge

**用途**：显示状态标签，如"已完成"、"进行中"等

**Props**：
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'history'` | `'default'` | 标签样式 |
| `size` | `'sm' \| 'md'` | `'md'` | 标签尺寸 |
| `glow` | `boolean` | `false` | 是否发光 |

**使用示例**：

```tsx
import { Badge } from '../components/common';

// 默认标签
<Badge>默认</Badge>

// 状态标签
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
<Badge variant="danger">错误</Badge>
<Badge variant="info">信息</Badge>

// 小尺寸
<Badge variant="success" size="sm">完成</Badge>
```

---

### Drawer

**用途**：从侧边滑出的抽屉面板

**Props**：
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `isOpen` | `boolean` | - | 是否打开 |
| `onClose` | `() => void` | - | 关闭回调 |
| `title` | `string` | - | 标题 |
| `width` | `string` | - | 宽度类名 |

**使用示例**：

```tsx
import { Drawer } from '../components/common';

const [isOpen, setIsOpen] = useState(false);

// 打开按钮
<button onClick={() => setIsOpen(true)}>打开详情</button>

// 抽屉
<Drawer
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="详情"
  width="max-w-3xl"
>
  <div>抽屉内容...</div>
</Drawer>
```

---

## 组件映射表

根据场景选择正确的组件：

| 场景 | 使用 | 不使用 |
|------|------|--------|
| 按钮 | `Button` 组件 | 原生 `button` 或 `sp-btn` |
| 下拉选择 | `Select` 组件 | 原生 `select` |
| 卡片容器 | `Card` 组件 | 自定义 `div` |
| 状态标签 | `Badge` 组件 | 自定义 `span` |
| 侧边抽屉 | `Drawer` 组件 | 自定义实现 |
| 顶部导航栏 | 原生 `select`（特殊样式需求） | - |
| 设置页面表单 | `SettingsField`（专用组件） | 通用组件 |

---

## 样式规范

### 颜色系统

项目中使用 Tailwind CSS，主要颜色：

```
主色调：cyan-500 / cyan-600
次要色：indigo-500 / indigo-600
成功：green-500
警告：yellow-500
错误：red-500
```

### 背景色

```
页面背景：bg-gradient-to-br from-gray-900 via-[#111827] to-gray-900
卡片背景：bg-gray-800/50 或 bg-slate-800/50
输入背景：bg-gray-900/50
```

### 圆角

```
小：rounded-lg
中：rounded-xl
大：rounded-2xl
```

---

## 常见错误

### 错误1：使用原生 select

```tsx
// ❌ 错误
<select value={value} onChange={...}>
  <option>...</option>
</select>

// ✅ 正确
<Select value={value} onChange={...} options={[...]} />
```

### 错误2：使用 sp-btn

```tsx
// ❌ 错误 - SettingsPage 专用样式
<button className="sp-btn sp-btn--primary">保存</button>

// ✅ 正确
<Button variant="primary">保存</Button>
```

### 错误3：混合导入方式

```tsx
// ❌ 错误 - 不一致的导入
import { Button } from '../components/common/Button';
import { Select } from '../components/common';

// ✅ 正确 - 统一从 index 导入
import { Button, Select } from '../components/common';
```

### 错误4：忽略事件参数类型

```tsx
// ❌ 错误 - 使用 React.ChangeEvent
<Select onChange={(e) => setValue(e.target.value)} />

// ✅ 正确 - Select 组件直接返回 value
<Select onChange={(val) => setValue(val)} />
```

---

## SettingsPage 特殊说明

`SettingsPage` 使用专门的 `sp-*` 样式系统和 `SettingsField` 组件，这是**预期行为**。

原因：
1. 设置页面与后端配置系统深度集成
2. `SettingsField` 组件自动处理多种控件类型
3. 600+行专用CSS定义了完整的设置界面样式

**除非修改设置页面功能，否则不要更改其样式系统。**

---

## 版本历史

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-07 | 1.0 | 初始版本，整理现有组件使用规范 |
