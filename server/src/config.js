/**
 * config.js
 * ---------
 * One place for every setting. Values come from environment variables
 * (see .env.example) with safe defaults so the server starts with zero setup.
 */
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/codesync',
  // Frontend origins allowed to call the API and open WebSockets.
  // Comma-separated; "*" wildcards allowed, e.g.
  //   CLIENT_ORIGIN=https://codesync.vercel.app,https://codesync-*.vercel.app
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5180')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  // Limits applied to every sandboxed run
  run: {
    timeoutMs: Number(process.env.RUN_TIMEOUT_MS) || 10000,
    memory: process.env.RUN_MEMORY || '128m',
    cpus: process.env.RUN_CPUS || '0.5',
    maxOutputBytes: Number(process.env.RUN_MAX_OUTPUT_BYTES) || 64 * 1024,
    // Debug only: keep finished containers (no --rm) so they stay visible in
    // Docker Desktop. Clean up with: docker container prune --filter label=codesync=run
    keepContainers: process.env.RUN_KEEP_CONTAINERS === 'true',
    maxCodeBytes: 100 * 1024,
    maxStdinBytes: 64 * 1024,
  },
};
