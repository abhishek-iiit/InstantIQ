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
