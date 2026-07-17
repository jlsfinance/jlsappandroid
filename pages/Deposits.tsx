import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Deposit } from '../types';
import { useCompany } from '../context/CompanyContext';
import { fetchCustomers, clearQueryCache } from '../services/dataService';

const Deposits: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Matured' | 'Closed'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
                <button key={d.id} onClick={() => navigate(`/deposits/${d.id}`)}
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-all text-left">
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
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="font-extrabold text-primary">₹{(d.principal || 0).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-slate-500">{paid}/{total} paid</p>
                    <div className="flex gap-2">
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
                </button>
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
      </div>
    </div>
  );
};

export default Deposits;
