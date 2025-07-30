import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import jsyaml from 'js-yaml';
import { diffLines } from 'diff';
import { Button, Upload, message, Card, Input, List, Typography, Space, Select, Divider } from 'antd';
import { UploadOutlined, RobotOutlined, SaveOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;
const API_URL = 'http://127.0.0.1:5001';

// Custom Diff Viewer Component
const DiffViewer = ({ oldYaml, newYaml }) => {
    const differences = diffLines(oldYaml, newYaml);

    return (
        <pre style={{ 
            border: '1px solid #d9d9d9', 
            padding: '12px', 
            borderRadius: '4px', 
            backgroundColor: '#f5f5f5', 
            height: '400px', 
            overflowY: 'auto', 
            fontFamily: 'monospace' 
        }}>
            {differences.map((part, index) => {
                const style = {
                    backgroundColor: part.added ? '#e6ffed' : part.removed ? '#ffebe9' : 'transparent',
                    color: part.added ? '#237804' : part.removed ? '#a8071a' : '#000',
                    display: 'block',
                    whiteSpace: 'pre-wrap',
                };
                return (
                    <span key={index} style={style}>
                        {part.value}
                    </span>
                );
            })}
        </pre>
    );
};

function WorkflowGenerator() {
    const navigate = useNavigate();
    const [rawSteps, setRawSteps] = useState([]);
    const [optimizationGoal, setOptimizationGoal] = useState(''); // New state for the goal
    const [originalYaml, setOriginalYaml] = useState('');
    const [optimizedYaml, setOptimizedYaml] = useState('');
    const [workflows, setWorkflows] = useState([]);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
    const [newFileName, setNewFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchWorkflows = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/workflows`);
            setWorkflows(response.data.workflows);
        } catch (err) {
            setError('无法加载现有流程列表。');
        }
    };

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const handleFileLoad = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const data = jsyaml.load(content);
                // Expect a full workflow object now
                if (data && typeof data === 'object' && Array.isArray(data.steps)) {
                    setRawSteps(data.steps); // Still keep raw steps for the list view
                    setOriginalYaml(content);
                    setOptimizedYaml(content); // Initially, both are the same
                    message.success(`成功加载工作流文件: ${file.name}`);
                } else {
                    // Handle the case where the loaded file is just a list of steps
                    const steps = jsyaml.load(content);
                    if (Array.isArray(steps)) {
                        console.warn('Loaded a file with only steps. Wrapping it in a temporary workflow object.');
                        const wrappedYaml = jsyaml.dump({ name: 'temp-workflow', description: 'Loaded from raw steps', steps: steps });
                        setRawSteps(steps);
                        setOriginalYaml(wrappedYaml);
                        setOptimizedYaml(wrappedYaml);
                        message.success(`成功加载步骤文件: ${file.name}`);
                    } else {
                        throw new Error('无效的工作流文件格式，必须是一个包含 \'steps\' 列表的对象或一个步骤列表。');
                    }
                }
            } catch (err) {
                setError(`加载文件失败: ${err.message}`);
                message.error(`加载文件失败: ${err.message}`);
            }
        };
        reader.readAsText(file);
        return false;
    };

    const handleOptimize = async () => {
        if (rawSteps.length === 0) {
            message.warning('请先加载一个包含步骤的录制文件。');
            return;
        }
        if (!optimizationGoal.trim()) {
            message.warning('请输入您的优化目标，以帮助 AI 更好地理解您的意图。');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const payload = { 
                steps: rawSteps,
                user_prompt: optimizationGoal // Pass the goal to the backend
            };
            const response = await axios.post(`${API_URL}/api/generate-workflow`, payload);
            if (response.data.success) {
                setOptimizedYaml(response.data.yaml);
                message.success('LLM 优化成功！请在下方查看差异。');
            } else {
                throw new Error(response.data.error || '未知错误');
            }
        } catch (err) {
            console.error("Error optimizing workflow:", err.response?.data || err);
            setError(`优化流程失败: ${err.response?.data?.error || err.message}`);
            message.error(`优化流程失败: ${err.response?.data?.error || err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!optimizedYaml) {
            message.error('没有可保存的 YAML 内容。');
            return;
        }

        // Mode 1: Overwrite existing workflow
        if (selectedWorkflowId) {
            try {
                await axios.put(`${API_URL}/api/workflows/${selectedWorkflowId}`, optimizedYaml, {
                    headers: { 'Content-Type': 'text/plain' }
                });
                message.success(`流程 '${selectedWorkflowId}' 已成功覆盖保存！`);
                navigate('/config');
            } catch (err) {
                handleSaveError(err, '覆盖');
            }
        } 
        // Mode 2: Create new workflow
        else if (newFileName) {
            try {
                const finalFileName = newFileName.endsWith('.yaml') ? newFileName : `${newFileName}.yaml`;
                await axios.post(`${API_URL}/api/workflows?file_name=${encodeURIComponent(finalFileName)}`, optimizedYaml, {
                    headers: { 'Content-Type': 'text/plain' }
                });
                message.success(`新流程 '${finalFileName}' 已成功创建！`);
                setNewFileName('');
                // Introduce a small delay to mitigate potential filesystem race conditions
                setTimeout(() => {
                    fetchWorkflows(); // Refresh the list
                }, 200);
            } catch (err) {
                handleSaveError(err, '创建');
            }
        } else {
            message.warning('请选择一个要覆盖的流程，或输入一个新文件名。');
        }
    };

    const handleSaveError = (err, action) => {
        console.error(`Error ${action}ing workflow:`, err.response?.data || err);
        setError(`${action}流程失败: ${err.response?.data?.error || err.message}`);
        message.error(`${action}流程失败: ${err.response?.data?.error || err.message}`);
    }

    const isSaveDisabled = !optimizedYaml || (!selectedWorkflowId && !newFileName.trim());

    return (
        <div style={{ padding: '24px' }}>
            <Title level={2}>工作流加载与优化</Title>
            <Paragraph>加载您录制的 YAML 文件，然后使用 LLM 进行智能分析和优化。优化结果将以高亮差异的形式展示。</Paragraph>

            <Card style={{ marginBottom: 24 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Upload beforeUpload={handleFileLoad} showUploadList={false}>
                        <Button icon={<UploadOutlined />}>加载录制的 YAML 文件</Button>
                    </Upload>
                    <Input.TextArea
                        rows={3}
                        value={optimizationGoal}
                        onChange={(e) => setOptimizationGoal(e.target.value)}
                        placeholder="请输入此工作流的最终目标，例如：&#10;登录OA，找到最新的出差报销单，打开它，然后把里面的内容填好并提交。"
                    />
                    <Button 
                        type="primary"
                        icon={<RobotOutlined />} 
                        onClick={handleOptimize} 
                        disabled={loading || rawSteps.length === 0}
                        loading={loading}
                    >
                        发送给 LLM 优化
                    </Button>
                </Space>
            </Card>

            {error && <div className="alert alert-danger mt-3">{error}</div>}

            <Card title="优化差异对比" style={{ marginBottom: 24 }}>
                <DiffViewer oldYaml={originalYaml} newYaml={optimizedYaml} />
            </Card>

            <Card>
                <Title level={4}>保存工作流</Title>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Paragraph>您可以选择覆盖一个现有流程，或创建一个新流程。</Paragraph>
                    <Select 
                        style={{ width: '100%' }}
                        value={selectedWorkflowId}
                        onChange={(value) => {
                            setSelectedWorkflowId(value);
                            if (value) setNewFileName(''); // Clear new file name if existing is selected
                        }}
                        placeholder="选择一个要覆盖的流程..."
                        allowClear
                    >
                        {workflows.map(wf => (
                            <Select.Option key={wf.id} value={wf.id}>{wf.name} ({wf.id})</Select.Option>
                        ))}
                    </Select>
                    
                    <Divider>或</Divider>

                    <Input 
                        placeholder="输入新文件名 (例如: my-new-workflow.yaml)"
                        value={newFileName}
                        onChange={(e) => {
                            setNewFileName(e.target.value);
                            if (e.target.value) setSelectedWorkflowId(null); // Clear selection if new name is typed
                        }}
                        disabled={!!selectedWorkflowId}
                    />
                    
                    <Button 
                        type="primary"
                        icon={<SaveOutlined />} 
                        onClick={handleSave} 
                        disabled={isSaveDisabled}
                        style={{ marginTop: 16 }}
                    >
                        {selectedWorkflowId ? `覆盖保存 '${selectedWorkflowId}'` : '保存为新工作流'}
                    </Button>
                </Space>
            </Card>
        </div>
    );
}

export default WorkflowGenerator;

