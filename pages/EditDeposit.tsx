import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { Deposit, DepositType } from '../types';
import { useCompany } from '../context/CompanyContext';
import { generateDepositSchedule, computeMaturity } from '../services/depositService';

const DEPOSIT_TYPES: { value: DepositType; label: string; desc: string }[] = [
  { value: 'rd_maturity', label: 'RD (Maturity)', desc: 'Monthly deposit, interest at maturity' },
  { value: 'rd_payout', label: 'RD (Monthly Payout)', desc: 'Monthly deposit + interest paid out' },
  { value: 'fd_lumpsum', label: 'FD (Lump Sum)', desc: 'One-time deposit, interest at maturity' },
];

const EditDeposit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    type: 'rd_maturity' as DepositType,
    monthlyAmount: 1000,
    principal: 12000,
    interestRate: 7,
    tenure: 12,
    notes: '',
  });

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, "deposits", id));
        if (snap.exists()) {
          const d = { id: snap.id, ...snap.data() } as Deposit;
          setDeposit(d);
          setForm({
            type: d.type,
            monthlyAmount: d.monthlyAmount || 0,
            principal: d.principal || 0,
            interestRate: d.interestRate,
            tenure: d.tenure,
            notes: d.notes || '',
          });
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'notes' ? value : Number(value) }));
  };

  const isFd = form.type === 'fd_lumpsum';
  const displayPrincipal = isFd ? form.principal : form.monthlyAmount * form.tenure;
  const maturityAmount = computeMaturity(form.type, form.principal, form.monthlyAmount, form.interestRate, form.tenure);
  const effectivePrincipal = isFd ? form.principal : form.monthlyAmount * form.tenure;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deposit || !currentCompany || isSubmitting) return;
    if (form.tenure < 1) return alert("Minimum tenure is 1 month");
    setIsSubmitting(true);
    try {
      // Only regenerate schedule if no installments paid yet (avoid corrupting history)
      const paidCount = deposit.depositSchedule?.filter(i => i.status === 'Paid').length || 0;
      const { schedule, maturityDate, maturityAmount: mat } = generateDepositSchedule(
        form.type, form.principal, form.monthlyAmount, form.interestRate, form.tenure, deposit.startDate, 1
      );
      const update: any = {
        type: form.type,
        principal: effectivePrincipal,
        monthlyAmount: isFd ? form.principal : form.monthlyAmount,
        interestRate: form.interestRate,
        tenure: form.tenure,
        maturityDate,
        maturityAmount: mat,
        notes: form.notes || null,
        updatedBy: auth.currentUser?.uid,
        updatedAt: new Date().toISOString(),
      };
      if (paidCount === 0) {
        update.depositSchedule = schedule;
      } else {
        alert("Some installments already paid — schedule kept as-is. Only terms updated.");
      }
      await updateDoc(doc(db, "deposits", deposit.id), update);
      alert("Deposit updated!");
      navigate(`/deposits/${deposit.id}`);
    } catch (error) {
      console.error(error);
      alert("Failed to update deposit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>;
  if (!deposit) return <div className="p-8 text-center text-slate-500">Deposit not found.</div>;

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold">Edit Deposit #{deposit.id}</h1>
        <div className="w-10"></div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            {(deposit.customerName || '?').substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-lg">{deposit.customerName}</h3>
            <p className="text-sm text-slate-500">{deposit.status}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
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
              {isSubmitting ? <><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div> Saving...</> : <>Update Deposit <span className="material-symbols-outlined material-symbols-fill">save</span></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditDeposit;
