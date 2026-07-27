const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const db = getFirestore();

const DEDUP_COLLECTION = "_metricsDedup";
const TTL_DAYS = 7;

/**
 * Atomically acquire a deduplication lock for a given event.
 * @param {string} eventKey Unique event identifier
 * @param {string} companyId Company scoping the event
 * @return {Promise<boolean>} true if acquired, false if duplicate
 */
async function tryAcquire(eventKey, companyId) {
  const ref = db.collection(DEDUP_COLLECTION).doc(eventKey);
  try {
    await ref.create({
      companyId,
      createdAt: FieldValue.serverTimestamp(),
      ttl: new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
    });
    return true;
  } catch (err) {
    if (err.code === 6) return false;
    throw err;
  }
}

/**
 * Best-effort release a deduplication lock.
 * Used when applyDelta() fails after acquiring the lock,
 * so retries can re-process the event.
 * @param {string} eventKey
 * @return {Promise<void>}
 */
async function tryRelease(eventKey) {
  try {
    await db.collection(DEDUP_COLLECTION).doc(eventKey).delete();
  } catch (err) {
    console.error(
        "dedup release failed",
        JSON.stringify({eventKey, error: err.message}),
    );
  }
}

module.exports = {tryAcquire, tryRelease};
