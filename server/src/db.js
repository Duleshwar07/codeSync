/**
 * db.js
 * -----
 * Connects to MongoDB with Mongoose.
 *
 * The app keeps working if MongoDB is down: live editing and running still work,
 * only persistence (saved documents + run history) is skipped. Every DB call
 * checks isDbReady() first instead of hanging on Mongoose's command buffer.
 */
const mongoose = require('mongoose');
const config = require('./config');

// Fail fast instead of queueing queries while disconnected.
mongoose.set('bufferCommands', false);

async function connectDb() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log(`[db] connected to ${config.mongoUri}`);
  } catch (err) {
    console.warn(`[db] could not connect to MongoDB (${err.message}).`);
    console.warn('[db] continuing WITHOUT persistence - rooms and run history will not be saved.');
  }
}

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isDbReady };
