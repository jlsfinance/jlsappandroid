import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, deleteDoc, doc, runTransaction, addDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebaseConfig';
import { Deposit, DepositInstallment } from '../types';
import { useCompany } from '../context/CompanyContext';
import { fetchCustomers, clearQueryCache } from '../services/dataService';
import { WhatsappService } from '../services/whatsappService';

const Deposits: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Matured' | 'Closed' | 'Foreclosed'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ponytail: collect deposit straight from list (EMI-style)
  const [collectDep, setCollectDep] = useState<Deposit | null>(null);
  const [collectInst, setCollectInst] = useState<DepositInstallment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customAmount, setCustomAmount] = useState(0);
  const [paymentRemark, setPaymentRemark] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);

  const openCollect = (d: Deposit) => {
    const next = d.depositSchedule?.find(i => i.status === 'Pending');
    if (!next) { alert('All installments already collected.'); return; }
    setCollectDep(d); setCollectInst(next); setCustomAmount(next.amount); setPaymentMethod('cash'); setPaymentRemark('');
  };

  const handleCollect = async () => {
    if (!collectInst || !collectDep || isCollecting) return;
    const amountToPay = customAmount > 0 ? customAmount : collectInst.amount;
    setIsCollecting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const depRef = doc(db, "deposits", collectDep.id);
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists()) throw new Error("Deposit not found");
        const data = depSnap.data();
        const today = format(new Date(), 'yyyy-MM-dd');
        const updatedSchedule = (data.depositSchedule || []).map((inst: DepositInstallment) => {
          if (inst.installmentNumber === collectInst.installmentNumber) {
            return { ...inst, status: 'Paid', paymentDate: today, paymentMethod, amountPaid: amountToPay, remark: paymentRemark };
          }
          return inst;
        });
        transaction.update(depRef, { depositSchedule: updatedSchedule });
        await addDoc(collection(db, "ledger"), {
          companyId: collectDep.companyId,
          customerId: collectDep.customerId,
          depositId: collectDep.id,
          date: new Date().toISOString(),
          narration: `Deposit Recd: ${collectDep.customerName} (#${collectDep.id})`,
          entries: [{ account: 'Cash / Bank', type: 'Credit', amount: amountToPay }],
          createdAt: new Date().toISOString(),
        });
      });
      WhatsappService.sendDepositReceived(
        collectDep.customerName, WhatsappService.phoneOf(customerMap[collectDep.customerId]),
        amountToPay, collectDep.id, collectInst.installmentNumber, format(new Date(), 'yyyy-MM-dd')
      );
      setDeposits(prev => prev.map(d => d.id === collectDep.id ? { ...d, depositSchedule: d.depositSchedule?.map(i => i.installmentNumber === collectInst.installmentNumber ? { ...i, status: 'Paid', paymentDate: format(new Date(), 'yyyy-MM-dd'), paymentMethod, amountPaid: amountToPay, remark: paymentRemark } : i) } : d));
      setCollectDep(null); setCollectInst(null); setCustomAmount(0); setPaymentRemark('');
      alert("Deposit collected! Cash account updated.");
    } catch (e: any) {
      console.error(e);
      alert("Failed: " + e.message);
    } finally { setIsCollecting(false); }
  };

  useEffect(() => {
    const load = async () => {
      if (!currentCompany) { setLoading(false); return; }
      setLoading(true);
      try {
        const [depSnap, custSnap] = await Promise.all([
          getDocs(query(collection(db, "deposits"), where("companyId", "==", currentCompany.id))),
          fetchCustomers(currentCompany.id),
        ]);
        const map: Record<string, any> = {};
        custSnap.forEach(c => { map[c.id] = c; });
        setCustomerMap(map);
        setDeposits(depSnap.docs.map(d => ({ id: d.id, ...d.data() } as Deposit)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentCompany]);

  const filtered = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return deposits
      .filter(d => statusFilter === 'all' || d.status === statusFilter)
      .filter(d => (d.customerName || '').toLowerCase().includes(s) || d.id.includes(s))
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [deposits, searchTerm, statusFilter]);

  const totalDeposited = deposits.reduce((sum, d) => sum + (d.principal || 0), 0);
  const totalMaturity = deposits.reduce((sum, d) => sum + (d.maturityAmount || 0), 0);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const ledgerSnap = await getDocs(query(collection(db, "ledger"), where("depositId", "==", deleteId)));
      await Promise.all(ledgerSnap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "deposits", deleteId));
      await clearQueryCache();
      setDeposits(prev => prev.filter(d => d.id !== deleteId));
      alert("Deposit deleted.");
    } catch (e) {
      console.error(e);
      alert("Failed to delete deposit.");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      <div className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold">Deposits</h1>
        <button onClick={() => navigate('/deposits/new')} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-sm font-bold">
          <span className="material-symbols-outlined text-[18px]">add</span> New
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 uppercase font-bold">Total Deposited</p>
            <p className="text-lg font-extrabold text-primary">₹{(totalDeposited || 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 uppercase font-bold">Total Maturity</p>
            <p className="text-lg font-extrabold text-primary">₹{(totalMaturity || 0).toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input type="text" placeholder="Search customer / ID..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none">
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Matured">Matured</option>
            <option value="Closed">Closed</option>
            <option value="Foreclosed">Foreclosed</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <span className="material-symbols-outlined text-4xl mb-2">savings</span>
            <p>No deposits found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(d => {
              const paid = d.depositSchedule?.filter(i => i.status === 'Paid').length || 0;
              const total = d.depositSchedule?.length || 0;
              const cust = customerMap[d.customerId];
              return (
                <div key={d.id} onClick={() => navigate(`/deposits/${d.id}`)}
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-all text-left cursor-pointer">
                  <div className="flex items-center gap-3">
                    {cust?.photo_url ? (
                      <img src={cust.photo_url} alt="" className="h-11 w-11 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {(d.customerName || '?').substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold capitalize">{d.customerName}</h3>
                      <p className="text-xs text-slate-500">#{d.id} · {d.type?.replace('_', ' ').toUpperCase()} · {d.interestRate}% p.a.</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <p className="font-extrabold text-primary">₹{(d.principal || 0).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-slate-500">{paid}/{total} paid</p>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); openCollect(d); }}
                        className="p-1.5 rounded-lg bg-primary/10 text-primary" title="Collect Deposit">
                        <span className="material-symbols-outlined text-[16px]">savings</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/deposits/edit/${d.id}`); }}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(d.id); }}
                        className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
              <h3 className="text-lg font-bold mb-2">Delete Deposit?</h3>
              <p className="text-sm text-slate-500 mb-6">This will permanently delete the deposit and its cash account entries.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
                <button onClick={handleDelete} disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {collectDep && collectInst && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
              <h3 className="text-lg font-bold mb-1">Collect Deposit</h3>
              <p className="text-sm text-slate-500 mb-4">#{collectInst.installmentNumber} · {collectDep.customerName}</p>
              <div className="space-y-4 mb-6">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                  <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Amount</span>
                  <span className="text-lg font-extrabold text-blue-600">₹{Number(collectInst.amount).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">Amount Received</label>
                  <input type="number" value={customAmount || collectInst.amount} onChange={(e) => setCustomAmount(Number(e.target.value))}
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
                  <label className="block text-xs font-bold text-slate-500 mb-2">Remark</label>
                  <input type="text" value={paymentRemark} onChange={(e) => setPaymentRemark(e.target.value)} placeholder="Notes..."
                    className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setCollectDep(null); setCollectInst(null); setCustomAmount(0); setPaymentRemark(''); }} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
                <button onClick={handleCollect} disabled={isCollecting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                  {isCollecting && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Deposits;
