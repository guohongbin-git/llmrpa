console.log('[LLMRPA-APP-CS] v12.0', 'App content script loaded.');

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    console.log('[LLMRPA-APP-CS]', 'chrome.runtime.sendMessage is available.');

    // All other logic remains the same
    function forwardStepsToApp(steps) {
        console.log('[LLMRPA-APP-CS]', 'Forwarding steps to the app page:', steps);
        window.postMessage({
            type: 'RPA_STEPS_UPDATED',
            steps: steps || [],
        }, '*');
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.recordedSteps) {
            forwardStepsToApp(changes.recordedSteps.newValue);
        }
    });

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (event.data.type === 'GET_RPA_STEPS') {
            chrome.storage.local.get('recordedSteps', (data) => {
                forwardStepsToApp(data.recordedSteps);
            });
        } else if (event.data.type === 'CLEAR_RPA_STEPS') {
            chrome.runtime.sendMessage({ command: 'clear' });
        }
    });

    chrome.storage.local.get('recordedSteps', (data) => {
        if (data.recordedSteps && data.recordedSteps.length > 0) {
            forwardStepsToApp(data.recordedSteps);
        }
    });

} else {
    console.error('[LLMRPA-APP-CS]', 'Fatal Error: chrome.runtime.sendMessage is not available. The extension context is lost.');
}