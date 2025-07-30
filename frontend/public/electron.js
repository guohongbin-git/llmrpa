const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const jsyaml = require('js-yaml');
const { exec } = require('child_process');
const os = require('os');

let mainWindow;
let recorderWindow;
let recordedSteps = [];
let isRecording = false;

function createMainWindow () {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // preload: path.join(__dirname, 'preload.js') // We don't preload for the main window
    }
  });

  const isDev = !app.isPackaged;
  const startUrl = isDev 
    ? 'http://localhost:4000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (recorderWindow) {
        recorderWindow.close();
    }
  });
}

function createRecorderWindow(url) {
    if (recorderWindow) {
        recorderWindow.close();
    }

    recorderWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // Best practice for security
            nodeIntegration: false
        }
    });

    recorderWindow.loadURL(url);

    // Intercept and handle new window requests (popups)
    recorderWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.log(`[ELECTRON-MAIN] Intercepted new window request for URL: ${url}`);
        // Instruct Electron to create a new BrowserWindow and inject the popup-specific preload script
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                width: 1024,
                height: 768,
                webPreferences: {
                    preload: path.join(__dirname, 'popup-preload.js'), // Use the dedicated preload for popups
                    contextIsolation: false, // For simplicity, matching the main recorder window
                    nodeIntegration: true
                },
                devTools: true // Correctly placed here to automatically open DevTools for popups
            }
        };
    });

    // Open DevTools on the recorder window itself if needed for debugging
    // recorderWindow.webContents.openDevTools();

    recorderWindow.on('closed', () => {
        console.log('[ELECTRON-MAIN]', 'Recorder window closed.');
        isRecording = false;
        recorderWindow = null;
        // Notify the renderer process that recording has stopped
        if (mainWindow) {
            mainWindow.webContents.send('recording-update', { recordingStatus: false });
        }
    });
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// --- IPC Handlers ---

ipcMain.on('recorder-command', async (event, receivedPayload) => {
    console.log('[ELECTRON-MAIN] Received raw payload:', receivedPayload);
    
    if (!receivedPayload || typeof receivedPayload !== 'object' || typeof receivedPayload.command === 'undefined') {
        console.error('[ELECTRON-MAIN] Invalid payload received. Expected an object with a "command" property:', receivedPayload);
        mainWindow.webContents.send('replay-update', { status: 'error', currentStep: '内部错误: 无效的命令格式' });
        return;
    }

    const command = receivedPayload.command;
    console.log('[ELECTRON-MAIN] Processing command:', command);

    switch (command) {
        case 'start':
            const url = receivedPayload.url;
            if (!url) {
                console.error('[ELECTRON-MAIN] "start" command missing URL.');
                mainWindow.webContents.send('replay-update', { status: 'error', currentStep: '内部错误: 启动命令缺少URL' });
                return;
            }
            recordedSteps = [];
            isRecording = true;
            createRecorderWindow(url);
            mainWindow.webContents.send('recording-update', { steps: recordedSteps, recordingStatus: true });
            break;
        case 'stop':
            if (recorderWindow) {
                recorderWindow.close();
            }
            isRecording = false;
            mainWindow.webContents.send('recording-update', { recordingStatus: false });
            break;
        case 'clear':
            recordedSteps = [];
            mainWindow.webContents.send('recording-update', { steps: recordedSteps });
            break;
        case 'save':
            const data = receivedPayload.data; // This 'data' is the YAML string
            dialog.showSaveDialog(mainWindow, {
                title: '保存工作流',
                defaultPath: 'workflow.yaml',
                filters: [{ name: 'YAML Files', extensions: ['yaml', 'yml'] }]
            }).then(result => {
                if (!result.canceled && result.filePath) {
                    const processedSteps = [];
                    let currentFrameContext = null;

                    recordedSteps.forEach(step => {
                        const stepFrameSelector = step.frameSelector || null;

                        if (stepFrameSelector !== currentFrameContext) {
                            if (stepFrameSelector) {
                                processedSteps.push({
                                    name: `切换到 iframe: ${stepFrameSelector}`,
                                    action: 'browser_switch_to_frame',
                                    params: { selector: stepFrameSelector }
                                });
                            } else {
                                processedSteps.push({
                                    name: '切换回主页面',
                                    action: 'browser_switch_to_frame',
                                    params: { selector: '__main_page__' }
                                });
                            }
                            currentFrameContext = stepFrameSelector;
                        }

                        const newStep = { ...step };
                        delete newStep.timestamp;
                        delete newStep.frameSelector;
                        processedSteps.push(newStep);
                    });

                    const workflow = {
                        name: "录制的工作流",
                        description: `从 ${receivedPayload.url || '未知URL'} 录制的操作`,
                        steps: processedSteps
                    };

                    console.log('[ELECTRON-MAIN] Workflow object before YAML dump:', JSON.stringify(workflow, null, 2));

                    const yamlData = jsyaml.dump(workflow);
                    console.log('[ELECTRON-MAIN] Generated YAML data:', yamlData);
                    console.log('[ELECTRON-MAIN] Saving to file:', result.filePath);

                    fs.writeFile(result.filePath, yamlData, (err) => {
                        if (err) {
                            console.error('Failed to save file:', err);
                            mainWindow.webContents.send('save-status', { success: false, message: err.message });
                        } else {
                            console.log('File saved successfully:', result.filePath);
                            mainWindow.webContents.send('save-status', { success: true });
                        }
                    });
                }
            }).catch(err => {
                console.error('Save dialog error:', err);
            });
            break;
        case 'replay':            // Instead of replaying in the current window, trigger Robocorp to execute the workflow            if (!recordedSteps || recordedSteps.length === 0) {                mainWindow.webContents.send('replay-update', { status: 'error', currentStep: '没有可回放的步骤' });                return;            }            mainWindow.webContents.send('replay-update', { status: 'started', currentStep: 0, totalSteps: recordedSteps.length });            const workflowToReplay = {                name: "临时回放工作流",                description: "由录制器生成用于回放",                steps: recordedSteps.map(step => {                    const newStep = { ...step };                    delete newStep.timestamp; // Remove timestamp before saving                    return newStep;                })            };            const tempYamlData = jsyaml.dump(workflowToReplay);            const tempFilePath = path.join(os.tmpdir(), `temp_workflow_${Date.now()}.yaml`);            console.log('[ELECTRON-MAIN] Temporary workflow file path:', tempFilePath);            try {                await fs.promises.writeFile(tempFilePath, tempYamlData);                console.log('[ELECTRON-MAIN] Temporary workflow saved successfully.');                const projectRoot = path.join(__dirname, '..', '..');                const logFilePath = path.join(projectRoot, 'output', 'replay.log');                const pythonPath = '/Users/guohongbin/mambaforge/envs/llmrpa/bin/python3'; // Absolute path to python in the conda env                // Command to run the python script directly using its absolute path, redirecting all output to a log file                const command = `"${pythonPath}" -m robocorp.tasks run robots/workflow_executor.py --task run_workflow --input-json '{"workflow_file": "${tempFilePath.replace(/\/g, '\\')}"}' > "${logFilePath}" 2>&1`;                                console.log('[ELECTRON-MAIN] Project Root:', projectRoot);                console.log('[ELECTRON-MAIN] Executing Robocorp command and logging to:', logFilePath);                console.log('[ELECTRON-MAIN] Command:', command);                // exec is asynchronous and we will check the log file for results                exec(command, { cwd: projectRoot }, (error, stdout, stderr) => {                    // This callback will run after the command has finished.                    // We will primarily rely on the log file for debugging.                                        // Always clean up the temporary workflow file                    fs.unlink(tempFilePath, (unlinkErr) => {                        if (unlinkErr) console.error('[ELECTRON-MAIN] Failed to delete temporary workflow file:', unlinkErr);                        else console.log('[ELECTRON-MAIN] Temporary workflow file deleted successfully.');                    });                    if (error) {                        // Log the error from exec itself, which usually indicates the command couldn't be run                        console.error(`[ELECTRON-MAIN] exec error: ${error.message}`);                        mainWindow.webContents.send('replay-update', { status: 'error', currentStep: `回放启动失败: ${error.message}. 查看 output/replay.log 获取详情.` });                        return;                    }                    // Since output is redirected, stdout/stderr here might be empty.                    // We'll inform the user to check the log file.                    console.log('[ELECTRON-MAIN] Robocorp command execution finished. Check replay.log for details.');                    // We can't know for sure if it succeeded or failed just from exec,                    // but we can notify the UI that the process is complete.                    // A more robust solution would be to read the log file and parse the result.                    mainWindow.webContents.send('replay-update', { status: 'completed', message: '回放执行完毕，请在 output/replay.log 中查看结果。' });                });            } catch (error) {                console.error('[ELECTRON-MAIN] Robocorp execution setup error:', error);                // Attempt to clean up the temporary file in case of an error during writeFile                if (fs.existsSync(tempFilePath)) {                    fs.unlink(tempFilePath, (unlinkErr) => {                        if (unlinkErr) console.error('[ELECTRON-MAIN] Failed to delete temporary file after setup error:', unlinkErr);                    });                }                mainWindow.webContents.send('replay-update', { status: 'error', currentStep: `回放准备失败: ${error.message}` });            }            break;
        case 'load':
            (async () => {
                try {
                    const result = await dialog.showOpenDialog(mainWindow, {
                        title: '加载工作流',
                        properties: ['openFile'],
                        filters: [{ name: 'YAML Files', extensions: ['yaml', 'yml'] }]
                    });

                    if (!result.canceled && result.filePaths.length > 0) {
                        const filePath = result.filePaths[0];
                        const fileContent = fs.readFileSync(filePath, 'utf-8');
                        const loadedWorkflow = jsyaml.load(fileContent);

                        if (loadedWorkflow && Array.isArray(loadedWorkflow.steps)) {
                            mainWindow.webContents.send('load-workflow-response', { success: true, workflow: loadedWorkflow });
                        } else {
                            mainWindow.webContents.send('load-workflow-response', { success: false, message: '文件内容无效或格式不正确' });
                        }
                    } else {
                        mainWindow.webContents.send('load-workflow-response', { success: false, message: '用户取消了文件选择' });
                    }
                } catch (error) {
                    console.error('[ELECTRON-MAIN] Error loading workflow:', error);
                    mainWindow.webContents.send('load-workflow-response', { success: false, message: error.message });
                }
            })();
            break;
        default:
            console.warn('[ELECTRON-MAIN] Unknown command received:', command);
            break;
    }
});

