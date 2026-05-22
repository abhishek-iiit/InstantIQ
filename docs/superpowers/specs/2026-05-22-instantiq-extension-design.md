# InstantIQ — AI Quiz Answer Browser Extension

**Date:** 2026-05-22  
**Status:** Approved  

---

## Overview

A standalone Chrome browser extension that detects quiz questions on any website as they appear (without page reload) and displays AI-generated answers in a floating overlay. Uses Gemini API as the AI backend. Works across sites with unknown/varying endpoints by combining three detection layers.

---

## Goals

- Detect quiz questions on any site without pre-configuring endpoints
- Answer questions within 1–2 seconds of appearance
- Work without page reload (SPA-style quiz sites like SurveyMonkey, Quizizz, Kahoot)
- Display answers non-intrusively as a floating overlay
- Require only a Gemini API key from the user

---

## Architecture

### Extension Structure

```
instantiq-extension/
├── manifest.json
├── background/
│   └── service-worker.js        ← Gemini API calls, screenshot capture
├── content/
│   ├── content.js               ← MutationObserver, Layer 2 + 3 orchestration
│   ├── injected.js              ← fetch/XHR override (Layer 1)
│   └── overlay.js               ← floating answer UI
├── popup/
│   ├── popup.html               ← API key input, on/off toggle
│   └── popup.js
└── icons/
    └── icon-16/32/48/128.png
```

### Message Flow

```
injected.js (page context)
    │  window.postMessage (network response captured)
    ▼
content.js (content script)
    │  chrome.runtime.sendMessage (question text + context)
    ▼
service-worker.js (background)
    │  fetch → Gemini API
    ▼
content.js receives answer
    │
    ▼
overlay.js displays floating card
```

---

## Detection Layers

### Layer 1 — Network Interception (Primary)

`injected.js` runs in the page's own JavaScript context (not the content script sandbox) so it can override `window.fetch` and `XMLHttpRequest`. Every JSON response is forwarded to `content.js` via `window.postMessage`.

**Flow:**
```
Page makes any fetch/XHR request
    → injected.js clones response body
    → filters: is JSON? is > 50 chars?
    → postMessage({ type: 'NETWORK_RESPONSE', body: jsonString })
    → content.js relays to service worker
    → Gemini prompt: "If this JSON contains a quiz question and answer options,
                      extract and answer it. Otherwise reply NO_QUESTION."
```

**Why:** Catches question data before DOM renders. Works even when questions are in canvas or heavily obfuscated HTML. No endpoint config needed — Gemini decides if the payload is a question.

---

### Layer 2 — DOM Intelligence (Fallback)

`content.js` registers a `MutationObserver` on `document.body` watching for added nodes. When nodes are added, the changed subtree HTML is sent to Gemini.

**Flow:**
```
DOM mutation detected (childList, subtree: true)
    → debounce 300ms (wait for changes to settle)
    → collect outerHTML of added nodes (truncate to 3000 chars)
    → hash content — already sent? skip.
    → Gemini prompt: "Extract the question and answer choices from this HTML,
                      then answer the question. If no question, reply NO_QUESTION."
```

**Why:** Catches questions that don't come via detectable network requests (e.g., server-side rendered, embedded in page state, or when fetch override fails).

---

### Layer 3 — Vision Fallback (Last Resort)

Triggers only if Layers 1 and 2 produce no answer within 3 seconds of a DOM change. Captures a screenshot and sends to Gemini Vision.

**Flow:**
```
3s timeout fires with no answer
    → chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' })
    → service-worker: chrome.tabs.captureVisibleTab()
    → Gemini Vision prompt: "What question is shown on screen?
                             What are the answer choices? Which is correct?"
```

**Why:** Handles questions inside iframes, canvas elements, or image-based question formats that neither network nor DOM text extraction can reach.

---

## Components

### `service-worker.js`

