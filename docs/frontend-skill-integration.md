# Frontend Skill Integration

本文档记录 Skill 体系前端集成的实现细节、当前进度和开发恢复指引。

## 本阶段目标

实现完整的 "Agent = 身份 + 组合 Skills" 配置方式，让前端可以：
1. 管理技能库（查看、创建、编辑、删除）
2. 在 Agent 配置页选择技能并预览组合效果
3. 一键应用技能模板到目标 Agent

---

## 已完成（Checked List）

### 1. API 层 (`apps/dsa-web/src/api/`)
- [x] 新建 `skills.ts` - Skill API 封装
  - CRUD: list, get, create, update, delete
  - Categories: listCategories
  - Preview: preview (POST /api/v1/skills/preview)
  - Agent binding: bindToAgent, getAgentSkills, updateAgentSkillBinding, unbindFromAgent
- [x] 更新 `agents.ts` - 添加 `manual_tools` 字段
- [x] 更新 `index.ts` - 导出 skills API

### 2. AgentSettingsPage (`apps/dsa-web/src/pages/AgentSettingsPage.tsx`)
- [x] 加载 Skills 列表和当前 Agent 绑定状态
- [x] 技能启用/停用切换（带 10 个上限限制）
- [x] 自定义 Prompt Override 编辑
- [x] 手动工具选择（保持原有功能）
- [x] 实时预览区：
  - 组合后 system_prompt
  - 启用工具列表
  - 预估 tokens
- [x] 保存逻辑：
  1. 更新 Agent 基础信息（含 manual_tools）
  2. 差量同步 Skill 绑定（bind/update enable/disable）

### 3. SkillLibraryPage (`apps/dsa-web/src/pages/SkillLibraryPage.tsx`)
- [x] 分类筛选侧边栏
- [x] 技能卡片网格（icon/name/category/description/is_builtin/version）
- [x] 详情抽屉（Drawer）：prompt_template, tool_bindings
- [x] 用户技能 CRUD（内置技能只读）
- [x] 组合预览区（多选技能 + base prompt）
- [x] 模板应用模态框：
  - 预设模板：日内交易、价值投资、新闻驱动
  - 目标 Agent 选择
  - 差量同步绑定

### 4. 路由与导航 (`apps/dsa-web/src/App.tsx`)
- [x] 新增 `/skills` 路由
- [x] 新增侧边导航项 "技能"（lightning icon）

### 5. 文档
- [x] 更新 `docs/CHANGELOG.md`
- [x] 新建本文档

---

## 待完成（Next Actions）

- [ ] 后端补充 `DELETE /api/v1/skills/agents/{agent_id}/skills/{binding_id}` 完整实现（当前可能是空实现）
- [ ] 优化 SkillLibraryPage 性能（大数据量时虚拟滚动）
- [ ] 技能模板可配置化（从后端读取或本地配置文件）
- [ ] 技能图标选择器（emoji picker）
- [ ] 工具绑定可视化编辑器（替代 JSON 输入）

---

## API 对齐清单

| 前端调用 | 后端端点 | 状态 |
|---------|---------|------|
| `SkillApi.list()` | `GET /api/v1/skills` | ✅ |
| `SkillApi.listCategories()` | `GET /api/v1/skills/categories` | ✅ |
| `SkillApi.get(id)` | `GET /api/v1/skills/{id}` | ✅ |
| `SkillApi.create(data)` | `POST /api/v1/skills` | ✅ |
| `SkillApi.update(id, data)` | `PUT /api/v1/skills/{id}` | ✅ |
| `SkillApi.delete(id)` | `DELETE /api/v1/skills/{id}` | ✅ |
| `SkillApi.preview(data)` | `POST /api/v1/skills/preview` | ✅ |
| `SkillApi.bindToAgent(...)` | `POST /api/v1/skills/agents/{id}/bind` | ✅ |
| `SkillApi.getAgentSkills(...)` | `GET /api/v1/skills/agents/{id}/skills` | ✅ |
| `SkillApi.updateAgentSkillBinding(...)` | `PUT /api/v1/skills/agents/{id}/skills/{bid}` | ✅ |
| `SkillApi.unbindFromAgent(...)` | `DELETE /api/v1/skills/agents/{id}/skills/{bid}` | ⚠️ 需后端确认 |

---

## 已知问题/风险

1. **DELETE binding 端点**：后端 `skills.py` 中 `unbind_skill_from_agent` 函数实现不完整（TODO: Add method to delete by binding_id），实际可能无法删除绑定。前端目前通过 `is_enabled=false` 来"禁用"而非删除，功能可用但数据会累积。

2. **Skill 模板硬编码**：当前 `SKILL_TEMPLATES` 数组写死在 `SkillLibraryPage.tsx` 中，后续应从后端或配置文件读取。

3. **Token 估算**：前端预览使用后端返回的 `estimated_tokens`，该值为简单字符串长度/4，非精确 tokenizer 计算。

---

## 恢复开发入口

如需继续开发或调试，从以下文件开始：

### 主要文件
- `apps/dsa-web/src/pages/SkillLibraryPage.tsx` - 技能库主页面（模板应用、预览）
- `apps/dsa-web/src/pages/AgentSettingsPage.tsx` - Agent 配置页（技能选择器）
- `apps/dsa-web/src/api/skills.ts` - Skill API 封装

### 后端对应文件
- `api/v1/endpoints/skills.py` - Skill API 端点
- `src/services/skill_service.py` - Skill 业务逻辑

### 快速验证命令
```bash
cd apps/dsa-web
npm run build        # 检查 TypeScript 编译
npm run dev          # 启动开发服务器
```

### 关键约束（前后端对齐）
- Skill 组合上限：10 个（`SkillService.validate_skill_combination`）
- `prompt_template` 最小长度：10 字符
- 工具名必须在 `ToolRegistry` 中有效（后端校验）

---

## 端到端验证步骤

1. **AgentSettingsPage**
   - 选择 Agent，观察已有技能绑定是否正确加载
   - 勾选/取消技能，观察预览区实时更新
   - 修改 custom_prompt_override，保存后刷新验证持久化
   - 确认手动工具和 Skill 工具同时生效

2. **SkillLibraryPage**
   - 点击分类筛选，确认列表过滤正确
   - 点击技能卡片打开详情抽屉，查看 prompt_template
   - 新建用户技能 -> 编辑 -> 删除，验证 CRUD
   - 使用预览区选择多个技能，验证组合输出

3. **模板应用**
   - 点击"应用模板"，选择模板和目标 Agent
   - 应用后跳转到 AgentSettingsPage，验证绑定状态
   - 对比 AgentSettingsPage 的预览与 SkillLibraryPage 的预览是否一致

4. **Chat 验证**
   - 在 Chat 页面选择带技能的 Agent 发起会话
   - 验证技能组合后的工具可被正常调用

---

*Last Updated: 2026-02-20*
