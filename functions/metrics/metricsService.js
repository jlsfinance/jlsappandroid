const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const db = getFirestore();

const CURRENT_SCHEMA_VERSION = 1;
const METRICS_DOC_ID = "dashboardMetrics";

/**
 * Return a DocumentReference to the metrics doc for a company.
 * @param {string} companyId
 * @return {FirebaseFirestore.DocumentReference}
 */
function metricsDocRef(companyId) {
  return db.collection("companies").doc(companyId)
      .collection("system").doc(METRICS_DOC_ID);
}

/**
 * Apply atomic deltas to a company's dashboard metrics document.
 * Uses FieldValue.increment() — zero reads, no transactions.
 * @param {string} companyId
 * @param {Object<string, number>} deltas Flat map of field → delta
 * @return {Promise<void>}
 */
async function applyDelta(companyId, deltas) {
  if (!companyId || typeof deltas !== "object") {
    throw new Error("Invalid arguments: companyId and deltas are required");
  }
  const update = {};
  for (const [field, delta] of Object.entries(deltas)) {
    if (typeof delta !== "number" || !Number.isFinite(delta)) continue;
    if (delta === 0) continue;
    update[field] = FieldValue.increment(delta);
  }
  if (Object.keys(update).length === 0) return;
  update.updatedAt = FieldValue.serverTimestamp();
  await metricsDocRef(companyId).set(update, {merge: true});
}

/**
 * Rebuild ALL dashboard metrics from source collections.
 * Idempotent — safe to call multiple times.
 * @param {string} companyId
 * @return {Promise<Object>} The computed metrics values
 */
async function rebuild(companyId) {
  const [
    loansSnap,
    customersSnap,
    partnerTxSnap,
    expensesSnap,
    ledgerSnap,
    depositsSnap,
  ] = await Promise.all([
    db.collection("loans").where("companyId", "==", companyId).get(),
    db.collection("customers").where("companyId", "==", companyId).get(),
    db.collection("partner_transactions")
        .where("companyId", "==", companyId).get(),
    db.collection("expenses").where("companyId", "==", companyId).get(),
    db.collection("ledger").where("companyId", "==", companyId).get(),
    db.collection("deposits").where("companyId", "==", companyId).get(),
  ]);

  const loans = loansSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const customers = customersSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const partnerTx = partnerTxSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const expenses = expensesSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const ledger = ledgerSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const deposits = depositsSnap.docs.map((d) => ({id: d.id, ...d.data()}));

  let activeLoans = 0;
  let closedLoans = 0;
  let overdueLoans = 0;
  let totalLoans = 0;
  let totalDisbursedAmount = 0;
  let totalProcessingFees = 0;
  let totalOutstanding = 0;
  let pendingCollections = 0;
  let totalTopupCount = 0;
  let totalTopupAmount = 0;
  let totalCollections = 0;
  let foreclosureCollections = 0;
  let totalForeclosures = 0;

  loans.forEach((loan) => {
    const amount = Number(loan.amount) || 0;
    const emi = Number(loan.emi) || 0;
    const tenure = Number(loan.tenure) || 1;
    const status = loan.status;

    const paidAmount = loan.repaymentSchedule ?
      loan.repaymentSchedule
          .filter((e) => e.status === "Paid")
          .reduce((s, e) => s + (Number(e.amount) || 0), 0) : 0;

    const processingFee = Number(loan.processingFee) || 0;
    if (["Disbursed", "Active", "Completed", "Overdue"].includes(status)) {
      totalLoans++;
      totalDisbursedAmount += amount;
      totalProcessingFees += processingFee;
    }
    if (["Disbursed", "Active", "Overdue"].includes(status)) {
      activeLoans++;
      const totalPayablePI = emi * tenure;
      totalOutstanding += Math.max(0, totalPayablePI - paidAmount);
    }
    if (status === "Completed") closedLoans++;
    if (status === "Overdue") overdueLoans++;

    if (loan.repaymentSchedule) {
      loan.repaymentSchedule.forEach((e) => {
        if (e.status === "Paid") totalCollections += Number(e.amount) || 0;
        if (e.status === "Pending") {
          pendingCollections += Number(e.amount) || 0;
        }
      });
    }
    const fc = loan.foreclosureDetails;
    if (fc && fc.totalPaid) {
      totalForeclosures++;
      const fcAmt = Number(fc.totalPaid) || 0;
      foreclosureCollections += fcAmt;
      totalCollections += fcAmt;
    }
    const topUps = loan.topUpHistory || [];
    totalTopupCount += topUps.length;
    topUps.forEach((t) => {
      totalTopupAmount += Number(t.topUpAmount || t.amount) || 0;
      if (t.processingFee) totalProcessingFees += Number(t.processingFee) || 0;
    });
  });

  let cashBalance = totalCollections + totalProcessingFees;
  cashBalance -= totalDisbursedAmount;
  cashBalance -= totalTopupAmount;

  partnerTx.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    cashBalance += tx.type === "investment" ? amt : -amt;
  });

  expenses.forEach((ex) => {
    cashBalance -= Number(ex.amount) || 0;
  });

  ledger.forEach((entry) => {
    const subs = Array.isArray(entry.entries) ? entry.entries : [entry];
    subs.forEach((sub) => {
      if (sub.account === "Cash / Bank" && Number(sub.amount) > 0) {
        cashBalance += sub.type === "Credit" ?
          Number(sub.amount) : -Number(sub.amount);
      }
    });
  });

  const totalCustomers = customers.length;
  const activeCustomers = customers
      .filter((c) => c.status !== "inactive").length;

  const partnerInvestments = partnerTx
      .filter((t) => t.type === "investment")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const partnerWithdrawals = partnerTx
      .filter((t) => t.type !== "investment")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const totalExpenses = expenses
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  let activeDeposits = 0;
  let totalDepositAmount = 0;
  let totalDepositCollections = 0;

  deposits.forEach((dep) => {
    const principal = Number(dep.principal) || 0;
    totalDepositAmount += principal;
    if (dep.status === "Active") activeDeposits++;
    const schedule = dep.depositSchedule || [];
    schedule.forEach((inst) => {
      if (inst.status === "Paid") {
        totalDepositCollections +=
          Number(inst.amountPaid) || Number(inst.amount) || 0;
      }
    });
    const fc = dep.foreclosureDetails;
    if (fc && fc.totalPaid) {
      cashBalance -= Number(fc.totalPaid) || 0;
    }
    if (dep.status === "Matured" && dep.maturityAmount) {
      cashBalance -= Number(dep.maturityAmount) || 0;
    }
  });
  cashBalance += totalDepositCollections;

  let totalLedgerCashCredits = 0;
  let totalLedgerCashDebits = 0;

  ledger.forEach((entry) => {
    const subs = Array.isArray(entry.entries) ? entry.entries : [entry];
    subs.forEach((sub) => {
      if (sub.account === "Cash / Bank" &&
          Number(sub.amount) > 0) {
        if (sub.type === "Credit") {
          totalLedgerCashCredits += Number(sub.amount);
        } else if (sub.type === "Debit") {
          totalLedgerCashDebits += Number(sub.amount);
        }
      }
    });
  });

  const metrics = {
    availableBalance: cashBalance,
    activeLoans,
    closedLoans,
    overdueLoans,
    totalDisbursedLoans: totalLoans,
    totalDisbursedAmount,
    netDisbursed: totalDisbursedAmount - totalProcessingFees,
    totalProcessingFees,
    totalOutstanding,
    pendingCollections,
    totalTopupCount,
    totalTopupAmount,
    totalCollections,
    foreclosureCollections,
    totalForeclosures,
    totalCustomers,
    activeCustomers,
    activeDeposits,
    totalDepositAmount,
    totalDepositCollections,
    partnerInvestments,
    partnerWithdrawals,
    totalPartnerTxCount: partnerTx.length,
    totalExpenses,
    expenseCount: expenses.length,
    totalLedgerCashCredits,
    totalLedgerCashDebits,
    lastTransactionAt: null,
    lastTransactionType: null,
    lastTransactionAmount: 0,
    lastTransactionId: null,
    updatedAt: FieldValue.serverTimestamp(),
    lastRebuildAt: FieldValue.serverTimestamp(),
    rebuildCount: FieldValue.increment(1),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  await metricsDocRef(companyId).set(metrics, {merge: true});
  return metrics;
}

