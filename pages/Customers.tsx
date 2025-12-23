import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Customer } from '../types';
import { useCompany } from '../context/CompanyContext';

const Customers: React.FC = () => {
  const { currentCompany } = useCompany();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'All' | 'Overdue' | 'Active'>('All');

  useEffect(() => {
    const fetchCustomers = async () => {
      if (!currentCompany) return;

      try {
        const q = query(collection(db, "customers"), where("companyId", "==", currentCompany.id));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...docData,
            status: docData.status || 'Active',
            avatar: docData.photo_url || docData.avatar || '',
            name: docData.name || 'Unknown Customer'
          };
        }) as Customer[];
        setCustomers(data);
      } catch (error) {
        console.error("Error fetching customers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [currentCompany]);

  // Filter Logic
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const matchesSearch =
        (customer.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone || '').includes(searchTerm);

      const matchesFilter =
        filter === 'All' ? true :
          filter === 'Overdue' ? customer.status === 'Overdue' :
            filter === 'Active' ? customer.status === 'Active' : true;

      return matchesSearch && matchesFilter;
    });
  }, [customers, searchTerm, filter]);

  // Helper to generate initials from name
  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Helper to deterministically pick a pastel color based on name
  const getColorFromName = (name: string) => {
    if (!name) return 'bg-slate-100 text-slate-500';
    const colors = [
      'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
      'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
      'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
      'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
      'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm transition-colors duration-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          </div>
          <Link to="/customers/new" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all">
            <span className="material-symbols-outlined">add</span>
          </Link>
        </div>
        {/* Search Bar */}
        <div className="px-4 pb-2">
          <label className="group flex h-12 w-full items-center gap-3 rounded-lg bg-white dark:bg-[#1e2736] px-3 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10 focus-within:ring-2 focus-within:ring-primary transition-all">
            <span className="material-symbols-outlined text-slate-400">search</span>
            <input
              className="h-full w-full bg-transparent border-none p-0 text-base font-medium placeholder:text-slate-400 focus:ring-0 focus:outline-none"
              placeholder="Search by name, ID or phone..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
        </div>
        {/* Filter Chips */}
        <div className="flex w-full gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
          <button
            onClick={() => setFilter('All')}
            className={`flex h-9 min-w-fit items-center justify-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors ${filter === 'All' ? 'bg-primary text-white' : 'bg-white dark:bg-[#1e2736] text-slate-600 dark:text-slate-300 ring-1 ring-slate-900/5 dark:ring-white/10'
              }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('Overdue')}
            className={`flex h-9 min-w-fit items-center justify-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors ${filter === 'Overdue' ? 'bg-primary text-white' : 'bg-white dark:bg-[#1e2736] text-slate-600 dark:text-slate-300 ring-1 ring-slate-900/5 dark:ring-white/10'
              }`}
          >
            Overdue
          </button>
          <button
            onClick={() => setFilter('Active')}
            className={`flex h-9 min-w-fit items-center justify-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors ${filter === 'Active' ? 'bg-primary text-white' : 'bg-white dark:bg-[#1e2736] text-slate-600 dark:text-slate-300 ring-1 ring-slate-900/5 dark:ring-white/10'
              }`}
          >
            Active Loans
          </button>
        </div>
      </header>

      {/* List */}
      <main className="flex flex-col gap-3 px-4 pt-2">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <span className="material-symbols-outlined text-4xl mb-2">person_search</span>
            <p>No customers found.</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <Link
              to={`/customers/${customer.id}`}
              key={customer.id}
              className="group flex items-center justify-between rounded-xl bg-white dark:bg-[#1e2736] p-3 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/5 transition-all hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="relative h-14 w-14 flex-shrink-0">
                  {/* Smart Avatar Logic: Checks avatar (mapped from photo_url) */}
                  {customer.avatar && customer.avatar.length > 5 ? (
                    <img
                      src={customer.avatar}
                      alt={customer.name}
                      className="h-full w-full rounded-full object-cover bg-slate-200 dark:bg-slate-700"
                      onError={(e) => {
                        // Fallback to text if image fails to load
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('fallback-mode');
                      }}
                    />
                  ) : (
                    <div className={`h-full w-full rounded-full flex items-center justify-center font-bold text-lg ${getColorFromName(customer.name)}`}>
                      {getInitials(customer.name)}
                    </div>
                  )}
                  {/* Helper for onError to show fallback if image broken */}
                  <div className={`hidden fallback-mode:flex h-full w-full absolute top-0 left-0 rounded-full items-center justify-center font-bold text-lg ${getColorFromName(customer.name)}`}>
                    {getInitials(customer.name)}
                  </div>

                  {/* Status Indicator Dot */}
                  <div className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#1e2736] ${customer.status === 'Active' ? 'bg-green-500' :
                      customer.status === 'Overdue' ? 'bg-red-500' : 'bg-orange-500'
                    }`}></div>
                </div>

                <div className="flex flex-col min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-900 dark:text-white uppercase">{customer.name}</h3>
                  <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">ID: {customer.id}</p>
                  {customer.phone && (
                    <p className="truncate text-xs text-slate-400 mt-0.5">{customer.phone}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 pl-2">
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold ring-1 ring-inset uppercase ${customer.status === 'Active' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-green-600/20' :
                    customer.status === 'Overdue' ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20' :
                      'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-orange-600/20'
                  }`}>{customer.status}</span>

                {/* Phone Call Button - Stop propagation to allow clicking row for details without calling */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `tel:${customer.phone}`;
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary-300 dark:hover:bg-primary/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">call</span>
                </button>
              </div>
            </Link>
          ))
        )}
      </main>
    </div>
  );
};

export default Customers;