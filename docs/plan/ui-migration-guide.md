# UI 样式迁移指南

> 本指南帮助开发者将旧版样式迁移到统一的组件化样式系统

## 迁移目标

统一使用 `components/common` 下的组件，提高代码复用率和一致性。

## 组件映射表

### 按钮 (Button)

| 旧写法 | 新写法 |
|--------|--------|
| `<button className="btn-primary">...</button>` | `<Button variant="primary">...</Button>` |
| `<button className="btn-secondary">...</button>` | `<Button variant="secondary">...</Button>` |
| `<button className="px-4 py-2 bg-blue-600 ...">...</button>` | `<Button variant="primary">...</Button>` |
| `<button className="px-4 py-2 bg-gray-700 ...">...</button>` | `<Button variant="secondary">...</Button>` |

**支持的 variant**: `primary` | `secondary` | `outline` | `ghost` | `gradient` | `danger`

**支持的 size**: `sm` | `md` | `lg`

**示例**:
```tsx
// 主要操作按钮
<Button variant="primary" onClick={handleSave}>
  保存
</Button>

// 次要操作按钮
<Button variant="secondary" onClick={handleCancel}>
  取消
</Button>

// 危险操作
<Button variant="danger" onClick={handleDelete}>
  删除
</Button>

// 带加载状态
<Button variant="primary" isLoading={isSubmitting}>
  提交
</Button>

// 小型文字按钮（表格内操作）
<Button variant="ghost" size="sm" className="text-red-400">
  删除
</Button>
```

---

### 卡片 (Card)

| 旧写法 | 新写法 |
|--------|--------|
| `<div className="bg-[#1e293b] rounded-lg p-4 border ...">...</div>` | `<Card padding="md" className="bg-[#1e293b] ...">...</Card>` |
| `<div className="bg-slate-800 rounded-lg p-6 ...">...</div>` | `<Card padding="lg">...</Card>` |

**支持的 variant**: `default` | `bordered` | `gradient`

**支持的 padding**: `none` | `sm` | `md` | `lg`

**示例**:
```tsx
// 默认卡片
<Card padding="md">
  <h3>标题</h3>
  <p>内容</p>
</Card>

// 带标题的卡片
<Card
  title="卡片标题"
  subtitle="副标题"
  padding="lg"
  variant="bordered"
>
  内容
</Card>

// 可悬停的卡片
<Card hoverable padding="md" onClick={handleClick}>
  点击我
</Card>

// 渐变边框卡片
<Card variant="gradient" padding="md">
  特殊强调内容
</Card>

// 自定义背景色（保持与页面一致）
<Card padding="md" className="bg-[#1e293b] border-white/10">
  自定义样式
</Card>
```

**何时不使用 Card**:
- 表格容器（需要无边距布局）
- 弹窗内容区（通常已有特定样式）
- 简单的 flex 布局容器

---

### 下拉选择 (Select)

| 旧写法 | 新写法 |
|--------|--------|
| `<select className="..."><option>...</option></select>` | `<Select options={[...]} value={...} onChange={...} />` |

**示例**:
```tsx
// 基础用法
<Select
  value={selectedValue}
  onChange={(val) => setSelectedValue(val)}
  options={[
    { value: 'a', label: '选项A' },
    { value: 'b', label: '选项B' },
  ]}
  placeholder="请选择"
/>

// 禁用状态
<Select
  value={value}
  onChange={handleChange}
  options={options}
  disabled={isLoading}
/>
```

**保留原生 select 的场景**:
- ChatPage 顶部栏的模型选择（特殊导航样式）
- 需要完全自定义样式的场景

---

### 状态标签 (Badge)

| 旧写法 | 新写法 |
|--------|--------|
| `<span className="px-2 py-1 bg-green-500/20 text-green-400 ...">成功</span>` | `<Badge variant="success">成功</Badge>` |

**支持的 variant**: `default` | `primary` | `success` | `warning` | `danger`

**示例**:
```tsx
<Badge variant="success">已完成</Badge>
<Badge variant="warning">数据不足</Badge>
<Badge variant="danger">错误</Badge>
<Badge variant="primary" glow>发光效果</Badge>
```

---

## 样式系统说明

### 专用样式系统保留说明

以下页面保留专用样式系统，不进行迁移：

1. **SettingsPage** (`sp-*` 类名)
   - 原因: 600+行CSS的完整体系，与 `SettingsField` 组件深度集成
   - 维护策略: 保持现状，如需修改在原有体系内调整

2. **ExpertPanelPage** (`ep-*` 类名)
   - 原因: 独立的专家会诊UI风格，有完整的设计体系
   - 维护策略: 保持现状

### 通用样式系统

其他页面统一使用：
- **Tailwind CSS** 工具类
- **components/common** 组件
- **CSS 变量** (定义在 index.css)

主要CSS变量：
```css
--bg-card: rgba(30, 41, 59, 0.8)    /* 卡片背景 */
--border-default: rgba(255, 255, 255, 0.1)  /* 默认边框 */
--border-accent: rgba(0, 212, 255, 0.3)     /* 强调边框 */
```

---

## 迁移检查清单

迁移页面时，请检查：

- [ ] 按钮使用 `Button` 组件
- [ ] 卡片容器使用 `Card` 组件（如适用）
- [ ] 下拉选择使用 `Select` 组件（如适用）
- [ ] 状态标签使用 `Badge` 组件
- [ ] 不使用 `sp-*` 类名（SettingsPage 除外）
- [ ] 不使用 `ep-*` 类名（ExpertPanelPage 除外）
- [ ] 运行 TypeScript 类型检查通过
- [ ] 视觉样式保持一致

---

## 常见问题

### Q: 表格行内的操作按钮如何替换？

A: 使用 `Button` 的 `ghost` 变体 + `sm` 尺寸：
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={handleDelete}
  className="text-red-400 hover:text-red-300"
>
  删除
</Button>
```

### Q: Card 组件的默认样式与页面不匹配怎么办？

A: 使用 `className` 覆盖样式：
```tsx
<Card padding="md" className="bg-[#1e293b] border-white/10">
  内容
</Card>
```

### Q: 原有的 `btn-primary` 类名还能用吗？

A: 不建议使用。虽然 index.css 中可能仍有定义，但建议统一迁移到 `Button` 组件，便于维护和主题切换。

---

## 更新记录

| 日期 | 更新内容 |
|------|----------|
| 2026-03-08 | 创建迁移指南 |
