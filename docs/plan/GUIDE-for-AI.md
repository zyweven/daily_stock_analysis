# AI助手工作指南

> 本文档面向协助开发此项目的AI助手，帮助你快速上手并与其他AI协同工作。

## 快速开始

### 1. 每次会话开始时

请先阅读计划中心主文档：
```
docs/plan/README.md
```

了解：
- 当前有哪些进行中的计划
- 每个计划的状态和进度
- 是否存在依赖关系

### 2. 认领任务

当你准备执行某个任务时：

1. 打开对应的计划文件（如 `PLAN-001-ui-consistency.md`）
2. 找到要执行的任务
3. **将任务状态改为进行中**：`- [ ]` → `- [x]`（如果完成部分可描述进度）
4. 在"进度记录"表格中添加一行

示例：
```markdown
### 任务1：统一 Select 组件使用
- [x] 替换 `AgentSettingsPage` 中的原生 select 为封装组件（已完成）
- [ ] 检查 `SkillLibraryPage` 中的 select 使用情况（进行中）
- [ ] 检查 `ChatPage` 中的 select 使用情况
```

进度记录：
```markdown
| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-07 | 计划创建 | Claude |
| 2026-03-07 | 完成任务1.1：替换AgentSettingsPage的select | Claude |
```

### 3. 完成任务

任务完成后：

1. 将所有子任务标记为 `- [x]`
2. 更新进度记录
3. 如有必要，更新计划的整体进度百分比
4. 如果整个计划完成，将状态改为 **Completed**

## 计划文件格式说明

### 任务清单格式

```markdown
### 任务编号：任务标题
- [ ] 子任务1
- [ ] 子任务2
- [ ] 子任务3
```

状态：
- `- [ ]` - 未开始
- `- [x]` - 已完成
- `- [~]` - 进行中（可选）

### 进度记录格式

```markdown
| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| YYYY-MM-DD | 做了什么 | AI名称/人名 |
```

## 代码规范

### 1. 组件使用优先顺序

**必须使用**已封装的通用组件：

| 功能 | 使用 | 不要使用 |
|------|------|----------|
| 按钮 | `Button` from `components/common` | 原生 `<button>` |
| 下拉选择 | `Select` from `components/common` | 原生 `<select>` |
| 卡片 | `Card` from `components/common` | 自定义 `div` |
| 标签 | `Badge` from `components/common` | 自定义 `span` |
| 抽屉 | `Drawer` from `components/common` | 自定义实现 |

### 2. 样式系统

**统一使用 Tailwind CSS**，不要使用：
- `sp-*` 类名（如 `sp-btn sp-btn--primary`）- 这是旧的样式系统
- 自定义CSS类名

正确的按钮用法：
```tsx
// ✅ 正确
import { Button } from '../components/common';
<Button variant="primary">保存</Button>

// ❌ 错误
<button className="sp-btn sp-btn--primary">保存</button>
<button className="px-4 py-2 bg-blue-600">保存</button>
```

### 3. 文件组织

- 页面组件放在 `apps/dsa-web/src/pages/`
- API调用放在 `apps/dsa-web/src/api/`
- 通用组件放在 `apps/dsa-web/src/components/common/`
- 类型定义放在 `apps/dsa-web/src/types/`

## 常见任务类型

### 类型1：修改现有页面

1. 先阅读现有代码，了解其结构
2. 检查是否有使用非标准组件
3. 替换为标准组件
4. 保持原有功能不变

### 类型2：创建新页面

1. 复制一个现有页面作为模板（推荐 `SkillLibraryPage.tsx`）
2. 使用标准组件
3. 创建对应的 API 文件
4. 在 `App.tsx` 中添加路由

### 类型3：后端API开发

1. 创建 endpoint 文件在 `api/v1/endpoints/`
2. 创建 repository 文件在 `src/repositories/`（如需要）
3. 在 `api/v1/router.py` 中注册路由
4. 更新 `src/storage.py` 中的模型（如需要）

## 重要检查清单

完成工作前，请确认：

- [ ] 代码可以正常编译/运行
- [ ] 没有引入新的样式类名（全部使用Tailwind）
- [ ] 使用了的组件都已从正确位置导入
- [ ] 更新了计划文件中的任务状态
- [ ] 在进度记录中添加了更新

## 获取帮助

如果你不确定：

1. 查看现有的实现示例（如 `SettingsPage.tsx` 的表单处理）
2. 查看 `docs/plan/` 中的其他计划文件
3. 查看 `docs/` 目录下的设计文档

## 协作原则

1. **一个计划同一时间最好只有一个AI负责**，避免冲突
2. **如果看到其他AI的进度记录，请尊重其工作**，不要回退或覆盖
3. **添加新的子任务**时，保持原有格式
4. **有疑问时**，在进度记录中写明，让人类用户知道

---

祝工作愉快！
