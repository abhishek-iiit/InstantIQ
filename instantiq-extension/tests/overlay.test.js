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

test('showAnswer escapes unknown layer value to prevent XSS', () => {
  window.IQOverlay.showAnswer({ question: 'Q?', answer: 'A', layer: '<img src=x onerror=alert(1)>' });
  const html = document.getElementById('instantiq-overlay').innerHTML;
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
});
