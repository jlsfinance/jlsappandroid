const {createTrigger} = require("./triggerFactory");

/**
 * Compute all metric deltas from an expense mutation.
 * @param {Object|null} before
 * @param {Object|null} after
 * @return {Object}
 */
function computeDeltas(before, after) {
  const d = {};

  // Create
  if (!before) {
    const amt = Number(after.amount) || 0;
    if (amt === 0) return d;
    d.totalExpenses = amt;
    d.expenseCount = 1;
    d.availableBalance = -amt;
    return d;
  }

  const oldAmt = Number(before.amount) || 0;

  // Delete
  if (!after) {
    if (oldAmt === 0) return d;
    d.totalExpenses = -oldAmt;
    d.expenseCount = -1;
    d.availableBalance = oldAmt;
    return d;
  }

  // Update
  const newAmt = Number(after.amount) || 0;
  if (oldAmt === newAmt) return d;

  const delta = newAmt - oldAmt;
  d.totalExpenses = delta;
  d.availableBalance = -delta;

  return d;
}

/**
 * Cloud Function trigger for expense writes (create/update/delete).
 * Computes metric deltas from before/after and applies them atomically.
 */
exports.onExpenseWrite = createTrigger("expenses", "expenseId", computeDeltas);
