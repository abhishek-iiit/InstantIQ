# InstantIQ Browser Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 browser extension that detects quiz questions on any website using 3 detection layers and displays Gemini AI answers in a floating overlay.

**Architecture:** `injected.js` overrides `window.fetch`/XHR in page context (Layer 1); `content.js` runs a MutationObserver (Layer 2) and a 3-second vision fallback (Layer 3); `service-worker.js` holds the API key and calls Gemini; `overlay.js` renders the answer card.

**Tech Stack:** Chrome Extension Manifest V3, Gemini API (`gemini-1.5-flash`), Jest 29 + jest-environment-jsdom, vanilla JS (no bundler)

---

## File Map

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 config — permissions, content scripts, service worker, web-accessible resources |
| `background/service-worker.js` | Gemini API calls, screenshot capture, message routing |
| `content/injected.js` | Runs in page JS context — overrides `window.fetch` + XHR, posts JSON bodies |
| `content/overlay.js` | Floating answer card — defines `window.IQOverlay` |
| `content/content.js` | Orchestrator: injects `injected.js`, MutationObserver, deduplication, vision timer |
| `popup/popup.html` | Settings UI |
| `popup/popup.js` | API key + toggle persistence via `chrome.storage.local` |
| `package.json` | Jest dev dependencies |
| `jest.config.js` | Jest → jsdom |
| `tests/__mocks__/chrome.js` | Chrome API mock |
| `tests/overlay.test.js` | overlay.js tests |
| `tests/injected.test.js` | injected.js tests |
| `tests/service-worker.test.js` | Gemini API tests |
| `tests/content.test.js` | Orchestrator tests |
| `tests/popup.test.js` | Settings UI tests |

---

### Task 1: Scaffold

**Files:** `manifest.json`, `package.json`, `jest.config.js`, `tests/__mocks__/chrome.js`, stub source files

- [ ] **Step 1: Create directories**

```bash
mkdir -p instantiq-extension/{background,content,popup,icons,tests/__mocks__}
cd instantiq-extension
```

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "InstantIQ",
  "version": "1.0.0",
  "description": "AI-powered quiz answer assistant",
  "permissions": ["storage", "activeTab", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/overlay.js", "content/content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["content/injected.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "instantiq-extension",
  "version": "1.0.0",
  "scripts": { "test": "jest" },
  "devDependencies": {
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  }
}
```

- [ ] **Step 4: Create `jest.config.js`**

```javascript
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  setupFiles: ['./tests/__mocks__/chrome.js'],
};
```

- [ ] **Step 5: Create `tests/__mocks__/chrome.js`**

```javascript
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn((obj, cb) => cb && cb()),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() },
    getURL: jest.fn((p) => `chrome-extension://fakeid/${p}`),
  },
  tabs: {
    captureVisibleTab: jest.fn(),
  },
};
```

- [ ] **Step 6: Create placeholder icons and stub source files**

```bash
# Create 1x1 transparent PNG for each icon size (valid PNG, Chrome accepts for dev)
python3 -c "
import struct, zlib
def png(size):
    def chunk(t, d):
        c = t+d; return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
    raw = b''.join(b'\x00'+b'\x7c\x83\xf7\xff'*size for _ in range(size))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
import os
for s in [16,32,48,128]:
    open(f'icons/icon{s}.png','wb').write(png(s))
print('Icons created')
"

touch background/service-worker.js content/injected.js content/overlay.js content/content.js popup/popup.js
```

Create `popup/popup.html` (minimal stub):
```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body><script src="popup.js"></script></body></html>
```

- [ ] **Step 7: Install and verify**

```bash
npm install
npx jest --passWithNoTests
```

Expected: `Test Suites: 0 passed, 0 total`

---

### Task 2: `overlay.js`

**Files:** `content/overlay.js`, `tests/overlay.test.js`

- [ ] **Step 1: Write failing tests — create `tests/overlay.test.js`**

```javascript
const fs = require('fs'), path = require('path');

function load() {
  document.body.innerHTML = '';
  delete window.IQOverlay;
  eval(fs.readFileSync(path.join(__dirname, '../content/overlay.js'), 'utf8'));
}

