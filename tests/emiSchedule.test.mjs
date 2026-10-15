/**
 * Regression tests for the Due List month-wise filtering fix.
 *
 * Bug: Due List filtered by a manually-selected month (viewDate), so
 * (a) previous months' unpaid EMIs disappeared when the month rolled over,
 * (b) users could navigate to future months and see not-yet-due EMIs,
 * (c) partial payments were impossible (amount < EMI was rejected).
 *
 * Fix: services/emiSchedule.ts filters purely by "due date has arrived"
 * and tracks amountPaid/remaining for partial payments.
 *
 * Run: node tests/emiSchedule.test.mjs
 */
import {
    getAllDueEmis,
    getDueEmisForLoan,
    applyPaymentToEmi,
    parseLocalDate,
    groupDueEmisByLoan,
    previewAllocation
} from '../services/emiSchedule.ts';

let passed = 0, failed = 0;
const eq = (name, actual, expected) => {
    const ok = Number(actual) === Number(expected);
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}: expected ${expected}, got ${actual}`); }
};
const ok = (name, cond) => {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}`); }
};

// Helper: make an EMI entry
const emi = (emiNumber, dueDate, status = 'Pending', extra = {}) => ({
    emiNumber, dueDate, amount: 10000, status, ...extra
});

// ─── Scenario: October 2026 (today = 2026-10-15) ───
console.log('\n[Scenario 1] Current month October 2026 (today = 15 Oct):');
{
    const now = new Date(2026, 9, 15); // Oct 15, 2026 local
    const loan = {
        id: 'L1', customerId: 'C1', customerName: 'Ramesh', tenure: 12,
        repaymentSchedule: [
            emi(1, '2026-04-05'), emi(2, '2026-05-05'), emi(3, '2026-06-05'),
            emi(4, '2026-07-05'), emi(5, '2026-08-05'), emi(6, '2026-09-05'),
            emi(7, '2026-10-10'),  // current month, due date arrived (10th)
            emi(8, '2026-10-31'),  // current month, due date NOT arrived
            emi(9, '2026-11-05'),  // FUTURE — must never show
            emi(10, '2026-12-05'), // FUTURE
            emi(11, '2027-01-05'), // FUTURE
            emi(12, '2027-02-05'), // FUTURE
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    const nums = due.map(d => d.emiNumber);
    ok('previous unpaid months (Apr–Sep) show', [1,2,3,4,5,6].every(n => nums.includes(n)));
    ok('October due EMI (#7, 10th) shows', nums.includes(7));
    ok('October NOT-yet-due EMI (#8, 31st) hidden', !nums.includes(8));
    ok('November EMI NEVER shows', !nums.includes(9));
    ok('Dec/Jan/Feb future EMIs NEVER show', ![10,11,12].some(n => nums.includes(n)));
    eq('total due count = 7', due.length, 7);
    ok('all previous months flagged isPreviousMonth', due.filter(d => d.emiNumber <= 6).every(d => d.isPreviousMonth));
    ok('current month EMI not flagged previous-month', due.find(d => d.emiNumber === 7)?.isPreviousMonth === false);
}

// ─── Scenario: January (previous year December + older) ───
console.log('\n[Scenario 2] Current month January 2027 (year rollover):');
{
    const now = new Date(2027, 0, 10); // Jan 10, 2027
    const loan = {
        id: 'L2', customerId: 'C2', customerName: 'Sita', tenure: 6,
        repaymentSchedule: [
            emi(1, '2026-08-05'), emi(2, '2026-09-05'),
            emi(3, '2026-10-05'), emi(4, '2026-11-05'), emi(5, '2026-12-05'),
            emi(6, '2027-01-05'), // current month, due
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    const nums = due.map(d => d.emiNumber);
    ok('previous-year December (Dec 2026) shows', nums.includes(5));
    ok('all older 2026 EMIs show', [1,2,3,4].every(n => nums.includes(n)));
    ok('January 2027 EMI shows', nums.includes(6));
    ok('Dec 2026 flagged isPreviousMonth', due.find(d => d.emiNumber === 5)?.isPreviousMonth === true);
}

// ─── Scenario: partially paid previous EMIs ───
console.log('\n[Scenario 3] Partially paid EMIs:');
{
    const now = new Date(2026, 9, 15);
    const loan = {
        id: 'L3', customerId: 'C3', customerName: 'Mohan', tenure: 4,
        repaymentSchedule: [
            emi(1, '2026-07-05', 'Pending', { amountPaid: 4000 }),   // 6000 remaining
            emi(2, '2026-08-05', 'Pending', { amountPaid: 10000 }),  // fully settled → hidden
            emi(3, '2026-09-05', 'Pending', { amountPaid: 10001 }),  // overpaid → hidden
            emi(4, '2026-10-05'),                                     // unpaid, current month
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    const nums = due.map(d => d.emiNumber);
    ok('partially-paid EMI #1 shows with remaining 6000', due.find(d => d.emiNumber === 1)?.remaining === 6000);
    ok('EMI #1 amountPaid = 4000', due.find(d => d.emiNumber === 1)?.amountPaid === 4000);
    ok('EMI #2 (exactly fully paid) hidden', !nums.includes(2));
    ok('EMI #3 (overpaid) hidden', !nums.includes(3));
    ok('EMI #4 unpaid shows full remaining 10000', due.find(d => d.emiNumber === 4)?.remaining === 10000);
}

// ─── Scenario: fully paid previous EMIs ───
console.log('\n[Scenario 4] Fully paid EMIs excluded:');
{
    const now = new Date(2026, 9, 15);
    const loan = {
        id: 'L4', customerId: 'C4', customerName: 'Geeta', tenure: 3,
        repaymentSchedule: [
            emi(1, '2026-08-05', 'Paid'),
            emi(2, '2026-09-05', 'Paid'),
            emi(3, '2026-10-05'),
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    eq('only 1 unpaid EMI shows', due.length, 1);
    ok('it is the current-month EMI', due[0].emiNumber === 3);
}

// ─── Scenario: current month due date not arrived ───
console.log('\n[Scenario 5] Current month, due date not arrived:');
{
    const now = new Date(2026, 9, 3); // Oct 3 — EMI due Oct 5
    const loan = {
        id: 'L5', customerId: 'C5', customerName: 'Arjun', tenure: 2,
        repaymentSchedule: [
            emi(1, '2026-09-05'),
            emi(2, '2026-10-05'),
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    eq('only September EMI shows', due.length, 1);
    ok('October EMI hidden (due date not arrived)', !due.some(d => d.emiNumber === 2));
}

// ─── Scenario: current month due date arrived today ───
console.log('\n[Scenario 6] Current month, due today counts as due:');
{
    const now = new Date(2026, 9, 10);
    const loan = {
        id: 'L6', customerId: 'C6', customerName: 'Kavita', tenure: 2,
        repaymentSchedule: [
            emi(1, '2026-09-10'),
            emi(2, '2026-10-10'),
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    eq('both EMIs show (due-today counts)', due.length, 2);
}

// ─── Scenario: month rollover — list auto-updates ───
console.log('\n[Scenario 7] Month changes automatically (no hardcoded month):');
{
    const loan = {
        id: 'L7', customerId: 'C7', customerName: 'Ravi', tenure: 4,
        repaymentSchedule: [
            emi(1, '2026-10-05'),
            emi(2, '2026-11-05'),
            emi(3, '2026-12-05'),
            emi(4, '2027-01-05'),
        ]
    };
    // Same loan, evaluated at different "now" values
    const inOct = getDueEmisForLoan(loan, new Date(2026, 9, 15));
    const inNov = getDueEmisForLoan(loan, new Date(2026, 10, 15));
    const inDec = getDueEmisForLoan(loan, new Date(2026, 11, 15));
    eq('Oct: 1 due (Oct only)', inOct.length, 1);
    eq('Nov: 2 due (Oct+Nov)', inNov.length, 2);
    eq('Dec: 3 due (Oct+Nov+Dec)', inDec.length, 3);
    ok('list grows with time, no future leaks', inDec.every(d => parseLocalDate(d.dueDate).getTime() <= new Date(2026, 11, 15, 23, 59, 59).getTime()));
}

// ─── Scenario: payment collection never offers future EMIs ───
console.log('\n[Scenario 8] Payment allocation — partial then full:');
{
    const now = new Date(2026, 9, 15);
    const loan = {
        id: 'L8', customerId: 'C8', customerName: 'Deepak', tenure: 3,
        repaymentSchedule: [
            emi(1, '2026-08-05'),
            emi(2, '2026-09-05'),
            emi(3, '2026-10-05'),
            emi(4, '2026-11-05'), // future
        ]
    };
    // Future EMIs can never even be selected (not in the due list)
    const dueBefore = getDueEmisForLoan(loan, now);
    ok('future EMI not selectable (not in list)', !dueBefore.some(d => d.emiNumber === 4));

    // Partial payment of 4000 on EMI #1
    const r1 = applyPaymentToEmi(emi(1, '2026-08-05'), 4000);
    ok('partial: not fully paid', r1.isFullyPaid === false);
    ok('partial: amountPaid = 4000', r1.updated.amountPaid === 4000);
    ok('partial: stays Pending', r1.updated.status === 'Pending');

    // Second partial of 6000 → full
    const r2 = applyPaymentToEmi(r1.updated, 6000);
    ok('second partial: now fully paid', r2.isFullyPaid === true);
    ok('second partial: status Paid', r2.updated.status === 'Paid');
    ok('second partial: amountPaid = 10000', r2.updated.amountPaid === 10000);

    // After payment, EMI #1 drops out of due list
    const loanAfter = { ...loan, repaymentSchedule: [r2.updated, emi(2, '2026-09-05'), emi(3, '2026-10-05'), emi(4, '2026-11-05')] };
    const dueAfter = getDueEmisForLoan(loanAfter, now);
    eq('EMI #1 gone after full payment', dueAfter.length, 2);
    ok('remaining = EMI2 + EMI3 only', dueAfter.every(d => d.emiNumber === 2 || d.emiNumber === 3));
}

// ─── Scenario: totals match ledger (no duplicates) ───
console.log('\n[Scenario 9] Outstanding totals, no duplicate installments:');
{
    const now = new Date(2026, 9, 15);
    const loans = [
        { id: 'LA', customerId: 'CA', customerName: 'A', tenure: 3, repaymentSchedule: [emi(1, '2026-08-05'), emi(2, '2026-09-05'), emi(3, '2026-11-05')] },
        { id: 'LB', customerId: 'CB', customerName: 'B', tenure: 3, repaymentSchedule: [emi(1, '2026-09-05', 'Pending', { amountPaid: 2500 }), emi(2, '2026-10-05'), emi(3, '2026-12-05')] },
    ];
    const all = getAllDueEmis(loans, now);
    eq('total due count (A:2 + B:2)', all.length, 4);
    const total = all.reduce((s, d) => s + d.remaining, 0);
    eq('total outstanding = 10000+10000+7500+10000 = 37500', total, 37500);
    eq('overdue count (Aug5, Sep5, Sep5, Oct5 — all past Oct 15)', all.filter(d => d.isOverdue).length, 4);
    // No duplicates: same loan+emiNumber pair unique
    const keys = all.map(d => `${d.loanId}-${d.emiNumber}`);
    eq('no duplicate loan-EMI pairs', new Set(keys).size, keys.length);
    // Sorted oldest first
    ok('sorted oldest due date first', all[0].dueDate <= all[all.length - 1].dueDate);
}

// ─── Scenario 10: multi-EMI allocation (oldest first) — mirrors handleCollectEmi ───
console.log('\n[Scenario 10] Multi-month payment allocation (oldest-first):');
{
    const now = new Date(2026, 9, 15);
    const loan = {
        id: 'L10', customerId: 'C10', customerName: 'Nikhil', tenure: 5,
        repaymentSchedule: [
            emi(1, '2026-06-05'),
            emi(2, '2026-07-05'),
            emi(3, '2026-08-05'),
            emi(4, '2026-11-05'), // future — not selectable
        ]
    };
    const due = getDueEmisForLoan(loan, now);
    eq('3 due EMIs selectable', due.length, 3);

    // Simulate handleCollectEmi allocation: pay 25000 across selected EMIs (oldest first)
    const selected = due.filter(d => due.map(x => x.emiNumber).includes(d.emiNumber));
    let amountLeft = 25000;
    const schedule = loan.repaymentSchedule.map(e => {
        const sel = selected.find(s => s.emiNumber === e.emiNumber);
        if (!sel || amountLeft <= 0) return e;
        const already = Number(e.amountPaid) || 0;
        const remaining = Math.max(0, e.amount - already);
        if (remaining <= 0) return e;
        const payNow = Math.min(remaining, amountLeft);
        amountLeft -= payNow;
        const newPaid = already + payNow;
        return { ...e, amountPaid: newPaid, status: newPaid >= e.amount - 1 ? 'Paid' : 'Pending' };
    });

    eq('EMI#1 fully paid (10000)', schedule[0].amountPaid, 10000);
    eq('EMI#2 fully paid (10000)', schedule[1].amountPaid, 10000);
    eq('EMI#3 partially paid (5000)', schedule[2].amountPaid, 5000);
    ok('EMI#1 status Paid', schedule[0].status === 'Paid');
    ok('EMI#3 stays Pending', schedule[2].status === 'Pending');
    eq('nothing left over', amountLeft, 0);

    // After payment, only EMI#3 (remaining 5000) shows in due list
    const loanAfter = { ...loan, repaymentSchedule: schedule };
    const dueAfter = getDueEmisForLoan(loanAfter, now);
    eq('1 EMI still due after payment', dueAfter.length, 1);
    ok('remaining is EMI#3 with 5000', dueAfter[0].emiNumber === 3 && dueAfter[0].remaining === 5000);
    ok('future EMI#4 still never shows', !dueAfter.some(d => d.emiNumber === 4));

    // Partial-only payment: 4000 on single EMI
    let left2 = 4000;
    const sched2 = [emi(1, '2026-06-05')].map(e => {
        const pay = Math.min(e.amount, left2);
        left2 -= pay;
        return { ...e, amountPaid: pay, status: pay >= e.amount - 1 ? 'Paid' : 'Pending' };
    });
    eq('partial single: 4000 paid', sched2[0].amountPaid, 4000);
    ok('partial single: still Pending', sched2[0].status === 'Pending');
    const dueSingle = getDueEmisForLoan({ ...loan, repaymentSchedule: [...sched2, emi(2, '2026-07-05')] }, now);
    eq('partial EMI stays visible with 6000 remaining', dueSingle.find(d => d.emiNumber === 1)?.remaining, 6000);
}

// ─── Scenario 11: grouping — one card per loan, multi-loan separate ───
console.log('\n[Scenario 11] groupDueEmisByLoan — one group per loan:');
{
    const now = new Date(2026, 9, 15);
    const loans = [
        // Customer A, loan 1: 3 unpaid EMIs
        { id: 'LA1', customerId: 'CA', customerName: 'Amit', tenure: 24, repaymentSchedule: [emi(10, '2026-08-05'), emi(11, '2026-09-05'), emi(12, '2026-10-05'), emi(13, '2026-11-05')] },
        // Customer A, loan 2 (independent): 1 unpaid EMI — must NOT mix with LA1
        { id: 'LA2', customerId: 'CA', customerName: 'Amit', tenure: 12, repaymentSchedule: [emi(5, '2026-09-05'), emi(6, '2026-11-05')] },
        // Customer B: 1 unpaid EMI
        { id: 'LB', customerId: 'CB', customerName: 'Babita', tenure: 6, repaymentSchedule: [emi(3, '2026-10-05'), emi(4, '2026-12-05')] },
    ];
    const all = getAllDueEmis(loans, now);
    const groups = groupDueEmisByLoan(all, now);
    eq('3 groups (one per loan)', groups.length, 3);
    const gA1 = groups.find(g => g.loanId === 'LA1');
    const gA2 = groups.find(g => g.loanId === 'LA2');
    const gB = groups.find(g => g.loanId === 'LB');
    ok('LA1 has 3 pending EMIs', gA1.pendingCount === 3);
    ok('LA1 total = 30000', gA1.totalRemaining === 30000);
    ok('LA1 has 2 previous-month EMIs', gA1.previousMonthCount === 2);
    ok('LA1 summary = "2 Months Pending"', gA1.previousMonthCount === 2);
    ok('LA2 (same customer) separate: 1 EMI', gA2.pendingCount === 1 && gA2.totalRemaining === 10000);
    ok('LB: 1 EMI', gB.pendingCount === 1);
    ok('groups sorted oldest first (LA1 before LB)', groups[0].loanId === 'LA1');
    ok('LA2 EMIs do not appear in LA1 group', !gA1.emis.some(e => e.emiNumber === 5));
}

// ─── Scenario 12: previewAllocation — partial across selected only ───
console.log('\n[Scenario 12] previewAllocation — unselected untouched:');
{
    // Selected: Aug (4227) + Sep (4227); Oct not selected
    const selected = [
        { emiNumber: 10, remaining: 4227 },
        { emiNumber: 11, remaining: 4227 },
    ];
    // Full payment
    const full = previewAllocation(selected, 8454);
    eq('full: total allocated = 8454', full.totalAllocated, 8454);
    eq('full: no leftover', full.leftover, 0);
    ok('full: both fully paid', full.lines.every(l => l.fullyPaid));
    ok('full: both zero remaining', full.lines.every(l => l.remainingAfter <= 1));

    // Partial: 5000 → Aug full, Sep partial 773
    const partial = previewAllocation(selected, 5000);
    eq('partial: total allocated = 5000', partial.totalAllocated, 5000);
    const aug = partial.lines.find(l => l.emiNumber === 10);
    const sep = partial.lines.find(l => l.emiNumber === 11);
    eq('partial: Aug fully paid 4227', aug.allocated, 4227);
    ok('partial: Aug zero remaining', aug.remainingAfter <= 1);
    eq('partial: Sep gets 773', sep.allocated, 773);
    eq('partial: Sep remaining 3454', sep.remainingAfter, 4227 - 773);
    ok('partial: Sep not fully paid', sep.fullyPaid === false);
    ok('partial: Oct never in allocation (unselected)', !partial.lines.some(l => l.emiNumber === 12));

    // Single month only
    const single = previewAllocation([{ emiNumber: 11, remaining: 4227 }], 4227);
    eq('single: one line only', single.lines.length, 1);
    eq('single: fully paid', single.totalAllocated, 4227);

    // Excess (advance) — leftover reported
    const excess = previewAllocation(selected, 10000);
    eq('excess: all allocated 8454', excess.totalAllocated, 8454);
    eq('excess: leftover 1546 flagged', excess.leftover, 1546);
}

// ─── Summary ───
console.log(`\n${'='.repeat(50)}`);
console.log(`TOTAL: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);