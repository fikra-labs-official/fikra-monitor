module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        path: '..',
        // Update's child re-reads app-scoped ENVIRONMENT directly.
        message: 'node scripts/pinokio-update.mjs',
      },
    },
  ],
};
