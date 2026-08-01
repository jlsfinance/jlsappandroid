import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, doc, runTransaction } from 'firebase/firestore';
import { db, auth, functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { Customer, DepositType } from '../types';
import { useCompany } from '../context/CompanyContext';
import { useSubscription } from '../context/SubscriptionContext';
import UpgradeModal from '../components/UpgradeModal';
import { WhatsappService } from '../services/whatsappService';
import { UsageService } from '../services/UsageService';
import { generateDepositSchedule, computeMaturity } from '../services/depositService';

const DEPOSIT_TYPES: { value: DepositType; label: string; desc: string }[] = [
  { value: 'rd_maturity', label: 'RD (Maturity)', desc: 'Monthly deposit, interest at maturity' },
  { value: 'rd_payout', label: 'RD (Monthly Payout)', desc: 'Monthly deposit + interest paid out' },
  { value: 'fd_lumpsum', label: 'FD (Lump Sum)', desc: 'One-time deposit, interest at maturity' },
];

const NewDeposit: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const { canCreateDeposit, showUpgradeModal, hideUpgradeModal, upgradeModalState, activePlan } = useSubscription();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    type: 'rd_maturity' as DepositType,
    monthlyAmount: 1000,
    principal: 12000,
    interestRate: 7,
    tenure: 12,
    notes: '',
    nomineeName: '',
    nomineeRelation: '',
    nomineePhone: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!currentCompany) { setLoading(false); return; }
      setLoading(true);
      try {
        const customersSnap = await getDocs(query(collection(db, "customers"), where("companyId", "==", currentCompany.id)));
        setCustomers(customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), avatar: doc.data().photo_url || doc.data().avatar } as Customer)));
      } catch (err) {
        console.error(err);
        alert("Failed to load customers.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentCompany]);

  const filteredCustomers = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return customers.filter(c => (c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s));
  }, [customers, searchTerm]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId) || null, [selectedCustomerId, customers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: (name === 'notes' || name.startsWith('nominee')) ? value : Number(value) }));
  };

  const isFd = form.type === 'fd_lumpsum';
  const displayPrincipal = isFd ? form.principal : form.monthlyAmount * form.tenure;
  const maturityAmount = computeMaturity(form.type, form.principal, form.monthlyAmount, form.interestRate, form.tenure);
  const effectivePrincipal = isFd ? form.principal : form.monthlyAmount * form.tenure;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !auth.currentUser || !currentCompany) return;
    if (form.tenure < 1) return alert("Minimum tenure is 1 month");

    // Subscription Deposit Guard Check
    const guardRes = canCreateDeposit(form.tenure);
    if (!guardRes.allowed) {
      showUpgradeModal(guardRes);
      return;
    }

    setIsSubmitting(true);
    try {
      const startDate = new Date().toISOString();
      const { schedule, maturityDate, maturityAmount: mat } = generateDepositSchedule(
        form.type, form.principal, form.monthlyAmount, form.interestRate, form.tenure, startDate, 1
      );

      const getNextCounterId = httpsCallable(functions, 'getNextCounterId');
      const counterRes = await getNextCounterId({ counterName: 'depositId_counter' });
      const nextId = (counterRes.data as any).nextId;

      const newId = await runTransaction(db, async (transaction) => {
        const newRef = doc(db, 'deposits', nextId.toString());
        transaction.set(newRef, {
          id: nextId.toString(),
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          companyId: currentCompany.id,
          type: form.type,
          principal: effectivePrincipal,
          monthlyAmount: isFd ? form.principal : form.monthlyAmount,
          interestRate: form.interestRate,
          tenure: form.tenure,
          status: 'Active',
          startDate,
          maturityDate,
          maturityAmount: mat,
          notes: form.notes || null,
          nominee: (form.nomineeName || form.nomineeRelation || form.nomineePhone)
            ? { name: form.nomineeName || null, relation: form.nomineeRelation || null, phone: form.nomineePhone || null }
            : null,
          customerPhoto: selectedCustomer.avatar || null,
          createdBy: auth.currentUser.uid,
          createdAt: new Date().toISOString(),
          depositSchedule: schedule,
        });
        return nextId;
      });

      await UsageService.incrementUsage(auth.currentUser.uid, 'deposits', 1);
      alert(`Deposit Created! Deposit ID: ${newId}`);
      // ponytail: notify customer on deposit creation
      WhatsappService.sendDepositCreated(
        selectedCustomer.name,
        WhatsappService.phoneOf(selectedCustomer),
        form.type.replace('_', ' ').toUpperCase(),
        effectivePrincipal, mat, newId.toString()
      );
      navigate(`/deposits/${newId}`);
    } catch (error) {
      console.error(error);
      alert("Failed to create deposit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold">New Deposit</h1>
        <div className="w-10"></div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="font-bold text-base flex items-center gap-2"><span className="material-symbols-outlined text-primary">person_search</span>Select Customer</h2>
          </div>
          {!selectedCustomer && (
            <div className="p-4">
              <div className="relative mb-4">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input type="text" placeholder="Search by Name or Phone..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                  {filteredCustomers.map(customer => (
                    <button key={customer.id} onClick={() => setSelectedCustomerId(customer.id)}
                      className="flex flex-col items-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2230] hover:border-primary hover:shadow-md transition-all">
                      {customer.avatar ? (
                        <img src={customer.avatar} alt={customer.name} className="h-14 w-14 rounded-full object-cover mb-2 bg-slate-200" />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-2">{getInitials(customer.name)}</div>
                      )}
                      <span className="text-sm font-bold text-center leading-tight">{customer.name}</span>
                      <span className="text-xs text-slate-500 mt-1">{customer.phone || 'No Phone'}</span>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && <div className="col-span-full text-center py-8 text-slate-400">No customers found.</div>}
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
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl border-2 border-white shadow-sm">{getInitials(selectedCustomer.name)}</div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{selectedCustomer.name}</h3>
                  <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomerId(null)} className="text-sm text-primary font-bold hover:underline px-3 py-1">Change</button>
            </div>
          )}
        </div>

        {selectedCustomer && (
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="font-bold text-base flex items-center gap-2"><span className="material-symbols-outlined text-primary">savings</span>Deposit Configuration</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Deposit Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {DEPOSIT_TYPES.map(t => (
                    <button type="button" key={t.value} onClick={() => setForm(prev => ({ ...prev, type: t.value }))}
                      className={`p-3 rounded-xl border text-left transition-all ${form.type === t.value ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700'}`}>
                      <p className="font-bold text-sm">{t.label}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {isFd ? (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Deposit Amount (₹)</label>
                    <input type="number" name="principal" value={form.principal} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none font-bold text-lg" min="100" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Monthly Deposit (₹)</label>
                    <input type="number" name="monthlyAmount" value={form.monthlyAmount} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none font-bold text-lg" min="100" />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Tenure (Months)</label>
                  <div className="flex items-center gap-4">
                    <input type="range" name="tenure" min="1" max="120" value={form.tenure} onChange={handleInputChange}
                      className="flex-1 accent-primary h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                    <div className="w-16 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-center font-bold">{form.tenure}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Interest Rate (% p.a.)</label>
                  <input type="number" name="interestRate" value={form.interestRate} onChange={handleInputChange} step="0.1"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Internal Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none resize-none h-24" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Nominee (Optional)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input type="text" name="nomineeName" value={form.nomineeName} onChange={handleInputChange} placeholder="Nominee Name"
                    className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none" />
                  <input type="text" name="nomineeRelation" value={form.nomineeRelation} onChange={handleInputChange} placeholder="Relation"
                    className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none" />
                  <input type="text" name="nomineePhone" value={form.nomineePhone} onChange={handleInputChange} placeholder="Phone"
                    className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold">Total Deposited</p>
                  <p className="text-xl font-extrabold text-primary">₹{displayPrincipal.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold">Maturity Amount</p>
                  <p className="text-xl font-extrabold text-primary">₹{maturityAmount.toLocaleString('en-IN')}</p>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting}
                className="w-full py-4 rounded-xl btn-kadak text-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                {isSubmitting ? <><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div> Processing...</> : <>Create Deposit <span className="material-symbols-outlined material-symbols-fill">arrow_forward</span></>}
              </button>
            </form>
          </div>
        )}

        <UpgradeModal
          isOpen={upgradeModalState.isOpen}
          onClose={hideUpgradeModal}
          blockedFeature="Deposit Feature Locked"
          currentPlan={activePlan}
          requiredPlanId={upgradeModalState.result?.requiredPlanId}
          reason={upgradeModalState.result?.reason}
        />
      </div>
    </div>
  );
};

export default NewDeposit;
