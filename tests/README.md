# 测试套件

## 目录结构

```
tests/
├── __init__.py              # 测试模块初始化
├── conftest.py              # pytest 配置和共享夹具
├── README.md                # 本文件
├── run_tests.py             # 测试运行脚本
├── test_model_selection.py  # 模型选择功能回归测试
└── test_regression.py       # 通用回归测试
```

## 运行测试

### 安装依赖

```bash
pip install pytest pytest-cov
```

### 运行所有测试

```bash
python tests/run_tests.py
# 或
pytest tests/ -v
```

### 运行特定测试

```bash
# 只运行模型选择相关的测试
pytest tests/test_model_selection.py -v

# 只运行回归测试
pytest tests/test_regression.py -v

# 根据关键字过滤
pytest tests/ -k "model_selection" -v
```

### 带覆盖率报告

```bash
pytest tests/ --cov=src --cov=api --cov-report=term-missing
```

## 测试类型

### 1. 回归测试 (`test_regression.py`)

确保新功能不会破坏旧功能：

- **函数签名兼容性**: 验证函数参数没有破坏性变更
- **返回数据结构**: 验证返回值结构保持稳定
- **关键路径**: 验证核心流程正常工作

### 2. 模型选择测试 (`test_model_selection.py`)

验证模型选择功能正确工作：

- **参数传递**: 验证 `model_name` 在调用链中正确传递
- **默认值处理**: 验证不指定模型时使用默认模型
- **响应包含**: 验证响应中包含实际使用的模型名称

## 添加新测试

当添加新功能时，请同时添加回归测试：

```python
def test_new_feature_does_not_break_old_behavior():
    """测试：新功能不会破坏旧行为"""
    # 1. 准备（模拟依赖）
    with patch('module.Dependency') as mock_dep:
        mock_dep.return_value.some_method.return_value = expected_value

        # 2. 执行（调用被测函数）
        result = function_under_test()

        # 3. 验证（检查结果）
        assert result['expected_field'] == expected_value
```

## 最佳实践

1. **先写测试**: 修改代码前，先写测试描述预期行为
2. **模拟外部依赖**: 使用 `unittest.mock.patch` 模拟数据库、API 等外部依赖
3. **测试边界情况**: 包括正常情况、异常情况、边界值
4. **保持独立**: 每个测试应该独立运行，不依赖其他测试
5. **快速执行**: 测试应该快速完成，避免真实网络请求
