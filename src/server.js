const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// STATIC: public фолдероос HTML/CSS/JS/зургууд үйлчилнэ
app.use(express.static(path.join(__dirname, "..", "public")));

const TREE_FILE = path.join(__dirname, "..", "public", "family-tree.json");

// Test API
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Undes backend working (commonjs)" });
});

// Ургийн мод хадгалах (members массивыг файлд бичнэ)
app.post("/api/tree/save", (req, res) => {
  const payload = req.body || {};
  const json = JSON.stringify(payload, null, 2);

  fs.writeFile(TREE_FILE, json, "utf8", (err) => {
    if (err) {
      console.error("family-tree.json бичихэд алдаа:", err);
      return res.status(500).json({ ok: false, error: "WRITE_ERROR" });
    }
    res.json({ ok: true });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Undes server running on http://localhost:${PORT}`);
});
