const {onCall} = require("firebase-functions/https");
const functions = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const metricsService = require("./metricsService");

const db = getFirestore();

exports.rebuildMetrics = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated", "You must be signed in.");
  }

  const {companyId} = request.data || {};
  if (!companyId) {
    throw new functions.https.HttpsError(
        "invalid-argument", "companyId is required.");
  }

  const callerUid = request.auth.uid;
  const callerEmail = request.auth.token.email || "";

  const companySnap =
    await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) {
    throw new functions.https.HttpsError(
        "not-found", "Company not found.");
  }

  const isOwner =
    companySnap.data().ownerEmail === callerEmail;
  let hasAccess = isOwner;

  if (!hasAccess) {
    const callerSnap =
      await db.collection("users").doc(callerUid).get();
    if (callerSnap.exists) {
      const data = callerSnap.data();
      if (data.companyId === companyId) hasAccess = true;
      /* eslint-disable-next-line max-len */
      else if (data.companies && Array.isArray(data.companies) && data.companies.includes(companyId)) hasAccess = true;
    }
  }

  if (!hasAccess) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have access to this company.");
  }

  const start = Date.now();

  const metrics = await metricsService.rebuild(companyId);

  const counts = await Promise.all([
    db.collection("loans").where("companyId", "==", companyId).count().get(),
    db.collection("customers")
        .where("companyId", "==", companyId).count().get(),
    db.collection("partner_transactions")
        .where("companyId", "==", companyId).count().get(),
    db.collection("expenses").where("companyId", "==", companyId).count().get(),
    db.collection("ledger").where("companyId", "==", companyId).count().get(),
    db.collection("deposits").where("companyId", "==", companyId).count().get(),
  ]);

  const documentsScanned = counts.reduce(
      (s, c) => s + c.data().count, 0);

  const executionTime = Date.now() - start;

  return {
    success: true,
    executionTime,
    documentsScanned,
    metrics,
  };
});
