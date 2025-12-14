import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';

// Type definitions for the dashboard
interface MetricCardProps {
  title: string;
  value: string;
  subtext: string;
  colorClass: string;
  icon?: string;
  onClick: () => void;
}

const formatCurrency = (amount: number) => {
    return `Rs. ${new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
    }).format(amount)}`;
};

const Dashboard: React.FC = () => {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real Data State
  const [loans, setLoans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [partnerTransactions, setPartnerTransactions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Admin');

  // Fetch Data
  useEffect(() => {
    const fetchDashboardData = async () => {
        try {
            const user = auth.currentUser;
            if (user?.email) {
                setUserName(user.email.split('@')[0]);
            }

            const [loansSnap, customersSnap, partnerTxSnap, expensesSnap] = await Promise.all([
                getDocs(query(collection(db, "loans"), orderBy("date", "desc"))),
                getDocs(collection(db, "customers")),
                getDocs(collection(db, "partner_transactions")),
                getDocs(collection(db, "expenses"))
            ]);

            const loansData = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const partnerData = partnerTxSnap.docs.map(doc => doc.data());
            const expensesData = expensesSnap.docs.map(doc => doc.data());

            setLoans(loansData);
            setCustomers(customersData);
            setPartnerTransactions(partnerData);
            setExpenses(expensesData);
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchDashboardData();
  }, []);

  // Calculate Metrics
  const metrics = useMemo(() => {
      let totalDisbursedCount = 0;
      let totalDisbursedPrincipal = 0;
      
      let activeLoansCount = 0;
      let activeLoansPrincipal = 0;
      let activeLoansOutstandingPI = 0; // Principal + Interest

      // Cash Balance Calculation (Comprehensive Ledger Logic)
      let calculatedBalance = 0;

      // 1. Partner Transactions
      partnerTransactions.forEach(tx => {
          if (tx.type === 'investment') calculatedBalance += Number(tx.amount || 0);
          else if (tx.type === 'withdrawal') calculatedBalance -= Number(tx.amount || 0);
      });

      // 2. Expenses
      expenses.forEach(exp => {
          calculatedBalance -= Number(exp.amount || 0);
      });

      loans.forEach(loan => {
          const amount = Number(loan.amount) || 0;
          const emi = Number(loan.emi) || 0;
          const tenure = Number(loan.tenure) || 0;
          const processingFee = Number(loan.processingFee) || 0;
          const status = loan.status;

          // 3. Loan Disbursements & Fees
          if (['Disbursed', 'Active', 'Completed', 'Overdue'].includes(status)) {
              totalDisbursedCount++;
              totalDisbursedPrincipal += amount;
              
              // Money Out: Loan Principal
              calculatedBalance -= amount;
              // Money In: Processing Fee
              calculatedBalance += processingFee;
          }

          // 4. EMI Collections
          let paidAmount = 0;
          if (loan.repaymentSchedule && Array.isArray(loan.repaymentSchedule)) {
              loan.repaymentSchedule.forEach((e: any) => {
                  if (e.status === 'Paid') {
                      const collected = Number(e.amount) || 0;
                      paidAmount += collected;
                      calculatedBalance += collected; // Money In
                  }
              });
          }

          // 5. Active Loan Stats
          if (['Disbursed', 'Active', 'Overdue'].includes(status)) {
              activeLoansCount++;
              activeLoansPrincipal += amount;
              
              const totalPayablePI = emi * tenure;
              const outstanding = Math.max(0, totalPayablePI - paidAmount);
              activeLoansOutstandingPI += outstanding;
          }
      });

      return {
          totalDisbursedCount,
          totalDisbursedPrincipal,
          activeLoansCount,
          activeLoansPrincipal,
          activeLoansOutstandingPI,
          customerCount: customers.length,
          cashBalance: calculatedBalance
      };
  }, [loans, customers, partnerTransactions, expenses]);

  // Helper to get data and column configuration based on active card
  const getModalContent = () => {
    let modalData: any[] = [];
    let columns: string[] = [];
    let renderRow: (row: any, index: number) => React.ReactNode = () => null;

    // Filter Data based on Card
    switch (activeCard) {
      case 'Total Disbursed Loans':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status));
        columns = ['Customer', 'Loan ID', 'Amount', 'Disbursal', 'Rate', 'Tenure', 'EMI', 'Status'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-blue-50/50 dark:hover:bg-white/5 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
              <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-200">{row.customerName}</td>
              <td className="px-4 py-4 text-slate-500">{row.id}</td>
              <td className="px-4 py-4 font-bold text-slate-800 dark:text-white">{formatCurrency(row.amount)}</td>
              <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.disbursalDate ? format(parseISO(row.disbursalDate), 'dd-MMM-yy') : '-'}</td>
              <td className="px-4 py-4 text-slate-600">{row.interestRate}%</td>
              <td className="px-4 py-4 text-slate-600">{row.tenure}m</td>
              <td className="px-4 py-4 text-slate-600">{formatCurrency(row.emi)}</td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{row.status}</span>
              </td>
            </tr>
        );
        break;

      case 'Active Loans':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
            const totalPI = (Number(l.emi) || 0) * (Number(l.tenure) || 0);
            const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
            const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
            const pendingPI = Math.max(0, totalPI - paidAmount);
            
            return {
                ...l,
                loanAmountPI: totalPI,
                emiPI: l.emi,
                emisPaidCount: `${paidEmis.length} / ${l.tenure}`,
                amountPendingPI: pendingPI,
                principal: l.amount,
                interestComp: totalPI - l.amount
            };
        });
        columns = ['Customer', 'Loan ID', 'Loan Amount (P+I)', 'EMI Amount (P+I)', 'EMIs Paid', 'Amount Pending (P+I)'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-green-50/50 dark:hover:bg-white/5 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
              <td className="px-4 py-4">
                  <div className="font-bold text-slate-700 dark:text-slate-200">{row.customerName}</div>
              </td>
              <td className="px-4 py-4">
                  <Link to={`/loans/${row.id}`} className="text-primary hover:underline font-medium">{row.id}</Link>
              </td>
              <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                  <div className="font-bold">{formatCurrency(row.loanAmountPI)}</div>
                  <div className="text-[10px] text-slate-400">(P: {formatCurrency(row.principal)} + I: {formatCurrency(row.interestComp)})</div>
              </td>
              <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                  <div className="font-medium">{formatCurrency(row.emiPI)}</div>
                  <div className="text-[10px] text-slate-400">(P: {formatCurrency(row.principal/row.tenure)} + I: {formatCurrency(row.interestComp/row.tenure)})</div>
              </td>
              <td className="px-4 py-4 text-slate-800 dark:text-white font-medium">{row.emisPaidCount}</td>
              <td className="px-4 py-4 font-bold text-red-600 dark:text-red-400">
                  <div>{formatCurrency(row.amountPendingPI)}</div>
                  <div className="text-[10px] text-slate-400 opacity-80">(P: {formatCurrency(row.principal * (1 - (parseInt(row.emisPaidCount)/row.tenure)))} + I: {formatCurrency(row.interestComp * (1 - (parseInt(row.emisPaidCount)/row.tenure)))})</div>
              </td>
            </tr>
        );
        break;

      case 'Active Loan Value':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
            const totalPI = (Number(l.emi) || 0) * (Number(l.tenure) || 0);
            const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
            const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
            const pendingPI = Math.max(0, totalPI - paidAmount);
            const lastPaymentDate = paidEmis.length > 0 ? paidEmis[paidEmis.length - 1].paymentDate : null;

            return {
                ...l,
                totalLoanPI: totalPI,
                totalReceivedPI: paidAmount,
                balancePI: pendingPI,
                lastPayment: lastPaymentDate,
                principal: l.amount,
                interestComp: totalPI - l.amount
            };
        });
        columns = ['Customer', 'Total Loan (P+I)', 'Total EMI Received (P+I)', 'Balance (P+I)', 'Last Payment'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-purple-50/50 dark:hover:bg-white/5 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
              <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-200">{row.customerName}</td>
              <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                  <div>{formatCurrency(row.totalLoanPI)}</div>
                  <div className="text-[10px] text-slate-400">(P: {formatCurrency(row.principal)} + I: {formatCurrency(row.interestComp)})</div>
              </td>
              <td className="px-4 py-4 text-green-600 dark:text-green-400 font-medium">
                  <div>{formatCurrency(row.totalReceivedPI)}</div>
                  <div className="text-[10px] text-slate-400 opacity-70">(P: {formatCurrency(row.totalReceivedPI * (row.principal/row.totalLoanPI))} + I: {formatCurrency(row.totalReceivedPI * (row.interestComp/row.totalLoanPI))})</div>
              </td>
              <td className="px-4 py-4 font-bold text-purple-600 dark:text-purple-400">
                  <div>{formatCurrency(row.balancePI)}</div>
                  <div className="text-[10px] text-slate-400 opacity-70">(P: {formatCurrency(row.balancePI * (row.principal/row.totalLoanPI))} + I: {formatCurrency(row.balancePI * (row.interestComp/row.totalLoanPI))})</div>
              </td>
              <td className="px-4 py-4 text-slate-500 text-sm">{row.lastPayment ? format(parseISO(row.lastPayment), 'dd-MMM-yy') : 'N/A'}</td>
            </tr>
        );
        break;

      default:
        modalData = [];
        break;
    }

    return { data: modalData, columns, renderRow };
  };

  const handleExportPDF = () => {
    if (!activeCard) return;
    const { data, columns } = getModalContent();
    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text("JLS Finance Company", 14, 20);
    doc.setFontSize(12);
    doc.text(`${activeCard} Report`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 34);

    const tableRows = data.map((row) => {
        switch (activeCard) {
            case 'Total Disbursed Loans':
                return [row.customerName, row.id, formatCurrency(row.amount), row.disbursalDate ? format(parseISO(row.disbursalDate), 'dd-MMM-yy') : '-', `${row.interestRate}%`, `${row.tenure}m`, formatCurrency(row.emi), row.status];
            case 'Active Loans':
                return [row.customerName, row.id, `${formatCurrency(row.loanAmountPI)}`, `${formatCurrency(row.emiPI)}`, row.emisPaidCount, `${formatCurrency(row.amountPendingPI)}`];
            case 'Active Loan Value':
                return [row.customerName, `${formatCurrency(row.totalLoanPI)}`, `${formatCurrency(row.totalReceivedPI)}`, `${formatCurrency(row.balancePI)}`, row.lastPayment ? format(parseISO(row.lastPayment), 'dd-MMM-yy') : 'N/A'];
            default:
                return [];
        }
    });

    autoTable(doc, {
        head: [columns],
        body: tableRows,
        startY: 40,
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold' } }
    });
    doc.save(`${activeCard.replace(/\s+/g, '_')}_Report.pdf`);
  };

  const { data, columns, renderRow } = getModalContent();

  const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtext, colorClass, icon, onClick }) => (
    <div 
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl p-4 text-white shadow-lg transition-transform active:scale-95 cursor-pointer ${colorClass}`}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
      <div className="relative z-10 flex flex-col h-full justify-between min-h-[100px]">
        <div>
          <h3 className="text-sm font-bold opacity-90 uppercase tracking-wide">{title}</h3>
          {icon && <span className="material-symbols-outlined absolute top-3 right-3 opacity-20 text-4xl">{icon}</span>}
        </div>
        <div className="mt-2">
          <h2 className="text-2xl font-extrabold tracking-tight mb-0.5">{loading ? '...' : value}</h2>
          <p className="text-xs font-medium opacity-80">{subtext}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 max-w-md mx-auto bg-background-light dark:bg-background-dark">
      
      {/* Header */}
      <div className="px-5 pt-6 pb-2 bg-background-light dark:bg-background-dark sticky top-0 z-20">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center border-2 border-white dark:border-slate-600 shadow-sm" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCBtnroGcHUbNnxIa2cmC7tDZOElu3foMfAOk98edeLgQlwYjc_MWFKh1MiFCUU5Bbekw0CxzBtUxVP6q0EaAr2zAKSA6orBF8XCauJge7U683ohhoAf_201_YRZStuqcIF7RLU67myYZ2Q2Bl-Wio2AOrnCu40KxtDLJ_I57FWIoVHADx4Vg4SF-HJLEhrauldgFpj2FMTzcZAeeKgMvtVRWo54pGAVBLhggHRkf2EhBXhyKTi96m4ki-Kcah0pPfDSiIEtqFj2uo")'}}></div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-500 dark:text-slate-400 leading-none">Good Morning,</span>
                    <h1 className="text-2xl font-extrabold text-primary dark:text-blue-400 leading-tight capitalize">{userName}</h1>
                </div>
            </div>
            <Link to="/settings" className="p-2 rounded-full bg-white dark:bg-[#1e2736] shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span className="material-symbols-outlined text-slate-400">notifications</span>
            </Link>
        </div>
      </div>

      <div className="p-5 space-y-6">
        
        {/* Hero Card */}
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-500 p-6 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">Live Cash Account Balance</h2>
                </div>
                <Link to="/finance" className="bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                    View Full Ledger <span className="material-symbols-outlined text-xs">arrow_forward</span>
                </Link>
            </div>
            
            <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">
                    {loading ? '...' : formatCurrency(metrics.cashBalance)}
                </span>
            </div>
            
            <div className="mt-4 flex gap-2">
                <div className="inline-flex items-center gap-1 bg-white/20 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm">
                    <span className="material-symbols-outlined text-xs">trending_up</span> +5.2%
                </div>
                <span className="text-xs font-medium self-center opacity-80">vs yesterday</span>
            </div>
          </div>
          {/* Decorative Circles */}
          <div className="absolute -right-10 -bottom-20 h-40 w-40 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute top-10 left-20 h-20 w-20 rounded-full bg-white/5 blur-xl"></div>
        </div>

        {/* Quick Actions */}
        <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Quick Actions</h3>
            <div className="grid grid-cols-3 gap-3">
                <Link to="/loans/new" className="bg-white dark:bg-[#1e2736] p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-2 hover:shadow-md transition-all active:scale-95">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                        <span className="material-symbols-outlined">add_circle</span>
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-white">New Loan</span>
                </Link>
                
                <Link to="/due-list" className="bg-white dark:bg-[#1e2736] p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-2 hover:shadow-md transition-all active:scale-95">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 h-10 w-10 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-white">Collect EMI</span>
                </Link>

                <Link to="/customers/new" className="bg-white dark:bg-[#1e2736] p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-2 hover:shadow-md transition-all active:scale-95">
                    <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 h-10 w-10 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined">person_add</span>
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-white">Add Client</span>
                </Link>
            </div>
        </div>

        {/* Loan Summary - The 3 Specific Cards */}
        <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Loan Summary</h3>
            <div className="flex flex-col gap-3">
                {/* Card 1: Total Disbursed Loans (Blue) */}
                <MetricCard 
                    title="Total Disbursed" 
                    value={formatCurrency(metrics.totalDisbursedPrincipal)} 
                    subtext={`${metrics.totalDisbursedCount} Loans`} 
                    colorClass="bg-white dark:bg-[#1e2736] !text-slate-900 dark:!text-white border border-slate-100 dark:border-slate-800"
                    icon="payments"
                    onClick={() => setActiveCard('Total Disbursed Loans')}
                />
                
                {/* Card 2: Active Loans (Green) */}
                <MetricCard 
                    title="Active Loans" 
                    value={metrics.activeLoansCount.toString()} 
                    subtext={formatCurrency(metrics.activeLoansPrincipal)} 
                    colorClass="bg-white dark:bg-[#1e2736] !text-slate-900 dark:!text-white border border-slate-100 dark:border-slate-800"
                    icon="trending_up"
                    onClick={() => setActiveCard('Active Loans')}
                />

                {/* Card 3: Active Loan Value (Purple) */}
                <MetricCard 
                    title="Active Loan Value" 
                    value={formatCurrency(metrics.activeLoansOutstandingPI)} 
                    subtext={`Portfolio Outstanding (P+I)`} 
                    colorClass="bg-white dark:bg-[#1e2736] !text-slate-900 dark:!text-white border border-slate-100 dark:border-slate-800"
                    icon="analytics"
                    onClick={() => setActiveCard('Active Loan Value')}
                />
            </div>
        </div>

        {/* Recent Activity */}
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Activity</h3>
                <Link to="/loans" className="text-primary text-sm font-bold">See All</Link>
            </div>
            <div className="space-y-3">
                {loans.slice(0, 5).map((loan: any) => (
                    <div key={loan.id} className="bg-white dark:bg-[#1e2736] p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                loan.status === 'Disbursed' ? 'bg-blue-100 text-blue-600' :
                                loan.status === 'Completed' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-600'
                            }`}>
                                <span className="material-symbols-outlined text-xl">
                                    {loan.status === 'Disbursed' ? 'check_circle' : 'history'}
                                </span>
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{loan.customerName}</h4>
                                <p className="text-xs text-slate-500">Loan #{loan.id}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">{formatCurrency(loan.amount)}</p>
                            <span className="text-[10px] uppercase font-bold text-slate-400">{loan.status}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>

      </div>

      {/* DYNAMIC DETAIL MODAL */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-5xl h-[90vh] sm:h-[650px] bg-[#fffbf7] dark:bg-surface-dark rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-[#fffbf7] dark:bg-surface-dark z-10">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white truncate pr-2">{activeCard}</h2>
              <div className="flex gap-2">
                <button 
                  onClick={handleExportPDF}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                  Export PDF
                </button>
                <button 
                  onClick={() => setActiveCard(null)}
                  className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="material-symbols-outlined text-slate-500">close</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 bg-[#fffbf7] dark:bg-background-dark">
              
              {/* Search Bar */}
              <div className="relative mb-4">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  type="text" 
                  placeholder="Search by customer name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded border border-orange-400 dark:border-slate-600 bg-white dark:bg-surface-dark pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 transition-shadow"
                />
              </div>

              {/* Dynamic Table */}
              <div className="flex-1 overflow-auto rounded-lg bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#fffbf7] dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium sticky top-0 z-10 shadow-sm">
                    <tr>
                      {columns.map((col, idx) => (
                        <th key={idx} className="px-4 py-3 font-semibold first:pl-4 last:pr-4">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {data.filter((row: any) => 
                      JSON.stringify(Object.values(row)).toLowerCase().includes(searchQuery.toLowerCase())
                    ).map((row: any, index: number) => renderRow(row, index))}
                    
                    {/* Fallback */}
                    {data.filter((row: any) => 
                      JSON.stringify(Object.values(row)).toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && (
                      <tr>
                        <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                          {loading ? 'Loading data...' : 'No records found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark flex justify-between items-center">
               <div className="text-xs text-slate-500">
                   Showing {data.length} records
               </div>
              <button 
                onClick={() => setActiveCard(null)}
                className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;