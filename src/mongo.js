const { MongoClient } = require("mongodb");

// ✅ .env дээр чинь байгаа нэрсийг уншина
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "undes";

let client;
let db;

async function getDB() {
  if (db) return db;

  if (!uri) throw new Error("❌ MONGODB_URI not set in .env");

  client = new MongoClient(uri);
  await client.connect();

  // ⚠️ URI дээр /undes байгаа ч гэсэн dbName-ийг ингэж тогтооно
  db = client.db(dbName);

  console.log("✅ MongoDB connected to DB:", dbName);
  return db;
}

module.exports = { getDB };
