import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format } from 'date-fns';

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
}

interface Company {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  upiId?: string;
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
    return `Rs. ${new Intl.NumberFormat("en-IN").format(value)}`;
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

  const getTotalPaid = (loan: Loan) => {
    if (!loan.repaymentSchedule) return 0;
    return loan.repaymentSchedule.filter(emi => emi.status === 'Paid').reduce((sum, emi) => sum + emi.amount, 0);
  };

  const getTotalPending = (loan: Loan) => {
    if (!loan.repaymentSchedule) return 0;
    return loan.repaymentSchedule.filter(emi => emi.status === 'Pending' || emi.status === 'Overdue').reduce((sum, emi) => sum + emi.amount, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-background-dark dark:to-[#1a1f2e] pb-8">
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Welcome, {customer?.name}</h1>
              <p className="text-white/80 text-sm">{company?.name || 'Customer Portal'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all text-sm font-medium"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Loans</p>
              <p className="text-2xl font-bold text-green-600">{loans.length}</p>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Active Loans</p>
              <p className="text-2xl font-bold text-blue-600">
                {loans.filter(l => l.status === 'Disbursed' || l.status === 'Active').length}
              </p>
            </div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Your Loans</h2>

        {loans.length === 0 ? (
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 mb-4">description</span>
            <p className="text-slate-500">No loans found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {loans.map(loan => {
              const nextEmi = getNextPendingEmi(loan);
              const totalPaid = getTotalPaid(loan);
              const totalPending = getTotalPending(loan);
              
              return (
                <div key={loan.id} className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        Loan Amount: {formatCurrency(loan.amount)}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        loan.status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        loan.status === 'Disbursed' || loan.status === 'Active' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {loan.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs">EMI</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatCurrency(loan.emi)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Rate</p>
                        <p className="font-medium text-slate-900 dark:text-white">{loan.interestRate}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Tenure</p>
                        <p className="font-medium text-slate-900 dark:text-white">{loan.tenure} months</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Total Paid</p>
                        <p className="font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Pending</p>
                        <p className="font-bold text-orange-600">{formatCurrency(totalPending)}</p>
                      </div>
                    </div>

                    {nextEmi && (loan.status === 'Disbursed' || loan.status === 'Active') && (
                      <button
                        onClick={() => openPaymentModal(loan, nextEmi)}
                        className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">qr_code_2</span>
                        Pay EMI #{nextEmi.emiNumber} - {formatCurrency(nextEmi.amount)}
                      </button>
                    )}
                  </div>

                  {loan.repaymentSchedule && loan.repaymentSchedule.length > 0 && (
                    <details className="border-t border-slate-100 dark:border-slate-800">
                      <summary className="p-4 cursor-pointer text-sm font-medium text-primary hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">list</span>
                        View EMI Schedule ({loan.repaymentSchedule.length} EMIs)
                      </summary>
                      <div className="p-4 pt-0 max-h-64 overflow-y-auto">
                        <div className="space-y-2">
                          {loan.repaymentSchedule.map((emi, idx) => (
                            <div 
                              key={idx}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                emi.status === 'Paid' ? 'bg-green-50 dark:bg-green-900/20' :
                                emi.status === 'Overdue' ? 'bg-red-50 dark:bg-red-900/20' :
                                'bg-slate-50 dark:bg-slate-800/50'
                              }`}
                            >
                              <div>
                                <p className="font-medium text-sm">EMI #{emi.emiNumber}</p>
                                <p className="text-xs text-slate-500">{formatDate(emi.dueDate)}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-sm">{formatCurrency(emi.amount)}</p>
                                <span className={`text-xs font-medium ${
                                  emi.status === 'Paid' ? 'text-green-600' :
                                  emi.status === 'Overdue' ? 'text-red-600' :
                                  'text-slate-500'
                                }`}>
                                  {emi.status}
                                </span>
                              </div>
                              {(emi.status === 'Pending' || emi.status === 'Overdue') && (
                                <button
                                  onClick={() => openPaymentModal(loan, emi)}
                                  className="ml-2 p-2 bg-primary text-white rounded-lg hover:opacity-90"
                                >
                                  <span className="material-symbols-outlined text-lg">qr_code_2</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPaymentModal && selectedLoan && selectedEmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 text-center">
              <h3 className="text-lg font-bold">Pay EMI</h3>
              <p className="text-white/80 text-sm">Scan QR code to pay</p>
            </div>
            
            <div className="p-6 text-center">
              <div className="bg-white p-4 rounded-xl inline-block mb-4 shadow-lg">
                <img 
                  src={generateQRCodeUrl(selectedEmi.amount, `EMI ${selectedEmi.emiNumber} for Loan`)}
                  alt="UPI QR Code"
                  className="w-48 h-48"
                />
              </div>
              
              <div className="mb-4">
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(selectedEmi.amount)}
                </p>
                <p className="text-sm text-slate-500">EMI #{selectedEmi.emiNumber} - Due: {formatDate(selectedEmi.dueDate)}</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 mb-4">
                <p className="text-xs text-slate-500 mb-1">UPI ID</p>
                <p className="font-mono font-bold text-slate-900 dark:text-white">{company?.upiId || UPI_ID}</p>
              </div>

              <a
                href={generateUPILink(selectedEmi.amount, `EMI ${selectedEmi.emiNumber} for Loan`)}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 mb-3"
              >
                <span className="material-symbols-outlined">open_in_new</span>
                Open UPI App
              </a>

              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
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

export default CustomerPortal;