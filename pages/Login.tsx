import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useNavigate, Link } from 'react-router-dom';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreeToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');

    if (!agreeToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err: any) {
      console.error("Google login error:", err);
      setError('Google Sign-In failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#3b2d72] via-[#482880] to-[#2c1b52] p-6 text-white overflow-y-auto relative font-sans">
      {/* Background decoration elements */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm flex flex-col items-center z-10 py-10">

        {/* Logo/Icon */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-purple-500/30">
          <span className="material-symbols-outlined text-4xl text-white">admin_panel_settings</span>
        </div>

        <h1 className="text-3xl font-bold mb-2">Admin Login</h1>
        <p className="text-white/60 text-sm mb-10">Secure Access to JLS Finance Suite</p>

        <form onSubmit={handleLogin} className="w-full space-y-5">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-100 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-white/70 tracking-wider uppercase ml-1 mb-2 block">Email Address</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                <span className="material-symbols-outlined text-[20px]">mail</span>
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/15 transition-all text-sm font-medium"
                placeholder="admin@jls.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-white/70 tracking-wider uppercase ml-1 mb-2 block">Password</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/15 transition-all text-sm font-medium"
                placeholder="••••••••"
              />
            </div>
            <div className="flex justify-end mt-2">
              <Link to="/forgot-password" className="text-xs text-white/60 hover:text-white transition-colors">Forgot password?</Link>
            </div>
          </div>

          <div className="flex items-start gap-3 mt-2">
            <input
              type="checkbox"
              id="terms"
              checked={agreeToTerms}
              onChange={(e) => setAgreeToTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-white/30 bg-white/10 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
            />
            <label htmlFor="terms" className="text-xs text-white/70 leading-relaxed">
              I agree to the <Link to="/terms" className="text-white font-bold hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-white font-bold hover:underline">Privacy Policy</Link>.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary hover:from-blue-500 hover:to-purple-500 text-white font-bold py-4 rounded-full shadow-lg shadow-purple-500/30 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">login</span>
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="w-full flex items-center gap-4 my-8">
          <div className="h-[1px] bg-white/10 flex-1"></div>
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Or Continue With</span>
          <div className="h-[1px] bg-white/10 flex-1"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white hover:bg-gray-50 text-slate-900 font-bold py-3.5 rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-3 relative overflow-hidden"
        >
          {/* Simple Google SVG visual approximation or img */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span className="text-sm">Google Account</span>
        </button>

        <div className="w-full bg-white/5 rounded-2xl p-4 mt-8 border border-white/5">
          <p className="text-[10px] text-white/50 text-center italic leading-relaxed">
            "This app is only for personal loan record and management. We do not provide loans, nor connect users with lenders."
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-white/60">
            Don't have an admin account? <Link to="/register" className="text-white font-bold hover:underline">Create one</Link>
          </p>
        </div>

        <div className="mt-12 w-full pt-6 border-t border-white/5 flex flex-col items-center gap-4">
          <Link to="/customer-login" className="px-6 py-3 bg-white/10 rounded-xl text-sm font-bold text-blue-200 tracking-wider uppercase hover:bg-white/20 hover:text-white transition-all shadow-lg backdrop-blur-sm">
            Go to Customer Portal
          </Link>
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
            App Created by LUVI
          </p>
        </div>

      </div>
    </div>
  );
};

export default Login;