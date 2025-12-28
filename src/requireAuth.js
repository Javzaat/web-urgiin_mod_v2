const { initFirebaseAdmin } = require("./firebaseAdmin");

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "NO_TOKEN" });

    const admin = initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);

    // ✅ uid-г middleware дээр суулгаж өгнө
    req.user = { uid: decoded.uid, email: decoded.email || null };
    return next();
  } catch (e) {
    console.error("❌ INVALID_TOKEN:", e.message);
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
}

module.exports = { requireAuth };
