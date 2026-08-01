const {onDocumentWritten} = require("firebase-functions/firestore");
const {tryAcquire, tryRelease} = require("./dedup");
const metricsService = require("./metricsService");

/**
 * Factory for metric triggers.
 * @param {string} collectionName
 * @param {string} paramName
 * @param {function(Object|null, Object|null): Object} computeDeltas
 * @return {import('firebase-functions/v2/firestore').DocumentBuilder}
 */
function createTrigger(collectionName, paramName, computeDeltas) {
  const eventPrefix = collectionName.split("_")[0].replace(/s$/, "");
  const path = `${collectionName}/{${paramName}}`;

  return onDocumentWritten(path, async (event) => {
    const before = event.data.before ? event.data.before.data() : null;
    const after = event.data.after ? event.data.after.data() : null;
    const entityId = event.params[paramName];
    const companyId = (before || after || {}).companyId;
    if (!companyId) return;

    const eventKey = `${eventPrefix}:${event.id}`;
    const acquired = await tryAcquire(eventKey, companyId);
    if (!acquired) return;

    const deltas = computeDeltas(before, after);
    const fieldNames = Object.keys(deltas);
    if (fieldNames.length === 0) return;

    try {
      await metricsService.applyDelta(companyId, deltas);
      console.log(JSON.stringify({
        event: `${eventPrefix}Trigger`,
        eventId: event.id,
        companyId,
        [paramName]: entityId,
        fields: fieldNames,
        status: "ok",
      }));
    } catch (err) {
      console.error(JSON.stringify({
        event: `${eventPrefix}Trigger`,
        eventId: event.id,
        companyId,
        [paramName]: entityId,
        fields: fieldNames,
        status: "error",
        error: err.message,
      }));
      await tryRelease(eventKey);
      throw err;
    }
  });
}

module.exports = {createTrigger};