beforeEach(() => { load(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test('showAnswer injects overlay into body', () => {
  window.IQOverlay.showAnswer({ question: 'Q?', answer: 'A', layer: 'dom' });
  expect(document.getElementById('instantiq-overlay')).not.toBeNull();
});

test('showAnswer displays answer text', () => {
  window.IQOverlay.showAnswer({ question: 'What is 2+2?', answer: '4', layer: 'network' });
  expect(document.getElementById('instantiq-overlay').innerHTML).toContain('4');
});

test('showAnswer displays question text', () => {
  window.IQOverlay.showAnswer({ question: 'What is 2+2?', answer: '4', layer: 'network' });
  expect(document.getElementById('instantiq-overlay').innerHTML).toContain('What is 2+2?');
});

test('showAnswer escapes HTML to prevent XSS', () => {
  window.IQOverlay.showAnswer({ question: '<script>x()</script>', answer: '<b>bad</b>', layer: 'dom' });
  const html = document.getElementById('instantiq-overlay').innerHTML;
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});

test('hideOverlay sets display to none', () => {
  window.IQOverlay.showAnswer({ question: 'Q?', answer: 'A', layer: 'dom' });
  window.IQOverlay.hideOverlay();
  expect(document.getElementById('instantiq-overlay').style.display).toBe('none');
});

test('showAnswer called twice creates only one overlay element', () => {
  window.IQOverlay.showAnswer({ question: 'Q1?', answer: 'A1', layer: 'dom' });
  window.IQOverlay.showAnswer({ question: 'Q2?', answer: 'A2', layer: 'dom' });
  expect(document.querySelectorAll('#instantiq-overlay').length).toBe(1);
});

test('showAnswer displays layer label', () => {
  window.IQOverlay.showAnswer({ question: 'Q?', answer: 'A', layer: 'vision' });
  expect(document.getElementById('instantiq-overlay').innerHTML).toContain('Vision');
});

test('overlay auto-hides after 15 seconds', () => {
  window.IQOverlay.showAnswer({ question: 'Q?', answer: 'A', layer: 'dom' });
  expect(document.getElementById('instantiq-overlay').style.display).toBe('block');
  jest.advanceTimersByTime(15001);
  expect(document.getElementById('instantiq-overlay').style.display).toBe('none');
});
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx jest tests/overlay.test.js
```

Expected: FAIL — `Cannot read properties of undefined (reading 'showAnswer')`

- [ ] **Step 3: Implement `content/overlay.js`**

```javascript
(function () {
  const ID = 'instantiq-overlay';
  const LABELS = { network: 'Network', dom: 'DOM', vision: 'Vision' };

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getOrCreate() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;width:320px;background:#1a1a2e;' +
      'color:#eee;border-radius:12px;padding:16px;z-index:2147483647;' +
      'font-family:system-ui,sans-serif;font-size:14px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.4);display:none';
    document.body.appendChild(el);
    return el;
  }

  function showAnswer({ question, answer, layer }) {
    const el = getOrCreate();
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<span style="font-weight:700;color:#7c83f7">InstantIQ</span>' +
        '<span style="font-size:11px;color:#888">' + (LABELS[layer] || layer) + '</span>' +
      '</div>' +
      '<div style="color:#aaa;font-size:12px;margin-bottom:8px;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap">' + esc(question) + '</div>' +
      '<div style="background:#0f3460;border-radius:8px;padding:10px;color:#4ecca3;font-weight:600">' +
        esc(answer) + '</div>';
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(hideOverlay, 15000);
  }

  function hideOverlay() {
    const el = document.getElementById(ID);
    if (el) el.style.display = 'none';
  }

  window.IQOverlay = { showAnswer, hideOverlay };
})();
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx jest tests/overlay.test.js
```

Expected: PASS — 8 tests

---

### Task 3: `injected.js`

**Files:** `content/injected.js`, `tests/injected.test.js`

- [ ] **Step 1: Write failing tests — create `tests/injected.test.js`**

```javascript
const fs = require('fs'), path = require('path');

function mockFetch(body, ct = 'application/json') {
  return jest.fn().mockResolvedValue({
    clone: () => ({
      headers: { get: (h) => h === 'content-type' ? ct : null },
      text: () => Promise.resolve(body),
    }),
  });
}

function load() {
  const code = fs.readFileSync(path.join(__dirname, '../content/injected.js'), 'utf8');
  eval(code);
}

beforeEach(() => { window.postMessage = jest.fn(); });

test('overrides window.fetch on load', () => {
  const orig = jest.fn();
  window.fetch = orig;
  load();
  expect(window.fetch).not.toBe(orig);
});

test('posts IQ_NETWORK_RESPONSE for JSON >= 50 chars', async () => {
  const body = JSON.stringify({ question: 'What is mitosis?', options: ['A','B','C','D'], id: 1 });
  window.fetch = mockFetch(body);
  load();
  await window.fetch('/api/q');
  expect(window.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'IQ_NETWORK_RESPONSE', body }),
    '*'
  );
});

test('does not post for non-JSON content-type', async () => {
  window.fetch = mockFetch('<html>page</html>', 'text/html');
  load();
  await window.fetch('/page');
  expect(window.postMessage).not.toHaveBeenCalled();
});

