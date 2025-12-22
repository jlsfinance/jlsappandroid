import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  useEffect(() => {
    const customerId = localStorage.getItem('customerPortalId');
    if (customerId) {
      navigate('/customer-portal');
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreeToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);

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
    <div className="h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex flex-col items-center justify-center p-4 overflow-hidden">

      <div className="w-full max-w-sm flex flex-col h-full justify-evenly">

        <div className="text-center pt-2">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 text-white backdrop-blur-md shadow-lg border border-white/20">
            <span className="material-symbols-outlined text-3xl">storefront</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Customer Portal</h1>
          <p className="text-white/80 text-xs">View your loans and pay EMI</p>
        </div>

        <div className="bg-white dark:bg-[#1e2736] rounded-3xl shadow-2xl p-5 relative">
          <form onSubmit={handleLogin} className="space-y-3">

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3 text-blue-800 dark:text-blue-300">
              <p className="font-bold text-[10px] mb-0.5 uppercase tracking-wider">Login ID Format</p>
              <div className="flex justify-between items-center">
                <p className="text-[10px] leading-tight text-blue-700 dark:text-blue-400">First 3 letters of company + 10-digit phone</p>
                <div className="bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded text-[10px] font-mono text-blue-900 dark:text-blue-200 ml-2 whitespace-nowrap">
                  e.g. jls8003986362
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 text-red-700 dark:text-red-400 text-xs text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Login ID
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </span>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value.toLowerCase())}
                  placeholder="jls8003986362"
                  className="w-full pl-10 pr-3 py-3 bg-gray-50 dark:bg-[#1a2230] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white lowercase font-medium transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Same as Login ID"
                  className="w-full pl-10 pr-3 py-3 bg-gray-50 dark:bg-[#1a2230] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-medium transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex items-start gap-2 mt-1">
              <input
                type="checkbox"
                id="terms"
                checked={agreeToTerms}
                onChange={(e) => setAgreeToTerms(e.target.checked)}
                className="mt-0.5 w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="terms" className="text-[10px] text-gray-600 dark:text-gray-400 leading-tight">
                I agree to the <Link to="/terms" className="text-blue-600 font-bold hover:underline">Terms</Link> & <Link to="/privacy" className="text-blue-600 font-bold hover:underline">Privacy</Link>.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 btn-primary text-white font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 text-sm mt-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Logging in...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Login
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="text-xs font-bold text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
              Admin Login
            </Link>
          </div>
        </div>

        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest text-center">
          Secured by JLS Finance v1.0
        </p>

      </div>
    </div>
  );
};

export default CustomerLogin;