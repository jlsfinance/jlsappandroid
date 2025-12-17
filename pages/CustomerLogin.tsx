import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Company {
  id: string;
  name: string;
}

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const companiesSnapshot = await getDocs(collection(db, "companies"));
        const companiesData = companiesSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Unnamed Company'
        }));
        companiesData.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(companiesData);
      } catch (err) {
        console.error('Error fetching companies:', err);
        setError('Failed to load companies. Please refresh the page.');
      } finally {
        setLoadingCompanies(false);
      }
    };

    fetchCompanies();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!selectedCompany) {
        setError('Please select a finance company');
        setLoading(false);
        return;
      }

      const cleanPhone = phone.replace(/\D/g, '');
      
      if (cleanPhone.length !== 10) {
        setError('Please enter a valid 10-digit phone number');
        setLoading(false);
        return;
      }

      if (password !== cleanPhone) {
        setError('Invalid password. Use your phone number as password.');
        setLoading(false);
        return;
      }

      // Query customers with phone and companyId filter
      const customersQuery = query(
        collection(db, "customers"),
        where("phone", "==", cleanPhone),
        where("companyId", "==", selectedCompany)
      );
      const snapshot = await getDocs(customersQuery);

      if (snapshot.empty) {
        // Try with +91 prefix
        const customersQueryWithPrefix = query(
          collection(db, "customers"),
          where("phone", "==", `+91${cleanPhone}`),
          where("companyId", "==", selectedCompany)
        );
        const snapshotWithPrefix = await getDocs(customersQueryWithPrefix);
        
        if (snapshotWithPrefix.empty) {
          setError('No account found with this phone number in the selected company. Please check your details or contact your finance company.');
          setLoading(false);
          return;
        }
        
        const customerDoc = snapshotWithPrefix.docs[0];
        localStorage.setItem('customerPortalId', customerDoc.id);
        localStorage.setItem('customerPortalPhone', cleanPhone);
        localStorage.setItem('customerPortalCompanyId', selectedCompany);
        navigate('/customer-portal');
        return;
      }

      const customerDoc = snapshot.docs[0];
      localStorage.setItem('customerPortalId', customerDoc.id);
      localStorage.setItem('customerPortalPhone', cleanPhone);
      localStorage.setItem('customerPortalCompanyId', selectedCompany);
      navigate('/customer-portal');

    } catch (err: any) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
            <span className="material-symbols-outlined text-white text-3xl">account_balance</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Customer Portal</h1>
          <p className="text-white/80">View your loans and pay EMI</p>
        </div>

        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                Select Finance Company
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <span className="material-symbols-outlined text-xl">business</span>
                </span>
                {loadingCompanies ? (
                  <div className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 flex items-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2"></div>
                    Loading companies...
                  </div>
                ) : (
                  <select
                    value={selectedCompany}
                    onChange={(e) => setSelectedCompany(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white appearance-none cursor-pointer"
                    required
                  >
                    <option value="">-- Select your finance company --</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                )}
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <span className="material-symbols-outlined text-xl">expand_more</span>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                Phone Number (User ID)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <span className="material-symbols-outlined text-xl">phone</span>
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your 10-digit phone number"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <span className="material-symbols-outlined text-xl">lock</span>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your phone number as password"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                  required
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Use your phone number as password</p>
            </div>

            <button
              type="submit"
              disabled={loading || loadingCompanies}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Logging in...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">login</span>
                  Login
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
            <Link 
              to="/login" 
              className="text-sm text-primary hover:underline font-medium"
            >
              Admin/Agent Login
            </Link>
          </div>
        </div>

        <p className="text-center text-white/60 text-xs mt-6">
          Contact your finance company if you need help logging in.
        </p>
      </div>
    </div>
  );
};

export default CustomerLogin;