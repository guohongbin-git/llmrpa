import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:5001';

function ReviewItemDetail() {
    const { itemId } = useParams();
    const navigate = useNavigate();
    const [item, setItem] = useState(null);
    const [formData, setFormData] = useState({
        invoice_number: '',
        amount: '',
        date: ''
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [submitMessage, setSubmitMessage] = useState('');

    useEffect(() => {
        // In a real scenario, you'd fetch the specific item's data from the backend
        // For now, we'll simulate it or assume the data is passed.
        // Since our backend only returns a list, we'll need to adapt.
        // For this demo, we'll assume the item data is available from the review queue list.
        // A better approach would be to have a /api/review-queue/{itemId} endpoint.
        // For now, we'll just use dummy data or rely on the parent component to pass it.
        // Let's simulate fetching the item detail for now.
        axios.get(`${API_URL}/api/review-queue`)
            .then(response => {
                const foundItem = response.data.find(i => i.id === itemId);
                if (foundItem) {
                    setItem(foundItem);
                    // Pre-fill form with any existing data or placeholders
                    setFormData({
                        invoice_number: foundItem.extracted_data?.invoice_number || '',
                        amount: foundItem.extracted_data?.amount || '',
                        date: foundItem.extracted_data?.date || ''
                    });
                } else {
                    setError('Item not found.');
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching review item detail:", err);
                setError('Failed to load item details.');
                setLoading(false);
            });
    }, [itemId]);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitMessage('');
        try {
            await axios.post(`${API_URL}/api/review-queue/${itemId}`, formData);
            setSubmitMessage('Item successfully resubmitted!');
            // Optionally navigate back to the review queue list
            navigate('/review');
        } catch (err) {
            console.error("Error resubmitting item:", err);
            setSubmitMessage(`Failed to resubmit item: ${err.response?.data?.error || err.message}`);
        }
    };

    if (loading) {
        return <div className="text-center mt-5">Loading item details...</div>;
    }

    if (error) {
        return <div className="alert alert-danger mt-5">{error}</div>;
    }

    if (!item) {
        return <div className="alert alert-warning mt-5">Item not found or no data available.</div>;
    }

    return (
        <div className="container mt-4">
            <h2>审核任务: {item.id}</h2>
            <div className="row">
                <div className="col-md-6">
                    <h4>原始文件</h4>
                    {/* For now, we'll just show a placeholder or link to the file if it's served */}
                    {item.original_file_path && (
                        <iframe src={`${API_URL}/devdata/${item.input_file}`} width="100%" height="400px" title="Original Document"></iframe>
                    )}
                    <p><strong>错误信息:</strong> {item.error_message}</p>
                </div>
                <div className="col-md-6">
                    <h4>修正数据</h4>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label htmlFor="invoice_number" className="form-label">发票号码</label>
                            <input type="text" className="form-control" id="invoice_number" name="invoice_number" value={formData.invoice_number} onChange={handleFormChange} />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="amount" className="form-label">金额</label>
                            <input type="text" className="form-control" id="amount" name="amount" value={formData.amount} onChange={handleFormChange} />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="date" className="form-label">日期</label>
                            <input type="date" className="form-control" id="date" name="date" value={formData.date} onChange={handleFormChange} />
                        </div>
                        <button type="submit" className="btn btn-success me-2">提交修正</button>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/review')}>取消</button>
                    </form>
                    {submitMessage && <div className="alert alert-info mt-3">{submitMessage}</div>}
                </div>
            </div>
        </div>
    );
}

export default ReviewItemDetail;
