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
