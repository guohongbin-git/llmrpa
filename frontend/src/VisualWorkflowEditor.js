import React, { useState, useEffect } from 'react';
import './VisualWorkflowEditor.css';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Container, Button, Form, Card, Row, Col, Alert, 
  Accordion, Badge, ListGroup, InputGroup, Modal
} from 'react-bootstrap';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import yaml from 'js-yaml';
import './VisualWorkflowEditor.css';

// 支持的操作类型及其参数定义
const ACTION_TYPES = {
  llm_extract_document: {
    name: "LLM提取文档数据",
    description: "使用LLM从文档中提取结构化数据",
    params: [
      { name: "file_path", type: "string", required: true, description: "文档文件路径" },
      { name: "config_id", type: "string", required: true, description: "配置ID" }
    ],
    supportsOutput: true
  },
  llm_classify_document: {
    name: "LLM分类文档",
    description: "使用LLM对文档进行分类",
    params: [
      { name: "file_path", type: "string", required: true, description: "文档文件路径" },
      { name: "prompt", type: "text", required: true, description: "提示词" }
    ],
    supportsOutput: true
  },
  browser_configure: {
    name: "配置浏览器",
    description: "配置浏览器设置",
    params: [
      { name: "headless", type: "boolean", required: false, description: "是否无头模式" },
      { name: "timeout", type: "number", required: false, description: "超时时间（秒）" }
    ],
    supportsOutput: false
  },
  browser_goto: {
    name: "浏览器导航",
    description: "导航到指定URL",
    params: [
      { name: "url", type: "string", required: true, description: "目标URL" }
    ],
    supportsOutput: false
  },
  browser_login_human_like: {
    name: "模拟人类登录",
    description: "模拟人类行为登录网站",
    params: [
      { name: "url", type: "string", required: true, description: "登录页面URL" },
      { name: "username", type: "string", required: true, description: "用户名" },
      { name: "password", type: "string", required: true, description: "密码" },
      { name: "username_selector", type: "string", required: true, description: "用户名输入框选择器" },
      { name: "password_selector", type: "string", required: false, description: "密码输入框选择器" },
      { name: "login_button_selector", type: "string", required: true, description: "登录按钮选择器" }
    ],
    supportsOutput: false
  },
  browser_wait_for_selector: {
    name: "等待元素出现",
    description: "等待页面元素出现",
    params: [
      { name: "selector", type: "string", required: true, description: "CSS选择器" },
      { name: "timeout", type: "number", required: false, description: "超时时间（秒）" }
    ],
    supportsOutput: false
  },
  browser_fill_form: {
    name: "填写表单",
    description: "填写网页表单",
    params: [
      { name: "form_selector", type: "string", required: true, description: "表单选择器" },
      { name: "data", type: "object", required: true, description: "表单数据" }
    ],
    supportsOutput: false
  },
  browser_click: {
    name: "点击元素",
    description: "点击页面元素",
    params: [
      { name: "selector", type: "string", required: true, description: "元素选择器" }
    ],
    supportsOutput: false
  },
  debug_save_page_source: {
    name: "保存页面源码",
    description: "保存当前页面的HTML源码",
    params: [
      { name: "output_path", type: "string", required: true, description: "输出文件路径" }
    ],
    supportsOutput: false
  },
  browser_extract: {
    name: "提取页面内容",
    description: "提取页面元素内容",
    params: [
      { name: "selector", type: "string", required: true, description: "元素选择器" }
    ],
    supportsOutput: true
  }
};

