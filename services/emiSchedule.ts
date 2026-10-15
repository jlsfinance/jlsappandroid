/**
 * EMI schedule due-filtering logic — single source of truth for the Due List.
 *
 * Rules (business spec):
 * 1. Show installments whose due date has ARRIVED (<= today, local timezone).
 *    This includes ALL previous months + current month's due EMIs.
 * 2. NEVER show future-month installments (due date in the future).
 * 3. Skip fully paid installments (status 'Paid').
 * 4. Include partially paid installments, tracking amountPaid + remaining.
 * 5. Skip installments with zero remaining balance (fully settled via partials).
 *
 * The month is never used as a filter — only the actual due date vs. now.
 */

export interface ScheduleEmi {
    emiNumber: number;
    dueDate: string;       // 'yyyy-MM-dd'
    amount: number;
    status: 'Pending' | 'Paid';
    amountPaid?: number;
    paymentDate?: string | null;
    paymentMethod?: string;
    remark?: string | null;
}

export interface LoanData {
    id: string;
    customerId: string;
    customerName: string;
    tenure: number;
    repaymentSchedule?: ScheduleEmi[];
}

export interface DueEmi {
    loanId: string;
    customerId: string;
    customerName: string;
    emiNumber: number;
    dueDate: string;
    amount: number;
    tenure: number;
    amountPaid: number;
    remaining: number;
    isFinalEmi: boolean;
    isOverdue: boolean;    // due date strictly in the past (before today)
    isPreviousMonth: boolean; // due date before the 1st of the current month
}

/** Parse 'yyyy-MM-dd' as a LOCAL date (avoids UTC-midnight timezone shift). */
export const parseLocalDate = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

/** End of the given day, local time — "due today" counts as due. */
const endOfDay = (d: Date): Date => {
    const e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return e;
};

/**
 * Filter a single loan's schedule into due EMIs as of `now`.
 * Pure function — no Firebase, no React. Unit-testable.
 */
export const getDueEmisForLoan = (loan: LoanData, now: Date = new Date()): DueEmi[] => {
    const todayEnd = endOfDay(now);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const schedule = loan.repaymentSchedule || [];
    const result: DueEmi[] = [];

    for (const emi of schedule) {
        // Fully paid → excluded
        if (emi.status === 'Paid') continue;

        const dueObj = parseLocalDate(emi.dueDate);
        // Future-month / not-yet-arrived → NEVER shown
        if (dueObj.getTime() > todayEnd.getTime()) continue;

        const amountPaid = Number(emi.amountPaid) || 0;
        const remaining = Math.max(0, emi.amount - amountPaid);
        // Fully settled through partial payments → excluded
        if (remaining <= 0) continue;

        result.push({
            loanId: loan.id,
            customerId: loan.customerId,
            customerName: loan.customerName,
            emiNumber: emi.emiNumber,
            dueDate: emi.dueDate,
            amount: emi.amount,
            tenure: loan.tenure,
            amountPaid,
            remaining,
            isFinalEmi: loan.tenure > 0 && emi.emiNumber >= loan.tenure,
            isOverdue: dueObj.getTime() < endOfDay(now).getTime() && dueObj.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
            isPreviousMonth: dueObj.getTime() < thisMonthStart.getTime(),
        });
    }

    return result;
};

/**
 * Filter many loans; sorted oldest due date first.
 */
export const getAllDueEmis = (loans: LoanData[], now: Date = new Date()): DueEmi[] => {
    const all: DueEmi[] = [];
    for (const loan of loans) {
        all.push(...getDueEmisForLoan(loan, now));
    }
    all.sort((a, b) => parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime());
    return all;
};

/**
 * Apply a payment to one installment. Returns the updated entry
 * and whether the installment is now fully paid.
 * Allocation rule: amountPaid accumulates; status flips to 'Paid'
 * only when the cumulative paid reaches the full EMI amount.
 */
