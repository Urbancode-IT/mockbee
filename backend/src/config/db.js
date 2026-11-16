/**
 * Shared MongoDB layer — prepai database
 */
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
let client = null;

function mongoTargetLabel() {
  try {
    return String(MONGO_URI).replace(/\/\/([^@/]+)@/, '//***@');
  } catch {
    return '(unset)';
  }
}

async function getDb() {
  if (!client) {
    // family: 4 avoids some Windows IPv6/Atlas TLS handshake failures
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000, family: 4 });
    await client.connect();
  }
  return client.db('prepai');
}

async function pingMongo() {
  const database = await getDb();
  await database.command({ ping: 1 });
  return { ok: true, target: mongoTargetLabel() };
}

async function col(name) {
  const db = await getDb();
  return db.collection(name);
}

function now() {
  return new Date().toISOString();
}

async function upsertUser(email, name = '', role = 'PUBLIC', createdBy = null) {
  const users = await col('users');
  await users.updateOne(
    { _id: email },
    {
      $setOnInsert: {
        _id: email,
        name,
        role,
        created_by: createdBy,
        created_at: now(),
      },
      $set: { last_seen: now() },
    },
    { upsert: true }
  );
  return users.findOne({ _id: email });
}

async function getUser(email) {
  return (await col('users')).findOne({ _id: email });
}

module.exports = {
  getDb,
  col,
  now,
  upsertUser,
  getUser,
  pingMongo,
  mongoTargetLabel,
};
