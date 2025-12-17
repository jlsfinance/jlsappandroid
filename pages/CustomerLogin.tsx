import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [companyCode, setCompanyCode] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!companyCode.trim()) {
        setError('Please enter your company code');
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

      // First try to find customer with phone number
      let customersQuery = query(
        collection(db, "customers"),
        where("phone", "==", cleanPhone)
      );
      let snapshot = await getDocs(customersQuery);

      // If not found, try with +91 prefix
      if (snapshot.empty) {
        customersQuery = query(
          collection(db, "customers"),
          where("phone", "==", `+91${cleanPhone}`)
        );
        snapshot = await getDocs(customersQuery);
      }

      if (snapshot.empty) {
        setError('No account found with this phone number. Please contact your finance company.');
        setLoading(false);
        return;
      }

      // Check if any customer belongs to a company matching the code
      const companyCodeLower = companyCode.trim().toLowerCase();
      let matchedCustomer: any = null;
      let matchedCompanyId: string = '';

      for (const customerDoc of snapshot.docs) {
        const customerData = customerDoc.data();
        if (customerData.companyId) {
          try {
            const companyRef = doc(db, "companies", customerData.companyId);
            const companySnap = await getDoc(companyRef);
            if (companySnap.exists()) {
              const companyName = companySnap.data().name?.toLowerCase() || '';
              const companyShortCode = companySnap.data().shortCode?.toLowerCase() || '';
              
              // Match by company name or short code
              if (companyName.includes(companyCodeLower) || 
                  companyCodeLower.includes(companyName) ||
                  companyShortCode === companyCodeLower ||
                  customerData.companyId.toLowerCase() === companyCodeLower) {
                matchedCustomer = { id: customerDoc.id, ...customerData };
                matchedCompanyId = customerData.companyId;
                break;
              }
            }
          } catch (err) {
            // Skip if can't read company
            console.log('Could not verify company:', err);
          }
        }
      }

      if (!matchedCustomer) {
        // If only one customer found, use that
        if (snapshot.docs.length === 1) {
          const customerDoc = snapshot.docs[0];
          matchedCustomer = { id: customerDoc.id, ...customerDoc.data() };
          matchedCompanyId = matchedCustomer.companyId || '';
        } else {
          setError('Company code does not match. Please check with your finance company for the correct code.');
          setLoading(false);
          return;
        }
      }

      localStorage.setItem('customerPortalId', matchedCustomer.id);
      localStorage.setItem('customerPortalPhone', cleanPhone);
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

            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                Company Code / Name
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <span className="material-symbols-outlined text-xl">business</span>
                </span>
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value)}
                  placeholder="Enter your finance company name"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                  required
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Ask your finance company for this code</p>
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