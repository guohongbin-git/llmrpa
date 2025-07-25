"""
Unit tests for the ai_services module.
"""
import unittest
from unittest.mock import patch, MagicMock
from src.ai_services import extract_document_data

class TestAiServices(unittest.TestCase):

    @patch('src.ai_services.load_config')
    @patch('src.ai_services.get_llm_extraction')
    @patch('src.ai_services.get_ocr_result')
    def test_extract_document_data_success(self, mock_get_ocr_result, mock_get_llm_extraction, mock_load_config):
        """
        Tests the successful execution of the main extraction function.
        """
        # --- Arrange ---
        # Mock the configuration
        mock_load_config.return_value = {
            'ai_services': {
                'ocr_provider_1': {'url': 'fake_url_1'},
                'ocr_provider_2': {'url': 'fake_url_2'},
                'llm_provider': {'url': 'fake_llm_url'}
            }
        }

        # Mock the return values of the OCR services
        mock_get_ocr_result.side_effect = [
            "OCR result from provider 1",
            "OCR result from provider 2"
        ]

        # Mock the return value of the LLM service
        expected_data = {"amount": 150.0, "date": "2025-07-25"}
        mock_get_llm_extraction.return_value = expected_data

        # --- Act ---
        result = extract_document_data("dummy/file/path.jpg")

        # --- Assert ---
        # Verify that the result is what we expect
        self.assertEqual(result, expected_data)

        # Verify that the OCR functions were called twice with the correct file path
        self.assertEqual(mock_get_ocr_result.call_count, 2)
        mock_get_ocr_result.assert_any_call("dummy/file/path.jpg", 'ocr_provider_1')
        mock_get_ocr_result.assert_any_call("dummy/file/path.jpg", 'ocr_provider_2')

        # Verify that the LLM function was called with the results from the OCR services
        mock_get_llm_extraction.assert_called_once_with(
            "OCR result from provider 1",
            "OCR result from provider 2"
        )

    @patch('src.ai_services.load_config')
    @patch('src.ai_services.get_ocr_result')
    def test_extract_document_data_ocr_failure(self, mock_get_ocr_result, mock_load_config):
        """
        Tests the case where both OCR services fail.
        """
        # --- Arrange ---
        mock_load_config.return_value = {
            'ai_services': {
                'ocr_provider_1': {'url': 'fake_url_1'},
                'ocr_provider_2': {'url': 'fake_url_2'}
            }
        }
        # Mock both OCR services to return empty strings, simulating failure
        mock_get_ocr_result.return_value = ""

        # --- Act & Assert ---
        # Verify that a ConnectionError is raised
        with self.assertRaises(ConnectionError) as context:
            extract_document_data("dummy/file/path.jpg")
        
        self.assertIn("Both OCR services failed", str(context.exception))


if __name__ == '__main__':
    unittest.main()
