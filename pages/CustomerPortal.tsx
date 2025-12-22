import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format } from 'date-fns';
import NotificationListener from '../components/NotificationListener';
import { ContactService } from '../services/ContactService';
import { PdfGenerator } from '../services/PdfGenerator';

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

  const formatCurrency = (val: number) => `₹${new Intl.NumberFormat("en-IN").format(val)}`;
  const formatDate = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeLoans = useMemo(() => loans.filter(l => l.status === 'Active' || l.status === 'Disbursed'), [loans]);

  const getNextEmi = (loan: Loan) => loan.repaymentSchedule?.find(e => e.status === 'Pending' || e.status === 'Overdue');

  const primaryLoan = activeLoans[0];
  const nextEmi = primaryLoan ? getNextEmi(primaryLoan) : null;
  const isOverdue = nextEmi ? new Date() > new Date(nextEmi.dueDate) : false;

  const handleLogout = () => {
    if (confirm("Logout?")) {
      localStorage.removeItem('customerPortalId');
      localStorage.removeItem('customerPortalPhone');
      navigate('/customer-login');
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent animate-spin rounded-full"></div></div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 font-sans selection:bg-blue-100">
      <NotificationListener />

      {/* Header */}
      <header className="bg-blue-600 pt-12 pb-16 px-6 rounded-b-[2.5rem] shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl"></div>
        <div className="flex justify-between items-center relative z-10 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-white/30 overflow-hidden bg-blue-500 shadow-sm">
              {customer?.photo_url ? <img src={customer.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-xl">{customer?.name?.charAt(0)}</div>}
            </div>
            <div>
              <p className="text-blue-100 text-[10px] uppercase font-bold tracking-widest">Customer Portal</p>
              <h1 className="font-bold text-lg leading-none">{customer?.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2.5 bg-white/15 rounded-full backdrop-blur-md active:scale-90 transition"><span className="material-symbols-outlined text-xl">notifications</span></button>
            <button onClick={handleLogout} className="p-2.5 bg-red-500/80 rounded-full backdrop-blur-md shadow-lg active:scale-90 transition"><span className="material-symbols-outlined text-xl">logout</span></button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-20">

        {/* Quick Actions */}
        <div className="mx-6 -mt-8 bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 grid grid-cols-4 gap-2">
          {[
            { label: 'Pay EMI', icon: 'payments', bg: 'bg-blue-50', color: 'text-blue-600', action: () => { if (nextEmi && primaryLoan) { setSelectedLoan(primaryLoan); setSelectedEmi(nextEmi); setShowPaymentModal(true); } else alert("No pending EMI"); } },
            { label: 'History', icon: 'history', bg: 'bg-purple-50', color: 'text-purple-600', action: () => setCurrentTab('history') },
            { label: 'Support', icon: 'support_agent', bg: 'bg-green-50', color: 'text-green-600', action: () => setShowSupportModal(true) },
            { label: 'More', icon: 'apps', bg: 'bg-orange-50', color: 'text-orange-600', action: () => setCurrentTab('profile') },
          ].map((item, i) => (
            <div key={i} onClick={item.action} className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition group">
              <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center shadow-sm group-hover:shadow-md transition-all`}>
                <span className={`material-symbols-outlined ${item.color} text-2xl`}>{item.icon}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tighter">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Home Tab */}
        {currentTab === 'home' && (
          <div className="px-6 py-6 animate-in fade-in duration-500">
            {/* Hindi Warning Card */}
            {nextEmi && (
              <div className={`mb-6 p-5 rounded-2xl shadow-lg border-l-4 ${isOverdue ? 'bg-red-50 border-red-500 text-red-900' : 'bg-blue-50 border-blue-500 text-blue-900'} flex items-start gap-4`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                  <span className="material-symbols-outlined text-2xl">{isOverdue ? 'warning' : 'info'}</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{isOverdue ? '⚠️ भुगतान लंबित है!' : `नमस्ते ${customer?.name?.split(' ')[0]} 👋`}</h3>
                  <p className="text-sm font-medium leading-relaxed">
                    {isOverdue
                      ? `सावधान! आपकी लोन की क़िस्त ₹${nextEmi.amount} दिनांक ${formatDate(nextEmi.dueDate)} को निकल चुकी है। कृपया तुरंत भुगतान करें अन्यथा चार्ज लग सकता है और क़ानूनी कार्यवाही की जा सकती है।`
                      : `प्रिय ग्राहक, आपकी अगली क़िस्त ₹${nextEmi.amount} दिनांक ${formatDate(nextEmi.dueDate)} को देय है। कृपया भविष्य में पेनल्टी से बचने के लिए समय से भुगतान करना सुनिश्चित करें।`
                    }
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 tracking-tight"><span className="w-1.5 h-6 bg-blue-600 rounded-full"></span> Active Loans</h2>
              <button onClick={() => setCurrentTab('loans')} className="text-blue-600 font-bold text-xs uppercase tracking-widest hover:underline">View All</button>
            </div>

            <div className="space-y-4">
              {activeLoans.length === 0 ? <div className="p-8 text-center text-gray-400 italic bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-700">No active loans found.</div> : activeLoans.map(loan => (
                <div key={loan.id} className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100 uppercase">{loan.status}</span></div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">Loan ID: #{loan.id}</h3>
                  <div className="flex items-center gap-6 mt-4">
                    <div><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Loan Amount</p><p className="font-bold text-lg text-blue-600 leading-none">{formatCurrency(loan.amount)}</p></div>
                    <div className="w-px h-8 bg-gray-100 dark:bg-gray-700"></div>
                    <div><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Due Date</p><p className="font-bold text-sm text-gray-700 dark:text-gray-300 leading-none">{formatDate(getNextEmi(loan)?.dueDate || '-')}</p></div>
                  </div>
                  <button onClick={() => { setSelectedLoan(loan); setShowDetailsModal(true); }} className="w-full mt-5 py-3 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100 uppercase tracking-widest">Details & Schedule</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loans Tab */}
        {currentTab === 'loans' && (
          <div className="px-6 py-6 animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="font-bold text-xl mb-6 text-gray-800 dark:text-white">All Loans</h2>
            <div className="space-y-4">
              {loans.map(loan => (
                <div key={loan.id} className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div><p className="text-[10px] text-gray-400 font-bold uppercase">Loan ID</p><p className="font-bold text-gray-900 dark:text-white">#{loan.id}</p></div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${loan.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'} border uppercase`}>{loan.status}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div><p className="text-[10px] text-gray-400 font-bold uppercase">Disbursed On</p><p className="font-bold text-sm">{formatDate(loan.date)}</p></div>
                    <p className="font-bold text-xl text-blue-600">{formatCurrency(loan.amount)}</p>
                  </div>
                  <button onClick={() => { setSelectedLoan(loan); setShowDetailsModal(true); }} className="w-full mt-4 py-2 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg uppercase tracking-wider">View Details</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {currentTab === 'history' && (
          <div className="px-6 py-6 animate-in slide-in-from-right-4 duration-500">
            <h2 className="font-bold text-xl mb-6 text-gray-800 dark:text-white">Payment History</h2>
            <div className="space-y-4">
              {loans.flatMap(l => (l.repaymentSchedule || []).filter(e => e.status === 'Paid').map(e => ({ ...e, loanId: l.id }))).sort((a, b) => new Date(b.paidDate!).getTime() - new Date(a.paidDate!).getTime()).map((emi, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-100 group-hover:scale-110 transition"><span className="material-symbols-outlined">check_circle</span></div>
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">EMI #{emi.emiNumber} Paid</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Loan ID: #{emi.loanId}</p>
                      <p className="text-[10px] text-gray-500">{formatDate(emi.paidDate!)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600 text-lg leading-none">{formatCurrency(emi.amount)}</p>
                    <span className="text-[8px] font-bold text-gray-300 uppercase">Success</span>
                  </div>
                </div>
              ))}
              {loans.every(l => !l.repaymentSchedule?.some(e => e.status === 'Paid')) && <div className="py-20 text-center"><span className="material-symbols-outlined text-gray-200 text-6xl mb-2">history</span><p className="text-gray-400">No payment records found.</p></div>}
            </div>
          </div>
        )}

        {/* Profile/More Tab */}
        {currentTab === 'profile' && (
          <div className="px-6 py-6 animate-in slide-in-from-left-4 duration-500">
            <h2 className="font-bold text-xl mb-6 text-gray-800 dark:text-white">Account & More</h2>
            <div className="space-y-4">
              <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 text-center relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-24 bg-blue-600/5"></div>
                <div className="w-24 h-24 rounded-full bg-blue-50 border-4 border-white dark:border-gray-700 mx-auto mb-4 relative z-10 overflow-hidden shadow-md">
                  {customer?.photo_url ? <img src={customer.photo_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-4xl font-bold text-blue-600">{customer?.name?.charAt(0)}</span>}
                </div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{customer?.name}</h3>
                <p className="text-gray-500 text-sm font-medium">{customer?.phone}</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {[
                  { label: 'Download Statements', icon: 'description', action: () => alert('Feature coming soon!') },
                  { label: 'Refer & Earn Cashback', icon: 'redeem', action: () => alert('Share your code: ' + customer?.id.slice(0, 6).toUpperCase()) },
                  { label: 'Privacy Policy', icon: 'security', action: () => navigate('/privacy') },
                  { label: 'Terms & Conditions', icon: 'gavel', action: () => navigate('/terms') },
                  { label: 'Logout', icon: 'logout', color: 'text-red-500', action: handleLogout },
                ].map((m, i, arr) => (
                  <div key={i} onClick={m.action} className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all ${i !== arr.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined ${m.color || 'text-gray-400'}`}>{m.icon}</span>
                      <span className={`font-bold text-sm ${m.color || 'text-gray-700 dark:text-gray-200'}`}>{m.label}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-300 text-sm">arrow_forward_ios</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 py-3 px-6 flex justify-between items-center z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] rounded-t-[2.5rem]">
        {[
          { id: 'home', icon: 'home', label: 'Home' },
          { id: 'loans', icon: 'account_balance_wallet', label: 'Loans' },
          { id: 'qr', icon: 'qr_code_scanner', label: 'Pay' },
          { id: 'history', icon: 'history', label: 'History' },
          { id: 'profile', icon: 'person', label: 'Profile' },
        ].map(tab => (
          <div key={tab.id} onClick={() => { if (tab.id === 'qr') { if (nextEmi && primaryLoan) { setSelectedLoan(primaryLoan); setSelectedEmi(nextEmi); setShowPaymentModal(true); } else alert("No pending EMI"); } else setCurrentTab(tab.id as any); }}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-all duration-300 ${tab.id === 'qr' ? '-mt-12 bg-blue-600 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-300 active:scale-90' : currentTab === tab.id ? 'text-blue-600 scale-110' : 'text-gray-400'}`}>
            <span className={`material-symbols-outlined ${tab.id === 'qr' ? 'text-2xl' : 'text-2xl'} ${currentTab === tab.id ? 'font-variation-FILL' : ''}`}>{tab.icon}</span>
            {tab.id !== 'qr' && <span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span>}
          </div>
        ))}
      </nav>

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600"><span className="material-symbols-outlined text-5xl">support_agent</span></div>
              <h3 className="font-bold text-xl mb-2 text-gray-900 dark:text-white">Contact Support</h3>
              <p className="text-gray-500 text-sm mb-8">Need help with your loan? Reach out to us directly.</p>

              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-3xl p-6 mb-8 text-left border border-gray-100 dark:border-gray-700">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Finance Partner</p>
                <p className="font-bold text-lg text-gray-900 dark:text-white mb-4 leading-tight">{company?.name || 'JLS Finance'}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Helpline Number</p>
                <a href={`tel:${company?.phone || '9413821007'}`} className="font-bold text-2xl text-blue-600 decoration-wavy underline">{company?.phone || '9413821007'}</a>
              </div>

              <button onClick={() => setShowSupportModal(false)} className="w-full py-4 bg-gray-900 dark:bg-white dark:text-gray-900 text-white font-bold rounded-2xl active:scale-95 transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedEmi && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in zoom-in">
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-blue-600 p-8 text-center text-white relative">
              <button onClick={() => setShowPaymentModal(false)} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full"><span className="material-symbols-outlined text-sm">close</span></button>
              <h3 className="font-bold text-xl">Confirm Payment</h3>
              <p className="text-blue-100 text-xs mt-1">Scan QR or open UPI app</p>
              <div className="mt-6 bg-white p-3 rounded-2xl inline-block shadow-lg"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${company?.upiId || UPI_ID}&pn=EMI%20Payment&am=${selectedEmi.amount}&cu=INR&tn=EMI%20Pay`)}`} className="w-40 h-40" /></div>
            </div>
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Amount Due</p><p className="font-bold text-2xl text-gray-900 dark:text-white">{formatCurrency(selectedEmi.amount)}</p></div>
                <div className="text-right"><p className="text-[10px] font-bold text-gray-400 uppercase">EMI NO</p><p className="font-bold text-lg text-blue-600">#{selectedEmi.emiNumber}</p></div>
              </div>
              <a href={`upi://pay?pa=${company?.upiId || UPI_ID}&pn=EMI%20Payment&am=${selectedEmi.amount}&cu=INR&tn=EMI%20Pay`} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-blue-200 active:scale-95 transition-all mb-4"><span className="material-symbols-outlined">payments</span> Pay via UPI</a>
              <button onClick={() => setShowPaymentModal(false)} className="w-full py-3 text-gray-400 font-bold text-xs uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Details/Schedule Modal */}
      {showDetailsModal && selectedLoan && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in slide-in-from-bottom-full duration-500">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[3rem] p-8 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">Loan Breakdown</h3>
              <button onClick={() => setShowDetailsModal(false)} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full"><span className="material-symbols-outlined text-sm">close</span></button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <button onClick={() => PdfGenerator.generateLoanAgreement(selectedLoan as any, customer as any, company as any)} className="p-4 bg-blue-50 rounded-2xl flex flex-col items-center gap-2 text-blue-600 font-bold text-[10px] uppercase shadow-sm border border-blue-100"><span className="material-symbols-outlined">description</span> Agreement</button>
              <button onClick={() => PdfGenerator.generateLoanCard(selectedLoan as any, customer as any, company as any)} className="p-4 bg-orange-50 rounded-2xl flex flex-col items-center gap-2 text-orange-600 font-bold text-[10px] uppercase shadow-sm border border-orange-100"><span className="material-symbols-outlined">badge</span> Loan Card</button>
            </div>

            <h4 className="font-bold text-sm mb-4 uppercase tracking-widest text-gray-400">Repayment Schedule</h4>
            <div className="space-y-3">
              {selectedLoan.repaymentSchedule?.map((e, i) => (
                <div key={i} className={`p-4 rounded-2xl flex justify-between items-center ${e.status === 'Paid' ? 'bg-green-50/50 border border-green-50' : e.status === 'Overdue' ? 'bg-red-50/50 border border-red-50' : 'bg-gray-50 border border-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${e.status === 'Paid' ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>{e.emiNumber}</div>
                    <div><p className="font-bold text-xs">EMI Details</p><p className="text-[10px] text-gray-500">{formatDate(e.dueDate)} • {e.status}</p></div>
                  </div>
                  <p className="font-bold text-sm">{formatCurrency(e.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomerPortal;