/**
 * yjsServer.js
 * ------------
 * The real-time collaboration backend.
 *
 * We reuse y-websocket's server helper (`setupWSConnection`). It keeps one
 * in-memory Y.Doc per room and relays every edit between the browsers
 * connected to /yjs/<roomId>. Conflicts are resolved automatically by Yjs (CRDT).
 *
 * The shared document contains:
 *   ydoc.getText('code')            -> the code shown in Monaco
 *   ydoc.getText('stdin')           -> the shared stdin box
 *   ydoc.getMap('meta').language    -> the selected language
 *
 * Persistence to MongoDB:
 *   bindState  - called when a room's doc is first created in memory:
 *                load the saved state from Mongo (or seed a starter template),
 *                then save (debounced) on every change.
 *   writeState - called when the last user leaves: final save, then the
 *                doc is removed from memory.
 */
const Y = require('yjs');
const { setupWSConnection, setPersistence, docs } = require('y-websocket/bin/utils');
const Room = require('../models/Room');
const { isDbReady } = require('../db');
const { languages, DEFAULT_LANGUAGE } = require('../runner/languages');

const SAVE_DEBOUNCE_MS = 2000;
const saveTimers = new Map(); // roomId -> timeout

/** Put starter code into an empty room. Only the server seeds, so text is never duplicated. */
function seedIfEmpty(ydoc) {
  const meta = ydoc.getMap('meta');
  const text = ydoc.getText('code');
  if (!meta.has('language') && text.length === 0) {
    ydoc.transact(() => {
      meta.set('language', DEFAULT_LANGUAGE);
      text.insert(0, languages[DEFAULT_LANGUAGE].template);
    });
  }
}

async function saveDoc(roomId, ydoc) {
  if (!isDbReady()) return;
  try {
    await Room.updateOne(
      { roomId },
      {
        $set: {
          yState: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
          language: ydoc.getMap('meta').get('language') || DEFAULT_LANGUAGE,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[yjs] failed to save room ${roomId}:`, err.message);
  }
}

setPersistence({
  provider: null,

  bindState: async (roomId, ydoc) => {
    if (isDbReady()) {
      try {
        const room = await Room.findOne({ roomId });
        if (room?.yState) Y.applyUpdate(ydoc, new Uint8Array(room.yState));
      } catch (err) {
        console.error(`[yjs] failed to load room ${roomId}:`, err.message);
      }
    }
    seedIfEmpty(ydoc);

    ydoc.on('update', () => {
      clearTimeout(saveTimers.get(roomId));
      saveTimers.set(roomId, setTimeout(() => saveDoc(roomId, ydoc), SAVE_DEBOUNCE_MS));
    });
  },

  writeState: async (roomId, ydoc) => {
    clearTimeout(saveTimers.get(roomId));
    saveTimers.delete(roomId);
    await saveDoc(roomId, ydoc);
  },
});

/** Called by index.js for every WebSocket upgrade on /yjs/<roomId>. */
function handleYjsConnection(ws, req, roomId) {
  setupWSConnection(ws, req, { docName: roomId, gc: true });
}

/**
 * Read the current code + language of a room - used by the Run endpoint.
 * The live in-memory doc is the source of truth; if nobody is connected we
 * fall back to the copy saved in MongoDB.
 */
async function getRoomSnapshot(roomId) {
  let ydoc = docs.get(roomId);
  if (!ydoc) {
    if (!isDbReady()) return null;
    const room = await Room.findOne({ roomId });
    if (!room?.yState) return null;
    ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(room.yState));
  }
  return {
    code: ydoc.getText('code').toString(),
    stdin: ydoc.getText('stdin').toString(), // the shared stdin box
    language: ydoc.getMap('meta').get('language') || DEFAULT_LANGUAGE,
    online: docs.get(roomId)?.conns.size || 0,
  };
}

module.exports = { handleYjsConnection, getRoomSnapshot };
