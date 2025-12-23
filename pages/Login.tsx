import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useNavigate, Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

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
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        const user = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(user.authentication.idToken);
        await signInWithCredential(auth, credential);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      }
      navigate('/');
    } catch (err: any) {
      console.error("Google login error:", err);
      const errorMessage = err.message || JSON.stringify(err);
      setError(`Google Sign-In failed: ${errorMessage.slice(0, 50)}... Check Firebase/SHA configuration.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#3b2d72] via-[#482880] to-[#2c1b52] px-6 py-4 text-white font-sans overflow-hidden relative">
      {/* Background decoration elements */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm flex flex-col items-center z-10 h-full justify-evenly">

        {/* Header Section */}
        <div className="text-center">
          <div className="mb-4 flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-purple-500/30">
            <span className="material-symbols-outlined text-3xl text-white">admin_panel_settings</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">Admin Login</h1>
          <p className="text-white/60 text-xs">Secure Access to JLS Suite</p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleLogin} className="w-full space-y-3">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-red-100 text-xs text-center">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-white/70 tracking-wider uppercase ml-1 mb-1 block">Email</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
                <span className="material-symbols-outlined text-[18px]">mail</span>
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl py-3 pl-10 pr-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/15 transition-all text-sm font-medium"
                placeholder="admin@jls.com"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/70 tracking-wider uppercase ml-1 mb-1 block">Password</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl py-3 pl-10 pr-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/15 transition-all text-sm font-medium"
                placeholder="••••••••"
              />
            </div>
            <div className="flex justify-end mt-1">
              <Link to="/forgot-password" className="text-[10px] text-white/60 hover:text-white transition-colors">Forgot password?</Link>
            </div>
          </div>

          <div className="flex items-start gap-2 mt-1">
            <input
              type="checkbox"
              id="terms"
              checked={agreeToTerms}
              onChange={(e) => setAgreeToTerms(e.target.checked)}
              className="mt-0.5 w-3 h-3 rounded border-white/30 bg-white/10 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
            />
            <label htmlFor="terms" className="text-[10px] text-white/70 leading-tight">
              I agree to the <Link to="/terms" className="text-white font-bold hover:underline">Terms</Link> and <Link to="/privacy" className="text-white font-bold hover:underline">Privacy Policy</Link>.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-kadak py-3 rounded-full active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 transition-all text-sm"
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px] material-symbols-fill">login</span>
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer Actions */}
        <div className="w-full space-y-4">
          <div className="w-full flex items-center gap-4">
            <div className="h-[1px] bg-white/10 flex-1"></div>
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Or</span>
            <div className="h-[1px] bg-white/10 flex-1"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-50 text-slate-900 font-bold py-3 rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-2 relative overflow-hidden text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span className="text-xs">Google Account</span>
          </button>

          <Link to="/customer-login" className="w-full border border-white/20 bg-white/5 py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-all text-xs font-bold hover:bg-white/10">
            <span className="material-symbols-outlined text-[16px]">person_pin</span>
            Customer Portal Login
          </Link>
        </div>

        <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-2">
          App Created by LUVI
        </p>

      </div>
    </div>
  );
};

export default Login;