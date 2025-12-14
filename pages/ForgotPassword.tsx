import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await sendPasswordResetEmail(auth, email);
      setSubmitted(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError("No account found with this email.");
      } else {
        setError("Failed to send reset email. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark p-6 text-slate-900 dark:text-white">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-surface-dark p-8 shadow-xl ring-1 ring-slate-900/5 dark:ring-white/10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <span className="material-symbols-outlined text-2xl">lock_reset</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Forgot Password?</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enter your email to receive a reset link</p>
        </div>

        {submitted ? (
          <div className="text-center space-y-6">
            <div className="rounded-xl bg-green-50 p-4 text-green-800 dark:bg-green-900/20 dark:text-green-300">
              <p className="font-medium text-sm">Reset link sent!</p>
              <p className="text-xs mt-1 opacity-80">Check your inbox and spam folder.</p>
            </div>
            <Link 
                to="/login"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all"
            >
                Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-70"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              ) : (
                'Send Reset Link'
              )}
            </button>
            
            <div className="mt-2 text-center text-sm">
                <Link to="/login" className="font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors">
                    Back to Sign In
                </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;