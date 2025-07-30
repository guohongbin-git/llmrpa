import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:5001';

function InvoiceConfigEditor() {
    const { configId } = useParams();
    const navigate = useNavigate();
    const [yamlContent, setYamlContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/invoice-configs/${configId}`);
                if (response.data.success) {
                    setYamlContent(response.data.content);
                } else {
                    throw new Error(response.data.error);
                }
                setLoading(false);
            } catch (err) {
                console.error("Error fetching invoice config:", err);
                setError('Failed to load invoice config content.');
                setLoading(false);
            }
        };
        fetchConfig();
    }, [configId]);

    const handleSave = async () => {
        setMessage('');
        try {
            await axios.put(`${API_URL}/api/invoice-configs/${configId}`, yamlContent, {
                headers: { 'Content-Type': 'text/plain' }
            });
            setMessage('Invoice config saved successfully!');
        } catch (err) {
            console.error("Error saving invoice config:", err.response?.data || err);
            setMessage(`Failed to save invoice config: ${err.response?.data?.error || err.message}`);
        }
    };

    if (loading) {
        return <div className="text-center mt-5">加载发票配置中...</div>;
    }

    if (error) {
        return <div className="alert alert-danger mt-5">{error}</div>;
    }

    return (
        <div className="container mt-4">
            <h2>编辑发票配置: {configId}</h2>
            {message && <div className="alert alert-info">{message}</div>}
            <textarea
                className="form-control"
                rows="20"
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                style={{ fontFamily: 'monospace' }}
            ></textarea>
            <div className="mt-3">
                <button className="btn btn-success me-2" onClick={handleSave}>保存</button>
                <button className="btn btn-secondary" onClick={() => navigate('/config')}>返回</button>
            </div>
        </div>
    );
}

export default InvoiceConfigEditor;