ipcMain.handle('capture-screenshot', async (event) => {
    if (!recorderWindow) {
        console.warn('[ELECTRON-MAIN] capture-screenshot: Recorder window not open.');
        return null;
    }
    try {
        const image = await recorderWindow.webContents.capturePage();
        return image.toDataURL(); // Returns a Data URL (Base64 encoded PNG)
    } catch (error) {
        console.error('[ELECTRON-MAIN] Failed to capture screenshot:', error);
        return null;
    }
});

ipcMain.on('recorded-step', (event, step) => {
    if (isRecording) {
        console.log('[ELECTRON-MAIN]', 'Step received from main recorder:', step);
        recordedSteps.push(step);

        // Save screenshot and source code to files
        const debugDir = path.join(app.getPath('userData'), 'debug_recordings');
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const stepIndex = recordedSteps.length - 1;
        const baseFilename = `step_${stepIndex}_${timestamp}`;

        if (step.screenshot) {
            const screenshotPath = path.join(debugDir, `${baseFilename}.png`);
            const data = step.screenshot.replace(/^data:image\/\w+;base64,/, "");
            fs.writeFile(screenshotPath, data, { encoding: 'base64' }, (err) => {
                if (err) console.error(`[ELECTRON-MAIN] Failed to save screenshot for step ${stepIndex}:`, err);
                else console.log(`[ELECTRON-MAIN] Saved screenshot: ${screenshotPath}`);
            });
        }

        if (step.sourceCode) {
            const sourcePath = path.join(debugDir, `${baseFilename}.html`);
            fs.writeFile(sourcePath, step.sourceCode, (err) => {
                if (err) console.error(`[ELECTRON-MAIN] Failed to save source code for step ${stepIndex}:`, err);
                else console.log(`[ELECTRON-MAIN] Saved source code: ${sourcePath}`);
            });
        }

        if (mainWindow) {
            mainWindow.webContents.send('recording-update', { steps: recordedSteps });
        }
    }
});

// Listen for steps from popup windows
ipcMain.on('popup-recorded-step', (event, step) => {
    if (isRecording) {
        console.log('[ELECTRON-MAIN]', 'Step received from popup:', step);
        recordedSteps.push(step);
        if (mainWindow) {
            mainWindow.webContents.send('recording-update', { steps: recordedSteps });
        }
    }
});

ipcMain.handle('get-source-code', async (event, selector) => {
    if (!recorderWindow) {
        console.warn('[ELECTRON-MAIN] get-source-code: Recorder window not open.');
        return null;
    }
    try {
        // Execute the exposed function in the preload script of the recorder window
        const sourceCode = await recorderWindow.webContents.executeJavaScript(`window.electronAPI.getSourceCode(${JSON.stringify(selector)})`);
        return sourceCode;
    } catch (error) {
        console.error('[ELECTRON-MAIN] Failed to get source code:', error);
        return null;
    }
});








