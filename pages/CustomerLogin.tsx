import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Company {
  id: string;
  name: string;
  logo?: string;
}

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [error, setError] = useState('');
  const [noCompanyMode, setNoCompanyMode] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!companyId) {
        setLoadingCompany(false);
        setNoCompanyMode(true);
        return;
      }

      try {
        const companyRef = doc(db, "companies", companyId);
        const companySnap = await getDoc(companyRef);
        
        if (companySnap.exists()) {
          setCompany({
            id: companySnap.id,
            name: companySnap.data().name || 'Finance Company',
            logo: companySnap.data().logo
          });
        } else {
          setError('Invalid company link. Please contact your finance company for the correct link.');
        }
      } catch (err) {
        console.error('Error fetching company:', err);
        // If permission denied, try fallback mode
        setNoCompanyMode(true);
      } finally {
        setLoadingCompany(false);
      }
    };

    fetchCompany();
  }, [companyId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
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

      let customersQuery;
      
      if (companyId && company) {
        // Search with company filter
        customersQuery = query(
          collection(db, "customers"),
          where("phone", "==", cleanPhone),
          where("companyId", "==", companyId)
        );
      } else {
        // Search without company filter (fallback)
        customersQuery = query(
          collection(db, "customers"),
          where("phone", "==", cleanPhone)
        );
      }
      
      let snapshot = await getDocs(customersQuery);

      // Try with +91 prefix if not found
      if (snapshot.empty) {
        if (companyId && company) {
          customersQuery = query(
            collection(db, "customers"),
            where("phone", "==", `+91${cleanPhone}`),
            where("companyId", "==", companyId)
          );
        } else {
          customersQuery = query(
            collection(db, "customers"),
            where("phone", "==", `+91${cleanPhone}`)
          );
        }
        snapshot = await getDocs(customersQuery);
      }

      if (snapshot.empty) {
        setError('No account found with this phone number. Please contact your finance company.');
        setLoading(false);
        return;
      }

      const customerDoc = snapshot.docs[0];
      const customerData = customerDoc.data() as { companyId?: string };
      
      localStorage.setItem('customerPortalId', customerDoc.id);
      localStorage.setItem('customerPortalPhone', cleanPhone);
      localStorage.setItem('customerPortalCompanyId', customerData.companyId || companyId || '');
      navigate('/customer-portal');

    } catch (err: any) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingCompany) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
            <span className="material-symbols-outlined text-white text-3xl">account_balance</span>
          </div>
          {company ? (
            <>
              <h1 className="text-3xl font-bold text-white mb-2">{company.name}</h1>
              <p className="text-white/80">Customer Portal - View Loans & Pay EMI</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-white mb-2">Customer Portal</h1>
              <p className="text-white/80">View your loans and pay EMI</p>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {noCompanyMode && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-amber-700 dark:text-amber-400 text-sm">
                <p className="font-medium mb-1">Tip:</p>
                <p>Ask your finance company for your dedicated login link for faster access.</p>
              </div>
            )}

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
              disabled={loading}
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