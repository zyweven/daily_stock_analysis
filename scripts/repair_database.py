import sqlite3
import os
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def repair_database():
    db_path = os.path.join('data', 'stock_analysis.db')
    
    if not os.path.exists(db_path):
        logger.error(f"数据库文件不存在: {db_path}")
        return

    logger.info(f"正在连接数据库进行修复: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查 analysis_history 表结构
        cursor.execute("PRAGMA table_info(analysis_history)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # 需要添加的列
        new_columns = [
            ("model_details", "TEXT"),
            ("models_used", "VARCHAR(200)")
        ]
        
        added_count = 0
        for col_name, col_type in new_columns:
            if col_name not in columns:
                logger.info(f"正在添加缺失的列: {col_name} ({col_type})")
                cursor.execute(f"ALTER TABLE analysis_history ADD COLUMN {col_name} {col_type}")
                added_count += 1
            else:
                logger.info(f"列已存在，无需添加: {col_name}")
                
        if added_count > 0:
            conn.commit()
            logger.info(f"成功添加 {added_count} 个字段，数据库修复完成。")
        else:
            logger.info("数据库结构已是最新，无需修复。")
            
        conn.close()
        
    except Exception as e:
        logger.error(f"修复数据库时发生错误: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()

if __name__ == "__main__":
    repair_database()
