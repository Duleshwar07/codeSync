/**
 * Run model
 * ---------
 * One document per "Run" click: what code was executed, by whom, and what
 * came out. Powers the "History" tab in the UI.
 */
const mongoose = require('mongoose');

const runSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    language: { type: String, required: true },
    code: { type: String, required: true },
    stdin: { type: String, default: '' },
    startedBy: { type: String, default: 'anonymous' },
    // Output as an ordered list of chunks so stdout/stderr interleaving is kept
    output: [{ stream: String, text: String, _id: false }],
    exitCode: { type: Number, default: null },
    timedOut: { type: Boolean, default: false },
    truncated: { type: Boolean, default: false },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Run', runSchema);
