/**
 * routes/rooms.js
 * ---------------
 * REST API (all under /api):
 *
 *   GET  /api/languages              list of runnable languages + starter templates
 *   POST /api/rooms                  create a room id
 *   GET  /api/rooms/:roomId          room info (language, who is online)
 *   POST /api/rooms/:roomId/run      run the room's current code + shared stdin  { startedBy }
 *   GET  /api/rooms/:roomId/runs     last 20 runs (history)
 *   GET  /api/rooms/:roomId/runs/:id one run with its full output
 */
const express = require('express');
const crypto = require('crypto');
const Run = require('../models/Run');
const { isDbReady } = require('../db');
const config = require('../config');
const { languages } = require('../runner/languages');
const { startRun, getActiveRun } = require('../runner/runService');
const { getRoomSnapshot } = require('../collab/yjsServer');

const router = express.Router();

const ROOM_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const isValidRoomId = (id) => ROOM_ID_RE.test(id);

router.param('roomId', (req, res, next, roomId) => {
  if (!isValidRoomId(roomId)) return res.status(400).json({ error: 'Invalid room id' });
  next();
});

router.get('/languages', (req, res) => {
  res.json(
    Object.entries(languages).map(([id, l]) => ({ id, label: l.label, template: l.template }))
  );
});

router.post('/rooms', (req, res) => {
  // short, URL-friendly, hard to guess
  const roomId = crypto.randomBytes(6).toString('base64url');
  res.status(201).json({ roomId });
});

router.get('/rooms/:roomId', async (req, res, next) => {
  try {
    const snap = await getRoomSnapshot(req.params.roomId);
    res.json({
      roomId: req.params.roomId,
      exists: Boolean(snap),
      language: snap?.language ?? null,
      online: snap?.online ?? 0,
      activeRun: getActiveRun(req.params.roomId),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:roomId/run', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const startedBy = String(req.body.startedBy || 'anonymous').slice(0, 40);

    // The code AND stdin are read from the shared Yjs document on the server,
    // so what runs is exactly what everybody sees - whoever presses Run.
    const snap = await getRoomSnapshot(roomId);
    if (!snap) return res.status(404).json({ error: 'Room not found - open it in the editor first' });
    const { stdin } = snap;
    if (!snap.code.trim()) return res.status(400).json({ error: 'Nothing to run - the editor is empty' });
    if (Buffer.byteLength(snap.code) > config.run.maxCodeBytes)
      return res.status(413).json({ error: 'Code is too large' });
    if (Buffer.byteLength(stdin) > config.run.maxStdinBytes)
      return res.status(413).json({ error: 'stdin is too large' });

    const info = startRun({ roomId, language: snap.language, code: snap.code, stdin, startedBy });
    res.status(202).json(info);
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:roomId/runs', async (req, res, next) => {
  try {
    if (!isDbReady()) return res.json([]);
    const runs = await Run.find({ roomId: req.params.roomId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('language startedBy exitCode timedOut truncated durationMs createdAt')
      .lean();
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:roomId/runs/:runId', async (req, res, next) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: 'Database unavailable' });
    const run = await Run.findOne({ _id: req.params.runId, roomId: req.params.roomId }).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Run not found' });
    next(err);
  }
});

module.exports = { router, isValidRoomId };
