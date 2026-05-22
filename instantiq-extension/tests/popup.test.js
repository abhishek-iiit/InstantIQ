const fs = require('fs'), path = require('path');

function load(storageData = {}) {
  chrome.storage.local.get.mockImplementation((k, cb) => cb(storageData));
  document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
  eval(fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8'));
}

beforeEach(() => jest.resetAllMocks());

test('loads saved API key into input', () => {
  load({ apiKey: 'my-key', enabled: false });
  expect(document.getElementById('api-key-input').value).toBe('my-key');
});

test('saves API key on input change', () => {
  chrome.storage.local.get.mockImplementation((k, cb) => cb({ apiKey: '', enabled: false }));
  load();
  const input = document.getElementById('api-key-input');
  input.value = 'new-key';
  input.dispatchEvent(new Event('input'));
  expect(chrome.storage.local.set).toHaveBeenCalledWith(
    expect.objectContaining({ apiKey: 'new-key' }), expect.anything()
  );
});

test('reflects enabled=true in toggle', () => {
  load({ apiKey: '', enabled: true });
  expect(document.getElementById('enabled-toggle').checked).toBe(true);
});

test('saves enabled state on toggle change', () => {
  load({ apiKey: 'key', enabled: false });
  const toggle = document.getElementById('enabled-toggle');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  expect(chrome.storage.local.set).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: true }), expect.anything()
  );
});

test('status shows "Off" when disabled', () => {
  load({ apiKey: 'key', enabled: false });
  expect(document.getElementById('status-text').textContent).toBe('Off');
});

test('status shows "No API key" when enabled but no key', () => {
  load({ apiKey: '', enabled: true });
  expect(document.getElementById('status-text').textContent).toBe('No API key');
});

test('status shows "Listening" when enabled with key', () => {
  load({ apiKey: 'valid-key', enabled: true });
  expect(document.getElementById('status-text').textContent).toBe('Listening');
});
