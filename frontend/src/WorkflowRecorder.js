import React, { useState, useEffect } from 'react';
import { Button, Card, List, message, Typography, Input, Space, Empty, Alert, Modal } from 'antd';
import { PlayCircleOutlined, StopOutlined, SaveOutlined, ClearOutlined, CodeOutlined, FastForwardOutlined, FolderOpenOutlined } from '@ant-design/icons';
import jsyaml from 'js-yaml';

const { Title, Paragraph, Text } = Typography;
const { ipcRenderer, shell } = window.require ? window.require('electron') : { ipcRenderer: null, shell: null };

const WorkflowRecorder = () => {
  const [recordedSteps, setRecordedSteps] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [targetUrl, setTargetUrl] = useState('https://www.google.com');
  const [showSourceCodeModal, setShowSourceCodeModal] = useState(false);
  const [sourceCode, setSourceCode] = useState('');
  const [sourceCodeSelector, setSourceCodeSelector] = useState('');
  const [replayStatus, setReplayStatus] = useState(null);

  // New states for debug info modal
  const [currentDebugStep, setCurrentDebugStep] = useState(null);
  const [showDebugInfoModal, setShowDebugInfoModal] = useState(false);
  const [debugScreenshot, setDebugScreenshot] = useState(null);
  const [debugSourceCode, setDebugSourceCode] = useState(null);

  useEffect(() => {
    if (!ipcRenderer) return;

    const handleRecordingUpdate = (event, { steps, recordingStatus }) => {
      console.log('[RECORDER_UI]', 'Received update from main process', { steps, recordingStatus });
      if (steps) {
        setRecordedSteps(steps);
      }
      if (recordingStatus !== undefined) {
        setIsRecording(recordingStatus);
      }
    };

    const handleReplayUpdate = (event, { status, currentStep, totalSteps }) => {
      if (status === 'started') {
        setReplayStatus(`回放中... 步骤 ${currentStep}/${totalSteps}`);
      } else if (status === 'completed') {
        setReplayStatus('回放完成！');
        message.success('回放完成！');
        setTimeout(() => setReplayStatus(null), 3000);
      } else if (status === 'error') {
        setReplayStatus(`回放失败: ${currentStep}`);
        message.error(`回放失败: ${currentStep}`);
        setTimeout(() => setReplayStatus(null), 5000);
      }
    };

    ipcRenderer.on('recording-update', handleRecordingUpdate);
    ipcRenderer.on('replay-update', handleReplayUpdate);

    return () => {
      ipcRenderer.removeListener('recording-update', handleRecordingUpdate);
      ipcRenderer.removeListener('replay-update', handleReplayUpdate);
    };
  }, []);

  const handleStartRecording = () => {
    if (!targetUrl || !targetUrl.startsWith('http')) {
        message.error('请输入一个有效的 URL (以 http 或 https 开头)');
        return;
    }
    console.log('[RECORDER_UI]', 'Sending start-recording message to main process');
    ipcRenderer.send('recorder-command', { command: 'start', url: targetUrl });
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    console.log('[RECORDER_UI]', 'Sending stop-recording message to main process');
    ipcRenderer.send('recorder-command', { command: 'stop' });
    setIsRecording(false);
  };

  const handleClearSteps = () => {
    console.log('[RECORDER_UI]', 'Sending clear-steps message to main process');
    ipcRenderer.send('recorder-command', { command: 'clear' });
    setRecordedSteps([]);
    message.success('步骤已清空');
  };

  const handleSaveWorkflow = () => {
    console.log('[RECORDER_UI]', 'Sending save-workflow message to main process');
    const workflow = {
        name: "录制的工作流",
        description: `从 ${targetUrl} 录制的操作`,
        steps: recordedSteps.map(step => {
            const newStep = { ...step };
            delete newStep.timestamp;
            return newStep;
        })
    };
    const yamlData = jsyaml.dump(workflow);
    ipcRenderer.send('recorder-command', { command: 'save', data: yamlData });
  };

  const handleLoadWorkflow = () => {
    if (!ipcRenderer) return;
    console.log('[RECORDER_UI]', 'Sending load-workflow message to main process');
    ipcRenderer.send('recorder-command', { command: 'load' });
  };

  useEffect(() => {
    if (!ipcRenderer) return;

    const handleLoadWorkflowResponse = (event, { success, workflow, message: msg }) => {
      if (success) {
        if (workflow && workflow.steps) {
          setRecordedSteps(workflow.steps);
          setTargetUrl(workflow.description.replace('从 ', '').replace(' 录制的操作', ''));
          message.success('工作流加载成功！');
        } else {
          message.error('加载工作流失败：文件内容无效。');
        }
      } else {
        message.error(`加载工作流失败: ${msg}`);
      }
    };

    ipcRenderer.on('load-workflow-response', handleLoadWorkflowResponse);

    return () => {
      ipcRenderer.removeListener('load-workflow-response', handleLoadWorkflowResponse);
    };
  }, []);

  const handleReplayWorkflow = () => {
    if (!ipcRenderer) return;
    if (recordedSteps.length === 0) {
      message.warning('没有可回放的步骤。');
      return;
    }
    setReplayStatus('回放准备中...');
    ipcRenderer.send('recorder-command', { command: 'replay', steps: recordedSteps });
  };

  const handleGetSourceCode = async () => {
    if (!ipcRenderer) {
      message.error('Electron IPC not available.');
      return;
    }
    if (!isRecording) {
      message.warning('请先开始录制，才能获取当前页面的源代码。');
      return;
    }
    try {
      const code = await ipcRenderer.invoke('get-source-code', sourceCodeSelector);
      setSourceCode(code || '未能获取到源代码。');
      setShowSourceCodeModal(true);
    } catch (error) {
      console.error('Failed to get source code:', error);
      message.error('获取源代码失败: ' + error.message);
      setSourceCode('获取源代码失败。');
      setShowSourceCodeModal(true);
    }
  };

  // New functions for debug info modal
  const handleExecuteStep = (index) => {
    if (!ipcRenderer) return;
    const stepToExecute = recordedSteps[index];
    if (stepToExecute) {
      message.info(`正在执行步骤 ${index + 1}...`);
      ipcRenderer.send('recorder-command', { command: 'execute-step', step: stepToExecute });
    }
  };

  const handleViewDebugInfo = async (index) => {
    if (!ipcRenderer) return;
    const step = recordedSteps[index];
    if (step) {
      setCurrentDebugStep(step);
      // Assuming step object contains base64 encoded screenshot and source code
      // In a real scenario, you might need to fetch these from a temporary storage
      setDebugScreenshot(step.screenshot || null); // Assuming step.screenshot holds base64
      setDebugSourceCode(step.sourceCode || null); // Assuming step.sourceCode holds the source
      setShowDebugInfoModal(true);
    }
  };

  return (
    <div>
      <Title level={2}>桌面版工作流录制器</Title>
      <Paragraph>在这里控制录制过程。点击“开始录制”后，会弹出一个新窗口供您操作。</Paragraph>

      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
            <Input 
                addonBefore="目标网址"
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                placeholder="例如: https://www.google.com"
                disabled={isRecording}
            />
            <Space>
                <Button 
                    type="primary" 
                    icon={<PlayCircleOutlined />} 
                    onClick={handleStartRecording} 
                    disabled={isRecording}
                >
                    开始录制
                </Button>
                <Button 
                    type="danger" 
                    icon={<StopOutlined />} 
                    onClick={handleStopRecording} 
                    disabled={!isRecording}
                >
                    停止录制
                </Button>
                <Button 
                    icon={<SaveOutlined />} 
                    onClick={handleSaveWorkflow} 
                    disabled={recordedSteps.length === 0 || isRecording}
                >
                    保存工作流
                </Button>
                <Button 
                    icon={<FolderOpenOutlined />} 
                    onClick={handleLoadWorkflow} 
                    disabled={isRecording}
                >
                    加载工作流
                </Button>
                <Button 
                    icon={<ClearOutlined />} 
                    onClick={handleClearSteps} 
                    disabled={recordedSteps.length === 0 || isRecording}
                >
                    清空步骤
                </Button>
                <Button 
                    icon={<FastForwardOutlined />} 
                    onClick={handleReplayWorkflow} 
                    disabled={recordedSteps.length === 0 || isRecording}
                >
                    回放
                </Button>
                <Button 
                    icon={<CodeOutlined />} 
                    onClick={handleGetSourceCode} 
                    disabled={!isRecording}
                >
                    获取源代码
                </Button>
            </Space>
        </Space>
        
        {isRecording && <Alert message="录制进行中... 请在新打开的窗口中操作。" type="info" showIcon style={{ marginTop: 16 }}/>}

        <Title level={4} style={{ marginTop: 24 }}>已录制步骤 ({recordedSteps.length})</Title>
        <div style={{ height: '400px', overflowY: 'auto', border: '1px solid #d9d9d9', padding: '8px' }}>
            {recordedSteps.length > 0 ? (
                <List
                    dataSource={recordedSteps}
                    renderItem={(step, index) => {
                        let description = `Unknown action: ${step.type}`;
                        if (step.type === 'input') {
                            description = <>Input <Text key={`input-value-${index}`} code>{step.value}</Text> into <Text key={`input-selector-${index}`} strong>{step.selector}</Text></>;
                        } else if (step.type === 'select') {
                            description = <>Select option <Text key={`select-text-${index}`} code>{step.textContent}</Text> in <Text key={`select-selector-${index}`} strong>{step.selector}</Text></>;
                        } else if (step.type === 'click') {
                            description = <>Click on <Text key={`click-target-${index}`} code>{step.textContent || step.selector}</Text></>;
                        } else if (step.type === 'keydown') {
                            description = <>Press key <Text key={`keydown-key-${index}`} code>{step.key}</Text> on <Text key={`keydown-selector-${index}`} strong>{step.selector}</Text></>;
                        }

                        return (
                            <List.Item
                                key={index}
                                actions={[
                                    <Button type="link" onClick={() => handleExecuteStep(index)} disabled={isRecording}>执行此步骤</Button>,
                                    <Button type="link" onClick={() => handleViewDebugInfo(index)} disabled={isRecording}>查看调试信息</Button>,
                                ]}
                            >
                                <Text mark>[{index + 1}]</Text> {description}
                            </List.Item>
                        )
                    }}
                />
            ) : (
                <Empty description="暂未录制任何步骤" style={{ paddingTop: '100px' }}/>
            )}
        </div>
      </Card>

      {/* Debug Info Modal */}
      <Modal
        title={`步骤 ${currentDebugStep ? recordedSteps.indexOf(currentDebugStep) + 1 : ''} 调试信息`}
        open={showDebugInfoModal}
        onCancel={() => setShowDebugInfoModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowDebugInfoModal(false)}>
            关闭
          </Button>,
        ]}
        width={1000}
      >
        {currentDebugStep && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Title level={5}>步骤详情:</Title>
            <Paragraph>类型: <Text code>{currentDebugStep.type}</Text></Paragraph>
            <Paragraph>选择器: <Text code>{currentDebugStep.selector}</Text></Paragraph>
            {currentDebugStep.value && <Paragraph>值: <Text code>{currentDebugStep.value}</Text></Paragraph>}
            {currentDebugStep.textContent && <Paragraph>文本内容: <Text code>{currentDebugStep.textContent}</Text></Paragraph>}
            {currentDebugStep.key && <Paragraph>按键: <Text code>{currentDebugStep.key}</Text></Paragraph>}
            {currentDebugStep.checked !== undefined && <Paragraph>选中: <Text code>{String(currentDebugStep.checked)}</Text></Paragraph>}
            {currentDebugStep.frameSelector && <Paragraph>Frame选择器: <Text code>{currentDebugStep.frameSelector}</Text></Paragraph>}
            <Paragraph>时间戳: <Text code>{currentDebugStep.timestamp}</Text></Paragraph>

            <Title level={5}>截图:</Title>
            {debugScreenshot ? (
              <img src={debugScreenshot} alt="Step Screenshot" style={{ maxWidth: '100%', border: '1px solid #eee' }} />
            ) : (
              <Alert message="无可用截图" type="warning" showIcon />
            )}

            <Title level={5}>源代码:</Title>
            {debugSourceCode ? (
              <Input.TextArea
                value={debugSourceCode}
                rows={20}
                readOnly
                style={{ fontFamily: 'monospace' }}
              />
            ) : (
              <Alert message="无可用源代码" type="warning" showIcon />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default WorkflowRecorder;