test('does not post for JSON shorter than 50 chars', async () => {
  const body = JSON.stringify({ x: 1 }); // < 50 chars
  window.fetch = mockFetch(body);
  load();
  await window.fetch('/tiny');
  expect(window.postMessage).not.toHaveBeenCalled();
});

test('returns the original response to the caller', async () => {
  const body = JSON.stringify({ question: 'Q?', options: ['A','B','C','D'], extra: 'padding00' });
  window.fetch = mockFetch(body);
  load();
  const result = await window.fetch('/api/q');
  expect(result).toBeDefined();
});
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx jest tests/injected.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement `content/injected.js`**

```javascript
(function () {
  const origFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      const clone = response.clone();
      const ct = clone.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const text = await clone.text();
        if (text.length >= 50) {
          window.postMessage({ type: 'IQ_NETWORK_RESPONSE', body: text }, '*');
        }
      }
    } catch (_) {}
    return response;
  };

  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    const origSend = xhr.send.bind(xhr);
    xhr.send = function (...args) {
      xhr.addEventListener('load', function () {
        try {
          const ct = xhr.getResponseHeader('content-type') || '';
          if (ct.includes('json') && xhr.responseText.length >= 50) {
            window.postMessage({ type: 'IQ_NETWORK_RESPONSE', body: xhr.responseText }, '*');
          }
        } catch (_) {}
      });
      return origSend(...args);
    };
    return xhr;
  };
})();
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx jest tests/injected.test.js
```

Expected: PASS — 5 tests

---

### Task 4: `service-worker.js`

**Files:** `background/service-worker.js`, `tests/service-worker.test.js`

- [ ] **Step 1: Write failing tests — create `tests/service-worker.test.js`**

```javascript
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
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx jest tests/service-worker.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement `background/service-worker.js`**

```javascript
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const PROMPT = {
  NETWORK_RESPONSE: (body) =>
    'If this JSON contains a quiz question and answer options, extract and answer it. ' +
    'If not a question, reply exactly: NO_QUESTION\n\nJSON:\n' + body,
  DOM_QUESTION: (html) =>
    'Extract the quiz question and answer choices from this HTML and answer it. ' +
    'If no question present, reply exactly: NO_QUESTION\n\nHTML:\n' + html,
  CAPTURE_SCREENSHOT: () =>
    'What question is displayed on screen? List all answer choices. Which is correct and why?',
};

function getSettings() {
  return new Promise(r => chrome.storage.local.get(['apiKey', 'enabled'], r));
}

