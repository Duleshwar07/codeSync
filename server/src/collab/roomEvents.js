/**
 * roomEvents.js
 * -------------
 * A tiny pub/sub hub over WebSockets, separate from Yjs.
 *
 * Yjs syncs the *document* (code + language). This hub carries *events* that
 * are not part of the document: "a run started", "here is a chunk of stdout",
 * "the run finished". Every browser in a room connects to /events/<roomId>,
 * so when anyone presses Run, everybody sees the output stream in live.
 */
const rooms = new Map(); // roomId -> Set<WebSocket>

function join(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const clients = rooms.get(roomId);
  clients.add(ws);

  ws.on('close', () => {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(roomId);
  });
}

function send(ws, message) {
  if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(message));
}

function broadcast(roomId, message) {
  const clients = rooms.get(roomId);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

module.exports = { join, send, broadcast };
