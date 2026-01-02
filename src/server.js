require("dotenv").config();

const { getDB } = require("./mongo");
const { requireAuth } = require("./requireAuth");

const express = require("express");
const cors = require("cors");
const path = require("path");
const uploadRoute = require("./routes/upload");

const app = express();

//  Mongo connection test (startup)
getDB().catch((err) => {
  console.error("❌ MongoDB connection failed:", err.message);
});

const pool = require("./db"); // ✅ ганц DB connection

/* ================== MIDDLEWARE ================== */
app.use(cors());
app.use(express.json());
app.use("/api/upload", uploadRoute);

/* ================== STATIC FILES ================== */
app.use(express.static(path.join(__dirname, "..", "public")));

/* ================== HEALTH ================== */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Undes backend running" });
});

/* ================== SAVE TREE (Mongo + Auth) ================== */
app.post("/api/tree/save", requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const members = req.body?.members;

  if (!Array.isArray(members)) {
    return res.status(400).json({ ok: false, error: "INVALID_DATA" });
  }

  try {
    const db = await getDB();
    await db.collection("trees").updateOne(
      { uid },
      { $set: { uid, members, updatedAt: new Date(), version: 1 } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("SAVE TREE ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ================== LOAD TREE (Mongo + Auth) ================== */
app.get("/api/tree/load", requireAuth, async (req, res) => {
  const uid = req.user.uid;

  try {
    const db = await getDB();
    const doc = await db.collection("trees").findOne({ uid });
    res.json({ ok: true, members: doc?.members || [] });
  } catch (err) {
    console.error("LOAD TREE ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


/* ================== START ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Undes server running on http://localhost:${PORT}`);
});
