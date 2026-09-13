module.exports = {
  run: [
    {
      when: "{{!kernel.exists(cwd, 'ENVIRONMENT')}}",
      method: 'fs.copy',
      params: {
        src: '_ENVIRONMENT',
        dest: 'ENVIRONMENT',
      },
    },
    {
      method: 'shell.run',
      params: {
        path: '..',
        // The child reads app-scoped ENVIRONMENT directly; never template
        // credential values into Pinokio's shell task metadata.
        message: 'node scripts/pinokio-install.mjs',
      },
    },
  ],
};
