require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const pool = require("./db"); // ✅ ганц DB connection

const app = express();

/* ================== MIDDLEWARE ================== */
app.use(cors());
app.use(express.json());

/* ================== STATIC FILES ================== */
app.use(express.static(path.join(__dirname, "..", "public")));

/* ================== HEALTH ================== */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Undes backend running" });
});

/* ================== SAVE TREE ================== */
app.post("/api/tree/save", async (req, res) => {
  const firebaseUid = req.headers["x-user-uid"];
  const members = req.body.members;

  if (!firebaseUid) {
    return res.status(401).json({ ok: false, error: "NO_UID" });
  }

  if (!Array.isArray(members)) {
    return res.status(400).json({ ok: false, error: "INVALID_DATA" });
  }

  try {
    /* 1. user upsert */
    const userRes = await pool.query(
      `
      INSERT INTO users (firebase_uid)
      VALUES ($1)
      ON CONFLICT (firebase_uid)
      DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid
      RETURNING id
      `,
      [firebaseUid]
    );

    const userId = userRes.rows[0].id;

    /* 2. tree upsert */
    await pool.query(
      `
      INSERT INTO family_trees (user_id, data)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = NOW()
      `,
      [userId, members]
    );

    res.json({ ok: true });
  } catch (err) {
      console.error("SAVE TREE ERROR:");
      console.error(err.message);
      console.error(err.stack);

      res.status(500).json({
        ok: false,
        error: err.message
      });
    }

});

/* ================== LOAD TREE ================== */
app.get("/api/tree/load", async (req, res) => {
  const firebaseUid = req.headers["x-user-uid"];

  if (!firebaseUid) {
    return res.status(401).json({ ok: false, error: "NO_UID" });
  }

  try {
    const userRes = await pool.query(
      "SELECT id FROM users WHERE firebase_uid = $1",
      [firebaseUid]
    );

    if (userRes.rows.length === 0) {
      return res.json({ ok: true, members: [] });
    }

    const userId = userRes.rows[0].id;

    const treeRes = await pool.query(
      "SELECT data FROM family_trees WHERE user_id = $1",
      [userId]
    );

    if (treeRes.rows.length === 0) {
      return res.json({ ok: true, members: [] });
    }

    res.json({
      ok: true,
      members: treeRes.rows[0].data,
    });
  } catch (err) {
    console.error("LOAD TREE ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================== START ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Undes server running on http://localhost:${PORT}`);
});
