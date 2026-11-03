/**
 * Room model
 * ----------
 * One document per collaborative room.
 *
 * `yState` is the whole Yjs document encoded as a binary update
 * (Y.encodeStateAsUpdate). Loading it back with Y.applyUpdate restores the
 * code exactly as the users left it - this is how rooms survive restarts.
 */
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    language: { type: String, default: 'javascript' },
    yState: { type: Buffer },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);
