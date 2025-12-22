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
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex flex-col items-center justify-center p-4">

      <div className="text-center mb-6 pt-4">
        <h1 className="text-3xl font-bold text-white mb-1">Customer Portal</h1>
        <p className="text-white/80 text-sm mb-3">View your loans and pay EMI</p>
        <span className="bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">
          App v1.0.2 - FINAL SYNC READY
        </span>
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-[#1e2736] rounded-[2rem] shadow-2xl p-6 relative">
        <form onSubmit={handleLogin} className="space-y-5">

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 text-blue-800 dark:text-blue-300">
            <p className="font-bold text-sm mb-1">Login ID Format:</p>
            <p className="text-sm leading-tight text-blue-700 dark:text-blue-400 mb-2">First 3 letters of company name + Your 10-digit phone number</p>
            <div className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded inline-block text-sm font-mono text-blue-900 dark:text-blue-200">
              Example: jls8003986362
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-red-700 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              Login ID
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6 flex items-center justify-center overflow-hidden">
                <span className="material-symbols-outlined text-[20px]">person</span>
              </span>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value.toLowerCase())}
                placeholder="jls8003986362"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-[#1a2230] border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white lowercase font-medium transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6 flex items-center justify-center overflow-hidden">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-[#1a2230] border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-medium transition-all"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Password is same as your Login ID</p>
          </div>

          <div className="flex items-start gap-3 mt-1">
            <input
              type="checkbox"
              id="terms"
              checked={agreeToTerms}
              onChange={(e) => setAgreeToTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="terms" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              I agree to the <Link to="/terms" className="text-blue-600 font-bold hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-blue-600 font-bold hover:underline">Privacy Policy</Link>. I understand that JLS Finance will collect my loan records securely.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 btn-primary text-white font-bold rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Logging in...
              </>
            ) : (
              <>
                <span className="w-6 h-6 flex items-center justify-center overflow-hidden">
                  <span className="material-symbols-outlined">login</span>
                </span>
                Login
              </>
            )}
          </button>
        </form>

        <div className="mt-8 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] text-gray-400 text-center italic leading-relaxed">
            "This app is only for personal loan record and management. We do not provide loans, nor connect users with lenders."
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            Admin/Agent Login
          </Link>
        </div>
      </div>

    </div>
  );
};

export default CustomerLogin;