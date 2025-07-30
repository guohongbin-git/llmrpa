const SCRIPT_VERSION = 'v2.0'; // A version to ensure we are running the latest code.

document.addEventListener('DOMContentLoaded', () => {
  console.log(`[LLMRPA-POPUP] Popup script version: ${SCRIPT_VERSION} loaded.`);
  const toggleButton = document.getElementById('toggleRecord');
  const statusDiv = document.getElementById('status');

  // Function to update the UI based on the recording state
  function updateUI(isRecording) {
    if (isRecording) {
      statusDiv.textContent = 'RECORDING';
      statusDiv.style.color = 'red';
      toggleButton.textContent = 'Stop Recording';
    } else {
      statusDiv.textContent = 'STOPPED';
      statusDiv.style.color = 'black';
      toggleButton.textContent = 'Start Recording';
    }
  }

  // Get initial state from storage and update UI
  chrome.storage.local.get('isRecording', (data) => {
    updateUI(data.isRecording || false);
  });

  // Listen for changes in storage to keep the UI in sync
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.isRecording) {
      updateUI(changes.isRecording.newValue);
    }
  });

  // When the button is clicked, just update the state in storage.
  // The content script will react to this change.
  toggleButton.addEventListener('click', () => {
    chrome.storage.local.get('isRecording', (data) => {
      const newRecordingState = !data.isRecording;
      // When starting, also clear any previous steps.
      if (newRecordingState) {
          chrome.storage.local.set({ isRecording: true, recordedSteps: [] });
      } else {
          chrome.storage.local.set({ isRecording: false });
      }
    });
  });

  const downloadButton = document.getElementById('downloadSteps');
  downloadButton.addEventListener('click', () => {
    console.log('[LLMRPA-POPUP]', 'Download button clicked. Sending message to background script.');
    chrome.runtime.sendMessage({ command: 'download_steps' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[LLMRPA-POPUP]', 'Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('[LLMRPA-POPUP]', 'Response from background script:', response);
      }
    });
  });
});
