#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
===================================
测试运行脚本
===================================

用法：
    python tests/run_tests.py              # 运行所有测试
    python tests/run_tests.py -v           # 详细输出
    python tests/run_tests.py -k model     # 只运行包含 "model" 的测试
    python tests/run_tests.py --cov        # 带覆盖率报告
"""

import sys
import subprocess


def main():
    """运行测试套件"""
    args = ["pytest", "tests/"] + sys.argv[1:]

    try:
        result = subprocess.run(args, check=False)
        return result.returncode
    except FileNotFoundError:
        print("❌ 错误：pytest 未安装")
        print("请运行：pip install pytest pytest-cov")
        return 1


if __name__ == "__main__":
    sys.exit(main())