- Listens for `chrome.runtime.onMessage`
- Handles three message types: `NETWORK_RESPONSE`, `DOM_QUESTION`, `CAPTURE_SCREENSHOT`
- Makes all Gemini API calls (API key never leaves background context)
- Handles rate limiting: queues requests with 1s delay between calls
- Returns `{ answer, question }` or `{ result: 'NO_QUESTION' }` back to content script

**Gemini model:** `gemini-1.5-flash` for all layers — vision is built-in, no separate model needed

### `injected.js`

- Injected via `content.js` using a `<script>` tag into the page's own DOM
- Overrides `window.fetch` and `XMLHttpRequest.prototype.open/send`
- Filters responses: must be JSON, must be > 50 characters
- Uses `window.postMessage` to communicate back to content script (cross-context boundary)

### `content.js`

- Injects `injected.js` into page context on load
- Listens for `window.postMessage` from `injected.js` (Layer 1)
- Registers `MutationObserver` (Layer 2)
- Manages the 3-second vision fallback timer (Layer 3)
- Deduplication: SHA-256 hash of last sent content, skips if same
- Sends questions to service worker, receives answers, calls `overlay.js`

### `overlay.js`

- Injects a `<div id="instantiq-overlay">` at top of `<body>` with `position: fixed`
- Shows: detected question (truncated to 100 chars), AI answer (highlighted), layer indicator (Network / DOM / Vision)
- Auto-dismisses after 15 seconds
- Dismissed immediately when next question is detected
- Z-index high enough to appear above all page content

### `popup.html` / `popup.js`

- Input field for Gemini API key (saved to `chrome.storage.local`)
- On/Off toggle (saved to `chrome.storage.local`)
- Shows current status: "Listening", "Off", "No API key"

---

## Gemini Prompts

| Layer | Input | Prompt |
|-------|-------|--------|
| 1 (Network) | JSON string | `"If this JSON contains a quiz question and answer options, extract the question text and all answer choices, then provide the correct answer. If this does not contain a question, reply exactly: NO_QUESTION"` |
| 2 (DOM) | HTML snippet | `"Extract the quiz question and answer choices from this HTML. Answer the question. If there is no question present, reply exactly: NO_QUESTION"` |
| 3 (Vision) | Base64 image | `"What question is displayed on this screen? List all answer choices. Which answer is correct and why?"` |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No API key | Overlay shows "Set your Gemini API key in extension settings" |
| Gemini API error / timeout | Overlay shows "Could not fetch answer" for 3s then disappears |
| Rate limit hit | Queue with 1s delay between calls, overlay shows "Thinking..." |
| Question inside iframe | Layer 3 (vision) catches it |
| Image-based question | Layer 3 (vision) catches it |
| Same question re-renders | Deduplication hash prevents duplicate API calls |
| Rapid DOM changes | 300ms debounce — fires after changes settle |
| Site blocks fetch override | Layer 2 DOM takes over as primary |
| Very long HTML subtree | Truncate to 3000 chars before sending |

---

## Privacy & Security

- API key stored in `chrome.storage.local` only — never hardcoded, never sent anywhere except Gemini
- No question data is logged or persisted — sent to Gemini and discarded
- Extension is **off by default** — user must toggle on
- `injected.js` has no access to `chrome.*` APIs — isolated from extension privileges
- Minimum required permissions: `storage`, `activeTab`, `scripting`, `tabs`

---

## Manifest V3 Permissions

```json
{
  "permissions": ["storage", "activeTab", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## Out of Scope

- Firefox / Safari support (Chrome MV3 only for now)
- Auto-filling answers (display only)
- Storing answer history
- Support for non-English questions
- Custom per-site configuration

---

## Open Questions

- Gemini Vision API availability in `gemini-1.5-pro` vs separate endpoint — verify before implementing Layer 3
- `chrome.tabs.captureVisibleTab` requires `"tabs"` permission and may prompt user — verify UX impact
- MV3 service worker sleep behavior: workers can go idle; ensure message handlers re-register correctly on wake
