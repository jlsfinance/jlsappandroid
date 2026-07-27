const {createTrigger} = require("./triggerFactory");

/**
 * Return sub-entries from a ledger document.
 * @param {Object|null} data
 * @return {Array}
 */
function getSubEntries(data) {
  if (!data) return [];
  return Array.isArray(data.entries) ? data.entries : [data];
}

/**
 * Compute metric deltas for a single sub-entry.
 * @param {Object|null} sub
 * @param {number} sign +1 for create, -1 for delete
 * @return {{creditDelta: number, debitDelta: number, balanceDelta: number}}
 */
function subEntryDelta(sub, sign) {
  const r = {creditDelta: 0, debitDelta: 0, balanceDelta: 0};
  if (!sub || sub.account !== "Cash / Bank") return r;
  const amt = Number(sub.amount) || 0;
  if (amt <= 0) return r;
  if (sub.type === "Credit") {
    r.creditDelta = sign * amt;
  } else if (sub.type === "Debit") {
    r.debitDelta = sign * amt;
  }
  if (!sub.loanId) {
    r.balanceDelta = sub.type === "Credit" ? sign * amt : -sign * amt;
  }
  return r;
}

/**
 * Accumulate sub-entry deltas into the result object.
 * @param {Object} d
 * @param {{creditDelta: number, debitDelta: number,
 *   balanceDelta: number}} delta
 */
function accum(d, delta) {
  if (delta.creditDelta !== 0) {
    d.totalLedgerCashCredits =
      (d.totalLedgerCashCredits || 0) + delta.creditDelta;
  }
  if (delta.debitDelta !== 0) {
    d.totalLedgerCashDebits =
      (d.totalLedgerCashDebits || 0) + delta.debitDelta;
  }
  if (delta.balanceDelta !== 0) {
    d.availableBalance = (d.availableBalance || 0) + delta.balanceDelta;
  }
}

/**
 * Compute all metric deltas from a ledger mutation.
 * @param {Object|null} before
 * @param {Object|null} after
 * @return {Object}
 */
function computeDeltas(before, after) {
  const d = {};

  // Create
  if (!before) {
    getSubEntries(after).forEach((sub) => accum(d, subEntryDelta(sub, 1)));
    return d;
  }

  // Delete
  if (!after) {
    getSubEntries(before).forEach((sub) => accum(d, subEntryDelta(sub, -1)));
    return d;
  }

  // Update: diff entries by array index
  const beforeSubs = getSubEntries(before);
  const afterSubs = getSubEntries(after);
  const maxLen = Math.max(beforeSubs.length, afterSubs.length);

  for (let i = 0; i < maxLen; i++) {
    const oldSub = beforeSubs[i] || null;
    const curSub = afterSubs[i] || null;

    if (oldSub === null) {
      accum(d, subEntryDelta(curSub, 1));
    } else if (curSub === null) {
      accum(d, subEntryDelta(oldSub, -1));
    } else {
      const oldDelta = subEntryDelta(oldSub, -1);
      const curDelta = subEntryDelta(curSub, 1);
      accum(d, {
        creditDelta: oldDelta.creditDelta + curDelta.creditDelta,
        debitDelta: oldDelta.debitDelta + curDelta.debitDelta,
        balanceDelta: oldDelta.balanceDelta + curDelta.balanceDelta,
      });
    }
  }

  return d;
}

/**
 * Cloud Function trigger for ledger writes (create/update/delete).
 * Computes metric deltas from before/after and applies them atomically.
 */
exports.onLedgerWrite = createTrigger("ledger", "ledgerId", computeDeltas);
