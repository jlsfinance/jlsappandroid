import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
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
    category: 'loan' | 'emi' | 'partner' | 'expense' | 'fee';
    amount: number;
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
  const [monthlyLedgers, setMonthlyLedgers] = useState<MonthlyLedger[]>([]);
  const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: '',
      narration: ''
  });
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const generateLedger = useCallback(async () => {
    setLoading(true);
    try {
        const [partnerTxSnap, loansSnap, expensesSnap] = await Promise.all([
            getDocs(query(collection(db, "partner_transactions"))),
            getDocs(query(collection(db, "loans"), where("status", "in", ["Disbursed", "Active", "Completed", "Overdue"]))),
            getDocs(query(collection(db, "expenses")))
        ]);
        
        const partnerTxs = partnerTxSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartnerTransaction));
        const loans = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
        const expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        
        let flatLedgerEntries: LedgerEntry[] = [];

        // 1. Process Partner Transactions
        // Logic Update: Investment = Money In (Credit), Withdrawal = Money Out (Debit)
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

        // 3. Process Loans
        loans.forEach(loan => {
            if (loan.disbursalDate) {
                const disbursalDate = parseISO(loan.disbursalDate);
                // Debit: Loan Amount Out
                flatLedgerEntries.push({
                    date: disbursalDate,
                    particulars: `Loan to ${loan.customerName}`,
                    type: 'debit',
                    category: 'loan',
                    amount: Number(loan.amount),
                });
                
                // Credit: Processing Fee In
                const feePercentage = loan.processingFeePercentage || 0;
                const processingFee = (Number(loan.amount) * feePercentage) / 100;
                if (processingFee > 0) {
                    flatLedgerEntries.push({
                        date: disbursalDate,
                        particulars: `Proc. Fee (${loan.customerName})`,
                        type: 'credit',
                        category: 'fee',
                        amount: processingFee,
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
                        });
                    }
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
  }, []);

  useEffect(() => {
    generateLedger();
  }, [generateLedger]);

  const handleAddExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!expenseForm.amount || !expenseForm.narration) return alert("Please fill all fields");
      
      setIsSubmittingExpense(true);
      try {
          await addDoc(collection(db, "expenses"), {
              date: expenseForm.date,
              amount: Number(expenseForm.amount),
              narration: expenseForm.narration,
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

  const handleDownloadPdf = () => {
    if (!startDate || !endDate) {
        alert("Please select both From and To dates for the report.");
        return;
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    // Filter entries for PDF
    const reportEntries = allEntries.filter(e => e.date >= start && e.date <= end);
    const openingBalEntry = allEntries.filter(e => e.date < start).reduce((acc, curr) => acc + (curr.type === 'credit' ? curr.amount : -curr.amount), 0);

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("JLS Finance Company", doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text("Cash Account Ledger", doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });
    doc.setFontSize(10);
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
  };

  const getIconForCategory = (category: string, type: 'credit' | 'debit') => {
      if (category === 'loan') return 'payments';
      if (category === 'emi') return 'account_balance_wallet';
      if (category === 'fee') return 'percent';
      if (category === 'partner') return 'handshake';
      if (category === 'expense') return 'receipt_long';
      return type === 'credit' ? 'arrow_downward' : 'arrow_upward';
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 max-w-md mx-auto bg-background-light dark:bg-background-dark shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md p-4 pb-2 justify-between border-b border-slate-200/50 dark:border-slate-800/50 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800">
             <span className="material-symbols-outlined dark:text-white">arrow_back</span>
          </Link>
          <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">Cash Account</h2>
        </div>
        <div className="flex gap-2">
            <Link 
                to="/partners"
                className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all"
            >
                <span className="material-symbols-outlined text-[16px]">group</span>
            </Link>
            <button 
                onClick={() => setShowExpenseModal(true)}
                className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
                <span className="material-symbols-outlined text-[16px]">add</span> Exp
            </button>
        </div>
      </div>

      {/* Quick Stats (Current Month) */}
      {monthlyLedgers.length > 0 && (
          <div className="px-4 py-4 grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-[#1e2736] p-3 rounded-xl border border-green-100 dark:border-slate-700 shadow-sm">
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Month Closing</span>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-white">{formatCurrency(monthlyLedgers[0].closingBalance)}</div>
              </div>
              <div className="bg-white dark:bg-[#1e2736] p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center cursor-pointer hover:bg-slate-50" onClick={handleDownloadPdf}>
                  <div className="flex flex-col items-center gap-1 text-primary">
                      <span className="material-symbols-outlined">download</span>
                      <span className="text-xs font-bold">Download Report</span>
                  </div>
              </div>
          </div>
      )}

      {/* Ledger List */}
      <div className="p-4 space-y-6">
        {loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
        ) : monthlyLedgers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">account_balance_wallet</span>
                <p>No transactions found.</p>
            </div>
        ) : (
            monthlyLedgers.map((ledger, idx) => (
                <div key={idx} className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="font-bold text-slate-800 dark:text-white">{format(ledger.month, 'MMMM yyyy')}</h3>
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                            Op: {formatCurrency(ledger.openingBalance)}
                        </span>
                    </div>
                    
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {ledger.entries.map((entry, eIdx) => {
                            const isCredit = entry.type === 'credit';
                            const isPartner = entry.category === 'partner';
                            
                            return (
                                <div key={eIdx} className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                                            isPartner ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' :
                                            isCredit ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 'bg-red-50 text-red-600 dark:bg-red-900/20'
                                        }`}>
                                            <span className="material-symbols-outlined text-xl">
                                                {getIconForCategory(entry.category, entry.type)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate leading-tight">
                                                    {entry.particulars}
                                                </span>
                                                {isPartner && <span className="text-[9px] bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 px-1.5 rounded font-bold uppercase">Capital</span>}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-medium">
                                                {format(entry.date, 'dd MMM, hh:mm a')}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`text-right font-mono font-bold text-sm whitespace-nowrap ${
                                        isCredit ? 'text-green-600' : 'text-slate-900 dark:text-white'
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                  <h3 className="text-lg font-bold mb-4">Record Expense</h3>
                  <form onSubmit={handleAddExpense} className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 mb-1 block">Date</label>
                          <input 
                            type="date" 
                            required
                            value={expenseForm.date} 
                            onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} 
                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary" 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 mb-1 block">Amount</label>
                          <input 
                            type="number" 
                            required
                            placeholder="0.00"
                            value={expenseForm.amount} 
                            onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} 
                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary" 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 mb-1 block">Narration</label>
                          <textarea 
                            required
                            placeholder="E.g. Office Rent, Electricity Bill..."
                            value={expenseForm.narration} 
                            onChange={e => setExpenseForm({...expenseForm, narration: e.target.value})} 
                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary resize-none h-20" 
                          />
                      </div>
                      <div className="flex gap-3 justify-end pt-2">
                          <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 font-bold text-slate-500">Cancel</button>
                          <button type="submit" disabled={isSubmittingExpense} className="px-6 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50">
                              {isSubmittingExpense ? 'Saving...' : 'Save'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
};

export default FinanceOverview;