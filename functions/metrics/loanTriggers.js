const {createTrigger} = require("./triggerFactory");

const DISBURSED_STATUSES = ["Disbursed", "Active", "Completed", "Overdue"];
const ACTIVE_STATUSES = ["Disbursed", "Active", "Overdue"];

/**
 * @param {string} status
 * @return {boolean}
 */
function isDisbursed(status) {
  return DISBURSED_STATUSES.includes(status);
}

/**
 * @param {string} status
 * @return {boolean}
 */
function isActive(status) {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Sum of all Paid EMI amounts.
 * @param {Array} schedule
 * @return {number}
 */
function sumPaid(schedule) {
  return (schedule || [])
      .filter((e) => e.status === "Paid")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

/**
 * Calculate outstanding balance for a loan.
 * @param {Object} loan
 * @return {number}
 */
function calcOutstanding(loan) {
  if (!loan || !isActive(loan.status)) return 0;
  const emi = Number(loan.emi) || 0;
  const tenure = Number(loan.tenure) || 1;
  const paid = sumPaid(loan.repaymentSchedule);
  return Math.max(0, emi * tenure - paid);
}

/**
 * Sum of all Pending EMI amounts.
 * @param {Array} schedule
 * @return {number}
 */
function sumPending(schedule) {
  return (schedule || [])
      .filter((e) => e.status === "Pending")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

/**
 * Build a Map keyed by field value.
 * @param {Array} arr
 * @param {string} field
 * @return {Map}
 */
function keyBy(arr, field) {
  const map = new Map();
  (arr || []).forEach((item) => map.set(item[field], item));
  return map;
}

/**
 * Diff two repaymentSchedule arrays by emiNumber.
 * Returns deltas for totalCollections, pendingCollections,
 * availableBalance.
 * @param {Array} before
 * @param {Array} after
 * @return {Object}
 */
function diffRepaymentSchedule(before, after) {
  const beforeMap = keyBy(before, "emiNumber");
  const afterMap = keyBy(after, "emiNumber");
  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  let collDelta = 0;
  let pendDelta = 0;
  let balDelta = 0;

  for (const key of allKeys) {
    const old = beforeMap.get(key) || null;
    const cur = afterMap.get(key) || null;

    if (old === null) {
      const amt = Number(cur.amount) || 0;
      if (cur.status === "Paid") {
        collDelta += amt; balDelta += amt;
      }
      if (cur.status === "Pending") pendDelta += amt;
    } else if (cur === null) {
      const amt = Number(old.amount) || 0;
      if (old.status === "Paid") {
        collDelta -= amt; balDelta -= amt;
      }
      if (old.status === "Pending") pendDelta -= amt;
    } else if (old.status !== cur.status) {
      const amt = Number(cur.amount) || 0;
      const oldAmt = Number(old.amount) || 0;
      if (old.status === "Pending" && cur.status === "Paid") {
        collDelta += amt; pendDelta -= oldAmt; balDelta += amt;
      } else if (old.status === "Paid" && cur.status === "Pending") {
        collDelta -= oldAmt; pendDelta += amt; balDelta -= oldAmt;
      }
    } else if (old.amount !== cur.amount) {
      const diff = (Number(cur.amount) || 0) - (Number(old.amount) || 0);
      if (cur.status === "Paid") {
        collDelta += diff; balDelta += diff;
      }
      if (cur.status === "Pending") pendDelta += diff;
    }
  }

  return {collDelta, pendDelta, balDelta};
}

/**
 * Diff two topUpHistory arrays by date.
 * Returns deltas for totalTopupCount, totalTopupAmount,
 * availableBalance.
 * @param {Array} before
 * @param {Array} after
 * @return {Object}
 */
function diffTopups(before, after) {
  const beforeMap = keyBy(before, "date");
  const afterMap = keyBy(after, "date");
  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  let countDelta = 0;
  let amtDelta = 0;
  let balDelta = 0;

  for (const date of allKeys) {
    const old = beforeMap.get(date) || null;
    const cur = afterMap.get(date) || null;

    const oldAmt = Number((old && (old.topUpAmount || old.amount)) || 0);
    const curAmt = Number((cur && (cur.topUpAmount || cur.amount)) || 0);

    if (old === null) {
      countDelta++;
      amtDelta += curAmt;
      balDelta -= curAmt;
      if (cur.processingFee) balDelta += Number(cur.processingFee) || 0;
    } else if (cur === null) {
      countDelta--;
      amtDelta -= oldAmt;
      balDelta += oldAmt;
      if (old.processingFee) balDelta -= Number(old.processingFee) || 0;
    } else {
      const diff = curAmt - oldAmt;
      amtDelta += diff;
      balDelta -= diff;
    }
  }

  return {countDelta, amtDelta, balDelta};
}

/**
 * Compute all metric deltas from a loan mutation.
 * @param {Object|null} before
 * @param {Object|null} after
 * @return {Object}
 */
function computeDeltas(before, after) {
  const d = {};

  // ── Create ───────────────────────────────────────
  if (!before) {
    if (!isDisbursed(after.status)) return d;
    d.totalDisbursedLoans = 1;
    d.totalDisbursedAmount = Number(after.amount) || 0;
    d.totalProcessingFees = Number(after.processingFee) || 0;
    d.netDisbursed = d.totalDisbursedAmount - d.totalProcessingFees;
    if (isActive(after.status)) d.activeLoans = 1;
    if (after.status === "Completed") d.closedLoans = 1;
    if (after.status === "Overdue") d.overdueLoans = 1;
    d.totalOutstanding = calcOutstanding(after);
    d.pendingCollections = sumPending(after.repaymentSchedule);
    d.totalTopupCount = (after.topUpHistory || []).length;
    d.totalTopupAmount = (after.topUpHistory || [])
        .reduce((s, t) => s + (Number(t.topUpAmount || t.amount) || 0), 0);
    d.availableBalance = -(d.totalDisbursedAmount - d.totalProcessingFees);
    return d;
  }

  // ── Delete ───────────────────────────────────────
  if (!after) {
    if (!isDisbursed(before.status)) return d;
    d.totalDisbursedLoans = -1;
    d.totalDisbursedAmount = -(Number(before.amount) || 0);
    d.totalProcessingFees = -(Number(before.processingFee) || 0);
    const amt = Number(before.amount) || 0;
    const fee = Number(before.processingFee) || 0;
    d.netDisbursed = -(amt - fee);
    if (isActive(before.status)) d.activeLoans = -1;
    if (before.status === "Completed") d.closedLoans = -1;
    if (before.status === "Overdue") d.overdueLoans = -1;
    d.totalOutstanding = -calcOutstanding(before);
    const paid = sumPaid(before.repaymentSchedule);
    d.totalCollections = -paid;
    d.pendingCollections = -sumPending(before.repaymentSchedule);
    const topupHistory = before.topUpHistory || [];
    const totalTopupAmt = topupHistory
        .reduce((s, t) => s + (Number(t.topUpAmount || t.amount) || 0), 0);
    const totalTopupFees = topupHistory
        .reduce((s, t) => s + (Number(t.processingFee) || 0), 0);
    d.totalTopupCount = -topupHistory.length;
    d.totalTopupAmount = -totalTopupAmt;
    d.availableBalance = amt - fee - paid + totalTopupAmt - totalTopupFees;
    const fc = before.foreclosureDetails;
    if (fc && fc.totalPaid) {
      d.foreclosureCollections = -(Number(fc.totalPaid) || 0);
      d.totalForeclosures = -1;
    }
    return d;
  }

  // ── Update ───────────────────────────────────────
  const wasDisbursed = isDisbursed(before.status);
  const nowDisbursed = isDisbursed(after.status);

  if (wasDisbursed !== nowDisbursed) {
    d.totalDisbursedLoans = nowDisbursed ? 1 : -1;
  }
  if (isActive(before.status) !== isActive(after.status)) {
    d.activeLoans = isActive(after.status) ? 1 : -1;
  }
  if (before.status === "Completed" !== (after.status === "Completed")) {
    d.closedLoans = after.status === "Completed" ? 1 : -1;
  }
  if (before.status === "Overdue" !== (after.status === "Overdue")) {
    d.overdueLoans = after.status === "Overdue" ? 1 : -1;
  }

  if (Number(before.amount) !== Number(after.amount)) {
    const delta = (Number(after.amount) || 0) - (Number(before.amount) || 0);
    if (wasDisbursed && nowDisbursed) {
      d.totalDisbursedAmount = delta;
      d.availableBalance = -delta;
    } else if (nowDisbursed) {
      d.totalDisbursedAmount = Number(after.amount) || 0;
      d.availableBalance = -(Number(after.amount) || 0);
    } else if (wasDisbursed) {
      d.totalDisbursedAmount = -(Number(before.amount) || 0);
      d.availableBalance = Number(before.amount) || 0;
    }
  }

  const feeDelta = Number(after.processingFee) - Number(before.processingFee);
  if (feeDelta !== 0) {
    d.totalProcessingFees = feeDelta;
    if ("availableBalance" in d) d.availableBalance += feeDelta;
    else d.availableBalance = feeDelta;
  }

  if (wasDisbursed || nowDisbursed) {
    const amtChanged = Number(before.amount) !== Number(after.amount);
    const feeChanged =
      Number(before.processingFee) !== Number(after.processingFee);
    const statusChanged = wasDisbursed !== nowDisbursed;
    if (amtChanged || feeChanged || statusChanged) {
      const beforeAmt = Number(before.amount) || 0;
      const afterAmt = Number(after.amount) || 0;
      const beforeFee = Number(before.processingFee) || 0;
      const afterFee = Number(after.processingFee) || 0;
      let netBefore = 0;
      let netAfter = 0;
      if (wasDisbursed) netBefore = beforeAmt - beforeFee;
      if (nowDisbursed) netAfter = afterAmt - afterFee;
      d.netDisbursed = netAfter - netBefore;
    }
  }

  if (Number(before.emi) !== Number(after.emi) ||
      Number(before.tenure) !== Number(after.tenure)) {
    d.totalOutstanding = calcOutstanding(after) - calcOutstanding(before);
  } else {
    const beforeOut = calcOutstanding(before);
    const afterOut = calcOutstanding(after);
    if (beforeOut !== afterOut) {
      d.totalOutstanding = afterOut - beforeOut;
    }
  }

  const emiDiff = diffRepaymentSchedule(
      before.repaymentSchedule, after.repaymentSchedule,
  );
  if (emiDiff.collDelta !== 0) d.totalCollections = emiDiff.collDelta;
  if (emiDiff.pendDelta !== 0) d.pendingCollections = emiDiff.pendDelta;
  if (emiDiff.balDelta !== 0) {
    if ("availableBalance" in d) d.availableBalance += emiDiff.balDelta;
    else d.availableBalance = emiDiff.balDelta;
  }

  const beforeFc = before.foreclosureDetails;
  const afterFc = after.foreclosureDetails;
  const hadFc = !!(beforeFc && beforeFc.totalPaid);
  const nowFc = !!(afterFc && afterFc.totalPaid);

  if (hadFc !== nowFc) {
    d.totalForeclosures = nowFc ? 1 : -1;
    const fcDelta = nowFc ?
      (Number(afterFc.totalPaid) || 0) : -(Number(beforeFc.totalPaid) || 0);
    d.foreclosureCollections = fcDelta;
    if ("totalCollections" in d) d.totalCollections += fcDelta;
    else d.totalCollections = fcDelta;
    if ("availableBalance" in d) d.availableBalance += fcDelta;
    else d.availableBalance = fcDelta;
  } else if (hadFc && nowFc &&
      Number(beforeFc.totalPaid) !== Number(afterFc.totalPaid)) {
    const fcDelta =
      (Number(afterFc.totalPaid) || 0) - (Number(beforeFc.totalPaid) || 0);
    d.foreclosureCollections = fcDelta;
    if ("totalCollections" in d) d.totalCollections += fcDelta;
    else d.totalCollections = fcDelta;
    if ("availableBalance" in d) d.availableBalance += fcDelta;
    else d.availableBalance = fcDelta;
  }

  const topupDiff = diffTopups(
      before.topUpHistory, after.topUpHistory,
  );
  if (topupDiff.countDelta !== 0) d.totalTopupCount = topupDiff.countDelta;
  if (topupDiff.amtDelta !== 0) d.totalTopupAmount = topupDiff.amtDelta;
  if (topupDiff.balDelta !== 0) {
    if ("availableBalance" in d) d.availableBalance += topupDiff.balDelta;
    else d.availableBalance = topupDiff.balDelta;
  }

  return d;
}

/**
 * Cloud Function trigger for loan writes (create/update/delete).
 * Computes metric deltas from before/after and applies them atomically.
 */
exports.onLoanWrite = createTrigger("loans", "loanId", computeDeltas);
