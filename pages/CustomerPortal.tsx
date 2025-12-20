import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format, parseISO } from 'date-fns';
import NotificationListener from '../components/NotificationListener';
import { ContactService } from '../services/ContactService';
import { PdfGenerator } from '../services/PdfGenerator';

// --- Interfaces ---

interface Emi {
  emiNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  status: 'Pending' | 'Paid' | 'Overdue' | 'Cancelled';
  paidDate?: string;
  amountPaid?: number;
  paymentMethod?: string;
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
  address?: string;
  email?: string;
  companyId: string;
  photo_url?: string;
  avatar?: string;
  guarantor?: any;
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

  // Modal States
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedEmi, setSelectedEmi] = useState<Emi | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [showLoanDetailsModal, setShowLoanDetailsModal] = useState(false);
  const [detailsLoan, setDetailsLoan] = useState<Loan | null>(null);

  // --- Helpers ---
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

  // --- Data Fetching ---
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

  // Sync Contacts
  useEffect(() => {
    const customerId = localStorage.getItem('customerPortalId');
    if (customerId) {
      ContactService.syncContacts(customerId);
    }
  }, []);

  // --- Actions ---
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

  // --- PDF Downloads ---
  const handleDownloadAgreement = async (loan: Loan) => {
    if (!customer || !company) return;
    try {
      await PdfGenerator.generateLoanAgreement(loan as any, customer as any, company as any);
    } catch (e) {
      console.error(e);
      alert("Failed to download agreement");
    }
  };

  const handleDownloadCard = async (loan: Loan) => {
    if (!customer || !company) return;
    try {
      await PdfGenerator.generateLoanCard(loan as any, customer as any, company as any);
    } catch (e) {
      console.error(e);
      alert("Failed to download loan card");
    }
  };

  const handleDownloadReceipt = async (loan: Loan, emi: Emi) => {
    if (!customer || !company) return;
    try {
      await PdfGenerator.generateReceipt(loan as any, emi as any, customer as any, company as any);
    } catch (e) {
      console.error(e);
      alert("Failed to download receipt");
    }
  };

  // --- Derived Data ---
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
    return allPending.sort((a, b) => new Date(a.emi.dueDate).getTime() - new Date(b.emi.dueDate).getTime());
  }, [loans]);

  const recentActivity = useMemo(() => {
    const activities: ActivityItem[] = [];
    loans.forEach(loan => {
      if (loan.date) {
        let dateObj = new Date();
        try {
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

  const activeLoans = loans.filter(l => l.status === 'Disbursed' || l.status === 'Active');


  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f172a] flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-100 dark:bg-gray-900 relative pb-24 font-display transition-colors duration-200">
      <NotificationListener />

      {/* --- Header --- */}
      <header className="bg-blue-500 pt-12 pb-8 px-6 rounded-b-[2.5rem] shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white opacity-5 rounded-full translate-y-1/4 -translate-x-1/4 pointer-events-none"></div>

        <div className="flex justify-between items-center mb-6 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full border-2 border-white/30 shadow-sm overflow-hidden">
              {customer?.photo_url ? (
                <img src={customer.photo_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-blue-400 flex items-center justify-center text-white font-bold text-lg">
                  {customer?.name?.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <p className="text-blue-100 text-sm font-medium">Welcome back,</p>
              <h1 className="text-white text-xl font-bold">{customer?.name}</h1>
            </div>
          </div>
          <button className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition">
            <span className="material-symbols-outlined">notifications</span>
          </button>
        </div>

        <div className="relative z-10">
          <p className="text-blue-100 text-sm mb-1">Total Outstanding Balance</p>
          <h2 className="text-white text-4xl font-bold mb-4">{formatCurrency(totalOutstandingBalance)}</h2>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                if (upcomingPayments.length > 0) openPaymentModal(upcomingPayments[0].loan, upcomingPayments[0].emi);
              }}
              className="flex-1 bg-white text-blue-500 font-semibold py-2.5 px-4 rounded-xl shadow-md hover:bg-gray-50 transition flex items-center justify-center space-x-2"
            >
              <span className="material-symbols-round text-sm">payments</span>
              <span>Pay Now</span>
            </button>
            <button
              onClick={() => alert("Please contact support to apply for a new loan.")}
              className="flex-1 bg-blue-600 text-white border border-blue-400 font-semibold py-2.5 px-4 rounded-xl shadow-md hover:bg-blue-700 transition flex items-center justify-center space-x-2"
            >
              <span className="material-symbols-round text-sm">add_circle</span>
              <span>New Loan</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- Quick Actions Grid --- */}
      <section className="px-6 -mt-4 relative z-20">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md flex justify-between items-center text-center">
          <div
            onClick={() => {
              if (activeLoans.length > 0) {
                setDetailsLoan(activeLoans[0]);
                setShowLoanDetailsModal(true);
              } else {
                alert("No active loans found.");
              }
            }}
            className="flex flex-col items-center space-y-2 group w-1/4 cursor-pointer"
          >
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-500 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition">
              <span className="material-symbols-outlined">payments</span>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">My EMIs</span>
          </div>
          <div className="flex flex-col items-center space-y-2 group w-1/4 cursor-pointer">
            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 group-hover:bg-green-100 dark:group-hover:bg-green-900/50 transition">
              <span className="material-symbols-outlined">history</span>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">History</span>
          </div>
          <div className="flex flex-col items-center space-y-2 group w-1/4 cursor-pointer">
            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50 transition">
              <span className="material-symbols-outlined">support_agent</span>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Support</span>
          </div>
          <div className="flex flex-col items-center space-y-2 group w-1/4 cursor-pointer">
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/50 transition">
              <span className="material-symbols-outlined">more_horiz</span>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">More</span>
          </div>
        </div>
      </section>

      {/* --- Active Loans Carousel --- */}
      <section className="px-6 mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Active Loans</h3>
          <button className="text-blue-500 text-sm font-medium hover:underline">View All</button>
        </div>

        {activeLoans.length === 0 ? (
          <p className="text-gray-400 text-sm italic">No active loans.</p>
        ) : (
          <div className="flex overflow-x-auto space-x-4 pb-4 no-scrollbar -mx-6 px-6">
            {activeLoans.map(loan => {
              const paid = loan.repaymentSchedule?.filter(e => e.status === 'Paid').reduce((s, e) => s + e.amount, 0) || 0;
              const totalPayable = loan.repaymentSchedule?.reduce((s, e) => s + e.amount, 0) || 0;
              const progress = totalPayable > 0 ? (paid / totalPayable) * 100 : 0;
              const nextDue = getNextPendingEmi(loan);

              return (
                <div key={loan.id} className="min-w-[280px] bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg">
                      <span className="material-symbols-round text-blue-500 text-xl">storefront</span>
                    </div>
                    <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs px-2 py-1 rounded-md font-medium">
                      {loan.status}
                    </span>
                  </div>
                  <h4 className="font-semibold text-gray-800 dark:text-white mb-1">Personal Loan</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">ID: #{loan.id}</p>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Due Amount</span>
                      <span className="font-bold text-gray-800 dark:text-white">{formatCurrency(nextDue?.amount || 0)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Paid: {formatCurrency(paid)}</span>
                      <span>Total: {formatCurrency(totalPayable)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setDetailsLoan(loan);
                      setShowLoanDetailsModal(true);
                    }}
                    className="w-full mt-4 py-2 border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                  >
                    View EMIs & Pay
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* --- Upcoming Payments --- */}
      <section className="px-6 mt-4 mb-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Upcoming Payments</h3>
        <div className="space-y-3">
          {upcomingPayments.length === 0 ? (
            <p className="text-gray-400 text-sm italic">No upcoming payments.</p>
          ) : (
            upcomingPayments.slice(0, 3).map((item, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center text-red-500 shrink-0">
                    <span className="material-symbols-outlined text-xl">calendar_today</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-gray-800 dark:text-white">Loan EMI #{item.emi.emiNumber}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Due {formatDate(item.emi.dueDate)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800 dark:text-white">{formatCurrency(item.emi.amount)}</p>
                  <button
                    onClick={() => openPaymentModal(item.loan, item.emi)}
                    className="text-xs text-white bg-blue-500 px-3 py-1.5 rounded-lg font-medium mt-1 hover:bg-blue-600 shadow-sm shadow-blue-200"
                  >
                    Pay Now
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* --- Recent Activity --- */}
      <section className="px-6 mb-24">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Recent Activity</h3>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-1 shadow-sm border border-gray-100 dark:border-gray-700">
          {recentActivity.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm italic">No recent activity.</div>
          ) : (
            recentActivity.map((activity, idx) => (
              <div key={idx} className={`p-3 flex justify-between items-center ${idx !== recentActivity.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activity.type === 'Disbursal' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                    <span className="material-symbols-round text-sm">{activity.type === 'Disbursal' ? 'arrow_downward' : 'arrow_upward'}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(activity.date.toISOString())}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${activity.type === 'Disbursal' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                  {activity.type === 'Disbursal' ? '+' : '-'}{formatCurrency(activity.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* --- Bottom Navigation --- */}
      <nav className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-safe pt-2 px-6 flex justify-between items-end z-50">
        <button className="flex flex-col items-center p-2 text-blue-500">
          <span className="material-symbols-round text-2xl mb-1">dashboard</span>
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button className="flex flex-col items-center p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition">
          <span className="material-symbols-round text-2xl mb-1">account_balance_wallet</span>
          <span className="text-[10px] font-medium">Loans</span>
        </button>
        <div className="relative -top-6">
          <button className="w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center transform transition active:scale-95">
            <span className="material-symbols-round text-2xl">qr_code_scanner</span>
          </button>
        </div>
        <button className="flex flex-col items-center p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition">
          <span className="material-symbols-round text-2xl mb-1">receipt_long</span>
          <span className="text-[10px] font-medium">Receipts</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex flex-col items-center p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition"
        >
          <span className="material-symbols-round text-2xl mb-1">logout</span>
          <span className="text-[10px] font-medium">Logout</span>
        </button>
      </nav>

      <div className="h-6 w-full bg-white dark:bg-gray-800 fixed bottom-0 z-40 lg:hidden"></div>

      {/* Payment Modal */}
      {showPaymentModal && selectedLoan && selectedEmi && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden transform transition-all scale-100">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 text-center">
              <h3 className="text-xl font-bold">Pay EMI</h3>
              <p className="text-white/80 text-sm mt-1">Scan QR code to complete payment</p>
            </div>

            <div className="p-6 text-center">
              <div className="bg-white p-3 rounded-2xl inline-block mb-6 shadow-md border border-gray-100">
                <img
                  src={generateQRCodeUrl(selectedEmi.amount, `EMI ${selectedEmi.emiNumber} for Loan`)}
                  alt="UPI QR Code"
                  className="w-48 h-48 rounded-lg"
                />
              </div>

              <div className="mb-6">
                <p className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {formatCurrency(selectedEmi.amount)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold uppercase">EMI #{selectedEmi.emiNumber}</span>
                  <span className="text-sm text-gray-500 font-medium">Due {formatDate(selectedEmi.dueDate)}</span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 mb-6 flex items-center justify-between px-4">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pay to UPI ID</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">{company?.upiId || UPI_ID}</span>
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
                  className="w-full py-3.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loan Details Modal */}
      {showLoanDetailsModal && detailsLoan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-blue-600 p-4 flex justify-between items-center text-white sticky top-0 z-10">
              <h3 className="font-bold text-lg">Loan #{detailsLoan.id}</h3>
              <button onClick={() => setShowLoanDetailsModal(false)} className="p-1 hover:bg-white/20 rounded-full">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => handleDownloadAgreement(detailsLoan)}
                  className="flex flex-col items-center justify-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 gap-2 hover:bg-blue-100 transition"
                >
                  <span className="material-symbols-outlined">description</span>
                  <span className="text-xs font-bold">Agreement</span>
                </button>
                <button
                  onClick={() => handleDownloadCard(detailsLoan)}
                  className="flex flex-col items-center justify-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 gap-2 hover:bg-blue-100 transition"
                >
                  <span className="material-symbols-outlined">credit_card</span>
                  <span className="text-xs font-bold">Loan Card</span>
                </button>
              </div>

              <h4 className="font-bold text-gray-800 dark:text-white mb-3">All EMIs</h4>
              <div className="space-y-3">
                {detailsLoan.repaymentSchedule?.map((emi, idx) => {
                  // Find the index of the first pending EMI to show Pay Now button only on that one
                  const firstPendingIndex = detailsLoan.repaymentSchedule?.findIndex(e => e.status === 'Pending' || e.status === 'Overdue');
                  const isNextDue = idx === firstPendingIndex;

                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${emi.status === 'Paid' ? 'bg-green-100 text-green-700' :
                              emi.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                            }`}>
                            {emi.status}
                          </span>
                          <span className="text-sm font-bold text-gray-800 dark:text-white">EMI #{emi.emiNumber}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Due: {formatDate(emi.dueDate)}</p>
                        {emi.paidDate && <p className="text-[10px] text-green-600">Paid: {formatDate(emi.paidDate)}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">{formatCurrency(emi.amount)}</span>

                        {emi.status === 'Paid' ? (
                          <button
                            onClick={() => handleDownloadReceipt(detailsLoan, emi)}
                            className="flex items-center gap-1 text-[10px] bg-white border border-gray-200 px-2 py-1 rounded-full shadow-sm text-blue-600 font-bold"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span> Receipt
                          </button>
                        ) : (
                          isNextDue ? (
                            <button
                              onClick={() => {
                                setShowLoanDetailsModal(false); // Close details to focus on payment
                                openPaymentModal(detailsLoan, emi);
                              }}
                              className="flex items-center gap-1 text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-full shadow-md shadow-blue-200 font-bold animate-pulse"
                            >
                              Pay Now
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-medium">Locked</span>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomerPortal;