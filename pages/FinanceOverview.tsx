import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Interfaces
interface PartnerTransaction { id: string; date: string; partnerName: string; type: 'investment' | 'withdrawal'; amount: number; }
interface Loan { id: string; customerName: string; amount: number; disbursalDate: string; repaymentSchedule: any[]; processingFeePercentage: number }
interface Expense { id: string; date: string; narration: string; amount: number; }
interface LedgerEntry {
    date: Date;
    particulars: string;
    type: 'credit' | 'debit';
    category: 'loan' | 'emi' | 'partner' | 'expense' | 'fee' | 'foreclosure';
    amount: number;
    customerId?: string;
}
interface MonthlyLedger {
    month: Date;
    openingBalance: number;
    entries: LedgerEntry[];
    closingBalance: number;
}

const formatCurrency = (value: number | null) => {
    if (value === null || isNaN(value)) return '---';
    return `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)}`;
}

const FinanceOverview: React.FC = () => {
    const { currentCompany } = useCompany();
    const [monthlyLedgers, setMonthlyLedgers] = useState<MonthlyLedger[]>([]);
    const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Date Filters for Download
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [showDownloadModal, setShowDownloadModal] = useState(false);

    // Expense Modal State
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        narration: ''
    });
    const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

    const generateLedger = useCallback(async () => {
        if (!currentCompany) return;

        setLoading(true);
        try {
            const companyId = currentCompany.id;
            const [partnerTxSnap, loansSnap, expensesSnap, customersSnap] = await Promise.all([
                getDocs(query(collection(db, "partner_transactions"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "loans"), where("companyId", "==", companyId), where("status", "in", ["Disbursed", "Active", "Completed", "Overdue"]))),
                getDocs(query(collection(db, "expenses"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "customers"), where("companyId", "==", companyId)))
            ]);

            const partnerTxs = partnerTxSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartnerTransaction));
            const loans = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
            const expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
            const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(customersData);
            const manualLedger_snap = await getDocs(query(collection(db, "ledger"), where("companyId", "==", companyId))); // legacy check
            // Also fetch global ledger or company specific logic if needed. Assuming 'ledger' collection has companyId? 
            // LoanDetails addDoc didn't add companyId explicitly? 
            // Let's check LoanDetails addDoc: 
            // await addDoc(collection(db, "ledger"), { ..., loanId: ..., customerId: ... });
            // It missed companyId! But we can filter by loanId -> companyId loop?
            // Or just fetch all ledger entries and filter in memory if size is small?
            // Better: Update LoanDetails to add companyId? Too late for existing?
            // Let's fetch all 'ledger' generally or filter by date?
            // For now, let's fetch 'ledger' collection.
            // Fetch ledger entries for the current company
            const ledgerSnap = await getDocs(query(collection(db, "ledger"), where("companyId", "==", companyId)));
            const manualLedger = ledgerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));


            let flatLedgerEntries: LedgerEntry[] = [];

            // 1. Process Partner Transactions
            partnerTxs.forEach(tx => {
                flatLedgerEntries.push({
                    date: parseISO(tx.date),
                    particulars: `${tx.partnerName} (${tx.type})`,
                    type: tx.type === 'investment' ? 'credit' : 'debit',
                    category: 'partner',
                    amount: Number(tx.amount),
                });
            });

            // 2. Process Expenses
            expenses.forEach(ex => {
                flatLedgerEntries.push({
                    date: parseISO(ex.date),
                    particulars: ex.narration,
                    type: 'debit',
                    category: 'expense',
                    amount: Number(ex.amount),
                });
            });

            // 2.1 Process Manual/System Ledger Collection
            manualLedger.forEach(entry => {
                if (entry.entries && Array.isArray(entry.entries)) {
                    entry.entries.forEach((sub: any) => {
                        // We primarily care about Cash/Bank impact.
                        // Credit Cash = Cash OUT (Debit in Ledger View)

                        if (sub.account === 'Cash / Bank') {
                            flatLedgerEntries.push({
                                date: parseISO(entry.date),
                                particulars: entry.narration || sub.account,
                                type: sub.type === 'Credit' ? 'debit' : 'credit',
                                category: 'loan',
                                amount: Number(sub.amount),
                                customerId: entry.customerId
                            });
                        }
                    });
                }
            });

            loans.forEach(loan => {
                // HANDLE LOAN DISBURSAL 
                // Logic: Check top-up history to subtract from the "base" amount shown at original date.

                let amountToShowAtDisbursal = Number(loan.amount);
                const topUps = (loan as any).topUpHistory || [];
                let totalTopUpAmount = 0;

                // Subtract Top-Ups
                topUps.forEach((t: any) => {
                    totalTopUpAmount += Number(t.topUpAmount || t.amount);
                });

                amountToShowAtDisbursal = Math.max(0, amountToShowAtDisbursal - totalTopUpAmount);

                if (loan.disbursalDate && amountToShowAtDisbursal > 0) {
                    const disbursalDate = parseISO(loan.disbursalDate);
                    // Debit: Loan Amount Out (Original / Base)
                    flatLedgerEntries.push({
                        date: disbursalDate,
                        particulars: `Loan to ${loan.customerName}`,
                        type: 'debit',
                        category: 'loan',
                        amount: amountToShowAtDisbursal,
                        customerId: (loan as any).customerId
                    });

                    // Note: Top-Ups are now handled via the 'manualLedger' processing above 
                    // (assuming LoanDetails wrote to 'ledger' collection).
                    // IF top-ups occurred BEFORE we added 'ledger' code (legacy), they won't show!
                    // FALLBACK: If 'manualLedger' didn't have entries for these top-ups, we should synthetically add them.
                    // How to detect? Check if we found a ledger entry for this topup date?
                    // For robustness: Iterate topUps. If no matching ledger entry found, add it here.

                    topUps.forEach((t: any) => {
                        const tDateParts = t.date.split("T")[0]; // YYYY-MM-DD
                        const hasLedgerEntry = manualLedger.some(le =>
                            le.loanId === loan.id &&
                            le.date.startsWith(tDateParts)
                        );

                        if (!hasLedgerEntry) {
                            flatLedgerEntries.push({
                                date: parseISO(t.date),
                                particulars: `Top-Up to ${loan.customerName}`,
                                type: 'debit',
                                category: 'loan',
                                amount: Number(t.topUpAmount || t.amount),
                                customerId: (loan as any).customerId
                            });
                            // Handle Fee for legacy too?
                            if (t.processingFee) {
                                flatLedgerEntries.push({
                                    date: parseISO(t.date),
                                    particulars: `Proc. Fee Top-Up (${loan.customerName})`,
                                    type: 'credit',
                                    category: 'fee',
                                    amount: Number(t.processingFee),
                                    customerId: (loan as any).customerId
                                });
                            }
                        }
                    });

                    // Credit: Processing Fee In (Original)
                    // Need to use Disbursed Amount (approx) to calc fee? 
                    // Or loan.processingFee is total?
                    // Usually processingFee is fixed or % of amount.
                    // Let's assume the 'fee' entry in standard logic covers the original fee.
                    const feePercentage = loan.processingFeePercentage || 0;
                    // Use amountToShowAtDisbursal for Fee calc to avoid inflating fee?
                    // Or if fee was stored.. 
                    // Standard logic:
                    const processingFee = (Number(amountToShowAtDisbursal) * feePercentage) / 100;
                    if (processingFee > 0) {
                        flatLedgerEntries.push({
                            date: disbursalDate,
                            particulars: `Proc. Fee (${loan.customerName})`,
                            type: 'credit',
                            category: 'fee',
                            amount: processingFee,
                            customerId: (loan as any).customerId
                        });
                    }
                }

                // Credit: EMI Payments
                if (loan.repaymentSchedule) {
                    loan.repaymentSchedule.forEach((emi: any) => {
                        // Only record ACTUAL cash received (Status = Paid)
                        if (emi.status === 'Paid' && emi.paymentDate) {
                            flatLedgerEntries.push({
                                date: parseISO(emi.paymentDate),
                                particulars: `EMI Recd: ${loan.customerName}`,
                                type: 'credit',
                                category: 'emi',
                                amount: Number(emi.amount),
                                customerId: (loan as any).customerId
                            });
                        }
                    });
                }

                // Credit: Foreclosure Payment (if amountReceived is true)
                const foreclosureDetails = (loan as any).foreclosureDetails;
                if (foreclosureDetails && foreclosureDetails.amountReceived && foreclosureDetails.date) {
                    flatLedgerEntries.push({
                        date: parseISO(foreclosureDetails.date),
                        particulars: `Foreclosure Recd: ${loan.customerName}`,
                        type: 'credit',
                        category: 'foreclosure',
                        amount: Number(foreclosureDetails.totalPaid),
                        customerId: (loan as any).customerId
                    });
                }
            });

            flatLedgerEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
            setAllEntries(flatLedgerEntries);

            if (flatLedgerEntries.length === 0) {
                setLoading(false);
                return;
            }

            const firstDate = flatLedgerEntries[0].date;
            const lastDate = flatLedgerEntries[flatLedgerEntries.length - 1].date;
            const monthsInterval = eachMonthOfInterval({ start: startOfMonth(firstDate), end: endOfMonth(lastDate) });

            let ledgers: MonthlyLedger[] = [];
            let runningBalance = 0;

            for (const monthDate of monthsInterval) {
                const monthStart = startOfMonth(monthDate);
                const monthEnd = endOfMonth(monthDate);
                const openingBalanceForMonth = runningBalance;

                const entriesInMonth = flatLedgerEntries.filter(entry =>
                    isWithinInterval(entry.date, { start: monthStart, end: monthEnd })
                );

                let monthEndBalance = openingBalanceForMonth;
                entriesInMonth.forEach(entry => {
                    monthEndBalance += (entry.type === 'credit' ? entry.amount : -entry.amount);
                });

                if (entriesInMonth.length > 0 || openingBalanceForMonth !== 0) {
                    ledgers.push({
                        month: monthDate,
                        openingBalance: openingBalanceForMonth,
                        entries: entriesInMonth.reverse(), // Show newest on top for mobile
                        closingBalance: monthEndBalance
                    });
                }
                runningBalance = monthEndBalance;
            }

            setMonthlyLedgers(ledgers.reverse()); // Show newest months first

        } catch (error) {
            console.error("Error generating ledger:", error);
        } finally {
            setLoading(false);
        }
    }, [currentCompany]);

    useEffect(() => {
        generateLedger();
    }, [generateLedger]);

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!expenseForm.amount || !expenseForm.narration) return alert("Please fill all fields");
        if (!currentCompany) return alert("No company selected");

        setIsSubmittingExpense(true);
        try {
            await addDoc(collection(db, "expenses"), {
                date: expenseForm.date,
                amount: Number(expenseForm.amount),
                narration: expenseForm.narration,
                companyId: currentCompany.id,
                createdAt: new Date().toISOString()
            });
            alert("Expense recorded successfully.");
            setShowExpenseModal(false);
            setExpenseForm({ date: format(new Date(), 'yyyy-MM-dd'), amount: '', narration: '' });
            generateLedger();
        } catch (err) {
            console.error(err);
            alert("Failed to save expense.");
        } finally {
            setIsSubmittingExpense(false);
        }
    };

    const openDownloadModal = () => {
        // Default to current month
        const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
        setStartDate(start);
        setEndDate(end);
        setShowDownloadModal(true);
    };

    const handleDownloadPdf = () => {
        if (!startDate || !endDate) {
            alert("Please select both From and To dates for the report.");
            return;
        }

        const start = parseISO(startDate);
        const end = parseISO(endDate);

        // Filter entries for PDF
        const reportEntries = allEntries.filter(e => e.date >= start && e.date <= end);
        // Calculate Opening Balance before start date
        const openingBalEntry = allEntries.filter(e => e.date < start).reduce((acc, curr) => acc + (curr.type === 'credit' ? curr.amount : -curr.amount), 0);

        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(currentCompany?.name || "Finance Company", doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
        doc.setFontSize(14);
        doc.text("Cash Account Ledger", doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Period: ${format(start, 'dd-MMM-yyyy')} to ${format(end, 'dd-MMM-yyyy')}`, 14, 35);

        const tableData: any[] = [];
        let runningBal = openingBalEntry;

        // Opening Row
        tableData.push(['', 'Opening Balance b/f', '', '', formatCurrency(openingBalEntry)]);

        reportEntries.forEach(entry => {
            runningBal += (entry.type === 'credit' ? entry.amount : -entry.amount);
            tableData.push([
                format(entry.date, 'dd-MMM-yyyy'),
                entry.particulars,
                entry.type === 'debit' ? formatCurrency(entry.amount) : '',
                entry.type === 'credit' ? formatCurrency(entry.amount) : '',
                formatCurrency(runningBal)
            ]);
        });

        // Closing Row
        tableData.push(['', 'Closing Balance c/f', '', '', formatCurrency(runningBal)]);

        autoTable(doc, {
            startY: 40,
            head: [['Date', 'Particulars', 'Debit', 'Credit', 'Balance']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 8 },
            columnStyles: {
                2: { halign: 'right', textColor: [200, 0, 0] }, // Debit Red
                3: { halign: 'right', textColor: [0, 150, 0] }, // Credit Green
                4: { halign: 'right', fontStyle: 'bold' }
            },
        });

        doc.save(`Ledger_${startDate}_to_${endDate}.pdf`);
        setShowDownloadModal(false);
    };

    const getIconForCategory = (category: string, type: 'credit' | 'debit') => {
        if (category === 'loan') return 'payments';
        if (category === 'emi') return 'account_balance_wallet';
        if (category === 'fee') return 'percent';
        if (category === 'partner') return 'handshake';
        if (category === 'expense') return 'receipt_long';
        return type === 'credit' ? 'arrow_downward' : 'arrow_upward';
    };

    const getCategoryColorClass = (category: string, type: 'credit' | 'debit') => {
        if (category === 'partner') return 'bg-tertiary-container text-on-tertiary-container';
        if (type === 'credit') return 'bg-primary-container text-on-primary-container';
        return 'bg-error-container text-on-error-container';
    };

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 max-w-md mx-auto bg-background-light dark:bg-background-dark text-on-surface-light dark:text-on-surface-dark font-sans">
            {/* M3 Header */}
            <div className="sticky top-0 z-20 flex items-center bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-sm p-4 pb-3 justify-between border-b border-outline-light/10 dark:border-outline-dark/10 transition-colors" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-3">
                    <Link to="/" className="flex items-center justify-center p-2 rounded-full hover:bg-surface-variant-light/30 dark:hover:bg-surface-variant-dark/30 transition-colors">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </Link>
                    <h2 className="text-xl font-normal">Cash Account</h2>
                </div>
                <div className="flex gap-2">
                    <Link
                        to="/partners"
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container hover:shadow-m3-1 transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px]">group</span>
                    </Link>
                    <button
                        onClick={() => setShowExpenseModal(true)}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-container text-on-primary-container hover:shadow-m3-1 transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats (Current Month Card) */}
            {monthlyLedgers.length > 0 && (
                <div className="px-4 py-4 grid grid-cols-2 gap-3">
                    <div className="bg-primary-container dark:bg-primary-container-dark p-4 rounded-2xl shadow-m3-1 text-on-primary-container dark:text-on-primary-container">
                        <span className="text-xs font-medium opacity-80 uppercase tracking-wider">Month Closing</span>
                        <div className="text-2xl font-normal mt-1">{formatCurrency(monthlyLedgers[0].closingBalance)}</div>
                    </div>
                    <div
                        className="bg-surface-light dark:bg-[#1e2736] p-4 rounded-2xl shadow-m3-1 border border-outline-light/10 flex flex-col items-center justify-center cursor-pointer hover:bg-surface-variant-light/20 transition-colors ripple"
                        onClick={openDownloadModal}
                    >
                        <span className="material-symbols-outlined text-primary mb-1">download</span>
                        <span className="text-xs font-medium text-primary">Download Report</span>
                    </div>
                </div>
            )}

            {/* Ledger List */}
            <div className="px-4 pb-4 space-y-6">
                {loading ? (
                    <div className="flex justify-center py-12"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>
                ) : monthlyLedgers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant-light opacity-50">
                        <span className="material-symbols-outlined text-6xl mb-4">account_balance_wallet</span>
                        <p>No transactions found.</p>
                    </div>
                ) : (
                    monthlyLedgers.map((ledger, idx) => (
                        <div key={idx} className="space-y-2">
                            <div className="flex items-center justify-between px-2 py-1 sticky top-16 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm">
                                <h3 className="text-sm font-medium text-primary dark:text-primary-dark">{format(ledger.month, 'MMMM yyyy')}</h3>
                                <span className="text-xs font-medium text-on-surface-variant-light bg-surface-variant-light/50 dark:bg-surface-variant-dark/50 px-2 py-1 rounded-md">
                                    Op: {formatCurrency(ledger.openingBalance)}
                                </span>
                            </div>

                            <div className="bg-surface-light dark:bg-[#1e2736] rounded-[20px] shadow-sm border border-outline-light/10 overflow-hidden">
                                {ledger.entries.map((entry, eIdx) => {
                                    const isCredit = entry.type === 'credit';

                                    return (
                                        <div key={eIdx} className={`flex items-center justify-between p-4 hover:bg-surface-variant-light/30 dark:hover:bg-surface-variant-dark/30 transition-colors ${eIdx !== ledger.entries.length - 1 ? 'border-b border-outline-light/10' : ''}`}>
                                            <div className="flex items-center gap-4 overflow-hidden">
                                                {(() => {
                                                    const customer = entry.customerId ? customers.find(c => c.id === entry.customerId) : null;
                                                    if (customer?.photo_url) {
                                                        return (
                                                            <img src={customer.photo_url} alt="C" className="h-10 w-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                                                        );
                                                    }
                                                    return (
                                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${getCategoryColorClass(entry.category, entry.type)}`}>
                                                            <span className="material-symbols-outlined text-xl">
                                                                {getIconForCategory(entry.category, entry.type)}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-medium text-on-surface-light dark:text-on-surface-dark truncate">
                                                        {entry.particulars}
                                                    </span>
                                                    <span className="text-xs text-on-surface-variant-light dark:text-on-surface-variant-dark">
                                                        {format(entry.date, 'dd MMM, hh:mm a')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className={`text-right font-medium text-sm whitespace-nowrap ml-2 ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-on-surface-light dark:text-on-surface-dark'
                                                }`}>
                                                {isCredit ? '+' : '-'} {Math.abs(entry.amount).toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Expense Modal */}
            {showExpenseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95">
                    <div className="bg-surface-light dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-m3-3 p-6">
                        <h3 className="text-xl font-normal mb-6 text-on-surface-light dark:text-on-surface-dark">Record Expense</h3>
                        <form onSubmit={handleAddExpense} className="space-y-5">
                            <div className="relative group">
                                <input
                                    type="date"
                                    required
                                    value={expenseForm.date}
                                    onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                                    className="peer w-full rounded-[4px] border border-outline-light dark:border-outline-dark bg-transparent px-3 py-3 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary focus:ring-0 outline-none transition-all placeholder-transparent"
                                    placeholder="Date"
                                />
                                <label className="absolute left-3 -top-2.5 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-primary dark:text-primary-dark transition-all">Date</label>
                            </div>
                            <div className="relative group">
                                <input
                                    type="number"
                                    required
                                    placeholder="Amount"
                                    value={expenseForm.amount}
                                    onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                    className="peer w-full rounded-[4px] border border-outline-light dark:border-outline-dark bg-transparent px-3 py-3 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary focus:ring-0 outline-none transition-all placeholder-transparent"
                                />
                                <label className="absolute left-3 -top-2.5 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-primary dark:text-primary-dark transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-placeholder-shown:text-on-surface-variant-light peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary">Amount</label>
                            </div>
                            <div className="relative group">
                                <textarea
                                    required
                                    placeholder="Narration"
                                    value={expenseForm.narration}
                                    onChange={e => setExpenseForm({ ...expenseForm, narration: e.target.value })}
                                    className="peer w-full rounded-[4px] border border-outline-light dark:border-outline-dark bg-transparent px-3 py-3 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary focus:ring-0 outline-none resize-none h-24 placeholder-transparent"
                                />
                                <label className="absolute left-3 -top-2.5 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-primary dark:text-primary-dark transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-placeholder-shown:text-on-surface-variant-light peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary">Narration</label>
                            </div>
                            <div className="flex gap-2 justify-end pt-2">
                                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-full transition-colors">Cancel</button>
                                <button type="submit" disabled={isSubmittingExpense} className="px-6 py-2.5 bg-primary text-on-primary rounded-full text-sm font-medium shadow-m3-1 hover:shadow-m3-2 transition-all disabled:opacity-70">
                                    {isSubmittingExpense ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Download Modal */}
            {showDownloadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95">
                    <div className="bg-surface-light dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-m3-3 p-6">
                        <h3 className="text-xl font-normal mb-6 text-on-surface-light dark:text-on-surface-dark">Download Ledger Report</h3>
                        <div className="space-y-5">
                            <div className="relative group">
                                <input
                                    type="date"
                                    required
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    className="peer w-full rounded-[4px] border border-outline-light dark:border-outline-dark bg-transparent px-3 py-3 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary focus:ring-0 outline-none transition-all placeholder-transparent"
                                    placeholder="Start Date"
                                />
                                <label className="absolute left-3 -top-2.5 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-primary dark:text-primary-dark transition-all">From Date</label>
                            </div>
                            <div className="relative group">
                                <input
                                    type="date"
                                    required
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    className="peer w-full rounded-[4px] border border-outline-light dark:border-outline-dark bg-transparent px-3 py-3 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary focus:ring-0 outline-none transition-all placeholder-transparent"
                                    placeholder="End Date"
                                />
                                <label className="absolute left-3 -top-2.5 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-primary dark:text-primary-dark transition-all">To Date</label>
                            </div>

                            <div className="flex gap-2 justify-end pt-2">
                                <button onClick={() => setShowDownloadModal(false)} className="px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-full transition-colors">Cancel</button>
                                <button onClick={handleDownloadPdf} className="px-6 py-2.5 bg-primary text-on-primary rounded-full text-sm font-medium shadow-m3-1 hover:shadow-m3-2 transition-all flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">download</span> Download PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default FinanceOverview;