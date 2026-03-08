# PLAN-001: UI一致性改进

> 统一前端组件使用方式，提高代码复用率和AI开发体验

## 基本信息

| 字段 | 值 |
|------|-----|
| 计划ID | PLAN-001 |
| 计划名称 | UI一致性改进 |
| 创建日期 | 2026-03-07 |
| 优先级 | High |
| 状态 | In Progress |
| 负责人 | - |

## 背景与目标

### 问题描述

当前项目前端存在以下一致性问题：

1. **样式系统混乱**：三个页面使用三种不同的样式类名
   - `SettingsPage`: `sp-*` 类名（如 `sp-btn sp-btn--primary`）
   - `AgentSettingsPage`: Tailwind 完整类名
   - `SkillLibraryPage`: 混用 `btn-primary` 和 Tailwind

2. **Select组件使用不一致**
   - `ExtraModelsEditor`: 正确使用封装的 `Select` 组件
   - `AgentSettingsPage`: 直接使用原生 `<select>`

3. **表单处理方式不统一**
   - `SettingsPage`: 使用 `useSystemConfig` + `SettingsField`
   - 其他页面: 各自实现表单逻辑

### 预期目标

1. 所有页面统一使用 `components/common` 下的封装组件
2. 统一样式系统为 Tailwind CSS
3. 建立UI组件使用文档
4. 提高AI开发时的组件复用率

## 任务清单

### 任务1：统一 Select 组件使用
- [x] 替换 `AgentSettingsPage` 中的原生 select 为封装组件 ✅
- [x] 替换 `SkillLibraryPage` 中的原生 select 为封装组件 ✅（替换了2处）
- [x] 检查 `ChatPage` 中的 select 使用情况 ✅
  - ChatPage 顶部栏的 select 有特殊样式需求（透明背景、无边框），作为导航控件与表单 select 设计目标不同，建议保持现状
- [x] 验证所有 Select 组件的行为一致性 ✅
  - AgentSettingsPage: 工具配置中的 select 已替换
  - SkillLibraryPage: 技能分类和目标 Agent 选择已替换
  - ChatPage: 保留原生 select（顶部栏导航控件）

**涉及文件位置**：
- `apps/dsa-web/src/pages/AgentSettingsPage.tsx` (第566行)
- `apps/dsa-web/src/pages/SkillLibraryPage.tsx` (第636行)

### 任务2：统一样式系统
- [x] 审计所有页面的样式类名使用情况 ✅
  - **发现**：`SettingsPage` 的 `sp-*` 样式系统是专门为设置页面设计的完整体系（600+行CSS），与 `SettingsField` 组件深度集成
  - **建议**：保留 `SettingsPage` 样式系统，专注于统一其他页面
- [ ] 创建样式迁移指南文档
- [x] 统一按钮样式为 `Button` 组件（主要操作按钮已完成替换，约30个）✅
- [ ] 统一卡片样式为 `Card` 组件
- [ ] 确保其他页面不使用 `sp-*` 类名

**涉及文件**：
- `apps/dsa-web/src/pages/SettingsPage.tsx`
- `apps/dsa-web/src/pages/SettingsPage.css`
- `apps/dsa-web/src/pages/AgentSettingsPage.tsx`
- `apps/dsa-web/src/pages/SkillLibraryPage.tsx`
- `apps/dsa-web/src/index.css` (如有全局样式)

### 任务3：创建UI组件使用文档
- [x] 创建 `docs/ui-components.md` ✅
- [x] 列出所有通用组件及其用法 ✅
- [x] 提供代码示例 ✅
- [x] 说明何时使用哪个组件 ✅

### 任务4：建立表单处理最佳实践
- [ ] 分析现有表单处理模式的优缺点
- [ ] 创建可复用的表单 hook
- [ ] 更新一个页面作为示例（推荐 AgentSettingsPage）
- [ ] 编写表单开发指南

## 技术方案

### 组件映射表

