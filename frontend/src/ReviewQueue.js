import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Table, Button, Tag, Spin, Alert, Typography } from 'antd';

const { Title, Paragraph } = Typography;
const API_URL = 'http://127.0.0.1:5001';

function ReviewQueue() {
    const [reviewItems, setReviewItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchReviewItems = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_URL}/api/review-queue`);
                if (response.data.success) {
                    setReviewItems(response.data.review_items);
                } else {
                    throw new Error(response.data.error);
                }
            } catch (err) {
                console.error("Error fetching review queue:", err);
                setError('无法加载需要审核的任务列表。');
            } finally {
                setLoading(false);
            }
        };

        fetchReviewItems();
    }, []);

    const columns = [
        {
            title: '任务 ID',
            dataIndex: 'task_id',
            key: 'task_id',
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: status => <Tag color="warning">{status}</Tag>,
        },
        {
            title: '失败原因',
            dataIndex: 'reason',
            key: 'reason',
        },
        {
            title: '时间戳',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: ts => new Date(ts).toLocaleString(),
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Link to={`/review/${record.id}`}>
                    <Button type="primary">审核</Button>
                </Link>
            ),
        },
    ];

    if (loading) {
        return <Spin tip="加载审核队列中..." size="large" style={{ display: 'block', marginTop: '50px' }} />;
    }

    if (error) {
        return <Alert message="加载失败" description={error} type="error" showIcon />;
    }

    return (
        <div>
            <Title level={2}>人工审核队列</Title>
            <Paragraph>当自动化流程遇到无法处理的异常时，相关任务会出现在这里等待人工审核和干预。</Paragraph>
            <Table 
                columns={columns} 
                dataSource={reviewItems} 
                rowKey="id" 
                pagination={{ pageSize: 10 }}
            />
        </div>
    );
}

export default ReviewQueue;