const VisualWorkflowEditor = () => {
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [workflow, setWorkflow] = useState(() => ({
    id: workflowId || '',
    name: '',
    description: '',
    steps: [] // 确保steps始终是一个数组
  }));

  // 安全设置workflow状态，确保steps始终是数组
  const safeSetWorkflow = (newWorkflow) => {
    setWorkflow({
      id: newWorkflow.id || workflowId || '',
      name: newWorkflow.name || '',
      description: newWorkflow.description || '',
      steps: Array.isArray(newWorkflow.steps) ? newWorkflow.steps : []
    });
  };
  const [yamlView, setYamlView] = useState(false);
  const [yamlContent, setYamlContent] = useState('');
  const [showStepModal, setShowStepModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [editingStepIndex, setEditingStepIndex] = useState(-1);

  // 加载工作流数据
  useEffect(() => {
    const fetchWorkflow = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/workflows/${workflowId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch workflow: ${response.statusText}`);
        }
        const content = await response.text();
        const parsedWorkflow = yaml.load(content) || {};
        safeSetWorkflow(parsedWorkflow);
        setYamlContent(content);
        setLoading(false);
      } catch (err) {
        setError(`Error loading workflow: ${err.message}`);
        setLoading(false);
      }
    };

    if (workflowId) {
      fetchWorkflow();
    } else {
      setLoading(false);
    }
  }, [workflowId]);

  // 更新YAML内容
  useEffect(() => {
    try {
      const content = yaml.dump(workflow, { lineWidth: -1, noRefs: true });
      setYamlContent(content);
    } catch (err) {
      console.error("Error generating YAML:", err);
    }
  }, [workflow]);

  // 保存工作流
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: yamlContent,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save workflow: ${response.statusText}`);
      }

      setSuccess("工作流保存成功！");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 处理基本信息变更
  const handleBasicInfoChange = (field, value) => {
    setWorkflow(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 打开步骤编辑模态框
  const handleEditStep = (index) => {
    setEditingStepIndex(index);
    setCurrentStep(index >= 0 ? { ...workflow.steps[index] } : {
      name: '',
      action: Object.keys(ACTION_TYPES)[0],
      params: {},
      output_to: '',
      on_error: ''
    });
    setShowStepModal(true);
  };

  // 删除步骤
  const handleDeleteStep = (index) => {
    if (window.confirm('确定要删除这个步骤吗？')) {
      setWorkflow(prev => ({
        ...prev,
        steps: prev.steps.filter((_, i) => i !== index)
      }));
    }
  };

  // 保存步骤
  const handleSaveStep = () => {
    if (!currentStep.name || !currentStep.action) {
      alert('步骤名称和操作类型是必填项！');
      return;
    }

    setWorkflow(prev => {
      const newSteps = [...prev.steps];
      if (editingStepIndex >= 0) {
        newSteps[editingStepIndex] = currentStep;
      } else {
        newSteps.push(currentStep);
      }
      return {
        ...prev,
        steps: newSteps
      };
    });

    setShowStepModal(false);
  };

  // 处理步骤参数变更
  const handleStepParamChange = (paramName, value) => {
    setCurrentStep(prev => {
      const newParams = { ...prev.params };
      
      // 处理特殊情况：data对象
      if (paramName === 'data') {
        try {
          // 尝试解析为JSON对象
          newParams.data = JSON.parse(value);
        } catch (e) {
          // 如果不是有效的JSON，则保存为字符串
          newParams.data = value;
        }
      } else {
        newParams[paramName] = value;
      }
      
      return {
        ...prev,
        params: newParams
      };
    });
  };

  // 设置拖放传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 处理拖放重新排序
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      setWorkflow(prev => {
        const oldIndex = parseInt(active.id.split('-')[1]);
        const newIndex = parseInt(over.id.split('-')[1]);
        
        return {
          ...prev,
          steps: arrayMove(prev.steps, oldIndex, newIndex)
        };
      });
    }
  };

  // 可排序步骤组件
  const SortableStep = ({ step, index }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id: `step-${index}` });
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    
    return (
      <Card 
        className="step-card"
        ref={setNodeRef}
        style={style}
      >
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <span 
                className="drag-handle"
                {...attributes}
                {...listeners}
              >
                ⋮⋮
              </span>
              <span>
                <strong>{index + 1}. {step.name}</strong>
                <Badge bg="info" className="ms-2">
                  {ACTION_TYPES[step.action]?.name || step.action}
                </Badge>
              </span>
            </div>
            <div className="step-actions">
              <Button 
                variant="outline-primary" 
                size="sm"
                onClick={() => handleEditStep(index)}
              >
                编辑
              </Button>
              <Button 
                variant="outline-danger" 
                size="sm"
                onClick={() => handleDeleteStep(index)}
              >
                删除
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={8}>
              <h6>参数:</h6>
              {Object.entries(step.params || {}).map(([key, value]) => (
                <Badge 
                  key={key} 
                  bg="light" 
                  text="dark" 
                  className="param-badge"
                >
                  {key}: {typeof value === 'object' ? JSON.stringify(value) : value.toString()}
                </Badge>
              ))}
              {Object.keys(step.params || {}).length === 0 && (
                <span className="text-muted">无参数</span>
              )}
            </Col>
            <Col md={4}>
              {step.output_to && (
                <div>
                  <h6>输出到:</h6>
                  <Badge bg="secondary">{step.output_to}</Badge>
                </div>
              )}
              {step.on_error && (
                <div className="mt-2">
                  <h6>错误处理:</h6>
                  <Badge bg="warning" text="dark">{step.on_error}</Badge>
                </div>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  };

  // 渲染参数输入表单
  const renderParamInput = (param) => {
    const paramValue = currentStep.params?.[param.name] || '';
    
    switch (param.type) {
      case 'boolean':
        return (
          <Form.Check
            type="checkbox"
            label={param.description}
            checked={!!paramValue}
            onChange={(e) => handleStepParamChange(param.name, e.target.checked)}
          />
        );
      case 'number':
        return (
          <Form.Control
            type="number"
            value={paramValue}
            onChange={(e) => handleStepParamChange(param.name, Number(e.target.value))}
            placeholder={param.description}
          />
        );
      case 'text':
        return (
          <Form.Control
            as="textarea"
            rows={3}
            value={paramValue}
            onChange={(e) => handleStepParamChange(param.name, e.target.value)}
            placeholder={param.description}
          />
        );
      case 'object':
        return (
          <Form.Control
            as="textarea"
            rows={5}
            value={typeof paramValue === 'object' ? JSON.stringify(paramValue, null, 2) : paramValue}
            onChange={(e) => handleStepParamChange(param.name, e.target.value)}
            placeholder={`请输入JSON格式的${param.description}`}
          />
        );
      default:
        return (
          <Form.Control
            type="text"
            value={paramValue}
            onChange={(e) => handleStepParamChange(param.name, e.target.value)}
            placeholder={param.description}
          />
        );
    }
  };

  if (loading) {
    return <div className="text-center p-5">加载中...</div>;
  }

  return (
    <Container className="mt-4 mb-5">
      <h2>工作流编辑器</h2>
      
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      
      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">基本信息</h5>
            <div>
              <Button 
                variant="outline-secondary" 
                size="sm" 
                className="me-2"
                onClick={() => setYamlView(!yamlView)}
              >
                {yamlView ? '可视化编辑' : 'YAML视图'}
              </Button>
              <Button 
                variant="primary" 
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存工作流'}
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {yamlView ? (
            <Form.Group>
              <Form.Control
                as="textarea"
                rows={20}
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                style={{ fontFamily: 'monospace' }}
                className="yaml-editor"
              />
            </Form.Group>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label>工作流ID</Form.Label>
                <Form.Control
                  type="text"
                  value={workflow.id}
                  onChange={(e) => handleBasicInfoChange('id', e.target.value)}
                  placeholder="输入工作流ID"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>工作流名称</Form.Label>
                <Form.Control
                  type="text"
                  value={workflow.name}
                  onChange={(e) => handleBasicInfoChange('name', e.target.value)}
                  placeholder="输入工作流名称"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>工作流描述</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={workflow.description}
                  onChange={(e) => handleBasicInfoChange('description', e.target.value)}
                  placeholder="输入工作流描述"
                />
              </Form.Group>
            </>
          )}
        </Card.Body>
      </Card>

      {!yamlView && (
        <Card className="mb-4">
          <Card.Header>
            <div className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">工作流步骤</h5>
              <Button 
                variant="success"
                size="sm"
                onClick={() => handleEditStep(-1)}
              >
                添加步骤
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {(!workflow.steps || workflow.steps.length === 0) ? (
              <div className="text-center text-muted p-4">
                <p>暂无步骤，点击"添加步骤"按钮开始创建工作流</p>
              </div>
            ) : (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={workflow.steps.map((_, index) => `step-${index}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="step-list">
                    {workflow.steps.map((step, index) => (
                      <SortableStep 
                        key={`step-${index}`} 
                        step={step} 
                        index={index} 
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </Card.Body>
        </Card>
      )}

      {/* 步骤编辑模态框 */}
      <Modal 
        show={showStepModal} 
        onHide={() => setShowStepModal(false)}
        size="lg"
        className="step-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingStepIndex >= 0 ? '编辑步骤' : '添加步骤'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {currentStep && (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>步骤名称</Form.Label>
                <Form.Control
                  type="text"
                  value={currentStep.name || ''}
                  onChange={(e) => setCurrentStep({...currentStep, name: e.target.value})}
                  placeholder="输入步骤名称"
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>操作类型</Form.Label>
                <Form.Select
                  value={currentStep.action || ''}
                  onChange={(e) => setCurrentStep({
                    ...currentStep, 
                    action: e.target.value,
                    params: {} // 重置参数
                  })}
                >
                  {Object.entries(ACTION_TYPES).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.name} - {value.description}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              
              {currentStep.action && ACTION_TYPES[currentStep.action] && (
                <>
                  <h6 className="mt-4 mb-3">参数设置</h6>
                  {ACTION_TYPES[currentStep.action].params.map(param => (
                    <Form.Group className="mb-3" key={param.name}>
                      <Form.Label>
                        {param.description}
                        {param.required && <span className="text-danger">*</span>}
                      </Form.Label>
                      {renderParamInput(param)}
                    </Form.Group>
                  ))}
                </>
              )}
              
              {currentStep.action && ACTION_TYPES[currentStep.action].supportsOutput && (
                <Form.Group className="mb-3">
                  <Form.Label>输出到变量</Form.Label>
                  <Form.Control
                    type="text"
                    value={currentStep.output_to || ''}
                    onChange={(e) => setCurrentStep({...currentStep, output_to: e.target.value})}
                    placeholder="输入变量名（可选）"
                  />
                </Form.Group>
              )}
              
              <Form.Group className="mb-3">
                <Form.Label>错误处理</Form.Label>
                <Form.Select
                  value={currentStep.on_error || ''}
                  onChange={(e) => setCurrentStep({...currentStep, on_error: e.target.value})}
                >
                  <option value="">默认（失败时停止）</option>
                  <option value="continue">继续执行下一步</option>
                  <option value="retry">重试当前步骤</option>
                </Form.Select>
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowStepModal(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSaveStep}>
            保存
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default VisualWorkflowEditor;