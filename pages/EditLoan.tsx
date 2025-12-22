import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  photo_url?: string;
  avatar?: string;
}

interface LoanData {
  amount: number;
  interestRate: number;
  tenure: number;
  processingFeePercentage: number;
  processingFee: number;
  emi: number;
  date: string;
  disbursalDate?: string;
  notes?: string;
  customerId: string;
  customerName: string;
  status: 'Pending' | 'Approved' | 'Disbursed' | 'Completed' | 'Rejected' | 'Active' | 'Overdue';
  companyId?: string;
}

interface FormState {
  amount: number;
  interestRate: number;
  tenure: number;
  processingFeePercentage: number;
  date: string;
  disbursalDate: string;
  notes: string;
}

const EditLoan: React.FC = () => {
  const navigate = useNavigate();
  const { id: loanId } = useParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loan, setLoan] = useState<LoanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState<FormState>({
    amount: 0,
    interestRate: 0,
    tenure: 0,
    processingFeePercentage: 0,
    date: '',
    disbursalDate: '',
    notes: ''
  });

  const fetchLoanAndCustomer = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const loanRef = doc(db, "loans", id);
      const loanSnap = await getDoc(loanRef);

      if (!loanSnap.exists()) {
        alert("Loan not found");
        navigate('/loans');
        return;
      }

      const loanData = loanSnap.data() as LoanData;
      setLoan(loanData);

      setForm({
        amount: loanData.amount,
        interestRate: loanData.interestRate,
        tenure: loanData.tenure,
        processingFeePercentage: loanData.processingFeePercentage || 2,
        date: loanData.date || '',
        disbursalDate: loanData.disbursalDate || '',
        notes: loanData.notes || ''
      });

      if (loanData.customerId) {
        const customerRef = doc(db, "customers", loanData.customerId);
        const customerSnap = await getDoc(customerRef);
        if (customerSnap.exists()) {
          setCustomer({ id: customerSnap.id, ...customerSnap.data() } as Customer);
        }
      }
    } catch (err) {
      console.error("Error loading loan:", err);
      alert("Failed to load loan data");
      navigate('/loans');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (loanId) {
      fetchLoanAndCustomer(loanId);
    }
  }, [loanId, fetchLoanAndCustomer]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'notes' || name === 'date' || name === 'disbursalDate' ? value : Number(value)
    }));
  };

  const calculateLoanDetails = () => {
    const processingFee = Math.round((form.amount * form.processingFeePercentage) / 100);
    const monthlyRate = form.interestRate / 12 / 100;
    const emi = monthlyRate > 0 && form.tenure > 0
      ? Math.round(
        (form.amount * monthlyRate * Math.pow(1 + monthlyRate, form.tenure)) /
        (Math.pow(1 + monthlyRate, form.tenure) - 1)
      )
      : 0;
    return { processingFee, emi };
  };

  const { processingFee, emi } = calculateLoanDetails();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loanId || !loan) {
      alert("Loan information is missing");
      return;
    }

    if (form.amount < 1000) {
      alert("Minimum loan amount is ₹1,000");
      return;
    }

    setIsSubmitting(true);
    try {
      const loanRef = doc(db, "loans", loanId);
      await updateDoc(loanRef, {
        amount: form.amount,
        interestRate: form.interestRate,
        tenure: form.tenure,
        processingFeePercentage: form.processingFeePercentage,
        processingFee,
        emi,
        date: form.date,
        disbursalDate: form.disbursalDate || null,
        notes: form.notes || null,
      });

      alert("Loan updated successfully!");
      navigate(`/loans/${loanId}`);
    } catch (err) {
      console.error("Update failed:", err);
      alert("Failed to update loan. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold">Edit Loan</h1>
        <div className="w-10"></div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">

          {customer && (
            <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">person</span>
                  Customer Details
                </h2>
              </div>
              <div className="p-6 flex items-start gap-6">
                <div className="h-24 w-24 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0">
                  {(customer.photo_url || customer.avatar) ? (
                    <img
                      src={customer.photo_url || customer.avatar}
                      alt={customer.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-slate-400">
                      {customer.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-500">verified_user</span>
                    {customer.name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <strong>Mobile:</strong> {customer.phone || 'N/A'}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <strong>Address:</strong> {customer.address || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loan && loan.status !== 'Pending' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">warning</span>
                <div>
                  <h4 className="font-bold text-amber-800 dark:text-amber-300">Warning: Editing an Active Loan</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    This loan has already been {loan.status.toLowerCase()}. Any changes made here may impact the existing EMI schedule and financial records. Please proceed with caution. This action will not automatically regenerate the payment schedule.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="font-bold text-base flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">account_balance</span>
                Loan Details
              </h2>
              <p className="text-xs text-slate-500 mt-1">Loan ID: {loanId}</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Loan Amount (₹) *</label>
                <input
                  type="number"
                  name="amount"
                  required
                  min="1000"
                  value={form.amount}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Tenure (Months) *</label>
                <input
                  type="number"
                  name="tenure"
                  required
                  min="1"
                  value={form.tenure}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Interest Rate (% p.a.) *</label>
                <input
                  type="number"
                  name="interestRate"
                  required
                  min="0"
                  max="50"
                  step="0.1"
                  value={form.interestRate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Processing Fee (%)</label>
                <input
                  type="number"
                  name="processingFeePercentage"
                  min="0"
                  max="10"
                  step="0.1"
                  value={form.processingFeePercentage}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Application Date</label>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Disbursal Date</label>
                <input
                  type="date"
                  name="disbursalDate"
                  value={form.disbursalDate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Internal Notes / Remarks</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleInputChange}
                  placeholder="Add any internal notes about this loan..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none resize-none h-24"
                />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-blue-500/10 dark:from-primary/20 dark:to-blue-500/20 rounded-2xl p-6 border border-primary/20">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">calculate</span>
              Updated Calculations
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-[#1e2736] rounded-xl p-4 text-center shadow-sm">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Processing Fee</p>
                <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">₹{processingFee.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white dark:bg-[#1e2736] rounded-xl p-4 text-center shadow-sm">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Monthly EMI</p>
                <p className="text-xl font-bold text-primary mt-1">₹{emi.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white dark:bg-[#1e2736] rounded-xl p-4 text-center shadow-sm">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Total Payable</p>
                <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">₹{(emi * form.tenure).toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="w-full py-4 rounded-xl btn-kadak text-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div> Updating...</>
            ) : (
              <>Update Loan <span className="material-symbols-outlined material-symbols-fill">check_circle</span></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditLoan;