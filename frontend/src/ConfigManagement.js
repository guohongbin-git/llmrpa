import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { List, Button, Typography, Modal, message, Spin, Alert, Divider } from 'antd';
import { ExclamationCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;
const { confirm } = Modal;
const API_URL = 'http://127.0.0.1:5001';

function ConfigManagement() {
    const [workflows, setWorkflows] = useState([]);
    const [invoiceConfigs, setInvoiceConfigs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchConfigs = async () => {
            try {
                setLoading(true);
                const [workflowsRes, invoiceConfigsRes] = await Promise.all([
                    axios.get(`${API_URL}/api/workflows`),
                    axios.get(`${API_URL}/api/invoice-configs`)
                ]);

                if (workflowsRes.data.success) {
                    setWorkflows(workflowsRes.data.workflows);
                }
                if (invoiceConfigsRes.data.success) {
                    setInvoiceConfigs(invoiceConfigsRes.data.invoice_configs);
                }
            } catch (err) {
                console.error("Error fetching configurations:", err);
                setError('Failed to load configurations.');
            } finally {
                setLoading(false);
            }
        };

        fetchConfigs();
    }, []);

    const showDeleteConfirm = (type, id, name) => {
        confirm({
            title: `您确定要删除 ${type} '${name}' 吗?`,
            icon: <ExclamationCircleOutlined />,
            content: '此操作不可撤销。请谨慎操作。',
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk() {
                handleDelete(type, id);
            },
        });
    };

    const handleDelete = async (type, id) => {
        const url = type === 'workflow' ? `${API_URL}/api/workflows/${id}` : `${API_URL}/api/invoice-configs/${id}`;
        const stateSetter = type === 'workflow' ? setWorkflows : setInvoiceConfigs;
        const originalState = type === 'workflow' ? workflows : invoiceConfigs;

        try {
            // Note: Backend DELETE endpoints are not yet implemented as per DESIGN.md.
            // This is a placeholder for when they are.
            // await axios.delete(url);
            message.success(`（模拟）${type} '${id}' 已成功删除。`);
            stateSetter(originalState.filter(item => item.id !== id));
        } catch (err) {
            console.error(`Error deleting ${type}:`, err);
            message.error(`删除 ${type} '${id}' 失败。`);
        }
    };

    if (loading) {
        return <Spin tip="加载配置中..." size="large" style={{ display: 'block', marginTop: '50px' }} />;
    }

    if (error) {
        return <Alert message="加载失败" description={error} type="error" showIcon />;
    }

    const renderConfigList = (title, type, data) => (
        <>
            <Title level={3}>{title}</Title>
            <List
                itemLayout="horizontal"
                dataSource={data}
                renderItem={item => (
                    <List.Item
                        actions={[
                            <Link to={`/config/${type}s/${item.id}`}><Button icon={<EditOutlined />}>编辑</Button></Link>,
                            <Button icon={<DeleteOutlined />} danger onClick={() => showDeleteConfirm(type, item.id, item.name)}>删除</Button>
                        ]}
                    >
                        <List.Item.Meta
                            title={<Link to={`/config/${type}s/${item.id}`}>{item.name}</Link>}
                            description={item.description || '暂无描述'}
                        />
                    </List.Item>
                )}
            />
        </>
    );

    return (
        <div>
            <Title level={2}>配置管理</Title>
            <Paragraph>在这里，您可以查看、编辑或删除系统的核心配置，包括 RPA 流程和发票识别模板。</Paragraph>
            
            {renderConfigList('RPA 流程定义', 'workflow', workflows)}
            <Divider />
            {renderConfigList('发票配置', 'invoice-config', invoiceConfigs)}
        </div>
    );
}

export default ConfigManagement;
