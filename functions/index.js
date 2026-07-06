const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const bcrypt = require("bcryptjs");

initializeApp();
const db = getFirestore();
const auth = getAuth();

const CALL_OPTIONS = { cors: true };

function slug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

exports.login = onCall(CALL_OPTIONS, async (request) => {
  const { name, pin } = request.data || {};
  if (!name || !pin) throw new HttpsError("invalid-argument", "Name and PIN are required.");
  const key = slug(name);
  if (key === "admin") {
    const adminDoc = await db.collection("members").doc("admin").get();
    let pinHash;
    if (!adminDoc.exists) {
      pinHash = bcrypt.hashSync("admin1234", 10);
      await db.collection("members").doc("admin").set({ name: "Admin", group: null, isAdmin: true, pinHash });
    } else {
      pinHash = adminDoc.data().pinHash;
    }
    if (!bcrypt.compareSync(pin, pinHash)) throw new HttpsError("permission-denied", "Wrong PIN.");
    const token = await auth.createCustomToken("admin", { isAdmin: true, group: null, name: "Admin" });
    return { token, name: "Admin", group: null, isAdmin: true };
  }
  const doc = await db.collection("members").doc(key).get();
  if (!doc.exists) throw new HttpsError("not-found", "Name not found. Ask your admin to add you.");
  const member = doc.data();
  if (!bcrypt.compareSync(pin, member.pinHash)) throw new HttpsError("permission-denied", "Wrong PIN. Try again.");
  const token = await auth.createCustomToken(key, { isAdmin: !!member.isAdmin, group: member.group || null, name: member.name });
  return { token, name: member.name, group: member.group || null, isAdmin: !!member.isAdmin };
});

exports.addMember = onCall(CALL_OPTIONS, async (request) => {
  if (!request.auth || !request.auth.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { name, group, pin } = request.data || {};
  if (!name || !group || !pin) throw new HttpsError("invalid-argument", "Name, group, and PIN are required.");
  const key = slug(name);
  const pinHash = bcrypt.hashSync(pin, 10);
  await db.collection("members").doc(key).set({ name: name.trim(), group, isAdmin: false, pinHash });
  return { ok: true };
});

exports.removeMember = onCall(CALL_OPTIONS, async (request) => {
  if (!request.auth || !request.auth.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { memberId } = request.data || {};
  if (!memberId) throw new HttpsError("invalid-argument", "memberId is required.");
  if (memberId === "admin") throw new HttpsError("invalid-argument", "Cannot remove the admin account.");
  await db.collection("members").doc(memberId).delete();
  return { ok: true };
});

exports.changePin = onCall(CALL_OPTIONS, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const { newPin } = request.data || {};
  if (!newPin || newPin.length < 4) throw new HttpsError("invalid-argument", "PIN must be at least 4 characters.");
  const pinHash = bcrypt.hashSync(newPin, 10);
  await db.collection("members").doc(request.auth.uid).update({ pinHash });
  return { ok: true };
});
