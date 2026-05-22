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
