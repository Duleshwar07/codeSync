/**
 * Vite dev server (port 5180).
 * The proxy forwards API calls and both WebSocket channels to the Express
 * server on port 4000, so the browser only ever talks to one origin.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Own port + strictPort: fail loudly if it's taken, instead of silently
    // sharing a port with another dev server (5173 is Vite's default for every project).
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': API,
      '/yjs': { target: API, ws: true },
      '/events': { target: API, ws: true },
    },
  },
});
