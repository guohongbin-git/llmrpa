import sys
import os

# 将项目根目录添加到Python路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, request, jsonify
import yaml
import json
import subprocess
from flask_cors import CORS
from src.ai_services import generate_workflow_yaml
from src.uivision_converter import convert_uivision_to_yaml

app = Flask(__name__)
CORS(app)

_tasks_db = {}

@app.route('/api/tasks', methods=['POST'])
def start_task():
    try:
        workflow_id = request.form.get('workflow_id')
        uploaded_files = request.files.getlist('files') # 接收文件列表

        if not workflow_id or not uploaded_files:
            return jsonify({'success': False, 'error': '缺少 workflow_id 或上传的文件'}), 400

        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        workflow_path = os.path.join(project_root, 'workflows', workflow_id)
        
        task_id = f"task_{os.urandom(8).hex()}"
        work_item_dir = os.path.join(project_root, 'devdata', 'running_work_items', task_id)
        os.makedirs(work_item_dir, exist_ok=True)

        saved_file_paths = []
        work_item_files = {}
        for f in uploaded_files:
            # 保存文件到工作项目录
            saved_path = os.path.join(work_item_dir, f.filename)
            f.save(saved_path)
            saved_file_paths.append(saved_path) # 使用绝对路径
            work_item_files[f.filename] = f.filename

        # 创建工作项 payload
        work_item = {
            "payload": {
                'workflow_file': workflow_path,
                'file_paths': saved_file_paths # 传递文件路径列表
            },
            "files": work_item_files
        }
        with open(os.path.join(work_item_dir, 'work-items.json'), 'w') as f:
            json.dump([work_item], f)

        # 设置并执行 Robocorp 任务
        task_env = os.environ.copy()
        task_env['RC_WORKITEM_INPUT_PATH'] = os.path.join(work_item_dir, 'work-items.json')
        
        command = [
            sys.executable, '-m', 'robocorp.tasks',
            'run', os.path.join(project_root, 'robots', 'workflow_executor.py'),
            '--task', 'run_workflow'
        ]
        
        subprocess.Popen(command, cwd=project_root, env=task_env)

        _tasks_db[task_id] = {'status': 'RUNNING'}

        return jsonify({
            'success': True, 
            'message': f'任务 {task_id} 已成功启动，包含 {len(saved_file_paths)} 个文件', 
            'task_id': task_id
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ... (保留所有其他 API 端点，如 get_workflows, get_task_status 等)

if __name__ == '__main__':
    app.run(debug=True, port=5001)