import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, doc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { Customer } from '../types';
import { useCompany } from '../context/CompanyContext';

interface LoanFormState {
  amount: number;
  tenure: number;
  interestRate: number;
  processingFeePercentage: number;
  notes: string;
}

const NewLoan: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customersWithActiveLoans, setCustomersWithActiveLoans] = useState<Set<string>>(new Set());

  // Form State
  const [form, setForm] = useState<LoanFormState>({
    amount: 10000,
    tenure: 12,
    interestRate: 12,
    processingFeePercentage: 2,
    notes: ''
  });

  // Load Initial Data
  useEffect(() => {
    const fetchData = async () => {
      if (!currentCompany) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch customers filtered by company
        const customersQuery = query(
          collection(db, "customers"),
          where("companyId", "==", currentCompany.id)
        );
        const customersSnap = await getDocs(customersQuery);
        const customersData = customersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          avatar: doc.data().photo_url || doc.data().avatar
        } as Customer));
        setCustomers(customersData);

        // Fetch active loans to prevent duplicates (also filter by company)
        const activeLoansQuery = query(
          collection(db, "loans"),
          where("status", "==", "Disbursed"),
          where("companyId", "==", currentCompany.id)
        );
        const activeLoansSnap = await getDocs(activeLoansQuery);
        const activeLoanCustomerIds = new Set(activeLoansSnap.docs.map(doc => doc.data().customerId));
        setCustomersWithActiveLoans(activeLoanCustomerIds);

      } catch (err) {
        console.error("Error loading data:", err);
        alert("Failed to load customer data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentCompany]);

  const filteredCustomers = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(lowerSearch) ||
      (c.phone || '').includes(lowerSearch)
    );
  }, [customers, searchTerm]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customers]);

  // Handle Form Changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'notes' ? value : Number(value)
    }));
  };

  const handleCustomerSelect = (customerId: string) => {
    if (customersWithActiveLoans.has(customerId)) {
      alert("This customer already has an active loan.");
      return;
    }
    setSelectedCustomerId(customerId);
  };

  // Calculations
  const calculateLoanDetails = () => {
    const processingFee = Math.round((form.amount * form.processingFeePercentage) / 100);
    const monthlyRate = form.interestRate / 12 / 100;
    const emi = Math.round(
      (form.amount * monthlyRate * Math.pow(1 + monthlyRate, form.tenure)) /
      (Math.pow(1 + monthlyRate, form.tenure) - 1)
    );
    return { processingFee, emi };
  };

  const { processingFee, emi } = calculateLoanDetails();

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !auth.currentUser) return;

    // Validation
    if (form.amount < 1000) return alert("Minimum loan amount is 1000");
    if (form.tenure < 1) return alert("Minimum tenure is 1 month");

    setIsSubmitting(true);

    try {
      const applicationDate = new Date().toISOString();

      // Transaction: Get new ID -> Save Loan -> Update Counter
      const newLoanId = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'loanId_counter');
        const counterDoc = await transaction.get(counterRef);

        let nextId = 10110;
        if (counterDoc.exists()) {
          const lastId = counterDoc.data().lastId;
          nextId = typeof lastId === 'number' ? lastId + 10 : 10110;
        }

        const newLoanRef = doc(db, 'loans', nextId.toString());

        // Construct Loan Object
        const loanData = {
          id: nextId.toString(),
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          companyId: currentCompany!.id,
          amount: form.amount,
          interestRate: form.interestRate,
          tenure: form.tenure,
          processingFeePercentage: form.processingFeePercentage,
          processingFee,
          emi,
          notes: form.notes || null,
          status: "Pending",
          createdBy: auth.currentUser!.uid,
          date: applicationDate,
          approvalDate: null,
          disbursalDate: null,
          repaymentSchedule: []
        };

        transaction.set(newLoanRef, loanData);
        transaction.set(counterRef, { lastId: nextId }, { merge: true });

        return nextId;
      });

      alert(`Loan Application Submitted Successfully! Loan ID: ${newLoanId}`);
      navigate('/loans');

    } catch (error) {
      console.error("Submission failed:", error);
      alert("Failed to submit loan application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for Initials
  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold">New Application</h1>
        <div className="w-10"></div> {/* Spacer */}
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">

        {/* Step 1: Customer Selection */}
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="font-bold text-base flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person_search</span>
              Select Customer
            </h2>
          </div>

          {!selectedCustomer && (
            <div className="p-4">
              <div className="relative mb-4">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                  type="text"
                  placeholder="Search by Name or Phone..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                  {filteredCustomers.length > 0 ? filteredCustomers.map(customer => {
                    const hasActiveLoan = customersWithActiveLoans.has(customer.id);
                    return (
                      <button
                        key={customer.id}
                        onClick={() => handleCustomerSelect(customer.id)}
                        disabled={hasActiveLoan}
                        className={`relative flex flex-col items-center p-4 rounded-xl border transition-all ${hasActiveLoan
                            ? 'opacity-60 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                            : 'bg-white dark:bg-[#1a2230] border-slate-200 dark:border-slate-700 hover:border-primary hover:shadow-md'
                          }`}
                      >
                        {hasActiveLoan && <span className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Active</span>}

                        {customer.avatar ? (
                          <img src={customer.avatar} alt={customer.name} className="h-14 w-14 rounded-full object-cover mb-2 bg-slate-200" />
                        ) : (
                          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-2">
                            {getInitials(customer.name)}
                          </div>
                        )}
                        <span className="text-sm font-bold text-center leading-tight">{customer.name}</span>
                        <span className="text-xs text-slate-500 mt-1">{customer.phone || 'No Phone'}</span>
                      </button>
                    );
                  }) : (
                    <div className="col-span-full text-center py-8 text-slate-400">No customers found.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedCustomer && (
            <div className="p-4 flex items-start justify-between bg-blue-50/50 dark:bg-blue-900/10">
              <div className="flex items-center gap-4">
                {selectedCustomer.avatar ? (
                  <img src={selectedCustomer.avatar} alt={selectedCustomer.name} className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl border-2 border-white shadow-sm">
                    {getInitials(selectedCustomer.name)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{selectedCustomer.name}</h3>
                  <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                  <div className="flex gap-2 mt-1 text-xs">
                    {selectedCustomer.aadhaar && <span className="px-2 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Aadhaar: {selectedCustomer.aadhaar}</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="text-sm text-primary font-bold hover:underline px-3 py-1"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Loan Details Form */}
        {selectedCustomer && (
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="font-bold text-base flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">edit_document</span>
                Loan Configuration
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Amount */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Loan Amount (₹)</label>
                  <input
                    type="number"
                    name="amount"
                    value={form.amount}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none font-bold text-lg"
                    min="1000"
                  />
                </div>

                {/* Tenure */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Tenure (Months)</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      name="tenure"
                      min="1" max="60"
                      value={form.tenure}
                      onChange={handleInputChange}
                      className="flex-1 accent-primary h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="w-16 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-center font-bold">
                      {form.tenure}
                    </div>
                  </div>
                </div>

                {/* Interest Rate */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Interest Rate (% p.a.)</label>
                  <input
                    type="number"
                    name="interestRate"
                    value={form.interestRate}
                    onChange={handleInputChange}
                    step="0.1"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                {/* Processing Fee % */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Processing Fee (%)</label>
                  <input
                    type="number"
                    name="processingFeePercentage"
                    value={form.processingFeePercentage}
                    onChange={handleInputChange}
                    step="0.1"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Internal Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleInputChange}
                  placeholder="Add any additional remarks..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none resize-none h-24"
                ></textarea>
              </div>

              {/* Summary Box */}
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold">Monthly EMI</p>
                  <p className="text-xl font-extrabold text-primary">₹{emi.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold">Processing Fee</p>
                  <p className="text-xl font-extrabold text-primary">₹{processingFee.toLocaleString('en-IN')}</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl btn-kadak text-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div> Processing...</>
                ) : (
                  <>Submit Application <span className="material-symbols-outlined material-symbols-fill">arrow_forward</span></>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};

export default NewLoan;