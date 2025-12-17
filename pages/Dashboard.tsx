import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';

// Type definitions for the dashboard
interface MetricCardProps {
  title: string;
  value: string;
  subtext: string;
  icon?: string;
  variant?: 'primary' | 'surface';
  onClick: () => void;
}

const formatCurrency = (amount: number) => {
    return `Rs. ${new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
    }).format(amount)}`;
};

const Dashboard: React.FC = () => {
  const { currentCompany } = useCompany();
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loans, setLoans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [partnerTransactions, setPartnerTransactions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Admin');

  useEffect(() => {
    const fetchDashboardData = async () => {
        if (!currentCompany) return;
        
        try {
            const user = auth.currentUser;
            if (user?.email) {
                setUserName(user.email.split('@')[0]);
            }

            const companyId = currentCompany.id;
            
            const [loansSnap, customersSnap, partnerTxSnap, expensesSnap] = await Promise.all([
                getDocs(query(collection(db, "loans"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "customers"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "partner_transactions"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "expenses"), where("companyId", "==", companyId)))
            ]);

            const loansData = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const partnerData = partnerTxSnap.docs.map(doc => doc.data());
            const expensesData = expensesSnap.docs.map(doc => doc.data());

            loansData.sort((a: any, b: any) => {
                const dateA = a.date?.toDate?.() || new Date(a.date) || new Date(0);
                const dateB = b.date?.toDate?.() || new Date(b.date) || new Date(0);
                return dateB.getTime() - dateA.getTime();
            });

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
  }, [currentCompany]);

  const metrics = useMemo(() => {
      let totalDisbursedCount = 0;
      let totalDisbursedPrincipal = 0;
      let activeLoansCount = 0;
      let activeLoansPrincipal = 0;
      let activeLoansOutstandingPI = 0; 
      let calculatedBalance = 0;

      partnerTransactions.forEach(tx => {
          if (tx.type === 'investment') calculatedBalance += Number(tx.amount || 0);
          else if (tx.type === 'withdrawal') calculatedBalance -= Number(tx.amount || 0);
      });

      expenses.forEach(exp => {
          calculatedBalance -= Number(exp.amount || 0);
      });

      loans.forEach(loan => {
          const amount = Number(loan.amount) || 0;
          const emi = Number(loan.emi) || 0;
          const tenure = Number(loan.tenure) || 0;
          const processingFee = Number(loan.processingFee) || 0;
          const status = loan.status;

          if (['Disbursed', 'Active', 'Completed', 'Overdue'].includes(status)) {
              totalDisbursedCount++;
              totalDisbursedPrincipal += amount;
              calculatedBalance -= amount;
              calculatedBalance += processingFee;
          }

          let paidAmount = 0;
          if (loan.repaymentSchedule && Array.isArray(loan.repaymentSchedule)) {
              loan.repaymentSchedule.forEach((e: any) => {
                  if (e.status === 'Paid') {
                      const collected = Number(e.amount) || 0;
                      paidAmount += collected;
                      calculatedBalance += collected;
                  }
              });
          }
          
          // Add foreclosure payment if amountReceived is true
          const foreclosureDetails = (loan as any).foreclosureDetails;
          if (foreclosureDetails && foreclosureDetails.amountReceived) {
              calculatedBalance += Number(foreclosureDetails.totalPaid) || 0;
          }

          if (['Disbursed', 'Active', 'Overdue'].includes(status)) {
              activeLoansCount++;
              activeLoansPrincipal += amount;
              const totalPayablePI = emi * tenure;
              const outstanding = Math.max(0, totalPayablePI - paidAmount);
              activeLoansOutstandingPI += outstanding;
          }
      });

      let totalCollections = 0;
      let totalProcessingFees = 0;
      
      loans.forEach(loan => {
          const processingFee = Number(loan.processingFee) || 0;
          const status = loan.status;
          if (['Disbursed', 'Active', 'Completed', 'Overdue'].includes(status)) {
              totalProcessingFees += processingFee;
          }
          if (loan.repaymentSchedule && Array.isArray(loan.repaymentSchedule)) {
              loan.repaymentSchedule.forEach((e: any) => {
                  if (e.status === 'Paid') {
                      totalCollections += Number(e.amount) || 0;
                  }
              });
          }
          const foreclosureDetails = (loan as any).foreclosureDetails;
          if (foreclosureDetails && foreclosureDetails.amountReceived) {
              totalCollections += Number(foreclosureDetails.totalPaid) || 0;
          }
      });

      const netDisbursed = totalDisbursedPrincipal - totalProcessingFees;

      return {
          totalDisbursedCount,
          totalDisbursedPrincipal,
          activeLoansCount,
          activeLoansPrincipal,
          activeLoansOutstandingPI,
          customerCount: customers.length,
          cashBalance: calculatedBalance,
          netDisbursed,
          totalCollections,
          totalProcessingFees
      };
  }, [loans, customers, partnerTransactions, expenses]);

  const getModalContent = () => {
    let modalData: any[] = [];
    let columns: string[] = [];
    let renderRow: (row: any, index: number) => React.ReactNode = () => null;

    switch (activeCard) {
      case 'Total Disbursed Loans':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status));
        columns = ['Customer', 'Loan ID', 'Amount', 'Disbursal', 'EMI', 'Status'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 dark:hover:bg-surface-variant-dark/30 transition-colors border-b border-outline-light/20 dark:border-outline-dark/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4 text-on-surface-variant-light">{row.id}</td>
              <td className="px-4 py-4 font-bold">{formatCurrency(row.amount)}</td>
              <td className="px-4 py-4">{row.disbursalDate ? format(parseISO(row.disbursalDate), 'dd-MMM-yy') : '-'}</td>
              <td className="px-4 py-4">{formatCurrency(row.emi)}</td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-primary-container text-on-primary-container">{row.status}</span>
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
            return { ...l, loanAmountPI: totalPI, emiPI: l.emi, emisPaidCount: `${paidEmis.length} / ${l.tenure}`, amountPendingPI: pendingPI };
        });
        columns = ['Customer', 'Total (P+I)', 'EMI', 'Paid', 'Pending'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4">{formatCurrency(row.loanAmountPI)}</td>
              <td className="px-4 py-4">{formatCurrency(row.emiPI)}</td>
              <td className="px-4 py-4">{row.emisPaidCount}</td>
              <td className="px-4 py-4 font-bold text-error">{formatCurrency(row.amountPendingPI)}</td>
            </tr>
        );
        break;
      case 'Active Loan Value':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
            const principal = Number(l.amount) || 0;
            const emi = Number(l.emi) || 0;
            const tenure = Number(l.tenure) || 0;
            const totalPI = emi * tenure;
            const totalInterest = totalPI - principal;
            const emiPrincipal = tenure > 0 ? principal / tenure : 0;
            const emiInterest = emi - emiPrincipal;
            const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
            const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
            const pendingPI = Math.max(0, totalPI - paidAmount);
            return { ...l, principal, totalInterest, totalLoanPI: totalPI, emiPrincipal, emiInterest, emi, totalReceivedPI: paidAmount, balancePI: pendingPI };
        });
        columns = ['Customer', 'Principal', 'Interest', 'Total', 'EMI (P)', 'EMI (I)', 'EMI', 'Received', 'Balance'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4">{formatCurrency(row.principal)}</td>
              <td className="px-4 py-4">{formatCurrency(row.totalInterest)}</td>
              <td className="px-4 py-4">{formatCurrency(row.totalLoanPI)}</td>
              <td className="px-4 py-4">{formatCurrency(row.emiPrincipal)}</td>
              <td className="px-4 py-4">{formatCurrency(row.emiInterest)}</td>
              <td className="px-4 py-4">{formatCurrency(row.emi)}</td>
              <td className="px-4 py-4 text-primary">{formatCurrency(row.totalReceivedPI)}</td>
              <td className="px-4 py-4 font-bold text-tertiary">{formatCurrency(row.balancePI)}</td>
            </tr>
        );
        break;
      case 'Net Disbursed':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status)).map(l => ({
            ...l,
            processingFee: Number(l.processingFee) || 0,
            netAmount: (Number(l.amount) || 0) - (Number(l.processingFee) || 0)
        }));
        columns = ['Customer', 'Loan Amount', 'Processing Fee', 'Net Disbursed', 'Status'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4">{formatCurrency(row.amount)}</td>
              <td className="px-4 py-4 text-error">{formatCurrency(row.processingFee)}</td>
              <td className="px-4 py-4 font-bold text-primary">{formatCurrency(row.netAmount)}</td>
              <td className="px-4 py-4"><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-primary-container text-on-primary-container">{row.status}</span></td>
            </tr>
        );
        break;
      case 'Portfolio Outstanding':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
            const principal = Number(l.amount) || 0;
            const emi = Number(l.emi) || 0;
            const tenure = Number(l.tenure) || 0;
            const totalPI = emi * tenure;
            const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
            const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
            const outstanding = Math.max(0, totalPI - paidAmount);
            return { ...l, principal, totalPI, paidAmount, outstanding };
        });
        columns = ['Customer', 'Principal', 'Total (P+I)', 'Collected', 'Outstanding'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4">{formatCurrency(row.principal)}</td>
              <td className="px-4 py-4">{formatCurrency(row.totalPI)}</td>
              <td className="px-4 py-4 text-primary">{formatCurrency(row.paidAmount)}</td>
              <td className="px-4 py-4 font-bold text-error">{formatCurrency(row.outstanding)}</td>
            </tr>
        );
        break;
      case 'Total Collections':
        modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status)).map(l => {
            const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
            const emiCollected = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
            const foreclosureDetails = (l as any).foreclosureDetails;
            const foreclosureAmount = (foreclosureDetails && foreclosureDetails.amountReceived) ? (Number(foreclosureDetails.totalPaid) || 0) : 0;
            const totalCollected = emiCollected + foreclosureAmount;
            return { ...l, emisPaid: paidEmis.length, emiCollected, foreclosureAmount, totalCollected };
        }).filter(l => l.totalCollected > 0);
        columns = ['Customer', 'EMIs Paid', 'EMI Collected', 'Foreclosure', 'Total Collected'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4">{row.emisPaid}</td>
              <td className="px-4 py-4">{formatCurrency(row.emiCollected)}</td>
              <td className="px-4 py-4">{formatCurrency(row.foreclosureAmount)}</td>
              <td className="px-4 py-4 font-bold text-primary">{formatCurrency(row.totalCollected)}</td>
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
    if (!data || data.length === 0) { alert("No data available."); return; }
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text((currentCompany?.name || "Finance Company") + " Report - " + activeCard, 14, 15);
    
    let tableRows: any[] = [];
    
    if (activeCard === 'Total Disbursed Loans') {
      tableRows = data.map((row: any) => [
        row.customerName || '-',
        row.id || '-',
        formatCurrency(row.amount),
        row.disbursalDate ? format(parseISO(row.disbursalDate), 'dd-MMM-yy') : '-',
        formatCurrency(row.emi),
        row.status || '-'
      ]);
    } else if (activeCard === 'Active Loans') {
      tableRows = data.map((row: any) => [
        row.customerName || '-',
        formatCurrency(row.loanAmountPI),
        formatCurrency(row.emiPI),
        row.emisPaidCount || '-',
        formatCurrency(row.amountPendingPI)
      ]);
    } else if (activeCard === 'Active Loan Value') {
      tableRows = data.map((row: any) => [
        row.customerName || '-',
        formatCurrency(row.principal),
        formatCurrency(row.totalInterest),
        formatCurrency(row.totalLoanPI),
        formatCurrency(row.emiPrincipal),
        formatCurrency(row.emiInterest),
        formatCurrency(row.emi),
        formatCurrency(row.totalReceivedPI),
        formatCurrency(row.balancePI)
      ]);
    } else if (activeCard === 'Net Disbursed') {
      tableRows = data.map((row: any) => [
        row.customerName || '-',
        formatCurrency(row.amount),
        formatCurrency(row.processingFee),
        formatCurrency(row.netAmount),
        row.status || '-'
      ]);
    } else if (activeCard === 'Portfolio Outstanding') {
      tableRows = data.map((row: any) => [
        row.customerName || '-',
        formatCurrency(row.principal),
        formatCurrency(row.totalPI),
        formatCurrency(row.paidAmount),
        formatCurrency(row.outstanding)
      ]);
    } else if (activeCard === 'Total Collections') {
      tableRows = data.map((row: any) => [
        row.customerName || '-',
        row.emisPaid?.toString() || '0',
        formatCurrency(row.emiCollected),
        formatCurrency(row.foreclosureAmount),
        formatCurrency(row.totalCollected)
      ]);
    }
    
    autoTable(doc, { head: [columns], body: tableRows, startY: 25 });
    const today = format(new Date(), 'dd-MMM-yyyy');
    doc.save(`report_${today}.pdf`);
  };

  const { data, columns, renderRow } = getModalContent();

  const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtext, icon, variant = 'surface', onClick }) => (
    <div 
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl p-5 shadow-m3-1 transition-all active:scale-[0.98] cursor-pointer ripple
        ${variant === 'primary' 
            ? 'bg-primary dark:bg-primary-dark text-on-primary dark:text-on-primary-dark' 
            : 'bg-surface-light dark:bg-[#1e2736] text-on-surface-light dark:text-on-surface-dark border border-outline-light/10 dark:border-outline-dark/10'
        }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className={`text-sm font-medium opacity-90 ${variant === 'primary' ? 'text-on-primary' : 'text-on-surface-variant-light dark:text-on-surface-variant-dark'}`}>{title}</h3>
          <div className="mt-2">
            <h2 className="text-3xl font-normal tracking-tight">{loading ? '...' : value}</h2>
            <p className="text-xs font-medium opacity-70 mt-1">{subtext}</p>
          </div>
        </div>
        {icon && (
            <div className={`p-2 rounded-full ${variant === 'primary' ? 'bg-on-primary/10' : 'bg-primary-container text-on-primary-container'}`}>
                <span className="material-symbols-outlined text-2xl">{icon}</span>
            </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 max-w-md mx-auto bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 text-on-surface-light dark:text-on-surface-dark font-sans">
      
      {/* Modern Header with Gradient */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-purple-500/30">
                      {userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Welcome back</span>
                      <h1 className="text-lg font-semibold text-slate-900 dark:text-white capitalize">{userName}</h1>
                  </div>
              </div>
              <Link to="/settings" className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95">
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">settings</span>
              </Link>
          </div>
          {currentCompany && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
              <span className="material-symbols-outlined text-indigo-500 text-sm">business</span>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{currentCompany.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-5 mt-4">
        
        {/* Hero Balance Card - Modern Glassmorphism */}
        <div className="relative rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 p-6 text-white shadow-xl shadow-purple-500/25 overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30"></div>
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-white/70">account_balance_wallet</span>
                        <h2 className="text-sm font-medium text-white/80">Available Balance</h2>
                    </div>
                    <Link to="/finance" className="bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-all active:scale-95 backdrop-blur-sm">
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </Link>
                </div>
                <span className="text-4xl font-bold tracking-tight block mb-1">
                    {loading ? '...' : formatCurrency(metrics.cashBalance)}
                </span>
                <div className="flex gap-2 items-center mt-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 backdrop-blur-sm text-xs font-medium">
                        <span className="material-symbols-outlined text-xs text-green-300">trending_up</span>
                        Total Liquid Assets
                    </span>
                </div>
            </div>
        </div>

        {/* Quick Actions - Modern Pills */}
        <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 px-1">Quick Actions</h3>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <Link to="/loans/new" className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 active:scale-[0.98] whitespace-nowrap transition-all">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm shadow-indigo-500/30">
                        <span className="material-symbols-outlined text-white text-lg">add</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">New Loan</span>
                </Link>
                <Link to="/due-list" className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-600 active:scale-[0.98] whitespace-nowrap transition-all">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-sm shadow-green-500/30">
                        <span className="material-symbols-outlined text-white text-lg">payments</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Collect EMI</span>
                </Link>
                <Link to="/customers/new" className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-600 active:scale-[0.98] whitespace-nowrap transition-all">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-sm shadow-orange-500/30">
                        <span className="material-symbols-outlined text-white text-lg">person_add</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Add Client</span>
                </Link>
            </div>
        </div>

        {/* Modern Analytics Cards */}
        <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 px-1">Performance Overview</h3>
            <div className="flex flex-col gap-3">
                {/* Feature Card */}
                <div 
                    onClick={() => setActiveCard('Total Disbursed Loans')}
                    className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-700 active:scale-[0.99] cursor-pointer"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white text-lg">account_balance</span>
                                </div>
                                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Disbursed</h3>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.totalDisbursedPrincipal)}</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{metrics.totalDisbursedCount} Loans in total</p>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div 
                        onClick={() => setActiveCard('Active Loans')}
                        className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-700 active:scale-[0.99] cursor-pointer"
                    >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-2">
                            <span className="material-symbols-outlined text-white text-base">trending_up</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? '...' : metrics.activeLoansCount}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active Loans</p>
                    </div>
                    <div 
                        onClick={() => setActiveCard('Active Loan Value')}
                        className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:border-violet-200 dark:hover:border-violet-700 active:scale-[0.99] cursor-pointer"
                    >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center mb-2">
                            <span className="material-symbols-outlined text-white text-base">analytics</span>
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.activeLoansOutstandingPI)}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Portfolio Value</p>
                    </div>
                </div>
                
                <div 
                    onClick={() => setActiveCard('Net Disbursed')}
                    className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:border-green-200 dark:hover:border-green-700 active:scale-[0.99] cursor-pointer"
                >
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white text-lg">payments</span>
                                </div>
                                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Net Disbursed</h3>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.netDisbursed)}</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">After Rs. {new Intl.NumberFormat('en-IN').format(metrics.totalProcessingFees)} fees</p>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div 
                        onClick={() => setActiveCard('Portfolio Outstanding')}
                        className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:border-amber-200 dark:hover:border-amber-700 active:scale-[0.99] cursor-pointer"
                    >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-2">
                            <span className="material-symbols-outlined text-white text-base">pending_actions</span>
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.activeLoansOutstandingPI)}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">To Collect</p>
                    </div>
                    <div 
                        onClick={() => setActiveCard('Total Collections')}
                        className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:border-teal-200 dark:hover:border-teal-700 active:scale-[0.99] cursor-pointer"
                    >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-green-500 flex items-center justify-center mb-2">
                            <span className="material-symbols-outlined text-white text-base">savings</span>
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.totalCollections)}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Collected</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Recent Activity - Modern List */}
        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Activity</h3>
                <Link to="/loans" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1">
                    View All
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                {loans.length === 0 && !loading && (
                    <div className="p-8 text-center">
                        <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">receipt_long</span>
                        <p className="text-sm text-slate-500 dark:text-slate-400">No recent loans</p>
                    </div>
                )}
                {loans.slice(0, 5).map((loan: any, i) => (
                    <Link key={loan.id} to={`/loan/${loan.id}`} className={`p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${i !== 0 ? 'border-t border-slate-100 dark:border-slate-700' : ''}`}>
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                                loan.status === 'Disbursed' || loan.status === 'Active' 
                                    ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                                    : loan.status === 'Completed' 
                                        ? 'bg-gradient-to-br from-purple-500 to-violet-500'
                                        : 'bg-gradient-to-br from-amber-500 to-orange-500'
                            }`}>
                                <span className="material-symbols-outlined text-white text-lg">
                                    {loan.status === 'Completed' ? 'check_circle' : loan.status === 'Disbursed' || loan.status === 'Active' ? 'trending_up' : 'schedule'}
                                </span>
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{loan.customerName}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Loan #{loan.id?.slice(0, 8)}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(loan.amount)}</span>
                            <span className={`block text-xs font-medium mt-0.5 ${
                                loan.status === 'Active' || loan.status === 'Disbursed' ? 'text-green-600 dark:text-green-400' 
                                : loan.status === 'Completed' ? 'text-purple-600 dark:text-purple-400' 
                                : 'text-amber-600 dark:text-amber-400'
                            }`}>{loan.status}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>

      </div>

      {/* Modal */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-4xl h-[90vh] sm:h-[600px] bg-surface-light dark:bg-surface-dark rounded-t-2xl sm:rounded-2xl flex flex-col shadow-m3-3 overflow-hidden">
            
            <div className="p-4 border-b border-outline-light/10 flex justify-between items-center">
                <h2 className="text-lg font-normal">{activeCard}</h2>
                <div className="flex gap-2">
                    <button onClick={handleExportPDF} className="p-2 hover:bg-surface-variant-light/30 rounded-full text-primary"><span className="material-symbols-outlined">download</span></button>
                    <button onClick={() => setActiveCard(null)} className="p-2 hover:bg-surface-variant-light/30 rounded-full"><span className="material-symbols-outlined">close</span></button>
                </div>
            </div>

            <div className="p-4 flex-1 overflow-auto bg-surface-light dark:bg-background-dark">
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full mb-4 rounded-lg border border-outline-light/30 bg-transparent px-4 py-2 text-sm focus:border-primary focus:ring-0"
                />
                <div className="rounded-lg border border-outline-light/10 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-surface-variant-light/50 dark:bg-surface-variant-dark/20 text-on-surface-variant-light">
                            <tr>
                                {columns.map((col, idx) => <th key={idx} className="px-4 py-3 font-medium">{col}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-light/10">
                            {data.filter((row: any) => JSON.stringify(Object.values(row)).toLowerCase().includes(searchQuery.toLowerCase()))
                                .map((row: any, index: number) => renderRow(row, index))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;