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
