# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch, MagicMock
from src.services.system_config_service import SystemConfigService

class TestModelDiscovery(unittest.TestCase):
    @patch("httpx.Client.get")
    def test_fetch_openai_models_success(self, mock_get):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": "gpt-4"},
                {"id": "gpt-3.5-turbo"},
                {"id": "dall-e-3"}
            ]
        }
        mock_get.return_value = mock_response
        
        service = SystemConfigService()
        models = service.fetch_openai_models(api_key="sk-test", base_url="https://api.openai.com/v1")
        
        self.assertEqual(len(models), 3)
        self.assertIn("gpt-4", models)
        self.assertIn("gpt-3.5-turbo", models)
        # Models should be sorted
        self.assertEqual(models[0], "dall-e-3")

    @patch("httpx.Client.get")
    def test_fetch_openai_models_failure(self, mock_get):
        # Mock failure response
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = Exception("Unauthorized")
        mock_get.return_value = mock_response
        
        service = SystemConfigService()
        with self.assertRaises(RuntimeError):
            service.fetch_openai_models(api_key="sk-invalid", base_url="https://api.openai.com/v1")

if __name__ == "__main__":
    unittest.main()