| 场景 | 当前做法 | 推荐做法 |
|------|----------|----------|
| 下拉选择 | `<select>` 原生 | `Select` 组件 |
| 按钮 | `<button className="...">` | `Button` 组件 |
| 卡片容器 | `div` + 自定义样式 | `Card` 组件 |
| 状态标签 | `span` + 自定义样式 | `Badge` 组件 |
| 侧边抽屉 | `div` + 自定义动画 | `Drawer` 组件 |

### 样式统一策略

**推荐方向**：统一使用 Tailwind CSS

```tsx
// 旧的 SettingsPage 方式
<button className="sp-btn sp-btn--primary">保存</button>

// 新的统一方式
<Button variant="primary">保存</Button>
```

### Select 组件替换示例

```tsx
// 当前 AgentSettingsPage.tsx 中的代码（第566-584行）
{field.type === 'select' && field.options && (
  <select
    value={value}
    onChange={(e) => { ... }}
    className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300"
  >
    {field.options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
)}

// 应该改为：
{field.type === 'select' && field.options && (
  <Select
    value={value}
    onChange={(val) => {
      setToolConfigs(prev => ({
        ...prev,
        [tool.function.name]: {
          ...prev[tool.function.name],
          [key]: val
        }
      }));
    }}
    options={field.options.map(opt => ({ value: opt.value, label: opt.label }))}
    disabled={disabled || !schema?.isEditable}
    placeholder="请选择"
  />
)}
```

## 注意事项

1. **向后兼容**：SettingsPage 的 `sp-*` 类名迁移时要小心，确保不破坏现有样式
2. **测试覆盖**：修改后要检查所有交互状态（hover、focus、disabled）
3. **主题一致性**：保持科技感配色（cyan/indigo/purple 主题）

## 参考文档

- [Button组件](../apps/dsa-web/src/components/common/Button.tsx)
- [Select组件](../apps/dsa-web/src/components/common/Select.tsx)
- [SettingsField组件](../apps/dsa-web/src/components/settings/SettingsField.tsx)

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-07 | 计划创建，问题分析完成 | Claude |
| 2026-03-07 | 完成任务1：统一Select组件使用，替换AgentSettingsPage和SkillLibraryPage中的原生select | Claude |
| 2026-03-07 | 完成任务2审计：发现SettingsPage样式系统是专用体系，建议保留；发现81个button需统一 | Claude |
| 2026-03-07 | 完成任务3：创建 `docs/ui-components.md` 组件使用文档 | Claude |
| 2026-03-07 | 替换按钮进行中：已替换AgentSettingsPage(2个)和SkillLibraryPage(2个)的主要按钮 | Claude |
| 2026-03-07 | 继续替换按钮：完成HomePage(1)、PortfolioPage(6)、StockManagementPage(4)、BacktestPage(2)、NotFoundPage(1)的主要按钮替换 | Claude |
| 2026-03-08 | 继续替换表格内小型按钮：PortfolioPage(2)、StockManagementPage(2)、BacktestPage(1)；类型检查通过 | Claude |

### 已替换按钮统计

| 页面 | 替换数量 | 说明 |
|------|----------|------|
| AgentSettingsPage | 2 | 保存、删除按钮 |
| SkillLibraryPage | 8 | 各种操作按钮 |
| HomePage | 1 | 分析按钮（btn-primary） |
| PortfolioPage | 8 | 刷新行情、设置本金、添加持仓、弹窗确认/取消按钮、表格内平仓/删除按钮 |
| StockManagementPage | 6 | 同步配置、添加股票、弹窗确认/取消、表格内刷新/删除按钮 |
| BacktestPage | 3 | 筛选、开始回测、补全数据按钮 |
| NotFoundPage | 1 | 返回首页按钮 |

**总计：约 30 个按钮已替换为 Button 组件**

**剩余未替换按钮**：
- ChatPage: 多个快捷操作按钮（作为列表项，样式特殊）
- ExpertPanelPage: 使用专用 `ep-*` 样式系统
- SettingsPage: 使用专用 `sp-*` 样式系统
- 弹窗中的 X 关闭按钮（图标按钮，样式简单）
- Toggle/开关式按钮（如状态筛选、强制重跑等，自定义样式组件）
