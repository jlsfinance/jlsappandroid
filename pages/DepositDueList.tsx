import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, runTransaction, addDoc } from 'firebase/firestore';
import { format, parseISO, isPast, subMonths, addMonths } from 'date-fns';
import { useCompany } from '../context/CompanyContext';
import { WhatsappService } from '../services/whatsappService';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={`bi bi-whatsapp ${className}`} viewBox="0 0 16 16">
    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
  </svg>
);

interface PendingKist {
  depositId: string;
  customerId: string;
  customerName: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  totalInstallments: number;
  phoneNumber?: string;
  customerPhoto?: string;
}

const DepositDueList: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [allPending, setAllPending] = useState<PendingKist[]>([]);
  const [filtered, setFiltered] = useState<PendingKist[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [totalDue, setTotalDue] = useState(0);

  const [selected, setSelected] = useState<PendingKist | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [paymentRemark, setPaymentRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const companyDetails = useMemo(() => ({
    name: currentCompany?.name || 'Finance Company',
    address: currentCompany?.address || '',
    phone: currentCompany?.phone || '',
  }), [currentCompany]);

  const formatCurrency = (v: number) => `Rs. ${new Intl.NumberFormat('en-IN').format(v)}`;

  const fetchPending = useCallback(async () => {
    if (!currentCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const [depSnap, custSnap] = await Promise.all([
        getDocs(query(collection(db, 'deposits'), where('status', 'in', ['Active', 'Matured']), where('companyId', '==', currentCompany.id))),
        getDocs(query(collection(db, 'customers'), where('companyId', '==', currentCompany.id))),
      ]);
      const custMap = new Map<string, any>();
      custSnap.forEach(d => custMap.set(d.id, d.data()));
      const list: PendingKist[] = [];
      depSnap.forEach(d => {
        const dep: any = d.data();
        const cust = custMap.get(dep.customerId);
        (dep.depositSchedule || []).forEach((s: any) => {
          if (s.status === 'Pending') {
            list.push({
              depositId: d.id,
              customerId: dep.customerId,
              customerName: dep.customerName,
              installmentNumber: s.installmentNumber,
              dueDate: s.dueDate,
              amount: s.amount,
              totalInstallments: dep.depositSchedule?.length || 0,
              phoneNumber: cust?.phone || 'N/A',
              customerPhoto: cust?.photo_url,
            });
          }
        });
      });
      list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      setAllPending(list);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [currentCompany]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  useEffect(() => {
    const monthKey = format(viewDate, 'yyyy-MM');
    const f = allPending.filter(k => format(parseISO(k.dueDate), 'yyyy-MM') <= monthKey);
    setFiltered(f);
    setTotalDue(f.reduce((s, k) => s + k.amount, 0));
  }, [viewDate, allPending]);

  const handleSendReminder = async (k: PendingKist) => {
    if (!k.phoneNumber || k.phoneNumber === 'N/A' || k.phoneNumber.length < 10) { alert('Phone not found.'); return; }
    const dd = format(parseISO(k.dueDate), 'yyyy-MM-dd');
    await WhatsappService.sendDepositReminder(k.customerName, k.phoneNumber, k.amount, dd, k.depositId, k.installmentNumber);
  };

  const handleBulk = async () => {
    if (filtered.length === 0) return alert('No dues to remind.');
    let count = 0;
    for (const k of filtered) {
      if (k.phoneNumber && k.phoneNumber.length >= 10) { await handleSendReminder(k); count++; }
    }
    alert(`WhatsApp reminder sent to ${count} customers via API.`);
  };

  const handleCollect = async () => {
    if (!selected || isSubmitting) return;
    const amt = customAmount > 0 ? customAmount : selected.amount;
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'deposits', selected.depositId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Deposit not found');
        const data: any = snap.data();
        const today = format(new Date(), 'yyyy-MM-dd');
        const upd = (data.depositSchedule || []).map((s: any) =>
          s.installmentNumber === selected.installmentNumber
            ? { ...s, status: 'Paid', paymentDate: today, paymentMethod, amountPaid: amt, remark: paymentRemark }
            : s
        );
        tx.update(ref, { depositSchedule: upd });
        await addDoc(collection(db, 'ledger'), {
          companyId: data.companyId, customerId: data.customerId, depositId: data.id,
          date: new Date().toISOString(),
          narration: `Deposit Recd: ${data.customerName} (#${data.id})`,
          entries: [{ account: 'Cash / Bank', type: 'Credit', amount: amt }],
          createdAt: new Date().toISOString(),
        });
      });
      WhatsappService.sendDepositReceived(selected.customerName, selected.phoneNumber || '', amt, selected.depositId, selected.installmentNumber, format(new Date(), 'yyyy-MM-dd'));
      setSelected(null); setCustomAmount(0); setPaymentRemark('');
      alert('Deposit collected!');
      fetchPending();
    } catch (e: any) { console.error(e); alert('Failed: ' + e.message); } finally { setIsSubmitting(false); }
  };

  const renderCard = (k: PendingKist) => {
    const overdue = isPast(parseISO(k.dueDate));
    const call = (k.phoneNumber && k.phoneNumber.length >= 10) ? `tel:91${k.phoneNumber.replace(/\D/g, '').slice(-10)}` : null;
    return (
      <div key={`${k.depositId}-${k.installmentNumber}`}
        className={`bg-white dark:bg-[#1e2736] rounded-xl p-4 shadow-sm border flex justify-between items-center gap-3 ${overdue ? 'border-red-400 dark:border-red-500/60 ring-1 ring-red-300 dark:ring-red-500/40 bg-red-50/30 dark:bg-red-950/10' : 'border-slate-100 dark:border-slate-800'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-11 w-11 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200 dark:border-slate-700">
            {k.customerPhoto ? (
              <img src={k.customerPhoto} alt={k.customerName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <span className="material-symbols-outlined text-[22px]">person</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="font-bold text-base text-slate-900 dark:text-white capitalize truncate">{k.customerName.toLowerCase()}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">KIST {k.installmentNumber}/{k.totalInstallments}</span>
              {overdue ? (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Overdue</span>
              ) : (
                <span className="text-[10px] font-bold text-slate-500">{format(parseISO(k.dueDate), 'dd MMM')}</span>
              )}
            </div>
            <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-1">{formatCurrency(k.amount)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button onClick={() => { setSelected(k); setCustomAmount(k.amount); setPaymentMethod('cash'); setPaymentRemark(''); }}
            className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/30 active:scale-95 transition-all hover:brightness-110">
            Collect
          </button>
          <div className="flex gap-2">
            {call && (
              <a href={call} className="p-2 bg-green-600 text-white rounded-lg flex items-center justify-center hover:bg-green-700 transition-colors">
                <span className="material-symbols-outlined text-[18px]">call</span>
              </a>
            )}
            <button onClick={() => handleSendReminder(k)}
              className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center hover:bg-green-100 hover:text-green-600 transition-colors">
              <span className="material-symbols-outlined text-[18px]">chat</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-safe text-slate-900 dark:text-white">
      <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 pb-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold tracking-tight">Deposit Due List</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBulk} className="p-2.5 rounded-xl bg-green-600 text-white shadow-md shadow-green-500/30 active:scale-95 transition-all">
            <WhatsAppIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">chevron_left</span></button>
            <h2 className="font-bold text-lg">{format(viewDate, 'MMMM yyyy')}</h2>
            <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">chevron_right</span></button>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <div className="text-center w-full">
              <span className="block text-xs font-bold text-slate-500 uppercase">Total Due</span>
              <span className="block text-xl font-extrabold text-primary">{formatCurrency(totalDue)}</span>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
            <div className="text-center w-full">
              <span className="block text-xs font-bold text-slate-500 uppercase">Pending Count</span>
              <span className="block text-xl font-extrabold text-slate-700 dark:text-white">{filtered.length}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
          ) : filtered.length > 0 ? (
            (() => {
              const cm = format(viewDate, 'yyyy-MM');
              const overdueList = filtered.filter(k => isPast(parseISO(k.dueDate)) && format(parseISO(k.dueDate), 'yyyy-MM') !== cm);
              const current = filtered.filter(k => !isPast(parseISO(k.dueDate)) || format(parseISO(k.dueDate), 'yyyy-MM') === cm);
              return (
                <>
                  {overdueList.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-1 mb-2">
                        <span className="material-symbols-outlined text-red-500 text-[18px]">warning</span>
                        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wide">Previous Months Overdue ({overdueList.length})</h3>
                      </div>
                      <div className="space-y-3">{overdueList.map(renderCard)}</div>
                    </div>
                  )}
                  {current.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide px-1 mb-2">This Month & Upcoming ({current.length})</h3>
                      {current.map(renderCard)}
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
              <p>No pending deposits for this month.</p>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">Collect Deposit</h3>
            <p className="text-sm text-slate-500 mb-4">Kist #{selected.installmentNumber} from {selected.customerName}</p>
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Amount</span>
                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(selected.amount)}</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Amount Received</label>
                <input type="number" value={customAmount || selected.amount} onChange={(e) => setCustomAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none text-lg font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'upi', 'bank'].map(m => (
                    <button key={m} onClick={() => setPaymentMethod(m)}
                      className={`py-2 rounded-lg text-sm font-bold capitalize border ${paymentMethod === m ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-[#1a2230] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Remark (Optional)</label>
                <input type="text" value={paymentRemark} onChange={(e) => setPaymentRemark(e.target.value)} placeholder="Any notes..."
                  className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setSelected(null); setCustomAmount(0); setPaymentRemark(''); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Cancel</button>
              <button onClick={handleCollect} disabled={isSubmitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                {isSubmitting && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositDueList;
