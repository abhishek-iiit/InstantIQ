# InstantIQ

> AI that observes, understands, and reacts to live web content.

InstantIQ is a Chrome extension that silently monitors every page you visit and uses Google Gemini to detect quiz questions — from network traffic, DOM changes, or raw screenshots — then surfaces the answer in a floating overlay before you have to ask.

---

## How It Works

Three independent detection layers run simultaneously on every tab:

| Layer | Source | Mechanism |
|-------|--------|-----------|
| **Network** | JSON API responses | Hooks `fetch` / `XMLHttpRequest` in the page context |
| **DOM** | HTML mutations | `MutationObserver` debounced at 300 ms |
| **Vision** | Full-page screenshot | `chrome.tabs.captureVisibleTab` triggered 3 s after a DOM hit |

When any layer finds a question, the service worker forwards it to Gemini 1.5 Flash and renders the answer in a fixed overlay at the bottom-right of the screen. The overlay auto-dismisses after 15 seconds.

```
Page
 ├── injected.js      — wraps fetch/XHR, posts IQ_NETWORK_RESPONSE to window
 ├── content.js       — MutationObserver + message bridge to service worker
 └── overlay.js       — creates and updates the answer card in the DOM

service-worker.js     — calls Gemini API, dispatches answers back to content
popup.html / popup.js — stores API key + enabled flag in chrome.storage.local
```

---

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/abhishek-iiit/InstantIQ.git
   cd InstantIQ/instantiq-extension
   ```

2. Open Chrome and navigate to `chrome://extensions`.

3. Enable **Developer mode** (top-right toggle).

4. Click **Load unpacked** and select the `instantiq-extension/` directory.

5. The InstantIQ icon appears in your toolbar.

---

## Setup

1. Click the InstantIQ toolbar icon.
2. Paste your [Gemini API key](https://aistudio.google.com/app/apikey) into the input field (`AIza...`).
3. Toggle **Active** on.
4. The status badge turns **Listening** — you're live.

Your API key is stored locally in `chrome.storage.local` and never sent anywhere except Google's Gemini endpoint.

---

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Persists API key and enabled state |
| `activeTab` | Captures the visible tab for screenshot analysis |
| `scripting` | Injects `injected.js` into page context to intercept network calls |
| `tabs` | Required for `captureVisibleTab` |
| `<all_urls>` | Runs on every site so no quiz platform is missed |

---

## Project Structure

```
InstantIQ/
└── instantiq-extension/
    ├── background/
    │   └── service-worker.js   # Gemini API calls, message routing
    ├── content/
    │   ├── content.js          # MutationObserver, screenshot trigger
    │   ├── injected.js         # fetch/XHR interception (page context)
    │   └── overlay.js          # Answer card UI
    ├── popup/
    │   ├── popup.html          # Extension popup
    │   └── popup.js            # API key + toggle logic
    ├── icons/                  # Extension icons (16/32/48/128 px)
    ├── tests/                  # Jest test suite
    ├── manifest.json           # Manifest V3 config
    └── package.json
```

---

## Development

### Running Tests

```bash
cd instantiq-extension
npm install
npm test
```

Tests use Jest with `jest-environment-jsdom` and cover all four content/background modules.

### Reloading After Changes

After editing any file, go to `chrome://extensions` and click the **reload** icon on the InstantIQ card. Content scripts re-inject on the next page navigation.

---

## Detection Flow

```
New page / DOM mutation
        │
        ▼
  content.js (MutationObserver)
        │  debounce 300 ms
        ▼
  DOM_QUESTION → service-worker → Gemini → answer → IQOverlay.showAnswer()
        │
        └─ after 3 s → CAPTURE_SCREENSHOT → Gemini (vision) → IQOverlay.showAnswer()

XHR / fetch response (JSON ≥ 50 chars)
        │
  injected.js posts IQ_NETWORK_RESPONSE
        │
  content.js forwards NETWORK_RESPONSE → service-worker → Gemini → IQOverlay.showAnswer()
```

Duplicate content is suppressed by a 32-bit djb2 hash of the first 3 000 characters; the same HTML is never sent to Gemini twice in a row.

---

## Tech Stack

- **Chrome Extension Manifest V3**
- **Google Gemini 1.5 Flash** — multimodal (text + image)
- **Vanilla JS** — zero runtime dependencies
- **Jest 29** — unit tests

---

## License

[MIT](LICENSE)