/**
 * Compare current metrics document against a full recalculation.
 * @param {string} companyId
 * @return {Promise<{consistent: boolean, diffs: Object}>}
 */
async function detectInconsistencies(companyId) {
  const [metricsSnap, recomputed] = await Promise.all([
    metricsDocRef(companyId).get(),
    rebuild(companyId),
  ]);
  if (!metricsSnap.exists) {
    return {consistent: false, diffs: {}};
  }

  const current = metricsSnap.data();
  const diffs = {};
  const FIELDS = [
    "availableBalance",
    "activeLoans",
    "closedLoans",
    "overdueLoans",
    "totalDisbursedLoans",
    "totalDisbursedAmount",
    "netDisbursed",
    "totalProcessingFees",
    "totalOutstanding",
    "pendingCollections",
    "totalTopupCount",
    "totalTopupAmount",
    "totalCollections",
    "foreclosureCollections",
    "totalForeclosures",
    "totalCustomers",
    "activeCustomers",
    "activeDeposits",
    "totalDepositAmount",
    "totalDepositCollections",
    "partnerInvestments",
    "partnerWithdrawals",
    "totalPartnerTxCount",
    "totalExpenses",
    "expenseCount",
    "totalLedgerCashCredits",
    "totalLedgerCashDebits",
  ];
  for (const field of FIELDS) {
    const a = Number(current[field]) || 0;
    const b = Number(recomputed[field]) || 0;
    if (a !== b) diffs[field] = {current: a, recomputed: b, delta: a - b};
  }
  return {
    consistent: Object.keys(diffs).length === 0,
    diffs,
  };
}

module.exports = {
  applyDelta,
  rebuild,
  detectInconsistencies,
  CURRENT_SCHEMA_VERSION,
};
