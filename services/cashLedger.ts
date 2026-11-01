/**
 * Shared Cash Ledger calculation — single source of truth for cash balances.
 *
 * Used by:
 *  - pages/FinanceOverview.tsx (Cash Account screen)
 *  - pages/Dashboard.tsx (Available Balance / Total Liquid Assets)
 *
 * Accounting rules (preserved from the original Cash Account implementation):
 *  - Partner investment  => credit (cash in)
 *  - Partner withdrawal  => debit  (cash out)
 *  - Expense             => debit  (cash out)
 *  - Loan disbursal      => debit  (cash out), base amount = amount - topUps
 *  - Top-up disbursal    => debit  (cash out), via `ledger` entries when present,
 *                           else synthesized from topUpHistory (legacy fallback)
 *  - Top-up proc. fee    => credit (cash in), same ledger/fallback rules
 *  - Processing fee      => credit (cash in), computed as baseAmount * feePercentage / 100
 *  - EMI (status=Paid with paymentDate) => credit (cash in)
 *  - Foreclosure (amountReceived with date) => credit (cash in)
 */

export type LedgerCategory = 'loan' | 'emi' | 'partner' | 'expense' | 'fee' | 'foreclosure';

export interface LedgerEntry {
    date: Date;
    particulars: string;
    type: 'credit' | 'debit';
    category: LedgerCategory;
    amount: number;
    customerId?: string;
}

export interface MonthlyLedger {
    month: Date;
    openingBalance: number;
    entries: LedgerEntry[];
    closingBalance: number;
}

export interface RawPartnerTransaction {
    id?: string;
    date: string;
    partnerName: string;
    type: 'investment' | 'withdrawal';
    amount: number;
}

export interface RawLoan {
    id: string;
    customerId?: string;
    customerName?: string;
    amount: number;
    disbursalDate?: string;
    status?: string;
    repaymentSchedule?: Array<{ status?: string; amount?: number; paymentDate?: string }>;
    processingFeePercentage?: number;
    processingFee?: number;
    topUpHistory?: Array<{ date?: string; topUpAmount?: number; amount?: number; processingFee?: number }>;
    foreclosureDetails?: { amountReceived?: boolean; date?: string; totalPaid?: number };
}

export interface RawExpense {
    id?: string;
    date: string;
    narration?: string;
    amount: number;
}

export interface RawLedgerDoc {
    date?: string;
    loanId?: string;
    customerId?: string;
    narration?: string;
    entries?: Array<{ type?: string; account?: string; amount?: number }>;
}

const DISBURSED_STATUSES = ['Disbursed', 'Active', 'Completed', 'Overdue'];

/** Safe date parse: returns null for unparseable input instead of Invalid Date. */
const safeParseISO = (value: string | undefined | null): Date | null => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Build the flat, chronologically-sorted ledger entries from raw collections.
 * Mirrors the original Cash Account (FinanceOverview) aggregation exactly.
 */
export const buildLedgerEntries = (params: {
    partnerTransactions: RawPartnerTransaction[];
    loans: RawLoan[];
    expenses: RawExpense[];
    ledgerDocs: RawLedgerDoc[];
}): LedgerEntry[] => {
    const { partnerTransactions, loans, expenses, ledgerDocs } = params;
    const flatLedgerEntries: LedgerEntry[] = [];

    // 1. Partner Transactions
    partnerTransactions.forEach(tx => {
        const date = safeParseISO(tx.date);
        if (!date) return;
        flatLedgerEntries.push({
            date,
            particulars: `${tx.partnerName} (${tx.type})`,
            type: tx.type === 'investment' ? 'credit' : 'debit',
            category: 'partner',
            amount: Number(tx.amount) || 0,
        });
    });

    // 2. Expenses
    expenses.forEach(ex => {
        const date = safeParseISO(ex.date);
        if (!date) return;
        flatLedgerEntries.push({
            date,
            particulars: ex.narration || 'Expense',
            type: 'debit',
            category: 'expense',
            amount: Number(ex.amount) || 0,
        });
    });

    // 2.1 Manual/System ledger collection (e.g. top-ups written by LoanDetails)
    ledgerDocs.forEach(entry => {
        if (!entry.entries || !Array.isArray(entry.entries)) return;
        const date = safeParseISO(entry.date);
        if (!date) return;
        entry.entries.forEach((sub: any) => {
            // Only Cash / Bank impact matters for the cash ledger.
            // Credit Cash = Cash OUT (debit in ledger view)
            if (sub.account === 'Cash / Bank') {
                flatLedgerEntries.push({
                    date,
                    particulars: entry.narration || sub.account,
                    type: sub.type === 'Credit' ? 'debit' : 'credit',
                    category: 'loan',
                    amount: Number(sub.amount) || 0,
                    customerId: entry.customerId
                });
            }
        });
    });

    // 3. Loans (disbursal, top-up fallback, processing fee, EMIs, foreclosure)
    loans.forEach(loan => {
        // Only disbursed-family loans touch cash.
        if (!DISBURSED_STATUSES.includes(loan.status || '')) return;

        let amountToShowAtDisbursal = Number(loan.amount) || 0;
        const topUps = loan.topUpHistory || [];
        let totalTopUpAmount = 0;

        // Subtract Top-Ups from the base amount shown at original date
        topUps.forEach((t: any) => {
            totalTopUpAmount += Number(t.topUpAmount || t.amount) || 0;
        });
        amountToShowAtDisbursal = Math.max(0, amountToShowAtDisbursal - totalTopUpAmount);

        const disbursalDate = safeParseISO(loan.disbursalDate);
        if (disbursalDate && amountToShowAtDisbursal > 0) {
            // Debit: Loan base amount out
            flatLedgerEntries.push({
                date: disbursalDate,
                particulars: `Loan to ${loan.customerName}`,
                type: 'debit',
                category: 'loan',
                amount: amountToShowAtDisbursal,
                customerId: loan.customerId
            });

            // Legacy top-up fallback: if no `ledger` doc exists for a top-up
            // date, synthesize the cash movement here.
            topUps.forEach((t: any) => {
                const tDateParts = (t.date || '').split('T')[0]; // YYYY-MM-DD
                const hasLedgerEntry = ledgerDocs.some(le =>
                    le.loanId === loan.id && (le.date || '').startsWith(tDateParts)
                );

                if (!hasLedgerEntry) {
                    const tDate = safeParseISO(t.date);
                    if (tDate) {
                        flatLedgerEntries.push({
                            date: tDate,
                            particulars: `Top-Up to ${loan.customerName}`,
                            type: 'debit',
                            category: 'loan',
                            amount: Number(t.topUpAmount || t.amount) || 0,
                            customerId: loan.customerId
                        });
                    }
                    if (t.processingFee) {
                        const tDate = safeParseISO(t.date);
                        if (tDate) {
                            flatLedgerEntries.push({
                                date: tDate,
                                particulars: `Proc. Fee Top-Up (${loan.customerName})`,
                                type: 'credit',
                                category: 'fee',
                                amount: Number(t.processingFee) || 0,
                                customerId: loan.customerId
                            });
                        }
                    }
                }
            });

            // Credit: Processing fee in (computed from percentage of base amount)
            const feePercentage = loan.processingFeePercentage || 0;
            const processingFee = (amountToShowAtDisbursal * feePercentage) / 100;
            if (processingFee > 0) {
                flatLedgerEntries.push({
                    date: disbursalDate,
                    particulars: `Proc. Fee (${loan.customerName})`,
                    type: 'credit',
                    category: 'fee',
                    amount: processingFee,
                    customerId: loan.customerId
                });
            }
        }

        // Credit: EMI payments actually received
        if (loan.repaymentSchedule) {
            loan.repaymentSchedule.forEach((emi: any) => {
                if (emi.status === 'Paid' && emi.paymentDate) {
                    const emiDate = safeParseISO(emi.paymentDate);
                    if (!emiDate) return;
                    flatLedgerEntries.push({
                        date: emiDate,
                        particulars: `EMI Recd: ${loan.customerName}`,
                        type: 'credit',
                        category: 'emi',
                        amount: Number(emi.amount) || 0,
                        customerId: loan.customerId
                    });
                }
            });
        }

        // Credit: Foreclosure payment actually received
        const foreclosureDetails = loan.foreclosureDetails;
        if (foreclosureDetails && foreclosureDetails.amountReceived && foreclosureDetails.date) {
            const fcDate = safeParseISO(foreclosureDetails.date);
            if (!fcDate) return;
            flatLedgerEntries.push({
                date: fcDate,
                particulars: `Foreclosure Recd: ${loan.customerName}`,
                type: 'credit',
                category: 'foreclosure',
                amount: Number(foreclosureDetails.totalPaid) || 0,
                customerId: loan.customerId
            });
        }
    });

    flatLedgerEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
    return flatLedgerEntries;
};

/** Group flat entries into monthly ledgers with opening/closing balances (newest month first). */
export const buildMonthlyLedgers = (flatLedgerEntries: LedgerEntry[]): MonthlyLedger[] => {
    if (flatLedgerEntries.length === 0) return [];

    const firstDate = flatLedgerEntries[0].date;
    const lastDate = flatLedgerEntries[flatLedgerEntries.length - 1].date;

    const months: Date[] = [];
    const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    const endMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
    while (cursor <= endMonth) {
        months.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }

    const ledgers: MonthlyLedger[] = [];
    let runningBalance = 0;

    for (const monthDate of months) {
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
        const openingBalanceForMonth = runningBalance;

        const entriesInMonth = flatLedgerEntries.filter(entry =>
            entry.date >= monthStart && entry.date <= monthEnd
        );

        let monthEndBalance = openingBalanceForMonth;
        entriesInMonth.forEach(entry => {
            monthEndBalance += (entry.type === 'credit' ? entry.amount : -entry.amount);
        });

        if (entriesInMonth.length > 0 || openingBalanceForMonth !== 0) {
            ledgers.push({
                month: monthDate,
                openingBalance: openingBalanceForMonth,
                entries: [...entriesInMonth].reverse(), // newest on top
                closingBalance: monthEndBalance
            });
        }
        runningBalance = monthEndBalance;
    }

    return ledgers.reverse(); // newest months first
};

/** One-shot helper: raw collections -> monthly ledgers. */
export const computeMonthlyLedgers = (params: {
    partnerTransactions: RawPartnerTransaction[];
    loans: RawLoan[];
    expenses: RawExpense[];
    ledgerDocs: RawLedgerDoc[];
}): MonthlyLedger[] => {
    return buildMonthlyLedgers(buildLedgerEntries(params));
};

/**
 * Current cash position = closing balance of the newest month with activity.
 * This is the number the Dashboard "Available Balance" must show on initial load.
 */
export const getCurrentCashBalance = (monthlyLedgers: MonthlyLedger[]): number => {
    if (monthlyLedgers.length === 0) return 0;
    return monthlyLedgers[0].closingBalance;
};