export const applyPaymentToEmi = (
    emi: ScheduleEmi,
    amountPaidNow: number
): { updated: ScheduleEmi; isFullyPaid: boolean } => {
    const alreadyPaid = Number(emi.amountPaid) || 0;
    const newAmountPaid = alreadyPaid + amountPaidNow;
    const isFullyPaid = newAmountPaid >= emi.amount - 1; // 1-rupee tolerance
    return {
        updated: {
            ...emi,
            amountPaid: newAmountPaid,
            status: isFullyPaid ? 'Paid' : 'Pending',
        },
        isFullyPaid,
    };
};

export interface CustomerDueGroup {
    loanId: string;
    customerId: string;
    customerName: string;
    tenure: number;
    emis: DueEmi[];                    // sorted oldest first
    totalRemaining: number;
    pendingCount: number;
    overdueCount: number;
    previousMonthCount: number;
    oldestDueDate: string;
}

/**
 * Group due EMIs into ONE group per (loanId) — one Due List card per loan.
 * Multiple loans for the same customer stay separate (by loanId).
 */
export const groupDueEmisByLoan = (dueEmis: DueEmi[], now: Date = new Date()): CustomerDueGroup[] => {
    const map = new Map<string, DueEmi[]>();
    for (const d of dueEmis) {
        const arr = map.get(d.loanId) || [];
        arr.push(d);
        map.set(d.loanId, arr);
    }

    const groups: CustomerDueGroup[] = [];
    map.forEach((emis, loanId) => {
        emis.sort((a, b) => a.emiNumber - b.emiNumber);
        const totalRemaining = emis.reduce((s, e) => s + e.remaining, 0);
        const overdueCount = emis.filter(e => e.isOverdue).length;
        const previousMonthCount = emis.filter(e => e.isPreviousMonth).length;
        groups.push({
            loanId,
            customerId: emis[0].customerId,
            customerName: emis[0].customerName,
            tenure: emis[0].tenure,
            emis,
            totalRemaining,
            pendingCount: emis.length,
            overdueCount,
            previousMonthCount,
            oldestDueDate: emis[0].dueDate,
        });
    });

    // Most urgent loan first (oldest overdue EMI first)
    groups.sort((a, b) => parseLocalDate(a.oldestDueDate).getTime() - parseLocalDate(b.oldestDueDate).getTime());
    return groups;
};

/**
 * Preview allocation of `amount` across SELECTED emis only, oldest-first.
 * Unselected emis are never touched. Returns per-EMI allocation.
 */
export interface AllocationLine {
    emiNumber: number;
    allocated: number;      // amount applied to this EMI
    remainingAfter: number; // remaining balance after this allocation
    fullyPaid: boolean;
}

export const previewAllocation = (
    selectedEmis: { emiNumber: number; remaining: number }[],
    amount: number
): { lines: AllocationLine[]; totalAllocated: number; leftover: number } => {
    // Oldest first: selectedEmis should already be sorted by emiNumber/dueDate
    const sorted = [...selectedEmis].sort((a, b) => a.emiNumber - b.emiNumber);
    let amountLeft = Math.max(0, amount);
    const lines: AllocationLine[] = [];
    for (const e of sorted) {
        if (amountLeft <= 0) {
            lines.push({ emiNumber: e.emiNumber, allocated: 0, remainingAfter: e.remaining, fullyPaid: false });
            continue;
        }
        const payNow = Math.min(e.remaining, amountLeft);
        amountLeft -= payNow;
        lines.push({
            emiNumber: e.emiNumber,
            allocated: payNow,
            remainingAfter: e.remaining - payNow,
            fullyPaid: e.remaining - payNow <= 1, // 1-rupee tolerance
        });
    }
    const totalAllocated = lines.reduce((s, l) => s + l.allocated, 0);
    return { lines, totalAllocated, leftover: amountLeft };
};
