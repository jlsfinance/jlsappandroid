const {createTrigger} = require("./triggerFactory");

/**
 * Sum all Paid installment amounts for a deposit.
 * @param {Object} deposit
 * @return {number}
 */
function sumCollections(deposit) {
  return (deposit.depositSchedule || [])
      .filter((i) => i.status === "Paid")
      .reduce((s, i) => s + (Number(i.amountPaid) || Number(i.amount) || 0), 0);
}

/**
 * Compute all metric deltas from a deposit mutation.
 * @param {Object|null} before
 * @param {Object|null} after
 * @return {Object}
 */
function computeDeltas(before, after) {
  const d = {};

  // Create
  if (!before) {
    const principal = Number(after.principal) || 0;
    d.totalDepositAmount = principal;
    if (after.status === "Active") d.activeDeposits = 1;
    return d;
  }

  // Delete
  if (!after) {
    const principal = Number(before.principal) || 0;
    d.totalDepositAmount = -principal;
    const collections = sumCollections(before);
    if (collections !== 0) d.totalDepositCollections = -collections;
    if (before.status === "Active") {
      d.activeDeposits = -1;
      if (collections !== 0) d.availableBalance = -collections;
    } else if (before.status === "Matured") {
      const payout = Number(before.maturityAmount) || 0;
      if (payout !== 0) d.availableBalance = payout;
    } else if (before.status === "Foreclosed") {
      const fc = before.foreclosureDetails;
      const payout = fc ? (Number(fc.totalPaid) || 0) : 0;
      if (payout !== 0) d.availableBalance = payout;
    }
    return d;
  }

  // Update
  const oldStatus = before.status;
  const newStatus = after.status;

  if (oldStatus !== "Active" && newStatus === "Active") {
    d.activeDeposits = 1;
  }
  if (oldStatus === "Active" && newStatus !== "Active") {
    d.activeDeposits = -1;
    if (newStatus === "Matured") {
      const payout = Number(after.maturityAmount) || 0;
      if (payout !== 0) d.availableBalance = -payout;
    } else if (newStatus === "Foreclosed") {
      const fc = after.foreclosureDetails;
      if (fc) {
        const payout = Number(fc.totalPaid) || 0;
        if (payout !== 0) d.availableBalance = -payout;
      }
    }
  }

  // Diff depositSchedule by index position
  const beforeSchedule = before.depositSchedule || [];
  const afterSchedule = after.depositSchedule || [];
  const maxLen = Math.max(beforeSchedule.length, afterSchedule.length);
  let collDelta = 0;
  let balDelta = 0;
  for (let i = 0; i < maxLen; i++) {
    const old = beforeSchedule[i] || null;
    const cur = afterSchedule[i] || null;
    if (old === null) {
      if (cur.status === "Paid") {
        const amt = Number(cur.amountPaid) || Number(cur.amount) || 0;
        collDelta += amt;
        balDelta += amt;
      }
    } else if (cur === null) {
      if (old.status === "Paid") {
        const amt = Number(old.amountPaid) || Number(old.amount) || 0;
        collDelta -= amt;
        balDelta -= amt;
      }
    } else if (old.status !== cur.status) {
      if (old.status === "Pending" && cur.status === "Paid") {
        const amt = Number(cur.amountPaid) || Number(cur.amount) || 0;
        collDelta += amt;
        balDelta += amt;
      } else if (old.status === "Paid" && cur.status === "Pending") {
        const amt = Number(old.amountPaid) || Number(old.amount) || 0;
        collDelta -= amt;
        balDelta -= amt;
      }
    } else if (old.status === "Paid" && cur.status === "Paid") {
      const oldAmt = Number(old.amountPaid) || Number(old.amount) || 0;
      const curAmt = Number(cur.amountPaid) || Number(cur.amount) || 0;
      const diff = curAmt - oldAmt;
      if (diff !== 0) {
        collDelta += diff;
        balDelta += diff;
      }
    }
  }

  if (collDelta !== 0) d.totalDepositCollections = collDelta;
  if (balDelta !== 0) {
    if ("availableBalance" in d) d.availableBalance += balDelta;
    else d.availableBalance = balDelta;
  }

  // Foreclosure added (skip if status transition already handled it)
  const statusAlreadyHandledForeclosure =
    oldStatus === "Active" && newStatus === "Foreclosed";
  const beforeFc = before.foreclosureDetails;
  const afterFc = after.foreclosureDetails;
  if (!beforeFc && afterFc && afterFc.totalPaid &&
      !statusAlreadyHandledForeclosure) {
    const payout = Number(afterFc.totalPaid) || 0;
    if (payout !== 0) {
      if ("availableBalance" in d) d.availableBalance -= payout;
      else d.availableBalance = -payout;
    }
  }

  return d;
}

exports.onDepositWrite = createTrigger("deposits", "depositId", computeDeltas);
