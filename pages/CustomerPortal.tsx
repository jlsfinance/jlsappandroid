import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format, parseISO } from 'date-fns';
import NotificationListener from '../components/NotificationListener';

interface Emi {
  emiNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  status: 'Pending' | 'Paid' | 'Overdue' | 'Cancelled';
  paidDate?: string;
}

interface Loan {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  emi: number;
  interestRate: number;
  tenure: number;
  status: string;
  date: string;
  repaymentSchedule?: Emi[];
  companyId: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  companyId: string;
  photo_url?: string;
  avatar?: string;
}

interface Company {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  upiId?: string;
}

interface ActivityItem {
  type: 'Disbursal' | 'Payment';
  date: Date;
  amount: number;
  title: string;
  subtitle: string;
}

const UPI_ID = "9413821007@superyes";

const CustomerPortal: React.FC = () => {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedEmi, setSelectedEmi] = useState<Emi | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const formatCurrency = (value: number) => {
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const generateUPILink = (amount: number, note: string) => {
    const upiId = company?.upiId || UPI_ID;
    const encodedNote = encodeURIComponent(note);
    return `upi://pay?pa=${upiId}&pn=EMI%20Payment&am=${amount}&cu=INR&tn=${encodedNote}`;
  };

  const generateQRCodeUrl = (amount: number, note: string) => {
    const upiLink = generateUPILink(amount, note);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
  };

  const fetchData = useCallback(async () => {
    const customerId = localStorage.getItem('customerPortalId');
    const storedPhone = localStorage.getItem('customerPortalPhone');

    if (!customerId || !storedPhone) {
      navigate('/customer-login');
      return;
    }

    setLoading(true);
    try {
      const customerRef = doc(db, "customers", customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) {
        localStorage.removeItem('customerPortalId');
        localStorage.removeItem('customerPortalPhone');
        navigate('/customer-login');
        return;
      }

      const customerData = { id: customerSnap.id, ...customerSnap.data() } as Customer;

      const customerPhone = customerData.phone?.replace(/\D/g, '').slice(-10);
      if (customerPhone !== storedPhone) {
        localStorage.removeItem('customerPortalId');
        localStorage.removeItem('customerPortalPhone');
        navigate('/customer-login');
        return;
      }
      setCustomer(customerData);

      if (customerData.companyId) {
        const companyRef = doc(db, "companies", customerData.companyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          setCompany({ id: companySnap.id, ...companySnap.data() } as Company);
        }
      }

      const loansQuery = query(
        collection(db, "loans"),
        where("customerId", "==", customerId)
      );
      const loansSnap = await getDocs(loansQuery);
      const loansData = loansSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Loan[];

      loansData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLoans(loansData);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('customerPortalId');
    localStorage.removeItem('customerPortalPhone');
    navigate('/customer-login');
  };

  const openPaymentModal = (loan: Loan, emi: Emi) => {
    setSelectedLoan(loan);
    setSelectedEmi(emi);
    setShowPaymentModal(true);
  };

  const getNextPendingEmi = (loan: Loan) => {
    if (!loan.repaymentSchedule) return null;
    return loan.repaymentSchedule.find(emi => emi.status === 'Pending' || emi.status === 'Overdue');
  };

  // --- Derived Data for UI ---

  const totalOutstandingBalance = useMemo(() => {
    return loans.reduce((total, loan) => {
      if (loan.status === 'Completed') return total;
      const pending = loan.repaymentSchedule?.filter(e => e.status === 'Pending' || e.status === 'Overdue')
        .reduce((sum, e) => sum + e.amount, 0) || 0;
      return total + pending;
    }, 0);
  }, [loans]);

  const upcomingPayments = useMemo(() => {
    const allPending: { loan: Loan; emi: Emi }[] = [];
    loans.forEach(loan => {
      if (loan.status === 'Disbursed' || loan.status === 'Active') {
        const next = getNextPendingEmi(loan);
        if (next) {
          allPending.push({ loan, emi: next });
        }
      }
    });
    // Sort by due date
    return allPending.sort((a, b) => new Date(a.emi.dueDate).getTime() - new Date(b.emi.dueDate).getTime());
  }, [loans]);

  const recentActivity = useMemo(() => {
    const activities: ActivityItem[] = [];
    loans.forEach(loan => {
      // Loan Disbursal
      if (loan.date) {
        // Safe date parsing
        let dateObj = new Date();
        try {
          // Handle Firestore Timestamp or string
          if ((loan.date as any).toDate) dateObj = (loan.date as any).toDate();
          else dateObj = new Date(loan.date);
        } catch (e) { }

        activities.push({
          type: 'Disbursal',
          date: dateObj,
          amount: loan.amount,
          title: `Loan Disbursed`,
          subtitle: `Loan ID: ${loan.id}`
        });
      }

      // EMI Payments
      loan.repaymentSchedule?.forEach(emi => {
        if (emi.status === 'Paid' && emi.paidDate) {
          activities.push({
            type: 'Payment',
            date: new Date(emi.paidDate),
            amount: emi.amount,
            title: 'EMI Payment',
            subtitle: `EMI #${emi.emiNumber}`
          });
        }
      });
    });

    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  }, [loans]);


  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f172a] flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  // Active Loans for Carousel
  const activeLoans = loans.filter(l => l.status === 'Disbursed' || l.status === 'Active');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-safe font-sans">
      <NotificationListener />

      {/* --- Blue Header Section --- */}
      <div className="bg-[#2d6cd8] dark:bg-[#1e40af] rounded-b-[2.5rem] pt-safe pb-8 px-6 relative overflow-hidden shadow-xl shadow-blue-500/20">
        {/* Background Decorative Circles */}
        <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-[-20px] left-[-20px] w-32 h-32 bg-white/10 rounded-full blur-xl"></div>

        {/* Top Bar: User Info & Notification */}
        <div className="relative z-10 flex items-center justify-between mb-8 mt-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full border-2 border-white/30 p-0.5">
              {customer?.photo_url ? (
                <img src={customer.photo_url} alt="Profile" className="h-full w-full rounded-full object-cover" />
              ) : (
                <div className="h-full w-full rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-lg">
                  {customer?.name?.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <p className="text-blue-100 text-xs font-medium">Welcome back,</p>
              <p className="text-white text-lg font-bold leading-tight">{customer?.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </div>

        {/* Total Balance */}
        <div className="relative z-10 mb-8">
          <p className="text-blue-100 text-sm font-medium mb-1">Total Outstanding Balance</p>
          <h1 className="text-4xl font-bold text-white tracking-tight">{formatCurrency(totalOutstandingBalance)}</h1>
        </div>

        {/* Quick Actions Row */}
        <div className="relative z-10 flex gap-4">
          <button
            onClick={() => {
              // For Pay Now, try to pay earliest due
              if (upcomingPayments.length > 0) openPaymentModal(upcomingPayments[0].loan, upcomingPayments[0].emi);
            }}
            className="flex-1 bg-white text-blue-600 rounded-xl py-3 px-4 font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined">account_balance_wallet</span>
            Pay Now
          </button>
          <button className="flex-1 bg-blue-500 border border-blue-400 text-white rounded-xl py-3 px-4 font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform" onClick={() => alert("Please contact support to apply for a new loan.")}>
            <span className="material-symbols-outlined">add_circle</span>
            New Loan
          </button>
        </div>
      </div>

      {/* --- Content Area --- */}
      <div className="px-5 py-6 space-y-8">

        {/* Service Grid (Icons) */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm flex justify-between items-center px-6">
          <div className="flex flex-col items-center gap-2 cursor-pointer opacity-80 hover:opacity-100">
            <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">calculate</span>
            </div>
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">EMI Calc</span>
          </div>
          <div className="flex flex-col items-center gap-2 cursor-pointer opacity-80 hover:opacity-100">
            <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">history</span>
            </div>
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">History</span>
          </div>
          <div className="flex flex-col items-center gap-2 cursor-pointer opacity-80 hover:opacity-100">
            <div className="h-10 w-10 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">support_agent</span>
            </div>
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">Support</span>
          </div>
          <div className="flex flex-col items-center gap-2 cursor-pointer opacity-80 hover:opacity-100">
            <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">more_horiz</span>
            </div>
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">More</span>
          </div>
        </div>

        {/* Active Loans Horizontal Scroll */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Active Loans</h3>
            <button className="text-blue-600 text-sm font-medium">View All</button>
          </div>

          {activeLoans.length === 0 ? (
            <p className="text-slate-400 text-sm italic">No active loans.</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-5 px-5">
              {activeLoans.map(loan => {
                const paid = loan.repaymentSchedule?.filter(e => e.status === 'Paid').reduce((s, e) => s + e.amount, 0) || 0;
                const total = loan.amount + (loan.repaymentSchedule?.reduce((s, e) => s + (e.interest || 0), 0) || 0); // Approx total payable if basic interest
                // Or just use Total from schedule
                const totalPayable = loan.repaymentSchedule?.reduce((s, e) => s + e.amount, 0) || 0;
                const progress = totalPayable > 0 ? (paid / totalPayable) * 100 : 0;
                const nextDue = getNextPendingEmi(loan);

                return (
                  <div key={loan.id} className="min-w-[280px] bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 relative">
                    <div className="absolute top-4 right-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      {loan.status}
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center mb-4">
                      <span className="material-symbols-outlined">payments</span>
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white mb-1">Personal Loan</h4>
                    <p className="text-xs text-slate-400 mb-4 font-mono">ID: #{loan.id}</p>

                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500">Due Amount</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(nextDue?.amount || 0)}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mb-2">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 mb-4">
                      <span>Paid: {formatCurrency(paid)}</span>
                      <span>Total: {formatCurrency(totalPayable)}</span>
                    </div>

                    <button onClick={() => {
                      /* Expand/Details Logic */
                      // For now just toggle EMI view or similar.
                      // Or simplified just show details
                    }} className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      View Details
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Payments */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Upcoming Payments</h3>
          <div className="space-y-3">
            {upcomingPayments.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No upcoming payments due.</p>
            ) : (
              upcomingPayments.slice(0, 3).map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center">
                      <span className="material-symbols-outlined">calendar_month</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900 dark:text-white text-sm">Loan EMI</h5>
                      <p className="text-xs text-slate-500">Due {formatDate(item.emi.dueDate)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900 dark:text-white">{formatCurrency(item.emi.amount)}</p>
                    <button
                      onClick={() => openPaymentModal(item.loan, item.emi)}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Pay Now
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Activity</h3>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-2 shadow-sm border border-slate-100 dark:border-slate-700">
            {recentActivity.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm italic">No recent activity.</div>
            ) : (
              recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activity.type === 'Disbursal' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      <span className="material-symbols-outlined text-lg">{activity.type === 'Disbursal' ? 'south' : 'north'}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{activity.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(activity.date.toISOString())}</p>
                    </div>
                  </div>
                  <div className={`font-bold text-sm ${activity.type === 'Disbursal' ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>
                    {activity.type === 'Disbursal' ? '+' : '-'}{formatCurrency(activity.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedLoan && selectedEmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#1e2736] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden transform transition-all scale-100">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 text-center">
              <h3 className="text-xl font-bold">Pay EMI</h3>
              <p className="text-white/80 text-sm mt-1">Scan QR code to complete payment</p>
            </div>

            <div className="p-6 text-center">
              <div className="bg-white p-3 rounded-2xl inline-block mb-6 shadow-md border border-slate-100">
                <img
                  src={generateQRCodeUrl(selectedEmi.amount, `EMI ${selectedEmi.emiNumber} for Loan`)}
                  alt="UPI QR Code"
                  className="w-48 h-48 rounded-lg"
                />
              </div>

              <div className="mb-6">
                <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {formatCurrency(selectedEmi.amount)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold uppercase">EMI #{selectedEmi.emiNumber}</span>
                  <span className="text-sm text-slate-500 font-medium">Due {formatDate(selectedEmi.dueDate)}</span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 mb-6 flex items-center justify-between px-4">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pay to UPI ID</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{company?.upiId || UPI_ID}</span>
              </div>

              <div className="space-y-3">
                <a
                  href={generateUPILink(selectedEmi.amount, `EMI ${selectedEmi.emiNumber} for Loan`)}
                  className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30"
                >
                  <span className="material-symbols-outlined">open_in_new</span>
                  Pay via UPI App
                </a>

                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Mock (Visual Only as requested in image, but non-functional for single page portal unless expanded) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe pt-2 px-6 flex justify-between items-center z-40 lg:hidden">
        <div className="flex flex-col items-center gap-1 text-blue-600">
          <span className="material-symbols-filled text-2xl">grid_view</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-white -mt-8">
          <div className="h-14 w-14 rounded-full bg-blue-500 shadow-lg shadow-blue-500/40 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <span className="material-symbols-outlined text-2xl">history</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <span className="material-symbols-outlined text-2xl">person</span>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortal;