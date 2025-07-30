const { ipcRenderer, contextBridge } = require('electron');

console.log('[LLMRPA-PRELOAD]', 'v7 Final with Debounce Logic');

// --- Debounce Utility ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getSelector(element) {
    if (!element) return '';

    // 1. By ID
    if (element.id) {
        return `#${element.id}`;
    }

    // 2. By data-testid (common in React apps)
    if (element.dataset && element.dataset.testid) {
        return `[data-testid="${element.dataset.testid}"]`;
    }

    // 3. By Name attribute
    if (element.name) {
        return `[name="${element.name}"]`;
    }

    // 4. By TagName and stable ClassNames
    if (element.className && typeof element.className === 'string') {
        const classNames = element.className.split(' ').filter(c => c && !c.includes(':') && !c.startsWith('is-') && !c.startsWith('has-')); // Filter out dynamic/state classes
        if (classNames.length > 0) {
            return `${element.tagName.toLowerCase()}.${classNames.join('.')}`;
        }
    }

    // 5. Fallback to TagName with nth-of-type
    // This is a less stable selector but provides a fallback
    let selector = element.tagName.toLowerCase();
    if (element.parentNode) {
        const siblings = Array.from(element.parentNode.children).filter(child => child.tagName === element.tagName);
        if (siblings.length > 1) {
            const index = siblings.indexOf(element) + 1;
            selector += `:nth-of-type(${index})`;
        }
    }
    return selector;
}

async function sendStep(step, frameSelector = null) {
    if (frameSelector) {
        step.frameSelector = frameSelector;
    }

    // Capture screenshot
    const screenshotDataURL = await new Promise(resolve => {
        ipcRenderer.invoke('capture-screenshot').then(resolve);
    });
    step.screenshot = screenshotDataURL; // Base64 encoded image

    // Capture source code
    const sourceCode = document.documentElement.outerHTML;
    step.sourceCode = sourceCode;

    console.log('[LLMRPA-PRELOAD]', 'SUCCESSFULLY RECORDED STEP:', step, 'Frame Selector:', frameSelector);
    ipcRenderer.send('recorded-step', step);
}

function attachListenersToDocument(doc, currentFrameSelector = null) {
    console.log('[LLMRPA-PRELOAD]', 'Attaching listeners to document:', doc.title, 'Current Frame:', currentFrameSelector);
    const useCapture = true;

    const debouncedInput = debounce((target, frameSelector) => {
        sendStep({ type: 'input', selector: getSelector(target), value: target.value, timestamp: new Date().toISOString() }, frameSelector || currentFrameSelector);
    }, 500); // 500ms delay

    const recordChange = (e) => {
        const target = e.target;
        const tagName = target.tagName.toUpperCase();
        const frameSelector = currentFrameSelector; // Use the passed frame selector

        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            const type = target.type.toLowerCase();
            if (['checkbox', 'radio', 'submit', 'button', 'file', 'image'].includes(type)) return;
            // For text-like inputs, the final value is captured here on blur/change
            debouncedInput.clear?.(); // Clear any pending debounced calls
            sendStep({ type: 'input', selector: getSelector(target), value: target.value, timestamp: new Date().toISOString() }, frameSelector);
        } else if (tagName === 'SELECT') {
            const selectedOption = target.options[target.selectedIndex];
            sendStep({ type: 'select', selector: getSelector(target), value: target.value, textContent: selectedOption ? selectedOption.text : '', timestamp: new Date().toISOString() }, frameSelector);
        }
    };
    
    const recordInput = (e) => {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            const type = target.type.toLowerCase();
            if (['checkbox', 'radio', 'submit', 'button', 'file', 'image'].includes(type)) return;
            const frameSelector = currentFrameSelector; // Use the passed frame selector
            debouncedInput(target, frameSelector);
        }
    };

    const recordClick = (e) => {
        const target = e.target;
        const tagName = target.tagName.toUpperCase();
        if (tagName === 'SELECT' || tagName === 'OPTION' || tagName === 'TEXTAREA') return;
        if (tagName === 'INPUT' && !['checkbox', 'radio'].includes(target.type.toLowerCase())) return;

        const frameSelector = currentFrameSelector; // Use the passed frame selector

        if (tagName === 'INPUT' && ['radio', 'checkbox'].includes(target.type.toLowerCase())) {
            sendStep({ type: 'click', selector: getSelector(target), value: target.value, checked: target.checked, timestamp: new Date().toISOString() }, frameSelector);
            return;
        }
        const MAX_TEXT_LENGTH = 255;
        let text = target.textContent ? target.textContent.trim() : '';
        if (text.length > MAX_TEXT_LENGTH) {
            text = text.substring(0, MAX_TEXT_LENGTH) + '...';
        }
        sendStep({ type: 'click', selector: getSelector(target), textContent: text, timestamp: new Date().toISOString() }, frameSelector);
    };

    const recordKeydown = (e) => {
        const target = e.target;
        const frameSelector = currentFrameSelector;
        if (e.key === 'Enter') {
            sendStep({ type: 'keydown', selector: getSelector(target), key: 'Enter', timestamp: new Date().toISOString() }, frameSelector);
        } else if (e.key === 'Tab') {
            sendStep({ type: 'keydown', selector: getSelector(target), key: 'Tab', timestamp: new Date().toISOString() }, frameSelector);
        }
    };

    doc.addEventListener('input', recordInput, useCapture);
    doc.addEventListener('change', recordChange, useCapture);
    doc.addEventListener('click', recordClick, useCapture);
    doc.addEventListener('keydown', recordKeydown, useCapture);
}

function setupListenersInWindow(win) {
    attachListenersToDocument(win.document); // Attach to main document
    const handleFrames = (context) => {
        try {
            const iframes = context.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.dataset.listenerAttached) return;
                iframe.dataset.listenerAttached = 'true';
                const iframeSelector = getSelector(iframe); // Get selector for the iframe itself

                iframe.addEventListener('load', () => {
                    try {
                        attachListenersToDocument(iframe.contentDocument, iframeSelector); // Pass iframeSelector
                    } catch (e) {
                        console.warn('Could not attach listeners to iframe content due to cross-origin restrictions.', e);
                    }
                });
                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                     attachListenersToDocument(iframe.contentDocument, iframeSelector); // Pass iframeSelector
                }
            });
        } catch (e) {
            console.error('Error processing frames:', e);
        }
    };
    handleFrames(win.document);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    handleFrames(node);
                }
            });
        });
    });
    observer.observe(win.document.body, { childList: true, subtree: true });
}

window.addEventListener('DOMContentLoaded', () => {
    setupListenersInWindow(window);
});

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    getSourceCode: async (selector) => {
        return new Promise((resolve) => {
            // Execute in the context of the main window's DOM
            if (selector) {
                const element = document.querySelector(selector);
                resolve(element ? element.outerHTML : null);
            } else {
                resolve(document.documentElement.outerHTML);
            }
        });
    }
});

window.addEventListener('DOMContentLoaded', () => {
    setupListenersInWindow(window);
});