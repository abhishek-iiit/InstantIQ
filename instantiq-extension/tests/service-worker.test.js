const fs = require('fs'), path = require('path');

function geminiResp(text) {
  return { ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text }] } }] }) };
}

function load() {
  eval(fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'));
}

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn();
  chrome.storage.local.get.mockImplementation((k, cb) => cb({ apiKey: 'test-key', enabled: true }));
  load();
});

test('registers onMessage listener', () => {
  expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
});

test('calls Gemini for DOM_QUESTION and returns answer', async () => {
  global.fetch.mockResolvedValue(geminiResp('Paris'));
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = jest.fn();
  listener({ type: 'DOM_QUESTION', html: '<div>Capital of France?</div>' }, {}, send);
  await new Promise(r => setTimeout(r, 0));
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('generativelanguage.googleapis.com'), expect.objectContaining({ method: 'POST' })
  );
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ answer: 'Paris' }));
});

test('calls Gemini for NETWORK_RESPONSE and returns answer', async () => {
  global.fetch.mockResolvedValue(geminiResp('Option C'));
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = jest.fn();
  listener({ type: 'NETWORK_RESPONSE', body: '{"question":"Q?","options":["A","B","C","D"],"id":1}' }, {}, send);
  await new Promise(r => setTimeout(r, 0));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ answer: 'Option C' }));
});

test('returns NO_QUESTION when Gemini replies NO_QUESTION', async () => {
  global.fetch.mockResolvedValue(geminiResp('NO_QUESTION'));
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = jest.fn();
  listener({ type: 'DOM_QUESTION', html: '<div>Menu</div>' }, {}, send);
  await new Promise(r => setTimeout(r, 0));
  expect(send).toHaveBeenCalledWith({ result: 'NO_QUESTION' });
});

test('returns error when Gemini API throws', async () => {
  global.fetch.mockRejectedValue(new Error('Network error'));
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = jest.fn();
  listener({ type: 'DOM_QUESTION', html: '<div>Q?</div>' }, {}, send);
  await new Promise(r => setTimeout(r, 0));
  expect(send).toHaveBeenCalledWith({ error: expect.any(String) });
});

test('returns NO_QUESTION when extension is disabled', async () => {
  chrome.storage.local.get.mockImplementation((k, cb) => cb({ apiKey: 'key', enabled: false }));
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = jest.fn();
  listener({ type: 'DOM_QUESTION', html: '<div>Q?</div>' }, {}, send);
  await new Promise(r => setTimeout(r, 0));
  expect(global.fetch).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith({ result: 'NO_QUESTION' });
});

test('returns NO_API_KEY error when no key stored', async () => {
  chrome.storage.local.get.mockImplementation((k, cb) => cb({ enabled: true }));
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = jest.fn();
  listener({ type: 'DOM_QUESTION', html: '<div>Q?</div>' }, {}, send);
  await new Promise(r => setTimeout(r, 0));
  expect(send).toHaveBeenCalledWith({ error: 'NO_API_KEY' });
});
