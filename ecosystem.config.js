module.exports = {
  apps: [
    {
      name: 'ai-story-game',
      script: 'api/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        PM2_USAGE: 'true'
      },
    },
  ],
};
