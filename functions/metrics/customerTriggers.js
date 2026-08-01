const {createTrigger} = require("./triggerFactory");

/**
 * Compute all metric deltas from a customer mutation.
 * @param {Object|null} before
 * @param {Object|null} after
 * @return {Object}
 */
function computeDeltas(before, after) {
  const d = {};

  if (!before) {
    d.totalCustomers = 1;
    if (after.status !== "inactive") d.activeCustomers = 1;
    return d;
  }

  if (!after) {
    d.totalCustomers = -1;
    if (before.status !== "inactive") d.activeCustomers = -1;
    return d;
  }

  const wasActive = before.status !== "inactive";
  const isActive = after.status !== "inactive";
  if (wasActive === isActive) return d;

  d.activeCustomers = wasActive ? -1 : 1;
  return d;
}

/**
 * Cloud Function trigger for customer writes (create/update/delete).
 * Computes metric deltas from before/after and applies them atomically.
 */
exports.onCustomerWrite = createTrigger(
    "customers", "customerId", computeDeltas);
