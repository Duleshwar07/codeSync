/**
 * runService.js
 * -------------
 * Orchestrates one "Run" for a room:
 *
 *   1. make sure the room is not already running something
 *   2. broadcast  { type: 'run-start' }           to everyone in the room
 *   3. run the code in Docker, broadcasting       { type: 'output', stream, text }
 *      for every chunk of stdout / stderr
 *   4. broadcast  { type: 'run-end', exitCode, ... }
 *   5. store the run (code + output + result) in MongoDB
 */
const crypto = require('crypto');
const Run = require('../models/Run');
const { isDbReady } = require('../db');
const roomEvents = require('../collab/roomEvents');
const { runInDocker } = require('./dockerRunner');

const activeRuns = new Map(); // roomId -> { runId, startedBy, language, startedAt }

function getActiveRun(roomId) {
  return activeRuns.get(roomId) || null;
}

/**
 * Starts a run and returns immediately with its id. Output is delivered
 * through the room's event WebSocket, not through the HTTP response.
 */
function startRun({ roomId, language, code, stdin, startedBy }) {
  if (activeRuns.has(roomId)) {
    const err = new Error('A run is already in progress in this room');
    err.status = 409;
    throw err;
  }

  const runId = crypto.randomUUID();
  const info = { runId, startedBy, language, startedAt: Date.now() };
  activeRuns.set(roomId, info);
  // stdin is included so every client can show (echo) the input the program got
  roomEvents.broadcast(roomId, { type: 'run-start', ...info, stdin });

  const output = [];
  const onOutput = (stream, text) => {
    // merge consecutive chunks from the same stream to keep the stored doc small
    const last = output[output.length - 1];
    if (last && last.stream === stream) last.text += text;
    else output.push({ stream, text });
    roomEvents.broadcast(roomId, { type: 'output', runId, stream, text });
  };

  runInDocker({ language, code, stdin, onOutput })
    .catch((err) => {
      onOutput('system', `[Runner error: ${err.message}]\n`);
      return { exitCode: -1, timedOut: false, truncated: false, durationMs: Date.now() - info.startedAt };
    })
    .then(async (result) => {
      activeRuns.delete(roomId);
      roomEvents.broadcast(roomId, { type: 'run-end', runId, ...result });

      if (isDbReady()) {
        try {
          await Run.create({ roomId, language, code, stdin, startedBy, output, ...result });
          roomEvents.broadcast(roomId, { type: 'history-updated' });
        } catch (err) {
          console.error('[run] failed to save run:', err.message);
        }
      }
    });

  return info;
}

module.exports = { startRun, getActiveRun };
