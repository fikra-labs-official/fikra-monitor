module.exports = {
  daemon: true,
  run: [
    {
      method: 'shell.run',
      params: {
        path: '..',
        env: {
          HOST: '127.0.0.1',
          PORT: '{{port}}',
        },
        message: 'node scripts/pinokio-start.mjs',
        on: [{
          event: '/\\[Pinokio\\] Ready at (http:\\/\\/127\\.0\\.0\\.1:[0-9]+\\/)/',
          done: true,
        }],
      },
    },
    {
      // Pinokio requires local.url for ready/Open state. PINOKIO_SHARE_VAR is
      // pinned to a different sentinel so local.set cannot trigger sharing.
      method: 'local.set',
      params: {
        url: '{{input.event[1]}}',
      },
    },
  ],
};
