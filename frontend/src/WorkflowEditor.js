import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:5001';

function WorkflowEditor() {
    const { workflowId } = useParams();
    const navigate = useNavigate();
    const [yamlContent, setYamlContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchWorkflow = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/workflows/${workflowId}`);
                if (response.data.success) {
                    setYamlContent(response.data.content);
                }
                setLoading(false);
            } catch (err) {
                console.error("Error fetching workflow:", err);
                setError('Failed to load workflow content.');
                setLoading(false);
            }
        };
        fetchWorkflow();
    }, [workflowId]);

    const handleSave = async () => {
        setMessage('');
        try {
            await axios.put(`${API_URL}/api/workflows/${workflowId}`, yamlContent, {
                headers: { 'Content-Type': 'text/plain' }
            });
            setMessage('Workflow saved successfully!');
        } catch (err) {
            console.error("Error saving workflow:", err.response?.data || err);
            setMessage(`Failed to save workflow: ${err.response?.data?.error || err.message}`);
        }
    };

    if (loading) {
        return <div className="text-center mt-5">Loading Workflow...</div>;
    }

    if (error) {
        return <div className="alert alert-danger mt-5">{error}</div>;
    }

    return (
        <div className="container mt-4">
            <h2>Edit Workflow: {workflowId}</h2>
            {message && <div className="alert alert-info">{message}</div>}
            <textarea
                className="form-control"
                rows="20"
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                style={{ fontFamily: 'monospace' }}
            ></textarea>
            <div className="mt-3">
                <button className="btn btn-success me-2" onClick={handleSave}>Save</button>
                <button className="btn btn-secondary" onClick={() => navigate('/config')}>Back</button>
            </div>
        </div>
    );
}

export default WorkflowEditor;
