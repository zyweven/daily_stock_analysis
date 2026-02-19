import unittest
from unittest.mock import MagicMock, patch
from src.services.chat_service import ChatService

class TestChatService(unittest.TestCase):
    """
    针对 ChatService 的单元测试。
    遵循 Testing Expert Skill:
    1. 外部依赖 Mock (Database, AgentService)
    2. 覆盖正常流程 (Happy Path)
    3. 覆盖错误逻辑 (Error Path)
    """

    def setUp(self):
        # 使用 Mock 模拟数据库连接
        self.patcher = patch('src.storage.DatabaseManager.get_instance')
        self.mock_db_manager = self.patcher.start()
        self.mock_db_instance = MagicMock()
        self.mock_db_manager.return_value = self.mock_db_instance
        
        # 初始服务
        self.service = ChatService()

    def tearDown(self):
        self.patcher.stop()

    def test_delete_session_success(self):
        """测试成功删除会话 (Happy Path)"""
        # 模拟会话存在且删除成功
        mock_session = MagicMock()
        mock_chat_session = MagicMock()
        mock_session.query().get.return_value = mock_chat_session
        self.mock_db_instance.get_session.return_value.__enter__.return_value = mock_session
        
        result = self.service.delete_session("test_id")
        
        self.assertTrue(result)
        mock_session.delete.assert_called_once_with(mock_chat_session)
        mock_session.commit.assert_called()

    def test_delete_session_not_found(self):
        """测试删除不存在的会话 (Error Path)"""
        # 模拟会话不存在
        mock_session = MagicMock()
        mock_session.query().get.return_value = None
        self.mock_db_instance.get_session.return_value.__enter__.return_value = mock_session
        
        result = self.service.delete_session("non_existent_id")
        
        self.assertFalse(result)
        mock_session.delete.assert_not_called()

if __name__ == '__main__':
    unittest.main()
