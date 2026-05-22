(function () {
  const keyInput = document.getElementById('api-key-input');
  const toggle = document.getElementById('enabled-toggle');
  const statusEl = document.getElementById('status-text');

  function updateStatus(apiKey, enabled) {
    statusEl.className = '';
    if (!enabled) { statusEl.textContent = 'Off'; statusEl.className = 'off'; }
    else if (!apiKey) { statusEl.textContent = 'No API key'; statusEl.className = 'nokey'; }
    else { statusEl.textContent = 'Listening'; statusEl.className = 'listening'; }
  }

  chrome.storage.local.get(['apiKey', 'enabled'], (r) => {
    keyInput.value = r.apiKey || '';
    toggle.checked = r.enabled || false;
    updateStatus(r.apiKey, r.enabled);
  });

  keyInput.addEventListener('input', () => {
    chrome.storage.local.set({ apiKey: keyInput.value }, () => {
      chrome.storage.local.get(['apiKey', 'enabled'], (r) => updateStatus(r.apiKey, r.enabled));
    });
  });

  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ enabled: toggle.checked }, () => {
      chrome.storage.local.get(['apiKey', 'enabled'], (r) => updateStatus(r.apiKey, r.enabled));
    });
  });
})();
