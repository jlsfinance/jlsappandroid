const {createTrigger} = require("./triggerFactory");

/**
 * Compute all metric deltas from a partner transaction mutation.
 * @param {Object|null} before
 * @param {Object|null} after
 * @return {Object}
 */
function computeDeltas(before, after) {
  const d = {};

  if (!before) {
    const amt = Number(after.amount) || 0;
    if (amt === 0) return d;
    if (after.type === "investment") {
      d.partnerInvestments = amt;
      d.availableBalance = amt;
    } else {
      d.partnerWithdrawals = amt;
      d.availableBalance = -amt;
    }
    d.totalPartnerTxCount = 1;
    return d;
  }

  const oldAmt = Number(before.amount) || 0;
  const oldType = before.type;

  if (!after) {
    if (oldAmt === 0) return d;
    if (oldType === "investment") {
      d.partnerInvestments = -oldAmt;
      d.availableBalance = -oldAmt;
    } else {
      d.partnerWithdrawals = -oldAmt;
      d.availableBalance = oldAmt;
    }
    d.totalPartnerTxCount = -1;
    return d;
  }

  const newAmt = Number(after.amount) || 0;
  const newType = after.type;
  const amtChanged = oldAmt !== newAmt;
  const typeChanged = oldType !== newType;

  if (!amtChanged && !typeChanged) return d;

  if (!typeChanged) {
    const delta = newAmt - oldAmt;
    if (delta === 0) return d;
    if (newType === "investment") {
      d.partnerInvestments = delta;
      d.availableBalance = delta;
    } else {
      d.partnerWithdrawals = delta;
      d.availableBalance = -delta;
    }
    return d;
  }

  if (oldType === "investment") {
    d.partnerInvestments = -oldAmt;
    d.availableBalance = -oldAmt;
  } else {
    d.partnerWithdrawals = -oldAmt;
    d.availableBalance = oldAmt;
  }
  if (newType === "investment") {
    d.partnerInvestments = (d.partnerInvestments || 0) + newAmt;
    d.availableBalance = (d.availableBalance || 0) + newAmt;
  } else {
    d.partnerWithdrawals = (d.partnerWithdrawals || 0) + newAmt;
    d.availableBalance = (d.availableBalance || 0) - newAmt;
  }

  return d;
}

exports.onPartnerTxWrite = createTrigger(
    "partner_transactions", "partnerTxId", computeDeltas);
