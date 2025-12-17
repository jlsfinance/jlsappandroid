import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const trimmedLoginId = loginId.trim().toLowerCase();
      
      if (trimmedLoginId.length < 13) {
        setError('Invalid Login ID. Format: First 3 letters of company + 10 digit phone (e.g., jls8003986362)');
        setLoading(false);
        return;
      }

      // Extract company code (first 3 letters) and phone (remaining digits)
      const companyCode = trimmedLoginId.substring(0, 3).toLowerCase();
      const phone = trimmedLoginId.substring(3);

      if (!/^\d{10}$/.test(phone)) {
        setError('Invalid Login ID. Phone number must be 10 digits.');
        setLoading(false);
        return;
      }

      if (password.toLowerCase() !== trimmedLoginId) {
        setError('Invalid password. Password should be same as Login ID.');
        setLoading(false);
        return;
      }

      // Search for customer by phone number
      let customersQuery = query(
        collection(db, "customers"),
        where("phone", "==", phone)
      );
      let snapshot = await getDocs(customersQuery);

      // Try with +91 prefix if not found
      if (snapshot.empty) {
        customersQuery = query(
          collection(db, "customers"),
          where("phone", "==", `+91${phone}`)
        );
        snapshot = await getDocs(customersQuery);
      }

      if (snapshot.empty) {
        setError('No account found with this phone number. Please contact your finance company.');
        setLoading(false);
        return;
      }

      // Find customer whose company matches the code
      let matchedCustomer: any = null;
      let matchedCompanyId: string = '';
      let matchedCompanyName: string = '';

      for (const customerDoc of snapshot.docs) {
        const customerData = customerDoc.data();
        if (customerData.companyId) {
          try {
            const companyRef = doc(db, "companies", customerData.companyId);
            const companySnap = await getDoc(companyRef);
            if (companySnap.exists()) {
              const companyName = companySnap.data().name || '';
              const companyPrefix = companyName.substring(0, 3).toLowerCase();
              
              if (companyPrefix === companyCode) {
                matchedCustomer = { id: customerDoc.id, ...customerData };
                matchedCompanyId = customerData.companyId;
                matchedCompanyName = companyName;
                break;
              }
            }
          } catch (err) {
            console.log('Could not verify company:', err);
          }
        }
      }

      if (!matchedCustomer) {
        setError('Company code does not match. Please check your Login ID.');
        setLoading(false);
        return;
      }

      localStorage.setItem('customerPortalId', matchedCustomer.id);
      localStorage.setItem('customerPortalPhone', phone);
      localStorage.setItem('customerPortalCompanyId', matchedCompanyId);
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

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-blue-700 dark:text-blue-400 text-sm">
              <p className="font-medium mb-1">Login ID Format:</p>
              <p>First 3 letters of company name + Your 10-digit phone number</p>
              <p className="mt-1 font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded inline-block">Example: jls8003986362</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                Login ID
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <span className="material-symbols-outlined text-xl">person</span>
                </span>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value.toLowerCase())}
                  placeholder="e.g., jls8003986362"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white lowercase"
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
                  placeholder="Same as Login ID"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                  required
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Password is same as your Login ID</p>
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