async function callGemini(apiKey, parts) {
  const res = await fetch(`${GEMINI}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'NO_QUESTION';
}

async function handle(msg, sendResponse) {
  const { apiKey, enabled } = await getSettings();
  if (!enabled) { sendResponse({ result: 'NO_QUESTION' }); return; }
  if (!apiKey) { sendResponse({ error: 'NO_API_KEY' }); return; }

  try {
    let answer;
    if (msg.type === 'CAPTURE_SCREENSHOT') {
      const dataUrl = await new Promise(r => chrome.tabs.captureVisibleTab(null, { format: 'png' }, r));
      const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      answer = await callGemini(apiKey, [
        { text: PROMPT.CAPTURE_SCREENSHOT() },
        { inline_data: { mime_type: 'image/png', data: b64 } },
      ]);
    } else if (msg.type === 'NETWORK_RESPONSE') {
      answer = await callGemini(apiKey, [{ text: PROMPT.NETWORK_RESPONSE(msg.body) }]);
    } else if (msg.type === 'DOM_QUESTION') {
      answer = await callGemini(apiKey, [{ text: PROMPT.DOM_QUESTION(msg.html) }]);
    }
    sendResponse((!answer || answer.trim() === 'NO_QUESTION') ? { result: 'NO_QUESTION' } : { answer });
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg, sendResponse);
  return true; // keep channel open for async response
});
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx jest tests/service-worker.test.js
```

Expected: PASS — 7 tests

---

### Task 5: `content.js`

**Files:** `content/content.js`, `tests/content.test.js`

- [ ] **Step 1: Write failing tests — create `tests/content.test.js`**

```javascript
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
  jest.advanceTimersByTime(350);
  await Promise.resolve();
  const count = chrome.runtime.sendMessage.mock.calls.length;

  document.body.appendChild(div.cloneNode(true));
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
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx jest tests/content.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement `content/content.js`**

```javascript
(function () {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/injected.js');
  (document.head || document.documentElement).appendChild(script);

  let lastHash = '';
  let debounceTimer = null;
  let visionTimer = null;
  let pending = [];

  function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h |= 0; }
    return String(h);
  }
  window.__IQ_hash = simpleHash;

  function sendQuestion(msg, layer) {
    chrome.runtime.sendMessage(msg, (res) => {
      if (!res || !res.answer) return;
      clearTimeout(visionTimer);
      const raw = (msg.html || msg.body || '').replace(/<[^>]+>/g, ' ').trim();
      window.IQOverlay.showAnswer({ question: raw.slice(0, 100), answer: res.answer, layer });
    });
  }

  function processHtml(html) {
    if (html.length < 10) return;
    const h = simpleHash(html.slice(0, 3000));
    if (h === lastHash) return;
    lastHash = h;
    sendQuestion({ type: 'DOM_QUESTION', html: html.slice(0, 3000) }, 'dom');
    clearTimeout(visionTimer);
    visionTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (res) => {
        if (res && res.answer) {
          window.IQOverlay.showAnswer({ question: '(screenshot)', answer: res.answer, layer: 'vision' });
        }
      });
    }, 3000);
  }

  const observer = new MutationObserver((mutations) => {
    pending.push(...mutations);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const html = pending
        .flatMap(m => Array.from(m.addedNodes))
        .filter(n => n.nodeType === 1)
        .map(n => n.outerHTML)
        .join('');
      pending = [];
      processHtml(html);
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.__IQ_observer = observer;

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'IQ_NETWORK_RESPONSE') return;
    sendQuestion({ type: 'NETWORK_RESPONSE', body: e.data.body }, 'network');
  });
})();
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx jest tests/content.test.js
```

Expected: PASS — 7 tests

---

### Task 6: `popup.html` + `popup.js`

**Files:** `popup/popup.html`, `popup/popup.js`, `tests/popup.test.js`

- [ ] **Step 1: Write failing tests — create `tests/popup.test.js`**

```javascript
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
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx jest tests/popup.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement `popup/popup.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>InstantIQ</title>
  <style>
    body{font-family:system-ui,sans-serif;width:280px;padding:16px;background:#1a1a2e;color:#eee;margin:0}
    h2{margin:0 0 16px;color:#7c83f7;font-size:16px}
    label{display:block;font-size:12px;color:#aaa;margin-bottom:4px}
    input[type=text]{width:100%;box-sizing:border-box;background:#0f3460;border:1px solid #333;
      border-radius:6px;color:#eee;padding:8px;font-size:13px;margin-bottom:12px}
    .row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    #status-text{font-size:12px;padding:4px 10px;border-radius:12px;background:#0f3460}
    #status-text.listening{background:#1a4d3a;color:#4ecca3}
    #status-text.off{background:#3d1515;color:#e07070}
    #status-text.nokey{background:#3d2e00;color:#e0b870}
  </style>
</head>
<body>
  <h2>InstantIQ</h2>
  <label for="api-key-input">Gemini API Key</label>
  <input type="text" id="api-key-input" placeholder="AIza...">
  <div class="row">
    <label for="enabled-toggle" style="margin:0">Active</label>
    <input type="checkbox" id="enabled-toggle">
  </div>
  <div class="row">
    <span style="font-size:12px;color:#aaa">Status</span>
    <span id="status-text" class="off">Off</span>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 4: Implement `popup/popup.js`**

```javascript
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
```

- [ ] **Step 5: Run — confirm pass**

```bash
npx jest tests/popup.test.js
```

Expected: PASS — 7 tests

---

### Task 7: Full Suite + Manual Verification

- [ ] **Step 1: Run full test suite**

```bash
npx jest
```

Expected:
```
PASS tests/overlay.test.js        (8 tests)
PASS tests/injected.test.js       (5 tests)
PASS tests/service-worker.test.js (7 tests)
PASS tests/content.test.js        (7 tests)
PASS tests/popup.test.js          (7 tests)

Test Suites: 5 passed
Tests:       34 passed
```

- [ ] **Step 2: Load in Chrome**

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `instantiq-extension/`
4. Extension icon appears in toolbar

- [ ] **Step 3: Configure**

1. Click extension icon
2. Paste Gemini API key into input
3. Toggle **Active** on → status shows **Listening**

- [ ] **Step 4: Test on a live quiz site**

Open any quiz site (e.g. quizizz.com, kahoot.it). Start a quiz. Verify:
- [ ] Floating overlay appears bottom-right within ~2 seconds
- [ ] Answer shown in green, layer label shows "Network" or "DOM"
- [ ] Overlay auto-dismisses after 15 seconds
- [ ] Next question replaces previous answer

- [ ] **Step 5: Test error states**

- Clear API key → no overlay, status shows "No API key"
- Toggle off → no overlay on any site
- Invalid key → overlay shows "Could not fetch answer" briefly then disappears

- [ ] **Step 6: Verify Layer 3 (vision) fires**

Open DevTools → Extensions background service worker console. Confirm `CAPTURE_SCREENSHOT` message appears after 3 seconds on a page where Layers 1+2 find nothing.
