const admin = require("firebase-admin");

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  // 1) Base64 хувилбар (хамгийн найдвартай)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const json = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_B64,
      "base64"
    ).toString("utf8");
    const serviceAccount = JSON.parse(json);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin init (B64)");
    return admin;
  }

  // 2) Raw JSON string хувилбар
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin init (JSON)");
    return admin;
  }

  throw new Error(
    "❌ FIREBASE_SERVICE_ACCOUNT_B64 эсвэл FIREBASE_SERVICE_ACCOUNT .env дээр байх ёстой"
  );
}

module.exports = { initFirebaseAdmin };
