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
      if (chrome.runtime.lastError) return;
      if (!res || !res.answer) return;
      clearTimeout(visionTimer);
      const raw = (msg.html || msg.body || '').replace(/<[^>]+>/g, ' ').trim();
      window.IQOverlay?.showAnswer({ question: raw.slice(0, 100), answer: res.answer, layer });
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
        if (chrome.runtime.lastError) return;
        if (res && res.answer) {
          window.IQOverlay?.showAnswer({ question: '(screenshot)', answer: res.answer, layer: 'vision' });
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
