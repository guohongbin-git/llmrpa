import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  FileProtectOutlined,
  SettingOutlined,
  RobotOutlined,
  EditOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';

import Dashboard from './Dashboard';
import ReviewQueue from './ReviewQueue';
import ReviewItemDetail from './ReviewItemDetail';
import ConfigManagement from './ConfigManagement';
import InvoiceConfigEditor from './InvoiceConfigEditor';
import WorkflowGenerator from './WorkflowGenerator';
import InvoiceTemplateGenerator from './InvoiceTemplateGenerator';
import WorkflowEditor from './WorkflowEditor';
import WorkflowRecorder from './WorkflowRecorder';
import UIVisionConverter from './UIVisionConverter';

const { Header, Content, Sider } = Layout;

// Define menu items
const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">仪表盘</Link> },
  { key: '/review', icon: <FileProtectOutlined />, label: <Link to="/review">人工审核队列</Link> },
  { key: '/config', icon: <SettingOutlined />, label: <Link to="/config">配置管理</Link> },
  { key: '/record-workflow', icon: <VideoCameraOutlined />, label: <Link to="/record-workflow">录制工作流</Link> },
  { key: '/generate-workflow', icon: <RobotOutlined />, label: <Link to="/generate-workflow">智能生成流程</Link> },
  { key: '/generate-invoice-template', icon: <EditOutlined />, label: <Link to="/generate-invoice-template">智能生成模板</Link> },
  { key: '/uivision-converter', icon: <VideoCameraOutlined />, label: <Link to="/uivision-converter">UI.Vision 转换器</Link> },
];


function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [generatedYaml, setGeneratedYaml] = useState('');

  const handleWorkflowGenerated = (yamlContent) => {
    setGeneratedYaml(yamlContent);
    navigate('/generate-workflow');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="header" style={{ display: 'flex', alignItems: 'center' }}>
        <div className="logo" style={{ color: 'white', fontSize: '20px', marginRight: '24px' }}>智能 RPA 平台</div>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px' }}>
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: '#fff',
              marginTop: '24px'
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/review" element={<ReviewQueue />} />
              <Route path="/review/:itemId" element={<ReviewItemDetail />} />
              <Route path="/config" element={<ConfigManagement />} />
              <Route path="/config/workflows/:workflowId" element={<WorkflowEditor />} />
              <Route path="/config/invoice-configs/:configId" element={<InvoiceConfigEditor />} />
              <Route path="/generate-workflow" element={<WorkflowGenerator initialYaml={generatedYaml} />} />
              <Route path="/generate-invoice-template" element={<InvoiceTemplateGenerator />} />
              <Route path="/record-workflow" element={<WorkflowRecorder onSave={handleWorkflowGenerated} />} />
              <Route path="/uivision-converter" element={<UIVisionConverter />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;