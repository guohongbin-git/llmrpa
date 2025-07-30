import unittest
import requests
import os
from io import BytesIO
from unittest.mock import patch, MagicMock

# We need to add the project root to the path to import the webapp
import sys
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

from webapp.app import app

class TaskExecutionTestCase(unittest.TestCase):

    def setUp(self):
        """Set up a test client for the Flask app."""
        self.app = app.test_client()
        self.app.testing = True

    @patch('webapp.app.subprocess.Popen')
    def test_start_task_api(self, mock_popen):
        """Test the /api/tasks endpoint to ensure it triggers a Robocorp task correctly."""
        print("\n--- Running test_start_task_api ---")

        # 1. Prepare the test data
        # Create a dummy workflow file for the test
        workflows_dir = os.path.join(project_root, 'workflows')
        if not os.path.exists(workflows_dir):
            os.makedirs(workflows_dir)
        dummy_workflow_path = os.path.join(workflows_dir, 'test_workflow.yaml')
        with open(dummy_workflow_path, 'w') as f:
            f.write('name: Test Workflow\nsteps:\n  - name: Step 1\n    action: browser_goto\n    params:\n      url: https://www.google.com')

        # Create a dummy file to upload
        dummy_file_content = b'This is a dummy file.'
        dummy_file_name = 'dummy_invoice.pdf'

        # 2. Simulate the multipart/form-data POST request
        data = {
            'workflow_id': 'test_workflow.yaml',
            'file': (BytesIO(dummy_file_content), dummy_file_name)
        }

        print("Sending POST request to /api/tasks...")
        response = self.app.post('/api/tasks', content_type='multipart/form-data', data=data)

        # 3. Assert the response from the API
        print(f"Received status code: {response.status_code}")
        self.assertEqual(response.status_code, 200)
        json_response = response.get_json()
        print(f"Received JSON response: {json_response}")
        self.assertTrue(json_response['success'])
        self.assertIn('task_', json_response['task_id'])

        # 4. Assert that the subprocess was called correctly
        print("Verifying that subprocess.Popen was called...")
        mock_popen.assert_called_once()
        call_args, call_kwargs = mock_popen.call_args
        command = call_args[0]
        print(f"subprocess.Popen was called with command: {command}")

        # Check the command structure
        self.assertIn('-m', command)
        self.assertIn('robocorp.tasks', command)
        self.assertIn('run', command)
        self.assertIn('--task', command)
        self.assertIn('run_workflow', command)
        
        # Check that the environment variable for work items was set
        self.assertIn('env', call_kwargs)
        self.assertIn('RC_WORKITEM_INPUT_PATH', call_kwargs['env'])
        work_item_path = call_kwargs['env']['RC_WORKITEM_INPUT_PATH']
        print(f"RC_WORKITEM_INPUT_PATH was set to: {work_item_path}")
        self.assertTrue(os.path.exists(work_item_path))

        # 5. Clean up the dummy files and directories
        os.remove(dummy_workflow_path)
        # Clean up the created work item directory
        import shutil
        if os.path.exists(work_item_path):
            shutil.rmtree(work_item_path)
        print("--- Test finished successfully ---")

if __name__ == '__main__':
    # Need to import BytesIO here for the test to run standalone
    from io import BytesIO
    unittest.main()
