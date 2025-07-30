console.log('[LLMRPA-BG] v11.0', 'Background script (Cache Buster) loaded.');

let injectedTabs = new Set();

// Force service worker to activate immediately and clear cache
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[LLMRPA-BG]', 'Extension installed/updated. Initializing storage and clearing cache.');
  chrome.storage.local.set({ isRecording: false, recordedSteps: [] });
  
  // Force clear all caches to ensure latest content scripts are loaded
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL || details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          console.log(`[LLMRPA-BG] Deleting cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
        console.log('[LLMRPA-BG]', 'All caches cleared.');
    });
  }
});

// --- Core Injection Logic with Injection Lock ---
async function injectScriptIfRecording(tabId) {
    if (!tabId || tabId < 0 || injectedTabs.has(tabId)) {
        if (injectedTabs.has(tabId)) {
            console.log(`[LLMRPA-BG] Injection skipped for tab ${tabId}, already injected.`);
        }
        return;
    }

    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('http://localhost:4000'))) {
            return;
        }
    } catch (e) {
        console.warn(`[LLMRPA-BG] Could not get tab info for tabId: ${tabId}. It might be closed.`);
        return;
    }

    chrome.storage.local.get('isRecording', async (data) => {
        if (data.isRecording) {
            console.log(`[LLMRPA-BG] Recording is active. Attempting to inject script into tab ${tabId}`);
            
            // Inject the main content script logic as a function
            const injectionResults = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // This function will be executed in the main world of the target page
                    // It needs to contain all the logic from content_script.js
                    // We pass chrome.runtime.sendMessage as an argument to bridge the isolated world

                    console.log('[LLMRPA-CS] v12.0', 'Content script injected. Now observing user actions.');

                    function getSelector(element) {
                        if (!element) return '';
                        if (element.id) return `#${element.id}`;
                        if (element.name) return `[name="${element.name}"]`;
                        if (element.className && typeof element.className === 'string') {
                            const stableClasses = element.className.split(' ').filter(c => c && !c.includes(':')).join('.');
                            return `${element.tagName.toLowerCase()}${stableClasses ? '.' + stableClasses : ''}`;
                        }
                        return element.tagName.toLowerCase();
                    }

                    function sendStep(step) {
                        console.log('[LLMRPA-CS]', 'Step recorded:', step);
                        // Use the passed sendMessage function to communicate with background
                        window.postMessage({ type: 'RECORDED_STEP_FROM_MAIN_WORLD', step: step }, '*');
                    }

                    const recordInput = (e) => {
                        const target = e.target;
                        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                            sendStep({
                                type: 'input',
                                selector: getSelector(target),
                                value: target.value,
                                timestamp: new Date().toISOString(),
                            });
                        }
                    };

                    const recordSelect = (e) => {
                        const target = e.target;
                        if (target.tagName === 'SELECT') {
                            const selectedOption = target.options[target.selectedIndex];
                            sendStep({
                                type: 'select',
                                selector: getSelector(target),
                                value: target.value,
                                textContent: selectedOption ? selectedOption.text : '',
                                timestamp: new Date().toISOString(),
                            });
                        }
                    };

                    const recordClick = (e) => {
                        const target = e.target;
                        if (target.tagName === 'SELECT') return;

                        if (target.tagName === 'INPUT' && (target.type === 'radio' || target.type === 'checkbox')) {
                            sendStep({
                                type: 'click',
                                selector: getSelector(target),
                                value: target.value,
                                checked: target.checked,
                                timestamp: new Date().toISOString(),
                            });
                            return;
                        }

                        sendStep({
                            type: 'click',
                            selector: getSelector(target),
                            textContent: target.textContent.trim(),
                            timestamp: new Date().toISOString(),
                        });
                    };

                    function attachListeners() {
                        console.log('[LLMRPA-CS]', 'Attaching behavior-focused event listeners.');
                        document.addEventListener('blur', recordInput, true);
                        document.addEventListener('change', recordSelect, true);
                        document.addEventListener('click', recordClick, true);
                    }

                    attachListeners();
                },
                world: 'MAIN' // Execute in the main world
            });

            if (chrome.runtime.lastError) {
                console.error(`[LLMRPA-BG] Script injection failed (MAIN world) on tab ${tabId}: ${chrome.runtime.lastError.message}`);
            } else if (injectionResults && injectionResults.length > 0) {
                console.log(`[LLMRPA-BG] Script injected successfully (MAIN world) on tab ${tabId}.`);
                injectedTabs.add(tabId);
            }
        }
    });
}

// --- Event Listeners for All Windows and Tabs ---

chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
            if (tabs[0]) injectScriptIfRecording(tabs[0].id);
        });
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    injectScriptIfRecording(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // When a tab is updated, it might be a new page, so we should consider re-injecting.
        // First, remove it from our set of injected tabs.
        if (injectedTabs.has(tabId)) {
            console.log(`[LLMRPA-BG] Tab ${tabId} updated, removing from injected set to allow re-injection.`);
            injectedTabs.delete(tabId);
        }
        injectScriptIfRecording(tabId);
    }
});

// When recording is turned on/off, update all active tabs in all windows
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.isRecording) {
        if (changes.isRecording.newValue === true) {
            injectedTabs.clear(); // Clear the set when starting a new recording session
            chrome.tabs.query({ active: true }, (tabs) => {
                for (const tab of tabs) {
                    injectScriptIfRecording(tab.id);
                }
            });
        } else {
            injectedTabs.clear(); // Clear the set when recording stops
        }
    }
});


// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECORDED_STEP') {
    chrome.storage.local.get('recordedSteps', (data) => {
      const steps = data.recordedSteps || [];
      steps.push(message.step);
      chrome.storage.local.set({ recordedSteps: steps });
    });
  } else if (message.command === 'clear') {
    chrome.storage.local.set({ recordedSteps: [] });
    sendResponse({ status: 'success' });
  } else if (message.command === 'download_steps') {
    chrome.storage.local.get('recordedSteps', (data) => {
      const steps = data.recordedSteps || [];
      const json = JSON.stringify(steps, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'recorded_steps.json',
        saveAs: true
      }).then((downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
          sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
        } else {
          console.log('Download started with ID:', downloadId);
          sendResponse({ status: 'success' });
        }
        // Revoke the object URL after a short delay to allow the download to start
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }).catch(err => {
        console.error('Download initiation failed:', err);
        sendResponse({ status: 'error', message: err.message });
      });
    });
    return true; // Keep the message channel open for async response
  }
  return true;
});
