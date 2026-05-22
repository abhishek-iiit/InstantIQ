const fs = require('fs'), path = require('path');

beforeEach(() => {
  document.body.innerHTML = '';
  window.IQOverlay = { showAnswer: jest.fn(), hideOverlay: jest.fn() };
  chrome.runtime.sendMessage.mockReset();
  chrome.runtime.getURL.mockReturnValue('chrome-extension://fakeid/content/injected.js');
  jest.useFakeTimers();
});

afterEach(() => {
  if (window.__IQ_observer) { window.__IQ_observer.disconnect(); delete window.__IQ_observer; }
  jest.useRealTimers();
});

function load() {
  eval(fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8'));
}

test('injects injected.js script tag into document', () => {
  load();
  expect(document.querySelector('script[src*="injected.js"]')).not.toBeNull();
});

test('simpleHash returns same value for same input', () => {
  load();
  expect(window.__IQ_hash('hello')).toBe(window.__IQ_hash('hello'));
});

test('simpleHash returns different values for different inputs', () => {
  load();
  expect(window.__IQ_hash('hello')).not.toBe(window.__IQ_hash('world'));
});

test('sends DOM_QUESTION when mutation adds content', async () => {
  chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ answer: 'Paris' }));
  load();
  const div = document.createElement('div');
  div.textContent = 'What is the capital of France? Berlin Paris Rome Madrid answer here';
  document.body.appendChild(div);
  await Promise.resolve(); // flush MutationObserver microtask
  jest.advanceTimersByTime(350);
  await Promise.resolve();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'DOM_QUESTION' }),
    expect.any(Function)
  );
});

test('calls showAnswer when service worker returns answer', async () => {
  chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ answer: 'Paris' }));
  load();
  const div = document.createElement('div');
  div.textContent = 'Capital of France? Berlin Paris Rome Madrid this is long enough text';
  document.body.appendChild(div);
  await Promise.resolve(); // flush MutationObserver microtask
  jest.advanceTimersByTime(350);
  await Promise.resolve();
  expect(window.IQOverlay.showAnswer).toHaveBeenCalledWith(
    expect.objectContaining({ answer: 'Paris', layer: 'dom' })
  );
});

test('deduplicates identical DOM mutations', async () => {
  chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ answer: 'X' }));
  load();
  const div = document.createElement('div');
  div.textContent = 'What is 2+2? Three Four Five Six padding padding padding padding';
  document.body.appendChild(div);
  await Promise.resolve(); // flush MutationObserver microtask
  jest.advanceTimersByTime(350);
  await Promise.resolve();
  const count = chrome.runtime.sendMessage.mock.calls.length;

  document.body.appendChild(div.cloneNode(true));
  await Promise.resolve(); // flush MutationObserver microtask
  jest.advanceTimersByTime(350);
  await Promise.resolve();
  expect(chrome.runtime.sendMessage.mock.calls.length).toBe(count);
});

test('forwards IQ_NETWORK_RESPONSE postMessage to service worker', async () => {
  chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ answer: 'Option A' }));
  load();
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'IQ_NETWORK_RESPONSE', body: '{"question":"Q?","options":["A","B","C","D"],"id":99}' },
    source: window,
  }));
  await Promise.resolve();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'NETWORK_RESPONSE' }),
    expect.any(Function)
  );
});
