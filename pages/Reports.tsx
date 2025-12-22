import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCompany } from '../context/CompanyContext';

// --- Types ---
interface Loan { id: string; customerId: string; customerName: string; amount: number; interestRate: number; disbursalDate: string; status: string; repaymentSchedule: any[]; processingFee: number; }
interface Receipt { id: string; amount: number; paymentDate: string; customerName: string; loanId: string; emiNumber: number; }
interface Customer { id: string; name: string; phone?: string; }

// --- Helpers ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const Reports: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();
    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);

    // Data State
    const [loans, setLoans] = useState<Loan[]>([]);
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);

    // Filter States
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');

    useEffect(() => {
        const fetchData = async () => {
            if (!currentCompany) {
                setLoading(false);
                return;
            }

            try {
                const [loansSnap, receiptsSnap, customersSnap] = await Promise.all([
                    getDocs(query(collection(db, "loans"), where("companyId", "==", currentCompany.id))),
                    getDocs(query(collection(db, "receipts"), where("companyId", "==", currentCompany.id))),
                    getDocs(query(collection(db, "customers"), where("companyId", "==", currentCompany.id)))
                ]);

                setLoans(loansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan)));
                setReceipts(receiptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt)));
                setCustomers(customersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
            } catch (e) {
                console.error("Error fetching report data", e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [currentCompany]);

    // --- Reports Logic ---

    const summaryData = useMemo(() => {
        const totalLent = loans.reduce((sum, l) => sum + (l.status !== 'Rejected' && l.status !== 'Pending' ? Number(l.amount) : 0), 0);
        const totalCollected = receipts.reduce((sum, r) => sum + Number(r.amount), 0);

        // Estimate outstanding principal (simplified)
        let totalOutstanding = 0;
        let activeLoansCount = 0;
        loans.forEach(l => {
            if (['Disbursed', 'Active', 'Overdue'].includes(l.status)) {
                activeLoansCount++;
                const paidEmis = l.repaymentSchedule?.filter((e: any) => e.status === 'Paid').length || 0;
                const totalEmis = l.repaymentSchedule?.length || 0;
                if (totalEmis > 0) {
                    // Approximate
                    totalOutstanding += (Number(l.amount) * (1 - (paidEmis / totalEmis)));
                } else {
                    totalOutstanding += Number(l.amount);
                }
            }
        });

        return { totalLent, totalCollected, totalOutstanding, activeLoansCount };
    }, [loans, receipts]);

    const arrearsData = useMemo(() => {
        const overdueItems: any[] = [];
        loans.forEach(loan => {
            if (['Active', 'Disbursed', 'Overdue'].includes(loan.status) && loan.repaymentSchedule) {
                loan.repaymentSchedule.forEach((emi: any) => {
                    if (emi.status === 'Pending' && new Date(emi.dueDate) < new Date()) {
                        overdueItems.push({
                            customerName: loan.customerName,
                            loanId: loan.id,
                            dueDate: emi.dueDate,
                            amount: emi.amount,
                            emiNumber: emi.emiNumber
                        });
                    }
                });
            }
        });
        return overdueItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [loans]);

    const monthlyCollectionData = useMemo(() => {
        const start = startOfMonth(parseISO(`${selectedMonth}-01`));
        const end = endOfMonth(parseISO(`${selectedMonth}-01`));
        return receipts.filter(r => isWithinInterval(parseISO(r.paymentDate), { start, end }));
    }, [receipts, selectedMonth]);

    const lentData = useMemo(() => {
        const start = startOfMonth(parseISO(`${selectedMonth}-01`));
        const end = endOfMonth(parseISO(`${selectedMonth}-01`));
        return loans.filter(l =>
            l.disbursalDate && isWithinInterval(parseISO(l.disbursalDate), { start, end }) &&
            ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status)
        );
    }, [loans, selectedMonth]);

    const ledgerData = useMemo(() => {
        if (!selectedCustomer) return [];
        const customerLoans = loans.filter(l => l.customerId === selectedCustomer);
        const customerReceipts = receipts.filter(r => customerLoans.some(l => l.id === r.loanId));

        const entries: any[] = [];
        customerLoans.forEach(l => {
            if (l.disbursalDate) {
                entries.push({ date: l.disbursalDate, type: 'Debit', desc: `Loan Disbursed (ID: ${l.id})`, amount: l.amount });
            }
        });
        customerReceipts.forEach(r => {
            entries.push({ date: r.paymentDate, type: 'Credit', desc: `Payment Recd (Loan: ${r.loanId})`, amount: r.amount });
        });
        return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [loans, receipts, selectedCustomer]);

    // --- PDF Export ---
    const downloadPDF = (title: string, columns: string[], data: any[]) => {
        const doc = new jsPDF();
        doc.text(title, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);

        autoTable(doc, {
            head: [columns],
            body: data,
            startY: 25,
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }
        });
        doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    };

    // --- Render Components ---

    const renderTabContent = () => {
        switch (activeTab) {
            case 'summary':
                return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                                <p className="text-xs text-indigo-600 dark:text-indigo-300 font-bold uppercase">Total Disbursed</p>
                                <p className="text-2xl font-bold text-indigo-900 dark:text-white">{formatCurrency(summaryData.totalLent)}</p>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
                                <p className="text-xs text-green-600 dark:text-green-300 font-bold uppercase">Total Collected</p>
                                <p className="text-2xl font-bold text-green-900 dark:text-white">{formatCurrency(summaryData.totalCollected)}</p>
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-800">
                                <p className="text-xs text-purple-600 dark:text-purple-300 font-bold uppercase">Est. Outstanding</p>
                                <p className="text-2xl font-bold text-purple-900 dark:text-white">{formatCurrency(summaryData.totalOutstanding)}</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-slate-500 font-bold uppercase">Active Loans</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{summaryData.activeLoansCount}</p>
                            </div>
                        </div>
                    </div>
                );

            case 'arrears':
                return (
                    <div className="space-y-4 animate-in fade-in">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg">Arrears Report</h3>
                            <button
                                onClick={() => downloadPDF('Arrears Report', ['Customer', 'Loan ID', 'Due Date', 'Amount'], arrearsData.map(a => [a.customerName, a.loanId, a.dueDate, formatCurrency(a.amount)]))}
                                className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-sm">download</span> PDF
                            </button>
                        </div>
                        <div className="bg-white dark:bg-[#1e2736] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300">
                                    <tr>
                                        <th className="px-4 py-2">Customer</th>
                                        <th className="px-4 py-2">Due Date</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {arrearsData.length > 0 ? arrearsData.map((item, i) => (
                                        <tr key={i}>
                                            <td className="px-4 py-2">
                                                <div className="font-bold">{item.customerName}</div>
                                                <div className="text-xs text-slate-500">#{item.loanId} (EMI {item.emiNumber})</div>
                                            </td>
                                            <td className="px-4 py-2 text-red-600">{item.dueDate}</td>
                                            <td className="px-4 py-2 text-right font-bold">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    )) : <tr><td colSpan={3} className="p-4 text-center text-slate-500">No arrears found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );

            case 'monthly':
                return (
                    <div className="space-y-4 animate-in fade-in">
                        <div className="flex justify-between items-center">
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm font-bold"
                            />
                            <button
                                onClick={() => downloadPDF(`Collections_${selectedMonth}`, ['Date', 'Customer', 'Loan ID', 'Amount'], monthlyCollectionData.map(r => [r.paymentDate, r.customerName, r.loanId, formatCurrency(r.amount)]))}
                                className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-sm">download</span> PDF
                            </button>
                        </div>
                        <div className="bg-white dark:bg-[#1e2736] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300">
                                    <tr>
                                        <th className="px-4 py-2">Date</th>
                                        <th className="px-4 py-2">Customer</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {monthlyCollectionData.length > 0 ? monthlyCollectionData.map((item, i) => (
                                        <tr key={i}>
                                            <td className="px-4 py-2 text-slate-500">{item.paymentDate}</td>
                                            <td className="px-4 py-2 font-bold">{item.customerName}</td>
                                            <td className="px-4 py-2 text-right font-mono">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    )) : <tr><td colSpan={3} className="p-4 text-center text-slate-500">No collections this month.</td></tr>}
                                </tbody>
                                <tfoot className="bg-slate-50 dark:bg-slate-800 font-bold">
                                    <tr>
                                        <td colSpan={2} className="px-4 py-2 text-right">Total</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(monthlyCollectionData.reduce((s, x) => s + Number(x.amount), 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                );

            case 'lent':
                return (
                    <div className="space-y-4 animate-in fade-in">
                        <div className="flex justify-between items-center">
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm font-bold"
                            />
                            <button
                                onClick={() => downloadPDF(`Lent_Report_${selectedMonth}`, ['Date', 'Customer', 'Loan ID', 'Amount', 'Rate'], lentData.map(l => [l.disbursalDate, l.customerName, l.id, formatCurrency(l.amount), l.interestRate + '%']))}
                                className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-sm">download</span> PDF
                            </button>
                        </div>
                        <div className="bg-white dark:bg-[#1e2736] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300">
                                    <tr>
                                        <th className="px-4 py-2">Date</th>
                                        <th className="px-4 py-2">Customer</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {lentData.length > 0 ? lentData.map((item, i) => (
                                        <tr key={i}>
                                            <td className="px-4 py-2 text-slate-500">{item.disbursalDate}</td>
                                            <td className="px-4 py-2 font-bold">{item.customerName}</td>
                                            <td className="px-4 py-2 text-right font-mono">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    )) : <tr><td colSpan={3} className="p-4 text-center text-slate-500">No loans disbursed this month.</td></tr>}
                                </tbody>
                                <tfoot className="bg-slate-50 dark:bg-slate-800 font-bold">
                                    <tr>
                                        <td colSpan={2} className="px-4 py-2 text-right">Total</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(lentData.reduce((s, x) => s + Number(x.amount), 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                );

            case 'ledger':
                return (
                    <div className="space-y-4 animate-in fade-in">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">Select Borrower</label>
                            <select
                                value={selectedCustomer}
                                onChange={(e) => setSelectedCustomer(e.target.value)}
                                className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                            >
                                <option value="">-- Choose Customer --</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        {selectedCustomer && (
                            <div className="bg-white dark:bg-[#1e2736] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex justify-end">
                                    <button
                                        onClick={() => downloadPDF(`Ledger_${customers.find(c => c.id === selectedCustomer)?.name}`, ['Date', 'Particulars', 'Debit', 'Credit', 'Balance'], ledgerData.map((e, i, arr) => {
                                            const bal = arr.slice(0, i + 1).reduce((sum, x) => sum + (x.type === 'Debit' ? x.amount : -x.amount), 0);
                                            return [e.date, e.desc, e.type === 'Debit' ? formatCurrency(e.amount) : '', e.type === 'Credit' ? formatCurrency(e.amount) : '', formatCurrency(bal)];
                                        }))}
                                        className="text-xs font-bold text-primary flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">download</span> Download PDF
                                    </button>
                                </div>
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 dark:bg-slate-800 font-bold">
                                        <tr>
                                            <th className="px-3 py-2">Date</th>
                                            <th className="px-3 py-2">Particulars</th>
                                            <th className="px-3 py-2 text-right">Debit</th>
                                            <th className="px-3 py-2 text-right">Credit</th>
                                            <th className="px-3 py-2 text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {ledgerData.length > 0 ? (
                                            (() => {
                                                let balance = 0;
                                                return ledgerData.map((item, i) => {
                                                    balance += (item.type === 'Debit' ? item.amount : -item.amount);
                                                    return (
                                                        <tr key={i}>
                                                            <td className="px-3 py-2 whitespace-nowrap">{item.date}</td>
                                                            <td className="px-3 py-2">{item.desc}</td>
                                                            <td className="px-3 py-2 text-right text-red-600">{item.type === 'Debit' ? formatCurrency(item.amount) : '-'}</td>
                                                            <td className="px-3 py-2 text-right text-green-600">{item.type === 'Credit' ? formatCurrency(item.amount) : '-'}</td>
                                                            <td className="px-3 py-2 text-right font-bold">{formatCurrency(balance)}</td>
                                                        </tr>
                                                    );
                                                });
                                            })()
                                        ) : (
                                            <tr><td colSpan={5} className="p-4 text-center text-slate-500">No transactions found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );

            default: return null;
        }
    };

    if (loading) return <div className="flex h-screen w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>;

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/tools')} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold tracking-tight">Financial Reports</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-6">
                {/* Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {[
                        { id: 'summary', label: 'Summary', icon: 'dashboard' },
                        { id: 'arrears', label: 'Arrears', icon: 'warning' },
                        { id: 'monthly', label: 'Collection', icon: 'calendar_month' },
                        { id: 'lent', label: 'Lent', icon: 'payments' },
                        { id: 'ledger', label: 'Ledger', icon: 'menu_book' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab === tab.id
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                {renderTabContent()}
            </div>
        </div>
    );
};

export default Reports;