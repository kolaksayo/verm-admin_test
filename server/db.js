require('dotenv').config();
const { MongoClient } = require('mongodb');

let db;
let client;
let writeDb;
let writeClient;

async function connect() {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const dbName = process.env.MONGODB_DB || 'vermo-production';
  db = client.db(dbName);
  console.log(`Connected to MongoDB: ${dbName}`);
  return db;
}

// Separate write connection — backed by a dedicated user with readWrite role.
// Falls back to the main connection if MONGODB_WRITE_URI is not set.
async function connectWrite() {
  const uri = process.env.MONGODB_WRITE_URI;
  if (!uri) return; // dev fallback: getWriteDb() will return getDb()
  writeClient = new MongoClient(uri);
  await writeClient.connect();
  const dbName = process.env.MONGODB_DB || 'vermo-production';
  writeDb = writeClient.db(dbName);
  console.log(`Connected to MongoDB (write user): ${dbName}`);
}

function getDb() {
  if (!db) throw new Error('Database not connected');
  return db;
}

function getWriteDb() {
  return writeDb || getDb();
}

module.exports = { connect, connectWrite, getDb, getWriteDb };
