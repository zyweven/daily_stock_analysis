# PLAN-004: 智能导入功能

## 基本信息

| 字段 | 值 |
|------|------|
| 计划ID | PLAN-004 |
| 计划名称 | 智能导入功能 |
| 创建日期 | 2026-03-11 |
| 优先级 | High |
| 状态 | In Progress |
| 负责人 | Claude Code + Peridot |

## 背景与目标

### 问题描述
用户需要快速导入股票列表，支持多种输入方式：
- 直接输入股票代码/名称
- 上传 CSV/Excel 文件
- 上传截图识别股票代码

上游项目 `ZhuLinsen/daily_stock_analysis` 已实现此功能，但直接 cherry-pick 会产生大量冲突。

### 预期目标
1. 实现股票代码智能识别和标准化
2. 实现股票名称到代码的解析（支持中文、拼音、英文）
3. 实现多格式文件导入（CSV、Excel、文本）
4. 实现图片识别提取股票代码
5. 提供 API 端点供前端调用
6. 提供前端组件供用户使用

## 任务清单

### 任务1：核心服务模块 ✅ 已完成
- [x] `stock_code_utils.py` - 股票代码识别和标准化
- [x] `name_to_code_resolver.py` - 名称→代码解析引擎
- [x] `import_parser.py` - CSV/Excel/文本解析管道
- [x] `image_stock_extractor.py` - Vision LLM 图片提取
- [x] `stock_mapping.py` - 股票映射数据（100+ 常用股票）

### 任务2：依赖和测试 ✅ 已完成
- [x] 更新 `requirements.txt`
- [x] 创建测试文件

### 任务3：API 端点 ⬜ 待完成
- [ ] `POST /api/v1/stocks/extract-from-image` - 图片识别
- [ ] `POST /api/v1/stocks/parse-import` - 文件/文本解析
- [ ] Schema 定义

### 任务4：前端组件 ⬜ 待完成
- [ ] `IntelligentImport.tsx` - 智能导入组件
- [ ] 集成到设置页面

## 技术方案

### 已实现的核心模块

#### 1. stock_code_utils.py
```python
is_code_like(text) -> bool      # 判断是否像股票代码
normalize_code(code) -> str     # 标准化股票代码
```

#### 2. name_to_code_resolver.py
```python
resolve_name_to_code(name) -> tuple[str, float, str]
# 多级策略：代码检测 → 本地映射 → 拼音匹配 → AkShare → 模糊匹配
# 返回：(代码, 置信度, 来源)
```

#### 3. import_parser.py
```python
parse_import_from_text(text) -> list[tuple[str, float, str]]
parse_import_from_file(file) -> list[tuple[str, float, str]]
# 支持 CSV、Excel、纯文本
```

#### 4. image_stock_extractor.py
```python
extract_stocks_from_image(image_path) -> list[tuple[str, float, str]]
# 使用 Vision LLM 识别图片中的股票代码
```

### 涉及文件

```
src/services/stock_code_utils.py      # 已创建
src/services/name_to_code_resolver.py # 已创建
src/services/import_parser.py         # 已创建
src/services/image_stock_extractor.py # 已创建
src/data/stock_mapping.py             # 已创建
api/v1/endpoints/stocks.py            # 待修改
api/v1/schemas/stocks.py              # 待修改
apps/dsa-web/src/components/...       # 待创建
```

### 依赖项
- pandas>=2.0.0
- openpyxl>=3.0.0
- pypinyin>=0.50.0
- litellm>=1.0.0

## 注意事项

- `import_parser.py` 依赖 pandas，需先安装
- `image_stock_extractor.py` 需要 Vision LLM API（通过 litellm）
- 股票映射数据需要定期更新
- 与上游项目的架构差异：
  - 上游的 `storage.py` 已被拆分
  - 上游的 `agent/executor.py` 已删除

## 参考文档

- 上游实现: `ZhuLinsen/daily_stock_analysis` commit `633bdda`
- AkShare 文档: https://akshare.akfamily.xyz/

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-11 | 计划创建，核心模块实现完成 | Claude Code + Peridot |
| 2026-03-11 | 提交核心模块代码 (commit cd489c5) | Peridot |
