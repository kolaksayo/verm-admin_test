require('dotenv').config();
const { MongoClient } = require('mongodb');

let db;
let client;

async function connect() {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const dbName = process.env.MONGODB_DB || 'vermo-production';
  db = client.db(dbName);
  console.log(`Connected to MongoDB: ${dbName}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected');
  return db;
}

module.exports = { connect, getDb };
