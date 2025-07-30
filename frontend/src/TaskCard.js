import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:5001';

function TaskCard({ template }) {
    const [selectedFiles, setSelectedFiles] = useState([]); // Changed to array for multiple files
    const [task, setTask] = useState(null);
    const [error, setError] = useState('');

    const handleFileChange = (event) => {
        setSelectedFiles(Array.from(event.target.files)); // Convert FileList to Array
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (selectedFiles.length === 0) { // Check if any file is selected
            setError('Please select at least one file.');
            return;
        }

        const formData = new FormData();
        selectedFiles.forEach((file, index) => {
            formData.append('files', file); // Append each file with the name 'files'
        });
        formData.append('workflow_id', template.id);

        setTask({ status: 'SUBMITTING' });
        setError('');

        axios.post(`${API_URL}/api/tasks`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        })
        .then(response => {
            setTask({ ...response.data, status: 'PENDING' });
        })
        .catch(err => {
            console.error("Error submitting task:", err);
            setError('Failed to submit task. Check the console for details.');
            setTask(null);
        });
    };

    useEffect(() => {
        let intervalId;
        if (task && (task.status === 'PENDING' || task.status === 'RUNNING')) {
            intervalId = setInterval(() => {
                axios.get(`${API_URL}/api/tasks/${task.task_id}`)
                    .then(response => {
                        setTask(response.data);
                        if (response.data.status !== 'PENDING' && response.data.status !== 'RUNNING') {
                            clearInterval(intervalId);
                        }
                    })
                    .catch(err => {
                        console.error("Error fetching task status:", err);
                        setError('Failed to fetch task status.');
                        clearInterval(intervalId);
                    });
            }, 3000); // Poll every 3 seconds
        }
        return () => clearInterval(intervalId);
    }, [task]);

    return (
        <div className="card mb-4">
            <div className="card-body">
                <h5 className="card-title">{template.name}</h5>
                <p className="card-text">{template.description}</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group mb-3">
                        <label htmlFor={`file-upload-${template.id}`}>Upload Invoice PDF</label>
                        <input type="file" className="form-control" id={`file-upload-${template.id}`} onChange={handleFileChange} multiple /> {/* Added multiple attribute */}
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={task && (task.status === 'SUBMITTING' || task.status === 'PENDING' || task.status === 'RUNNING')}>
                        {task && task.status === 'SUBMITTING' ? 'Submitting...' : 
                         task && (task.status === 'PENDING' || task.status === 'RUNNING') ? 'Running...' : 'Start Task'}
                    </button>
                </form>
                {error && <div className="alert alert-danger mt-3">{error}</div>}
                {task && task.task_id && (
                    <div className="alert alert-info mt-3">
                        Task ID: <strong>{task.task_id}</strong><br/>
                        Status: <strong>{task.status}</strong>
                        {task.status === 'SUCCESS' && task.result && (
                            <div>
                                <h6 className="mt-2">Extracted Data:</h6>
                                <pre>{JSON.stringify(task.result, null, 2)}</pre>
                            </div>
                        )}
                        {task.status === 'FAILED' && task.error && (
                            <div className="alert alert-danger mt-2">
                                Error: {task.error}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default TaskCard;