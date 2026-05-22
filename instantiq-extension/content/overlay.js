(function () {
  const ID = 'instantiq-overlay';
  const LABELS = { network: 'Network', dom: 'DOM', vision: 'Vision' };
  let autoHideTimer = null;

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getOrCreate() {
    let el = document.getElementById(ID);
    if (el) return el;
    if (!document.body) return null;
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
    if (!el) return;
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<span style="font-weight:700;color:#7c83f7">InstantIQ</span>' +
        '<span style="font-size:11px;color:#888">' + esc(LABELS[layer] || layer) + '</span>' +
      '</div>' +
      '<div style="color:#aaa;font-size:12px;margin-bottom:8px;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap">' + esc(question) + '</div>' +
      '<div style="background:#0f3460;border-radius:8px;padding:10px;color:#4ecca3;font-weight:600">' +
        esc(answer) + '</div>';
    el.style.display = 'block';
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(hideOverlay, 15000);
  }

  function hideOverlay() {
    const el = document.getElementById(ID);
    if (el) el.style.display = 'none';
  }

  window.IQOverlay = { showAnswer, hideOverlay };
})();
