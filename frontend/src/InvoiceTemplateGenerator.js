
import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:5001';

function InvoiceTemplateGenerator() {
    const [description, setDescription] = useState('');
    const [generatedYaml, setGeneratedYaml] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!description) {
            setError('请输入您对发票字段的描述。');
            return;
        }
        setLoading(true);
        setError('');
        setGeneratedYaml('');
        try {
            const response = await axios.post(`${API_URL}/api/generate-invoice-config`, { description });
            setGeneratedYaml(response.data.yaml_content);
        } catch (err) {
            console.error("Error generating invoice template:", err);
            setError('生成模板失败，请检查后端服务和LLM连接。');
        }
        setLoading(false);
    };

    const handleSave = async () => {
        const configId = prompt("请输入模板ID（例如：vat_general_invoice）：");
        if (!configId) {
            alert("模板ID不能为空。");
            return;
        }

        try {
            await axios.post(`${API_URL}/api/invoice-configs`, {
                id: configId,
                yaml_content: generatedYaml
            });
            alert(`模板 '${configId}' 保存成功！`);
            setGeneratedYaml(''); // Clear generated YAML after saving
            setDescription(''); // Clear description
        } catch (err) {
            console.error("Error saving invoice template:", err);
            setError(`保存模板失败：${err.response?.data?.error || err.message}`);
        }
    };

    return (
        <div className="container mt-4">
            <h2>智能发票模板生成器</h2>
            <p className="text-muted">通过自然语言描述您需要从发票中提取的字段，AI将为您自动生成配置文件。</p>
            
            <div className="mb-3">
                <label htmlFor="description" className="form-label"><strong>第一步：描述您的需求</strong></label>
                <textarea 
                    id="description"
                    className="form-control"
                    rows="4"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="例如：我需要一个模板，用来提取增值税发票的发票代码、总金额（含税）和开票日期。"
                />
            </div>

            <button onClick={handleGenerate} className="btn btn-primary" disabled={loading}>
                {loading ? '正在生成...' : '生成模板'}
            </button>

            {error && <div className="alert alert-danger mt-3">{error}</div>}

            {generatedYaml && (
                <div className="mt-4">
                    <h4><strong>第二步：查看并保存生成的模板</strong></h4>
                    <div className="card bg-light p-3">
                        <pre><code>{generatedYaml}</code></pre>
                    </div>
                    <button onClick={handleSave} className="btn btn-success mt-3">保存模板</button>
                </div>
            )}
        </div>
    );
}

export default InvoiceTemplateGenerator;
