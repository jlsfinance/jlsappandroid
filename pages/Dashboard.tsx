import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useCompany } from '../contexts/CompanyContext';
import CompanySelector from '../components/CompanySelector';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';

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
  const { activeCompany, user } = useCompany();
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
        if (!activeCompany) {
            setLoading(false);
            return;
        }

        try {
            if (user?.email) {
                setUserName(user.email.split('@')[0]);
            }

            const companyId = activeCompany.id;

            const [loansSnap, customersSnap, partnerTxSnap, expensesSnap] = await Promise.all([
                getDocs(query(collection(db, "loans"), where("companyId", "==", companyId), orderBy("date", "desc"))),
                getDocs(query(collection(db, "customers"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "partner_transactions"), where("companyId", "==", companyId))),
                getDocs(query(collection(db, "expenses"), where("companyId", "==", companyId)))
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
  }, [activeCompany, user]);

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
            const totalPI = (Number(l.emi) || 0) * (Number(l.tenure) || 0);
            const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
            const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
            const pendingPI = Math.max(0, totalPI - paidAmount);
            return { ...l, totalLoanPI: totalPI, totalReceivedPI: paidAmount, balancePI: pendingPI };
        });
        columns = ['Customer', 'Total (P+I)', 'Received', 'Balance'];
        renderRow = (row, index) => (
            <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
              <td className="px-4 py-4 font-medium">{row.customerName}</td>
              <td className="px-4 py-4">{formatCurrency(row.totalLoanPI)}</td>
              <td className="px-4 py-4 text-primary">{formatCurrency(row.totalReceivedPI)}</td>
              <td className="px-4 py-4 font-bold text-tertiary">{formatCurrency(row.balancePI)}</td>
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
    doc.text(`${activeCompany?.name || 'Company'} Report`, 14, 15);
    const tableRows = data.map((row) => Object.values(row).slice(0, columns.length));
    autoTable(doc, { head: [columns], body: tableRows, startY: 25 });
    doc.save('report.pdf');
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

  if (!activeCompany) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-4">No company selected</p>
          <Link to="/select-company" className="text-primary font-bold">Select a company</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 max-w-md mx-auto bg-background-light dark:bg-background-dark text-on-surface-light dark:text-on-surface-dark font-sans">
      
      <div className="px-4 py-4 sticky top-0 z-20 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-sm transition-colors">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary-container dark:bg-primary-container-dark flex items-center justify-center text-on-primary-container dark:text-on-primary-container text-lg font-bold">
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <span className="block text-xs font-medium text-on-surface-variant-light dark:text-on-surface-variant-dark">Welcome back,</span>
                    <h1 className="text-xl font-normal text-on-surface-light dark:text-on-surface-dark capitalize">{userName}</h1>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <CompanySelector />
                <Link to="/settings" className="p-2 rounded-full hover:bg-surface-variant-light/50 dark:hover:bg-surface-variant-dark/50 transition-colors">
                    <span className="material-symbols-outlined">settings</span>
                </Link>
            </div>
        </div>
      </div>

      <div className="px-4 space-y-6 mt-2">
        
        <div className="rounded-2xl bg-primary-container dark:bg-primary-container-dark p-6 text-on-primary-container dark:text-on-primary-container shadow-m3-1 relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                    <h2 className="text-sm font-medium opacity-80">Cash Account Balance</h2>
                    <p className="text-xs opacity-60 mt-1">{activeCompany.name}</p>
                </div>
                <Link to="/finance" className="bg-on-primary-container/10 hover:bg-on-primary-container/20 p-2 rounded-full transition-colors">
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
            </div>
            <span className="text-4xl font-normal tracking-tight relative z-10 block mb-2">
                {loading ? '...' : formatCurrency(metrics.cashBalance)}
            </span>
            <div className="relative z-10 flex gap-2 items-center">
                 <span className="text-xs font-medium opacity-70">Total Liquid Assets</span>
            </div>
            <div className="absolute right-[-20px] top-[-20px] w-32 h-32 rounded-full bg-on-primary-container/5"></div>
        </div>

        <div>
            <h3 className="text-sm font-medium text-on-surface-variant-light dark:text-on-surface-variant-dark mb-3 px-1">Quick Actions</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                <Link to="/loans/new" className="flex items-center gap-2 pl-3 pr-4 py-2.5 bg-surface-light dark:bg-[#1e2736] border border-outline-light/20 rounded-xl shadow-sm hover:bg-surface-variant-light/30 active:bg-surface-variant-light whitespace-nowrap transition-colors">
                    <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
                    <span className="text-sm font-medium">New Loan</span>
                </Link>
                <Link to="/due-list" className="flex items-center gap-2 pl-3 pr-4 py-2.5 bg-surface-light dark:bg-[#1e2736] border border-outline-light/20 rounded-xl shadow-sm hover:bg-surface-variant-light/30 active:bg-surface-variant-light whitespace-nowrap transition-colors">
                    <span className="material-symbols-outlined text-green-700 text-xl">payments</span>
                    <span className="text-sm font-medium">Collect EMI</span>
                </Link>
                <Link to="/customers/new" className="flex items-center gap-2 pl-3 pr-4 py-2.5 bg-surface-light dark:bg-[#1e2736] border border-outline-light/20 rounded-xl shadow-sm hover:bg-surface-variant-light/30 active:bg-surface-variant-light whitespace-nowrap transition-colors">
                    <span className="material-symbols-outlined text-secondary text-xl">person_add</span>
                    <span className="text-sm font-medium">Add Client</span>
                </Link>
            </div>
        </div>

        <div>
            <h3 className="text-sm font-medium text-on-surface-variant-light dark:text-on-surface-variant-dark mb-3 px-1">Overview</h3>
            <div className="flex flex-col gap-3">
                <MetricCard 
                    title="Total Disbursed" 
                    value={formatCurrency(metrics.totalDisbursedPrincipal)} 
                    subtext={`${metrics.totalDisbursedCount} Loans in total`} 
                    icon="account_balance"
                    onClick={() => setActiveCard('Total Disbursed Loans')}
                />
                
                <div className="grid grid-cols-2 gap-3">
                    <MetricCard 
                        title="Active Loans" 
                        value={metrics.activeLoansCount.toString()} 
                        subtext="Ongoing"
                        onClick={() => setActiveCard('Active Loans')}
                    />
                    <MetricCard 
                        title="Portfolio Value" 
                        value={formatCurrency(metrics.activeLoansOutstandingPI)} 
                        subtext="Outstanding" 
                        onClick={() => setActiveCard('Active Loan Value')}
                    />
                </div>
            </div>
        </div>

        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-medium text-on-surface-variant-light dark:text-on-surface-variant-dark">Recent Activity</h3>
                <Link to="/loans" className="text-sm font-medium text-primary hover:text-primary-dark">View All</Link>
            </div>
            <div className="bg-surface-light dark:bg-[#1e2736] rounded-xl border border-outline-light/10 overflow-hidden">
                {loans.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <p>No loans yet for this company</p>
                    </div>
                ) : (
                    loans.slice(0, 5).map((loan: any, i) => (
                        <div key={loan.id} className={`p-4 flex items-center justify-between hover:bg-surface-variant-light/30 transition-colors ${i !== 0 ? 'border-t border-outline-light/10' : ''}`}>
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-secondary-container dark:bg-secondary-container flex items-center justify-center text-on-secondary-container">
                                    <span className="material-symbols-outlined text-lg">{loan.status === 'Disbursed' ? 'check' : 'schedule'}</span>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-on-surface-light dark:text-on-surface-dark">{loan.customerName}</h4>
                                    <p className="text-xs text-on-surface-variant-light dark:text-on-surface-variant-dark">Loan #{loan.id}</p>
                                </div>
                            </div>
                            <span className="text-sm font-bold">{formatCurrency(loan.amount)}</span>
                        </div>
                    ))
                )}
            </div>
        </div>

      </div>

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