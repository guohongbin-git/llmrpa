import unittest
from unittest.mock import patch
import os

# Add the project root to the path to import the webapp
import sys
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

from src.ai_services import extract_document_data

class TestAiServices(unittest.TestCase):

    def test_extract_document_data_simulation(self):
        """Tests the simulation logic of extract_document_data."""
        # Create a dummy file
        dummy_file_path = 'dummy_c.pdf'
        with open(dummy_file_path, 'w') as f:
            f.write('dummy content')

        result = extract_document_data(dummy_file_path)
        self.assertEqual(result['invoice_number'], 'DD123456789')

        os.remove(dummy_file_path)

if __name__ == '__main__':
    unittest.main()