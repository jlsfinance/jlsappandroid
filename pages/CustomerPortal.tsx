import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import { format } from 'date-fns';
import NotificationListener from '../components/NotificationListener';
import { PdfGenerator } from '../services/PdfGenerator';
import { NotificationService } from '../services/NotificationService';

interface Emi {
  emiNumber: number;
  dueDate: string;
  amount: number;
  status: 'Pending' | 'Paid' | 'Overdue' | 'Cancelled';
  paidDate?: string;
}

interface Loan {
  id: string;
  customerId: string;
  amount: number;
  status: string;
  date: string;
  repaymentSchedule?: Emi[];
  companyId: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  companyId: string;
  photo_url?: string;
}

interface Company {
  id: string;
  name: string;
  phone?: string;
  upiId?: string;
}

const UPI_ID = "9413821007@superyes";

const CustomerPortal: React.FC = () => {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'home' | 'loans' | 'history' | 'profile'>('home');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedEmi, setSelectedEmi] = useState<Emi | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const formatCurrency = (val: number) => `₹${new Intl.NumberFormat("en-IN").format(val)}`;
  const formatDate = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };

  useEffect(() => {
    // Ensure we have an anonymous auth session for Firestore Rules
    const ensureAuth = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Anonymous Auth Failed", e);
        }
      }
      setIsAuthReady(true);
    };
    ensureAuth();
  }, []);

  const fetchData = useCallback(async () => {
    const cid = localStorage.getItem('customerPortalId');
    if (!cid) return navigate('/customer-login');
    setLoading(true);
    try {
      const cSnap = await getDoc(doc(db, "customers", cid));
      if (!cSnap.exists()) return navigate('/customer-login');
      const cData = { id: cSnap.id, ...cSnap.data() } as Customer;
      setCustomer(cData);
      if (cData.companyId) {
        const compSnap = await getDoc(doc(db, "companies", cData.companyId));
        if (compSnap.exists()) setCompany({ id: compSnap.id, ...compSnap.data() } as Company);
      }
      const lSnap = await getDocs(query(collection(db, "loans"), where("customerId", "==", cid)));
      setLoans(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as Loan)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => {
    if (loans.length > 0) {
      // Schedule local notifications for upcoming EMIs automatically
      // This ensures notifications work even if the app is closed/offline later
      NotificationService.scheduleLoanNotifications(loans);
    }
  }, [loans]);

  useEffect(() => {
    if (isAuthReady) fetchData();
  }, [fetchData, isAuthReady]);

  const activeLoans = useMemo(() => loans.filter(l => l.status === 'Active' || l.status === 'Disbursed'), [loans]);
  const getNextEmi = (loan: Loan) => loan.repaymentSchedule?.find(e => e.status === 'Pending' || e.status === 'Overdue');

  const primaryLoan = activeLoans[0];
  const nextEmi = primaryLoan ? getNextEmi(primaryLoan) : null;
  const isOverdue = nextEmi ? new Date() > new Date(nextEmi.dueDate) : false;

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.removeItem('customerPortalId');
      localStorage.removeItem('customerPortalPhone');
      navigate('/customer-login');
    }
  };

  if (loading || !isAuthReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 dark:bg-gray-900 font-sans selection:bg-blue-100 scroll-smooth overflow-x-hidden" style={{ paddingBottom: 'calc(16rem + env(safe-area-inset-bottom))' }}>
      <NotificationListener />

      {/* Header */}
      <header className="bg-[#6366f1] pb-16 px-6 rounded-b-[2.5rem] shadow-xl relative overflow-hidden" style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top))' }}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl"></div>
        <div className="flex justify-between items-center relative z-10 text-white">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full border-2 border-white/40 overflow-hidden bg-indigo-500 shadow-lg">
              {customer?.photo_url ? <img src={customer.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-2xl">{customer?.name?.charAt(0)}</div>}
            </div>
            <div>
              <p className="text-blue-100 text-[10px] uppercase font-black tracking-[0.2em] opacity-80">Dashboard</p>
              <h1 className="font-extrabold text-xl leading-none">{customer?.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2.5 bg-white/20 rounded-full backdrop-blur-lg active:scale-90 transition-all border border-white/10 shadow-sm"><span className="material-symbols-outlined text-2xl">notifications</span></button>
            <button onClick={handleLogout} className="p-2.5 bg-red-500 rounded-full border border-red-400 active:scale-95 transition-all shadow-md"><span className="material-symbols-outlined text-2xl">logout</span></button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-20">

        {/* Quick Actions Panel */}
        <div className="mx-6 -mt-10 bg-white dark:bg-gray-800 p-5 rounded-[2.5rem] shadow-[0_20px_40px_rgba(0,0,0,0.1)] border border-gray-100 dark:border-gray-700 grid grid-cols-4 gap-3 relative z-30">
          {[
            { label: 'Pay EMI', icon: 'payments', bg: 'btn-kadak', color: 'text-white', isSpecial: true, action: () => { if (nextEmi && primaryLoan) { setSelectedLoan(primaryLoan); setSelectedEmi(nextEmi); setShowPaymentModal(true); } else alert("No pending EMI found!"); } },
            { label: 'History', icon: 'history', bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600 dark:text-purple-400', action: () => setCurrentTab('history') },
            // Replaced Support with Test Notif for debugging
            {
              label: 'Support',
              icon: 'support_agent',
              bg: 'bg-green-50 dark:bg-green-900/20',
              color: 'text-green-600 dark:text-green-400',
              action: () => {
                try {
                  const phone = (company?.phone || '9413821007').replace(/\D/g, '');
                  const cleanPhone = phone.startsWith('91') ? phone : '91' + phone;
                  // Try deep link first, then fallback to wa.me
                  const waUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent('Hi Support Team, I need help.')}`;
                  window.location.href = waUrl;
                  // Fallback for some browsers/webview
                  setTimeout(() => {
                    const fallback = `https://wa.me/${cleanPhone}`;
                    window.open(fallback, '_system');
                  }, 500);
                } catch (e) { alert("Could not open WhatsApp."); }
              }
            },
            { label: 'More', icon: 'dashboard_customize', bg: 'bg-orange-50 dark:bg-orange-900/20', color: 'text-orange-600 dark:text-orange-400', action: () => setCurrentTab('profile') },
          ].map((item, i) => (
            <div key={i} onClick={item.action} className="flex flex-col items-center gap-2 cursor-pointer transition-all">
              <div className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center shadow-sm border border-black/5 active:scale-90 transition-transform ${item.isSpecial ? 'shadow-indigo-500/40' : ''}`}>
                <div className={`${item.isSpecial ? 'w-8 h-8 rounded-full bg-white/20 flex items-center justify-center' : ''}`}>
                  <span className={`material-symbols-outlined ${item.color} ${item.isSpecial ? 'text-xl' : 'text-2xl'}`}>{item.icon}</span>
                </div>
              </div>
              <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-tighter">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Home Tab */}
        {currentTab === 'home' && (
          <div className="px-6 py-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
            {/* Dynamic Message Card (Hindi) */}
            {nextEmi && (
              <div className={`mb-8 p-6 rounded-[2rem] shadow-xl border-l-8 ${isOverdue ? 'bg-red-50 border-red-600 text-red-900 shadow-red-100' : 'bg-blue-50 border-blue-600 text-blue-900 shadow-blue-100'} flex items-start gap-5 transition-all`}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg ${isOverdue ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-600 text-white'}`}>
                  <span className="material-symbols-outlined text-3xl">{isOverdue ? 'warning' : 'notifications_active'}</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-extrabold text-xl mb-1.5">{isOverdue ? '⚠️ तत्काल भुगतान करें!' : `नमस्ते ${customer?.name?.split(' ')[0]} 🙏`}</h3>
                  <p className="text-sm font-semibold leading-snug">
                    {isOverdue
                      ? `सावधान! आपकी ₹${nextEmi.amount} की क़िस्त दिनांक ${formatDate(nextEmi.dueDate)} को देय थी। देरी के कारण अतिरिक्त चार्ज लग सकता है। कृपया तुरंत भुगतान करके क़ानूनी कार्यवाही से बचें।`
                      : `प्रिय ग्राहक, आपकी अगली क़िस्त ₹${nextEmi.amount} दिनांक ${formatDate(nextEmi.dueDate)} को देय है। कृपया अच्छा क्रेडिट स्कोर बनाए रखने के लिए समय पर भुगतान करें।`
                    }
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-5">
              <h2 className="font-black text-xl text-gray-800 dark:text-white flex items-center gap-3"><span className="w-2 h-7 bg-[#6366f1] rounded-full"></span> Active Records</h2>
              <button onClick={() => setCurrentTab('loans')} className="text-[#6366f1] font-bold text-xs uppercase tracking-widest bg-[#6366f1]/10 px-3 py-1.5 rounded-full hover:bg-[#6366f1]/20 transition">View All</button>
            </div>

            <div className="space-y-5">
              {activeLoans.length === 0 ? (
                <div className="p-12 text-center text-gray-400 font-bold bg-white dark:bg-gray-800 rounded-3xl border-4 border-dashed border-gray-100 dark:border-gray-700">
                  <span className="material-symbols-outlined text-6xl mb-3 opacity-20">contract_edit</span>
                  <p>No active loans found at the moment.</p>
                </div>
              ) : activeLoans.map(loan => (
                <div key={loan.id} className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-700 relative overflow-hidden group active:scale-[0.98] transition-all">
                  <div className="absolute top-0 right-0 p-4"><span className="text-[10px] font-black px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider">{loan.status}</span></div>
                  <h3 className="font-bold text-gray-500 uppercase text-[10px] tracking-widest mb-1">Account Identity</h3>
                  <p className="font-black text-lg text-gray-900 dark:text-white mb-5 flex items-center gap-2">#{loan.id}</p>

                  <div className="flex items-center justify-between mt-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-black/5">
                    <div><p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1.5">Sanctioned Amt</p><p className="font-black text-2xl text-indigo-600 leading-none">{formatCurrency(loan.amount)}</p></div>
                    <div className="text-right"><p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1.5">Next Due</p><p className="font-black text-sm text-gray-700 dark:text-gray-200 leading-none">{formatDate(getNextEmi(loan)?.dueDate || '-')}</p></div>
                  </div>
                  <button onClick={() => { setSelectedLoan(loan); setShowDetailsModal(true); }} className="w-full mt-6 py-4 btn-kadak text-sm rounded-2xl hover:brightness-110 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-xl material-symbols-fill">list_alt</span>
                    View Schedule & Pay
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loans Tab */}
        {currentTab === 'loans' && (
          <div className="px-6 py-6 animate-in slide-in-from-bottom-5 duration-500">
            <h2 className="font-black text-2xl mb-8 text-gray-900 dark:text-white">Account Ledger</h2>
            <div className="space-y-5">
              {loans.map(loan => (
                <div key={loan.id} className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 active:scale-[0.97] transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div><p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">ID: #{loan.id}</p><p className="font-black text-2xl text-gray-900 dark:text-white">{formatCurrency(loan.amount)}</p></div>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full ${loan.status === 'Active' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-gray-100 text-gray-500 border-gray-200'} border uppercase`}>{loan.status}</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                    <div><p className="text-[9px] text-gray-400 font-black tracking-widest uppercase">Disbursement Date</p><p className="font-bold text-sm">{formatDate(loan.date)}</p></div>
                    <button onClick={() => { setSelectedLoan(loan); setShowDetailsModal(true); }} className="px-5 py-2.5 bg-white dark:bg-gray-700 text-blue-600 font-black text-[10px] rounded-lg border border-blue-100 shadow-sm uppercase">Manage</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {currentTab === 'history' && (
          <div className="px-6 py-6 animate-in slide-in-from-right-5 duration-500">
            <h2 className="font-black text-2xl mb-8 text-gray-900 dark:text-white">Transaction Logs</h2>
            <div className="space-y-4">
              {/* Combine Disbursals and Payments into a single timeline */}
              {useMemo(() => {
                try {
                  const logs: any[] = [];
                  loans?.forEach(l => {
                    const loanDate = l.date ? new Date(l.date) : null;
                    if (loanDate && !isNaN(loanDate.getTime())) {
                      logs.push({ type: 'loan', date: loanDate, amount: l.amount, id: l.id });
                    }
                    l.repaymentSchedule?.filter(e => e.status?.toLowerCase() === 'paid').forEach(e => {
                      const pDateS = e.paidDate || e.paymentDate || e.date;
                      const emiDate = pDateS ? new Date(pDateS) : null;
                      if (emiDate && !isNaN(emiDate.getTime())) {
                        logs.push({ type: 'emi', date: emiDate, amount: e.amountPaid || e.amount || 0, emiNo: e.emiNumber, loanId: l.id });
                      }
                    });
                  });
                  return logs.sort((a, b) => {
                    const timeA = a.date instanceof Date ? a.date.getTime() : 0;
                    const timeB = b.date instanceof Date ? b.date.getTime() : 0;
                    return timeB - timeA;
                  });
                } catch (e) {
                  console.error("History Log generation error:", e);
                  return [];
                }
              }, [loans]).map((log, i) => (
                <div key={i}
                  onClick={async () => {
                    try {
                      if (!customer || !company) return alert("Please wait for data to load.");
                      if (log.type === 'loan') {
                        const lData = loans.find(l => l.id === log.id);
                        if (lData) await PdfGenerator.generateLoanAgreement(lData as any, customer as any, company as any);
                      } else {
                        const tLoan = loans.find(l => l.id === log.loanId);
                        const tEmi = tLoan?.repaymentSchedule?.find(e => e.emiNumber === log.emiNo);
                        if (tLoan && tEmi) await PdfGenerator.generateReceipt(tLoan as any, tEmi as any, customer as any, company as any);
                      }
                    } catch (err) { alert("Generation failed."); }
                  }}
                  className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center group active:bg-gray-50 dark:active:bg-gray-700 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center border shadow-sm group-hover:scale-105 transition-all ${log.type === 'loan' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                      <span className="material-symbols-outlined text-3xl font-variation-FILL">{log.type === 'loan' ? 'account_balance' : 'verified_user'}</span>
                    </div>
                    <div>
                      <p className="font-black text-sm text-gray-900 dark:text-white leading-tight">{log.type === 'loan' ? 'Record Created' : `EMI #${log.emiNo} Payment`}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Ref: #{log.id || log.loanId}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1.5 opacity-60"><span className="material-symbols-outlined text-[14px]">calendar_month</span><span className="text-[10px] font-bold">{log.date instanceof Date ? log.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '---'}</span></div>
                        <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border border-indigo-100 shadow-sm">
                          <span className="material-symbols-outlined text-[12px]">download</span>
                          {log.type === 'loan' ? 'Agreement' : 'Receipt'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-xl leading-none ${log.type === 'loan' ? 'text-indigo-600' : 'text-emerald-600'}`}>{log.type === 'loan' ? '+' : '-'}{formatCurrency(log.amount)}</p>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Entry</span>
                  </div>
                </div>
              ))}
              {loans.length === 0 && <div className="py-24 text-center opacity-30"><span className="material-symbols-outlined text-8xl mb-4">history_edu</span><p className="font-black text-lg">No records yet.</p></div>}
            </div>
          </div>
        )}

        {/* Profile/More Tab */}
        {currentTab === 'profile' && (
          <div className="px-6 py-6 animate-in slide-in-from-left-5 duration-500">
            <h2 className="font-black text-2xl mb-8 text-gray-900 dark:text-white">Account Portfolio</h2>
            <div className="space-y-6">
              <div className="p-8 bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 text-center relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-32 bg-blue-600/10 blur-3xl"></div>
                <div className="w-28 h-28 rounded-full bg-blue-600 border-4 border-white dark:border-gray-700 mx-auto mb-6 relative z-10 overflow-hidden shadow-2xl flex items-center justify-center text-white">
                  {customer?.photo_url ? <img src={customer.photo_url} className="w-full h-full object-cover" /> : <span className="text-5xl font-black">{customer?.name?.charAt(0)}</span>}
                </div>
                <h3 className="font-black text-2xl text-gray-900 dark:text-white mb-1">{customer?.name}</h3>
                <p className="text-gray-500 text-sm font-bold tracking-tight">{customer?.phone}</p>
                <div className="mt-4 inline-block px-4 py-1.5 bg-[#6366f1]/10 text-[#6366f1] rounded-full font-black text-[10px] uppercase tracking-widest border border-[#6366f1]/20">Gold Customer</div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
                {[
                  {
                    label: 'Download Account Statement',
                    icon: 'description',
                    action: async () => {
                      if (!customer || !company) return alert("Please wait, data is still loading...");
                      try {
                        await PdfGenerator.generateAccountStatement(loans as any, customer as any, company as any);
                      } catch (err) { alert("Download failed. Try again."); }
                    }
                  },
                  {
                    label: 'Loan Clearance Certificate',
                    icon: 'workspace_premium',
                    action: async () => {
                      if (!customer || !company) return alert("Please wait, data is still loading...");
                      try {
                        const closedLoan = loans.find(l => l.status === 'Closed' || l.status === 'Paid');
                        if (closedLoan) {
                          await PdfGenerator.generateNoDuesCertificate(closedLoan as any, customer as any, company as any);
                        } else {
                          alert("No closed records found to generate a certificate.");
                        }
                      } catch (err) { alert("Generation failed."); }
                    }
                  },
                  { label: 'Payment Receipts', icon: 'receipt_long', action: () => setCurrentTab('history') },
                  { label: 'Update Personal Details', icon: 'manage_accounts', action: () => alert('Contact admin to update profile.') },
                  {
                    label: 'Refer a Friend & Earn',
                    icon: 'card_giftcard',
                    action: () => {
                      if (!customer) return;
                      const referralCode = 'JLS' + (customer?.id || '0000').slice(-4).toUpperCase();
                      const message = `Hello! I use JLS Suite to manage my personal records. Use my referral code: ${referralCode}`;
                      window.open(`whatsapp://send?text=${encodeURIComponent(message)}`, '_system');
                    }
                  },
                  { label: 'Live Support Chat', icon: 'smart_toy', action: () => setShowSupportModal(true) },
                  { label: 'Privacy & Security', icon: 'verified_user', action: () => navigate('/privacy') },
                  { label: 'Terms Overview', icon: 'gavel', action: () => navigate('/terms') },
                  { label: 'Log Out Session', icon: 'logout', color: 'text-red-500', action: handleLogout },
                ].map((m, i, arr) => (
                  <div key={i} onClick={m.action} className={`p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all ${i !== arr.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.color ? 'bg-red-50' : 'bg-gray-50 dark:bg-gray-900'}`}><span className={`material-symbols-outlined text-2xl ${m.color || 'text-gray-400 opacity-70'}`}>{m.icon}</span></div>
                      <span className={`font-black text-sm uppercase tracking-tight ${m.color || 'text-gray-700 dark:text-gray-200'}`}>{m.label}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-300 text-lg">chevron_right</span>
                  </div>
                ))}
              </div>

              {/* Build Version Info */}
              <div className="pt-10 pb-4 flex flex-col items-center gap-2 opacity-30">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-[1px] bg-gray-400"></span>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">JLS Suite</span>
                  <span className="w-10 h-[1px] bg-gray-400"></span>
                </div>
                <p className="text-[9px] font-bold text-gray-400">Environment: Production (Android)</p>
                <div className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full border border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-black text-gray-600 dark:text-gray-300">Build v1.3.0</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Spacer to ensure scrolling past the fixed nav */}
      <div className="h-40" />

      {/* Modern Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-t border-gray-100 dark:border-gray-800 pt-4 px-2 flex justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[3rem]" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        {[
          { id: 'home', icon: 'home', label: 'Home' },
          { id: 'loans', icon: 'account_balance_wallet', label: 'Loans' },
          { id: 'qr', icon: 'qr_code_scanner', label: 'Pay Now' },
          { id: 'history', icon: 'history', label: 'History' },
          { id: 'profile', icon: 'person', label: 'Account' },
        ].map(tab => (
          <div key={tab.id}
            onClick={() => {
              if (tab.id === 'qr') {
                if (nextEmi && primaryLoan) {
                  setSelectedLoan(primaryLoan);
                  setSelectedEmi(nextEmi);
                  setShowPaymentModal(true);
                } else alert("No due EMI at this moment!");
              } else {
                setCurrentTab(tab.id as any);
              }
            }}
            className={`flex-1 flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-300 ${tab.id === 'qr' ? '-mt-16 bg-[#6366f1] min-w-[64px] h-16 rounded-full flex items-center justify-center text-white shadow-2xl shadow-[#6366f1]/40 active:scale-90 border-[6px] border-white dark:border-gray-900 z-50' : currentTab === tab.id ? 'text-[#6366f1] scale-110' : 'text-gray-400 hover:text-gray-600'}`}>
            <span className={`material-symbols-outlined text-[28px] ${currentTab === tab.id ? 'font-variation-FILL' : ''}`}>{tab.icon}</span>
            {tab.id !== 'qr' && <span className="text-[9px] font-black uppercase tracking-widest leading-none">{tab.label}</span>}
          </div>
        ))}
      </nav>

      {/* Improved Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-lg animate-in fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl border border-white/20">
            <div className="p-10 text-center">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 border-4 border-emerald-50 shadow-inner"><span className="material-symbols-outlined text-5xl font-variation-FILL">support_agent</span></div>
              <h3 className="font-black text-2xl mb-2 text-gray-900 dark:text-white">Customer Support</h3>
              <p className="text-gray-500 text-sm font-medium mb-10 leading-relaxed px-4">Our finance assistants are available to help you with any queries related to your loans.</p>

              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-[2.5rem] p-8 mb-10 text-left border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><span className="material-symbols-outlined text-6xl">verified</span></div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Finance Business</p>
                <p className="font-black text-xl text-gray-900 dark:text-white mb-6 leading-none">{company?.name || 'JLS Suite'}</p>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Primary Helpline</p>
                <a href={`tel:${company?.phone || '9413821007'}`} className="font-black text-3xl text-blue-600 decoration-none flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl">phone_in_talk</span>
                  {company?.phone || '9413821007'}
                </a>
              </div>

              <button onClick={() => setShowSupportModal(false)} className="w-full py-5 bg-gray-900 dark:bg-white dark:text-gray-900 text-white font-black text-sm rounded-2xl active:scale-95 transition-all uppercase tracking-widest shadow-xl">Back to App</button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Payment Modal */}
      {showPaymentModal && selectedEmi && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in zoom-in duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-10 text-center text-white relative">
              <button onClick={() => setShowPaymentModal(false)} className="absolute top-6 right-6 p-2.5 bg-white/20 rounded-full hover:bg-white/30 active:scale-90 transition-all"><span className="material-symbols-outlined text-sm">close</span></button>
              <h3 className="font-black text-2xl mb-1">Make Payment</h3>
              <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest opacity-70">Scan or click to pay via UPI</p>
              <div className="mt-8 bg-white p-4 rounded-3xl inline-block shadow-2xl border-4 border-white">
                <img
                  src={`https://quickchart.io/qr?text=${encodeURIComponent(`upi://pay?pa=${company?.upiId || UPI_ID}&pn=EMI%20Payment&am=${selectedEmi.amount}&cu=INR&tn=EMI${selectedEmi.emiNumber}`)}&size=250`}
                  className="w-48 h-48 rounded-xl"
                  alt="Payment QR"
                />
              </div>
            </div>
            <div className="p-10">
              <div className="flex justify-between items-center mb-10">
                <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Net Payable</p><p className="font-black text-3xl text-gray-900 dark:text-white">{formatCurrency(selectedEmi.amount)}</p></div>
                <div className="text-right"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">EMI REF</p><p className="font-black text-lg text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">#{selectedEmi.emiNumber}</p></div>
              </div>
              <a href={`upi://pay?pa=${company?.upiId || UPI_ID}&pn=EMI%20Payment&am=${selectedEmi.amount}&cu=INR&tn=EMI${selectedEmi.emiNumber}`} className="w-full py-5 btn-kadak text-sm rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all mb-6 uppercase tracking-widest"><span className="material-symbols-outlined text-2xl material-symbols-fill">rocket_launch</span> Pay via UPI App</a>
              <button onClick={() => setShowPaymentModal(false)} className="w-full py-2 text-gray-400 font-bold text-[10px] uppercase tracking-[0.3em] opacity-50">Cancel Transaction</button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Loan Schedule Modal */}
      {showDetailsModal && selectedLoan && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-md animate-in slide-in-from-bottom-full duration-500">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[3.5rem] p-10 max-h-[88vh] overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.2)]">
            <div className="flex justify-between items-center mb-8">
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Schedule for</p><h3 className="font-black text-2xl text-gray-900 dark:text-white">Loan #{selectedLoan.id}</h3></div>
              <button onClick={() => setShowDetailsModal(false)} className="w-12 h-12 flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-full active:scale-90 transition-all border border-black/5"><span className="material-symbols-outlined text-xl">close</span></button>
            </div>

            <div className="grid grid-cols-2 gap-5 mb-10">
              <button onClick={async () => {
                if (!customer || !company || !selectedLoan) return;
                try {
                  await PdfGenerator.generateLoanAgreement(selectedLoan as any, customer as any, company as any);
                } catch (e) { alert("Failed to download."); }
              }} className="p-5 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex flex-col items-center gap-3 text-indigo-700 dark:text-indigo-300 font-black text-[10px] uppercase tracking-widest shadow-sm border border-indigo-100 flex-1 group active:scale-95 transition-all"><span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">article</span> Agreement</button>
              <button onClick={async () => {
                if (!customer || !company || !selectedLoan) return;
                try {
                  await PdfGenerator.generateLoanCard(selectedLoan as any, customer as any, company as any);
                } catch (e) { alert("Failed to download."); }
              }} className="p-5 bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex flex-col items-center gap-3 text-amber-700 dark:text-amber-300 font-black text-[10px] uppercase tracking-widest shadow-sm border border-amber-100 flex-1 group active:scale-95 transition-all"><span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">contact_emergency</span> Card</button>
            </div>

            <h4 className="font-black text-xs mb-6 uppercase tracking-[0.4em] text-gray-400 border-b border-gray-100 dark:border-gray-700 pb-3">Repayment Timeline</h4>
            <div className="space-y-4">
              {selectedLoan.repaymentSchedule?.map((e, i) => {
                const isNext = e.status === 'Pending' || e.status === 'Overdue';
                return (
                  <div key={i} className={`p-5 rounded-[1.5rem] flex justify-between items-center transition-all ${e.status === 'Paid' ? 'bg-emerald-50/40 border border-emerald-100 grayscale-[0.5]' : e.status === 'Overdue' ? 'bg-red-50 border-red-100 animate-pulse' : 'bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shadow-sm ${e.status === 'Paid' ? 'bg-emerald-600 text-white' : e.status === 'Overdue' ? 'bg-red-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-400'}`}>{e.emiNumber}</div>
                      <div><p className="font-black text-sm text-gray-800 dark:text-white">EMI #{e.emiNumber}</p><p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{formatDate(e.dueDate)} • {e.status}</p></div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-base mb-1">{formatCurrency(e.amount)}</p>
                      {isNext && (
                        <button onClick={() => { setShowDetailsModal(false); setSelectedEmi(e); setShowPaymentModal(true); }} className="px-4 py-1.5 bg-blue-600 text-white font-black text-[9px] rounded-lg uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-95 transition-all">Pay Now</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomerPortal;