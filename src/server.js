const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// STATIC: public фолдероос HTML/CSS/JS/зургууд үйлчилнэ
app.use(express.static(path.join(__dirname, "..", "public")));

// Test API
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Undes backend working (commonjs)" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Undes server running on http://localhost:${PORT}`);
});
