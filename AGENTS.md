# AGENTS.md

本文件定义在本仓库中执行开发、Issue 分析、PR 审查时的统一行为准则。  

## 1. 通用协作原则

- 语言与栈：Python 3.10+，遵循仓库现有架构与目录边界。
- 配置约束：统一使用 `.env`（参见 `.env.example`）。
- 代码质量：优先保证可运行、可回归验证、可追踪（日志/错误信息清晰）。
- 风格约束：
  - 行宽 120
  - `black` + `isort` + `flake8`
  - 关键变更需至少做语法检查（`py_compile`）或对应测试验证。
  - 新增或修改的代码注释必须使用中文。
- Git 约束：
  - 未经明确确认，不执行 `git commit`。
  - commit message 不添加 `Co-Authored-By`。
  - 后续所有 commit message 必须使用中文。

## 2. Issue 分析原则

每个 Issue 必须先回答 3 个问题：

1. 是否合理（Reasonable）
- 是否描述了真实影响（功能错误、数据错误、性能/稳定性问题、体验退化）。
- 是否有可验证证据（日志、截图、复现步骤、版本信息）。
- 是否与项目目标相关（股票分析、数据源、通知、API/WebUI、部署链路）。

2. 是否是 Issue（Valid Issue）
- 属于缺陷/功能缺失/回归/文档错误之一，而非纯咨询或环境误用。
- 能定位到仓库责任边界；若是三方服务波动，也需判断是否需要仓库侧兜底。
- 如果是使用问题，应转为文档改进或 FAQ，而不是代码缺陷。

3. 是否好解决（Solvability）
- 可否稳定复现。
- 依赖是否可控（第三方 API、网络、权限、密钥）。
- 变更范围与风险等级（低/中/高）。
- 是否存在临时缓解方案（降级、兜底、开关、重试、回退策略）。

### Issue 结论模板

- 结论：`成立 / 部分成立 / 不成立`
- 分类：`bug / feature / docs / question / external`
- 优先级：`P0 / P1 / P2 / P3`
- 难度：`easy / medium / hard`
- 建议：`立即修复 / 排期修复 / 文档澄清 / 关闭`

## 3. PR 分析原则

每个 PR 需按以下顺序审查：

1. 必要性（Necessity）
- 是否解决明确问题，或提供明确业务价值。
- 是否避免“为了改而改”的重构。

2. 关联性（Traceability）
- 是否关联对应 Issue（建议必须有：`Fixes #xxx` 或 `Refs #xxx`）。
- 若无 Issue，PR 描述必须给出动机、场景与验收标准。

3. 类型判定（Type）
- 明确标注：`fix / feat / refactor / docs / chore / test`。
- 对“fix/bug”类 PR：必须说明原问题、根因、修复点、回归风险。

4. 描述完整性（Description Completeness）
- 必须包含：
  - 背景与问题
  - 变更范围（改了哪些模块）
  - 验证方式与结果（命令、关键输出）
  - 兼容性与破坏性变更说明（如有）
  - 回滚方案（至少一句）
  - 若为 issue 修复：在 PR description 中显式写明关闭语句（如 `Fixes #241` / `Closes #241`）

5. 合入判定（Merge Readiness）
- 可直接合入（Ready to Merge）条件：
  - 目标明确且必要
  - 有 Issue 或同等质量的问题描述
  - 变更与描述一致，无隐藏副作用
  - 关键验证已通过（语法/测试/关键链路）
  - 无阻断性风险（安全、数据损坏、明显性能回退）
- 不可直接合入（Not Ready）条件：
  - 描述不完整，无法确认动机和影响
  - 无验证证据
  - 引入明显风险且无回滚策略
  - 与仓库方向无关或重复实现

## 4. 交付与发布同步原则

- 功能开发、缺陷修复完成后，必须同步更新文档：
  - `README.md`（用户可见能力、使用方式、配置项变化）
  - `docs/CHANGELOG.md`（版本变更记录、影响范围、兼容性说明）
