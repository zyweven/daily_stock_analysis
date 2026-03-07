#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：添加多用户支持字段

功能：
1. 为现有表添加 user_id 字段（默认 default_user）
2. 创建新表 portfolio_position
3. 为新字段创建索引

执行方式：
    python scripts/migrate_add_user_support.py

注意：此脚本可以安全地多次执行
"""

import sys
import os
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import sqlite3
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 默认用户ID
DEFAULT_USER_ID = "default_user"


def get_db_path() -> Path:
    """获取数据库路径"""
    from src.config import get_config
    config = get_config()
    db_path = Path(config.database_path)
    return db_path


def check_column_exists(cursor: sqlite3.Cursor, table: str, column: str) -> bool:
    """检查列是否已存在"""
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns


def check_table_exists(cursor: sqlite3.Cursor, table: str) -> bool:
    """检查表是否存在"""
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
    return cursor.fetchone() is not None


def migrate_chat_session(cursor: sqlite3.Cursor):
    """为 chat_session 表添加 user_id 字段"""
    logger.info("检查 chat_session 表...")

    if not check_table_exists(cursor, 'chat_session'):
        logger.warning("chat_session 表不存在，跳过迁移")
        return

    if check_column_exists(cursor, 'chat_session', 'user_id'):
        logger.info("chat_session.user_id 已存在，跳过")
        return

    # 添加 user_id 列
    logger.info("为 chat_session 添加 user_id 列...")
    cursor.execute(f"ALTER TABLE chat_session ADD COLUMN user_id TEXT NOT NULL DEFAULT '{DEFAULT_USER_ID}'")

    # 创建索引
    logger.info("创建 chat_session 索引...")
    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_chat_session_user ON chat_session(user_id, updated_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_chat_session_user_stock ON chat_session(user_id, stock_code)")
        logger.info("chat_session 索引创建成功")
    except Exception as e:
        logger.warning(f"创建索引失败（可能已存在）: {e}")


def migrate_analysis_history(cursor: sqlite3.Cursor):
    """为 analysis_history 表添加 user_id 字段"""
    logger.info("检查 analysis_history 表...")

    if not check_table_exists(cursor, 'analysis_history'):
        logger.warning("analysis_history 表不存在，跳过迁移")
        return

    if check_column_exists(cursor, 'analysis_history', 'user_id'):
        logger.info("analysis_history.user_id 已存在，跳过")
        return

    # 添加 user_id 列
    logger.info("为 analysis_history 添加 user_id 列...")
    cursor.execute(f"ALTER TABLE analysis_history ADD COLUMN user_id TEXT NOT NULL DEFAULT '{DEFAULT_USER_ID}'")

    # 创建索引
    logger.info("创建 analysis_history 索引...")
    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_analysis_user_code ON analysis_history(user_id, code)")
        logger.info("analysis_history 索引创建成功")
    except Exception as e:
        logger.warning(f"创建索引失败（可能已存在）: {e}")


def create_portfolio_table(cursor: sqlite3.Cursor):
    """创建 portfolio_position 表"""
    logger.info("检查 portfolio_position 表...")

    if check_table_exists(cursor, 'portfolio_position'):
        logger.info("portfolio_position 表已存在，跳过创建")
        # 检查是否需要添加 principal_amount 列
        if not check_column_exists(cursor, 'portfolio_position', 'principal_amount'):
            logger.info("为 portfolio_position 添加 principal_amount 列...")
            cursor.execute("ALTER TABLE portfolio_position ADD COLUMN principal_amount REAL")
            logger.info("principal_amount 列添加成功")
        return

    logger.info("创建 portfolio_position 表...")
    cursor.execute("""
        CREATE TABLE portfolio_position (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default_user',
            code TEXT NOT NULL,
            name TEXT,
            quantity REAL NOT NULL,
            cost_price REAL NOT NULL,
            principal_amount REAL,
            group_name TEXT DEFAULT '默认分组',
            remark TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 创建索引
    logger.info("创建 portfolio_position 索引...")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_portfolio_user_code ON portfolio_position(user_id, code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_portfolio_user_group ON portfolio_position(user_id, group_name)")

    logger.info("portfolio_position 表创建成功")


def migrate():
    """执行迁移"""
    logger.info("=" * 60)
    logger.info("开始数据库迁移：添加多用户支持字段")
    logger.info("=" * 60)

    db_path = get_db_path()

    if not db_path.exists():
        logger.error(f"数据库文件不存在: {db_path}")
        logger.info("将在首次运行时自动创建")
        return

    logger.info(f"数据库路径: {db_path}")

    # 备份数据库
    backup_path = db_path.parent / f"{db_path.stem}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    logger.info(f"备份数据库到: {backup_path}")

    import shutil
    shutil.copy2(db_path, backup_path)
    logger.info("备份完成")

    # 连接数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 执行迁移
        migrate_chat_session(cursor)
        migrate_analysis_history(cursor)
        create_portfolio_table(cursor)

        # 提交事务
        conn.commit()
        logger.info("=" * 60)
        logger.info("迁移成功完成！")
        logger.info("=" * 60)

        # 验证
        logger.info("\n验证迁移结果:")
        if check_column_exists(cursor, 'chat_session', 'user_id'):
            logger.info("  ✓ chat_session.user_id 已添加")
        if check_column_exists(cursor, 'analysis_history', 'user_id'):
            logger.info("  ✓ analysis_history.user_id 已添加")
        if check_table_exists(cursor, 'portfolio_position'):
            logger.info("  ✓ portfolio_position 表已创建")

        logger.info("\n提示：")
        logger.info("  - 所有现有数据的 user_id 已设置为 'default_user'")
        logger.info("  - 未来启用多用户时，只需修改代码传入真实用户ID")
        logger.info(f"  - 数据库备份位于: {backup_path}")

    except Exception as e:
        conn.rollback()
        logger.error(f"迁移失败: {e}")
        logger.error("数据库已回滚，请检查错误并重试")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
