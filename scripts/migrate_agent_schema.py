import sys
import os
import logging
from sqlalchemy import text

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage import DatabaseManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    db = DatabaseManager()
    
    with db._engine.connect() as conn:
        # 1. Check if agent_profile table exists (handled by create_all usually, but let's be sure)
        # SQLAlchemy create_all is usually called on app startup. 
        # But we need to update chat_session table.
        
        logger.info("Checking chat_session schema...")
        
        try:
            # Check if columns exist
            result = conn.execute(text("PRAGMA table_info(chat_session)"))
            columns = [row[1] for row in result.fetchall()]
            
            if 'agent_id' not in columns:
                logger.info("Adding agent_id column to chat_session...")
                conn.execute(text("ALTER TABLE chat_session ADD COLUMN agent_id VARCHAR(36)"))
                
            if 'current_agent_config' not in columns:
                logger.info("Adding current_agent_config column to chat_session...")
                conn.execute(text("ALTER TABLE chat_session ADD COLUMN current_agent_config TEXT"))
                
            logger.info("Migration completed successfully.")
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    migrate()
