import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Row, Col, Typography } from 'antd';
import TaskCard from './TaskCard'; // Import the dedicated TaskCard component

const { Title, Paragraph } = Typography;
const API_URL = 'http://127.0.0.1:5001';

function Dashboard() {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_URL}/api/workflows`)
            .then(response => {
                if (response.data.success) {
                    setWorkflows(response.data.workflows);
                }
                setLoading(false);
            })
            .catch(error => {
                console.error("Error fetching workflows:", error);
                setLoading(false);
            });
    }, []);

    return (
        <div>
            <Title level={2}>任务仪表盘</Title>
            <Paragraph>在这里您可以找到所有可用的自动化流程。上传文件并点击“开始任务”来启动一个新流程。</Paragraph>
            <Row gutter={[16, 16]}>
                {workflows.map(workflow => (
                    <Col xs={24} sm={12} md={8} key={workflow.id}>
                        {/* Use the TaskCard component to render each workflow */}
                        <TaskCard template={workflow} />
                    </Col>
                ))}
                 {loading && workflows.length === 0 && 
                    [...Array(3)].map((_, i) => (
                        <Col xs={24} sm={12} md={8} key={i}>
                            <div className="card"><div className="card-body">...Loading</div></div>
                        </Col>
                    ))
                 }
            </Row>
        </div>
    );
}

export default Dashboard;