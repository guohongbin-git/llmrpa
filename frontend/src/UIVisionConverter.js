import React, { useState } from 'react';
import './VisualWorkflowEditor.css';

const UIVisionConverter = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [yamlOutput, setYamlOutput] = useState('');

  const handleJsonInputChange = (event) => {
    setJsonInput(event.target.value);
  };

  const convertToJson = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/convert-uivision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonInput,
      });
      const data = await response.json();
      if (data.success) {
        setYamlOutput(data.yaml);
      } else {
        setYamlOutput(`Error: ${data.error}`);
      }
    } catch (error) {
      setYamlOutput(`Error: ${error.message}`);
    }
  };

  return (
    <div className="visual-workflow-editor">
      <h1>UI.Vision to YAML Converter</h1>
      <div className="converter-container">
        <div className="converter-input">
          <h2>UI.Vision JSON</h2>
          <textarea
            placeholder="Paste your UI.Vision JSON here..."
            value={jsonInput}
            onChange={handleJsonInputChange}
          />
          <button onClick={convertToJson}>Convert</button>
        </div>
        <div className="converter-output">
          <h2>YAML Output</h2>
          <textarea placeholder="YAML output will appear here..." value={yamlOutput} readOnly />
        </div>
      </div>
    </div>
  );
};

export default UIVisionConverter;