- 发布语义必须与改动规模匹配，在提交说明中添加对应 tag 标签：
  - `#patch`：修复类、小改动
  - `#minor`：新增可用功能、向后兼容
  - `#major`：破坏性变更或重大架构调整
  - `#skip` / `#none`：明确不触发自动版本标签
- 若改动用于解决已有 issue，PR description 必须声明关闭该 issue（`Fixes #xxx` / `Closes #xxx`），避免修复完成后 issue 悬挂。

## 5. 建议评审输出格式

### Issue 评审输出

- `是否合理`：是/否 + 理由
- `是否是 issue`：是/否 + 理由
- `是否好解决`：是/否 + 难点
- `建议动作`：修复/排期/文档/关闭

### PR 评审输出

- `必要性`：通过/不通过
- `是否有对应 issue`：有/无（编号）
- `PR 类型`：fix/feat/...
- `description 完整性`：完整/不完整（缺失项）
- `是否可直接合入`：可/不可 + 必改项

## 6. 快速检查命令（可选）

```bash
./test.sh syntax
python -m py_compile main.py src/*.py data_provider/*.py
flake8 main.py src/ --max-line-length=120
```

## 7. 修改代码时的防回归原则

### 7.1 多层调用链参数传递

当新增功能需要在多层调用链中传递参数时，必须确保参数在每一层都被正确传递：

**必须验证的调用链（以模型选择为例）：**
```
API Endpoint (analysis.py)
  ↓ 传递 model_name
TaskQueue (task_queue.py)
  ↓ 传递 model_name
AnalysisService (analysis_service.py)
  ↓ 传递 model_name
StockAnalysisPipeline (pipeline.py)
  ↓ 使用 model_name 初始化 analyzer
GeminiAnalyzer (analyzer.py)
```

**检查清单：**
- [ ] 确认每一层函数签名包含新参数
- [ ] 确认每一层都向下传递该参数
- [ ] 确认新增参数有默认值（避免破坏旧调用）
- [ ] 确认修改后立即运行 `python tests/test_smoke.py`

### 7.2 添加新功能的步骤

1. **先写测试**：在 `tests/test_regression.py` 中添加回归测试
2. **修改底层**：先修改最底层被调用的函数，支持新参数
3. **逐层连接**：向上逐层传递参数，每层都运行冒烟测试
4. **验证完整流程**：运行完整测试 `pytest tests/ -v`

### 7.3 回归测试要求

**必须添加测试的场景：**
- 修改函数签名（新增/删除参数）
- 修改返回值结构
- 修改多层调用链
- 修复 bug（防止回归）

**测试文件位置：**
- 功能测试：`tests/test_<feature_name>.py`
- 回归测试：`tests/test_regression.py`
- 冒烟测试：`tests/test_smoke.py`

**运行测试：**
```bash
# 快速验证（每次修改后必须运行）
python tests/test_smoke.py

# 完整回归测试
pytest tests/test_regression.py -v

# 所有测试
pytest tests/ -v
```

### 7.4 参数传递最佳实践

**推荐：使用 Context 对象（对于复杂场景）**
```python
@dataclass
class AnalysisContext:
    stock_code: str
    model_name: Optional[str] = None
    # 其他参数...

def analyze(ctx: AnalysisContext) -> Result:
    # 整个调用链只传一个对象
    return pipeline.process(ctx)
```

**推荐：默认值保护（对于简单场景）**
```python
def analyze_stock(
    stock_code: str,
    model_name: Optional[str] = None,  # 新增参数必须有默认值
) -> Result:
    return pipeline.process(stock_code, model_name=model_name)
```

**禁止：破坏向后兼容**
```python
# 错误！破坏旧调用
def analyze_stock(stock_code: str, model_name: str) -> Result:
    ...

# 正确！保持兼容
def analyze_stock(stock_code: str, model_name: Optional[str] = None) -> Result:
    ...
```

### 7.5 代码审查自检清单

修改多层调用代码前，自问：
1. 我画出了完整的调用链吗？
2. 每一层都正确传递参数了吗？
3. 新增参数有默认值吗？
4. 我添加了回归测试吗？
5. 运行 `python tests/test_smoke.py` 通过了吗？
