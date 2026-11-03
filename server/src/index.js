/**
 * index.js - server entry point
 * -----------------------------
 * One Node process, one port (default 4000), three kinds of traffic:
 *
 *   HTTP  /api/*            REST API (Express)            -> routes/rooms.js
 *   WS    /yjs/<roomId>     Yjs document sync              -> collab/yjsServer.js
 *   WS    /events/<roomId>  run start / output / end       -> collab/roomEvents.js
 *
 * In production (`npm run build` in client/) it also serves the built React
 * app from client/dist, so the whole thing runs on a single port.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const config = require('./config');
const { connectDb, isDbReady } = require('./db');
const { router: apiRouter, isValidRoomId } = require('./routes/rooms');
const { handleYjsConnection } = require('./collab/yjsServer');
const roomEvents = require('./collab/roomEvents');
const { getActiveRun } = require('./runner/runService');
const { checkDocker, logDockerStatus } = require('./runner/dockerCheck');

// Find `docker` (fixes PATH if needed) and report whether the engine is up.
logDockerStatus();

/**
 * Is this browser origin allowed? (CLIENT_ORIGIN list, "*" wildcards allowed.)
 * Requests without an Origin header (curl, server-to-server, same-origin GETs)
 * are allowed - CORS/origin checks only matter for browsers on other sites.
 */
const originPatterns = config.clientOrigins.map(
  (o) => new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]*')}$`)
);
function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  if (host && new URL(origin).host === host) return true; // same-origin (single-server deploy)
  return originPatterns.some((re) => re.test(origin));
}

const app = express();
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mongo: isDbReady(), docker: checkDocker() });
});
app.use('/api', apiRouter);

// Serve the production React build if it exists.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Generic error handler
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);

// Two WebSocket servers share the HTTP server; we route by URL path.
const yjsWss = new WebSocketServer({ noServer: true });
const eventsWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const [, channel, roomId] = pathname.split('/'); // "/yjs/abc" -> ["", "yjs", "abc"]

  if (!roomId || !isValidRoomId(roomId)) return socket.destroy();

  // CORS does not apply to WebSockets, so check the Origin ourselves: only our
  // own frontend(s) may connect (stops other websites joining rooms via your browser).
  let allowed = false;
  try {
    allowed = isAllowedOrigin(req.headers.origin, req.headers.host);
  } catch {
    allowed = false; // malformed Origin header
  }
  if (!allowed) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    return socket.destroy();
  }

  if (channel === 'yjs') {
    yjsWss.handleUpgrade(req, socket, head, (ws) => handleYjsConnection(ws, req, roomId));
  } else if (channel === 'events') {
    eventsWss.handleUpgrade(req, socket, head, (ws) => {
      roomEvents.join(roomId, ws);
      // tell a late joiner whether a run is already going on
      roomEvents.send(ws, { type: 'status', activeRun: getActiveRun(roomId) });
    });
  } else {
    socket.destroy();
  }
});

connectDb().then(() => {
  server.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
});
