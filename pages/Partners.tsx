import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, addDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Interfaces
interface Partner { id: string; name: string; }
interface Transaction { id: string; partnerId: string; partnerName?: string; type: 'investment' | 'withdrawal'; amount: number; date: string; }
interface Loan { id: string; amount: number; processingFee: number; interestRate: number; tenure: number; emi: number; disbursalDate: string; actualDisbursed: number; repaymentSchedule: { dueDate: string, status: 'Paid' | 'Pending' }[] }
interface Receipt { id: string; loanId: string, amount: number; paymentDate: string; emiNumber: number; }
interface PartnerLedgerEntry { date: Date; particulars: string; type: 'credit' | 'debit'; amount: number; }

const formatCurrency = (value: number) => `Rs. ${new Intl.NumberFormat('en-IN').format(value)}`;

const Partners: React.FC = () => {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Form State
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPartnerModal, setShowPartnerModal] = useState(false);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    
    const [partnerFormName, setPartnerFormName] = useState('');
    const [transactionForm, setTransactionForm] = useState({
        partnerId: '',
        type: 'investment',
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd')
    });

    // Ledger Modal State
    const [ledgerPartner, setLedgerPartner] = useState<Partner | null>(null);
    const [ledgerEntries, setLedgerEntries] = useState<PartnerLedgerEntry[]>([]);
    const [ledgerStartDate, setLedgerStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [ledgerEndDate, setLedgerEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const partnersSnap = await getDocs(query(collection(db, "partners"), orderBy("name")));
            const partnersData = partnersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Partner[];
            setPartners(partnersData);

            const transactionsSnap = await getDocs(query(collection(db, "partner_transactions"), orderBy("date", "desc")));
            const transactionsData = transactionsSnap.docs.map(doc => {
                const data = doc.data() as Omit<Transaction, 'id' | 'partnerName'>;
                const partner = partnersData.find(p => p.id === data.partnerId);
                return { id: doc.id, ...data, partnerName: partner?.name || 'Unknown' };
            }) as Transaction[];
            setTransactions(transactionsData);

            const loansSnap = await getDocs(query(collection(db, "loans"), where("status", "in", ["Disbursed", "Completed", "Active", "Overdue"])));
            const loansData = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Loan[];
            setLoans(loansData);
            
            const receiptsSnap = await getDocs(query(collection(db, "receipts")));
            const validReceipts = receiptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt));
            setReceipts(validReceipts);

        } catch (error) {
            console.error(error);
            alert('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const partnerCapitals = useMemo(() => {
        return partners.map(partner => {
            const partnerTransactions = transactions.filter(t => t.partnerId === partner.id);
            const capital = partnerTransactions.reduce((acc, t) => {
                return acc + (t.type === 'investment' ? t.amount : -t.amount);
            }, 0);
            return { name: partner.name, capital };
        });
    }, [partners, transactions]);

    const monthlyCalculations = useMemo(() => {
        if (!selectedMonth) return { totalProfit: 0, processingFees: 0, interestCollected: 0, profitSplits: [] };
        
        const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
        const monthEnd = endOfMonth(parseISO(`${selectedMonth}-01`));

        const processingFees = loans
            .filter(l => l.disbursalDate && isWithinInterval(parseISO(l.disbursalDate), { start: monthStart, end: monthEnd }))
            .reduce((sum, l) => sum + (Number(l.processingFee) || 0), 0);
        
        const interestCollected = receipts
            .filter(r => r.paymentDate && isWithinInterval(parseISO(r.paymentDate), { start: monthStart, end: monthEnd }))
            .reduce((sum, receipt) => {
                const loan = loans.find(l => l.id === receipt.loanId);
                if (!loan) return sum;
                const monthlyInterestRate = (loan.interestRate || 0) / 12 / 100;
                
                let balance = Number(loan.amount);
                // Simplified Interest Calculation for Receipts
                // Ideally this should use the exact principal outstanding at payment time from receipt/schedule
                // Estimation: Interest portion of this EMI based on schedule logic if available, or simple approximation
                const interestComponent = (balance * monthlyInterestRate); // Rough estimate for display
                return sum + interestComponent;
            }, 0);
            
        // Simplified Total Profit = Fees + Estimated Interest
        const totalProfit = processingFees + interestCollected;

        if (partners.length === 0) return { totalProfit, processingFees, interestCollected, profitSplits: [] };

        // Fixed 4:3:3 profit sharing logic
        const profitRatios: { [key: string]: number } = {
            'jitu': 4,
            'lavneet': 3,
            'sandeep': 3,
        };
        const totalRatio = Object.values(profitRatios).reduce((sum, ratio) => sum + ratio, 0);

        const profitSplits = partners.map(p => {
            const capitalInfo = partnerCapitals.find(c => c.name === p.name);
            const ratio = profitRatios[p.name.toLowerCase().split(' ')[0]] || 0; // Match first name
            const sharePercent = totalRatio > 0 ? (ratio / totalRatio) * 100 : 0;
            const profit = (sharePercent / 100) * totalProfit;
            return {
                name: p.name,
                capital: capitalInfo?.capital || 0,
                sharePercent: sharePercent,
                profit: profit
            };
        });

        return { totalProfit, processingFees, interestCollected, profitSplits };
    }, [selectedMonth, loans, receipts, partners, partnerCapitals]);

    const prepareLedgerData = useCallback((partnerId: string) => {
        const partnerTransactions = transactions.filter(t => t.partnerId === partnerId);
        let entries: PartnerLedgerEntry[] = partnerTransactions.map(t => ({
            date: parseISO(t.date),
            particulars: `Capital ${t.type}`,
            type: t.type === 'investment' ? 'credit' : 'debit',
            amount: Number(t.amount),
        }));
        
        // Add monthly profits to ledger (Simplified: Adds current selected month profit as an entry)
        const partner = partners.find(p => p.id === partnerId);
        if (partner) {
            monthlyCalculations.profitSplits.forEach(split => {
                if (split.name === partner.name && split.profit > 0) {
                     entries.push({
                        date: endOfMonth(parseISO(`${selectedMonth}-01`)),
                        particulars: `Profit Share for ${format(parseISO(`${selectedMonth}-01`), 'MMM yyyy')}`,
                        type: 'credit',
                        amount: split.profit,
                    });
                }
            });
        }
        
        entries.sort((a,b) => a.date.getTime() - b.date.getTime());
        setLedgerEntries(entries);
    }, [transactions, partners, monthlyCalculations, selectedMonth]);

    const filteredLedgerEntries = useMemo(() => {
        if (!ledgerStartDate) return ledgerEntries;
        const start = parseISO(ledgerStartDate);
        const end = ledgerEndDate ? parseISO(ledgerEndDate) : new Date();
        return ledgerEntries.filter(entry => isWithinInterval(entry.date, { start, end }));
    }, [ledgerEntries, ledgerStartDate, ledgerEndDate]);

    const ledgerOpeningBalance = useMemo(() => {
        if (!ledgerStartDate) return 0;
        const start = parseISO(ledgerStartDate);
        return ledgerEntries
            .filter(entry => entry.date < start)
            .reduce((acc, entry) => acc + (entry.type === 'credit' ? entry.amount : -entry.amount), 0);
    }, [ledgerEntries, ledgerStartDate]);


    const handleDownloadLedgerPdf = () => {
        if (!ledgerPartner) return;

        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("Partner Capital Ledger", doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
        doc.setFontSize(14);
        doc.text(ledgerPartner.name, doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`Period: ${ledgerStartDate} to ${ledgerEndDate}`, 14, 35);

        let balance = ledgerOpeningBalance;
        const body = filteredLedgerEntries.map(entry => {
            balance += (entry.type === 'credit' ? entry.amount : -entry.amount);
            return [
                format(entry.date, 'dd-MMM-yyyy'),
                entry.particulars,
                entry.type === 'debit' ? formatCurrency(entry.amount) : '',
                entry.type === 'credit' ? formatCurrency(entry.amount) : '',
                formatCurrency(balance),
            ];
        });

        body.unshift(['', 'Opening Balance', '', '', formatCurrency(ledgerOpeningBalance)]);
        body.push(['', 'Closing Balance', '', '', formatCurrency(balance)]);

        autoTable(doc, {
            head: [['Date', 'Particulars', 'Debit', 'Credit', 'Balance']],
            body,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            didDrawCell: (data) => {
                if (data.row.index === 0 || data.row.index === body.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
        
        doc.save(`${ledgerPartner.name}_Ledger.pdf`);
    }
    
    const monthlyCashFlow = useMemo(() => {
        if (!selectedMonth) return { totalInflow: 0, totalOutflow: 0, netFlow: 0 };
        
        const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
        const monthEnd = endOfMonth(parseISO(`${selectedMonth}-01`));

        const monthTransactions = transactions.filter(t => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }));
        const investments = monthTransactions.filter(t => t.type === 'investment').reduce((sum, t) => sum + Number(t.amount), 0);
        const withdrawals = monthTransactions.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + Number(t.amount), 0);
        
        const emiCollected = receipts
            .filter(r => r.paymentDate && isWithinInterval(parseISO(r.paymentDate), { start: monthStart, end: monthEnd }))
            .reduce((sum, r) => sum + Number(r.amount), 0);

        const loansDisbursed = loans
            .filter(l => l.disbursalDate && isWithinInterval(parseISO(l.disbursalDate), { start: monthStart, end: monthEnd }))
            .reduce((sum, l) => sum + (l.actualDisbursed || Number(l.amount)), 0);
        
        const totalInflow = investments + emiCollected;
        const totalOutflow = withdrawals + loansDisbursed;
        const netFlow = totalInflow - totalOutflow;

        return { totalInflow, totalOutflow, netFlow };

    }, [selectedMonth, transactions, loans, receipts]);
    
    const onPartnerSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!partnerFormName) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "partners"), { name: partnerFormName });
            setPartnerFormName("");
            setShowPartnerModal(false);
            fetchData();
        } catch (error) {
            alert('Failed to add partner');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const onTransactionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transactionForm.partnerId || !transactionForm.amount) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "partner_transactions"), {
                ...transactionForm,
                amount: Number(transactionForm.amount)
            });
            setTransactionForm({ partnerId: '', type: 'investment', amount: '', date: format(new Date(), 'yyyy-MM-dd') });
            setShowTransactionModal(false);
            fetchData();
        } catch (error) {
            alert('Failed to record transaction');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (loading) return <div className="flex h-screen w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>;

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <Link to="/finance" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">Partner Capital</h1>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 space-y-6">
                
                {/* Actions */}
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">Partners & Capital</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setShowTransactionModal(true)} className="flex items-center gap-1 bg-primary text-white px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-primary/90">
                            <span className="material-symbols-outlined text-sm">add</span> Transaction
                        </button>
                        <button onClick={() => setShowPartnerModal(true)} className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-slate-50 dark:hover:bg-slate-700">
                            <span className="material-symbols-outlined text-sm">person_add</span> Partner
                        </button>
                    </div>
                </div>

                {/* Monthly Report Card */}
                <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Controls & Summary */}
                        <div className="md:w-1/3 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Select Month</label>
                                <input 
                                    type="month" 
                                    value={selectedMonth} 
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                                />
                            </div>
                            
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-3">
                                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">Cash Flow Summary</h4>
                                <div className="flex justify-between text-sm text-green-600">
                                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">arrow_downward</span> Inflow</span> 
                                    <span className="font-bold">{formatCurrency(monthlyCashFlow.totalInflow)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-red-600">
                                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">arrow_upward</span> Outflow</span> 
                                    <span className="font-bold">{formatCurrency(monthlyCashFlow.totalOutflow)}</span>
                                </div>
                                <div className={`flex justify-between font-bold text-sm border-t border-slate-200 dark:border-slate-700 pt-2 ${monthlyCashFlow.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    <span>Net Flow:</span> 
                                    <span>{formatCurrency(monthlyCashFlow.netFlow)}</span>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2 text-sm">
                                <h4 className="font-bold text-slate-700 dark:text-slate-300">Profit Breakdown</h4>
                                <div className="flex justify-between"><span>Processing Fees:</span> <span className="font-medium">{formatCurrency(monthlyCalculations.processingFees)}</span></div>
                                <div className="flex justify-between"><span>Est. Interest:</span> <span className="font-medium">{formatCurrency(monthlyCalculations.interestCollected)}</span></div>
                                <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-700 pt-2"><span>Total Profit:</span> <span>{formatCurrency(monthlyCalculations.totalProfit)}</span></div>
                            </div>
                        </div>

                        {/* Split Table */}
                        <div className="md:w-2/3">
                            <h4 className="font-bold text-lg mb-4">Profit Split (4:3:3)</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                                        <tr>
                                            <th className="px-4 py-3">Partner</th>
                                            <th className="px-4 py-3">Capital</th>
                                            <th className="px-4 py-3">Share %</th>
                                            <th className="px-4 py-3 text-right">Profit Share</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {monthlyCalculations.profitSplits.length > 0 ? monthlyCalculations.profitSplits.map(s => (
                                            <tr key={s.name}>
                                                <td className="px-4 py-3 font-medium">{s.name}</td>
                                                <td className="px-4 py-3">{formatCurrency(s.capital)}</td>
                                                <td className="px-4 py-3">{s.sharePercent.toFixed(2)}%</td>
                                                <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(s.profit)}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No data for selected month.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Partner List & Transactions */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Partner Summary */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800"><h3 className="font-bold">Partner Summary</h3></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3 text-right">Net Capital</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {partners.map(p => {
                                        const capitalInfo = partnerCapitals.find(c => c.name === p.name);
                                        return (
                                            <tr key={p.id}>
                                                <td className="px-4 py-3 font-medium">{p.name}</td>
                                                <td className="px-4 py-3 text-right font-bold">{formatCurrency(capitalInfo?.capital || 0)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button 
                                                        onClick={() => { setLedgerPartner(p); prepareLedgerData(p.id); }}
                                                        className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 px-2 py-1 rounded font-bold"
                                                    >
                                                        Ledger
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800"><h3 className="font-bold">Recent Transactions</h3></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3">Partner</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {transactions.slice(0, 5).map(t => (
                                        <tr key={t.id}>
                                            <td className="px-4 py-3 font-medium">{t.partnerName}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-0.5 rounded font-bold capitalize ${t.type === 'investment' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {t.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{format(parseISO(t.date), 'dd MMM')}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCurrency(t.amount)}</td>
                                        </tr>
                                    ))}
                                    {transactions.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No transactions yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Transaction Modal */}
            {showTransactionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-4">Record Transaction</h3>
                        <form onSubmit={onTransactionSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Partner</label>
                                <select 
                                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                    value={transactionForm.partnerId}
                                    onChange={e => setTransactionForm({...transactionForm, partnerId: e.target.value})}
                                    required
                                >
                                    <option value="">Select Partner</option>
                                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Type</label>
                                <select 
                                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                    value={transactionForm.type}
                                    onChange={e => setTransactionForm({...transactionForm, type: e.target.value as any})}
                                >
                                    <option value="investment">Investment</option>
                                    <option value="withdrawal">Withdrawal</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Amount</label>
                                <input 
                                    type="number" 
                                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                    value={transactionForm.amount}
                                    onChange={e => setTransactionForm({...transactionForm, amount: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Date</label>
                                <input 
                                    type="date" 
                                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                    value={transactionForm.date}
                                    onChange={e => setTransactionForm({...transactionForm, date: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button type="button" onClick={() => setShowTransactionModal(false)} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Partner Modal */}
            {showPartnerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-4">Add Partner</h3>
                        <form onSubmit={onPartnerSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Name</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                    value={partnerFormName}
                                    onChange={e => setPartnerFormName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button type="button" onClick={() => setShowPartnerModal(false)} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90">Add</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Ledger Modal */}
            {ledgerPartner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-2xl shadow-2xl p-6 max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-bold">{ledgerPartner.name} Ledger</h3>
                                <p className="text-xs text-slate-500">Capital Account</p>
                            </div>
                            <button onClick={() => setLedgerPartner(null)} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        
                        <div className="flex gap-2 mb-4 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                            <input type="date" value={ledgerStartDate} onChange={e => setLedgerStartDate(e.target.value)} className="text-xs p-1 rounded border" />
                            <span className="text-xs self-center">to</span>
                            <input type="date" value={ledgerEndDate} onChange={e => setLedgerEndDate(e.target.value)} className="text-xs p-1 rounded border" />
                            <button onClick={handleDownloadLedgerPdf} className="ml-auto text-xs bg-primary text-white px-2 py-1 rounded font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">download</span> PDF</button>
                        </div>

                        <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 dark:bg-slate-900 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">Date</th>
                                        <th className="px-3 py-2">Particulars</th>
                                        <th className="px-3 py-2 text-right">Debit</th>
                                        <th className="px-3 py-2 text-right">Credit</th>
                                        <th className="px-3 py-2 text-right">Bal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                                        <td colSpan={4} className="px-3 py-2">Opening Balance</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(ledgerOpeningBalance)}</td>
                                    </tr>
                                    {(() => {
                                        let runningBalance = ledgerOpeningBalance;
                                        return filteredLedgerEntries.map((entry, idx) => {
                                            runningBalance += entry.type === 'credit' ? entry.amount : -entry.amount;
                                            return (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                    <td className="px-3 py-2 whitespace-nowrap">{format(entry.date, 'dd-MM-yyyy')}</td>
                                                    <td className="px-3 py-2">{entry.particulars}</td>
                                                    <td className="px-3 py-2 text-right text-red-600">{entry.type === 'debit' ? formatCurrency(entry.amount) : ''}</td>
                                                    <td className="px-3 py-2 text-right text-green-600">{entry.type === 'credit' ? formatCurrency(entry.amount) : ''}</td>
                                                    <td className="px-3 py-2 text-right font-bold">{formatCurrency(runningBalance)}</td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Partners;