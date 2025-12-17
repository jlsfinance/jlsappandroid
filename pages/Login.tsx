import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useNavigate, Link } from 'react-router-dom';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark p-4 text-on-surface-light dark:text-on-surface-dark">
      <div className="w-full max-w-sm rounded-[28px] bg-surface-light dark:bg-[#1e2736] p-8 shadow-m3-1 hover:shadow-m3-2 transition-shadow ring-1 ring-outline-light/10 dark:ring-outline-dark/10">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container dark:bg-primary-container-dark text-on-primary-container dark:text-primary-dark">
            <span className="material-symbols-outlined text-4xl">savings</span>
          </div>
          <h1 className="text-2xl font-normal tracking-tight">Welcome Back</h1>
          <p className="text-sm text-on-surface-variant-light dark:text-on-surface-variant-dark mt-2">Sign in to JLS FINANCE SUITE</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          {error && (
            <div className="rounded-lg bg-error-container p-4 text-center text-sm font-medium text-on-error-container">
              {error}
            </div>
          )}
          
          <div className="relative group">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="peer w-full rounded-md border border-outline-light dark:border-outline-dark bg-transparent px-4 pt-4 pb-2 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary dark:focus:border-primary-dark focus:ring-0 outline-none transition-all placeholder-transparent"
              placeholder="Email"
              id="email"
            />
            <label 
                htmlFor="email"
                className="absolute left-3 top-0 -translate-y-1/2 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-on-surface-variant-light dark:text-on-surface-variant-dark transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:text-on-surface-variant-light peer-focus:top-0 peer-focus:text-xs peer-focus:text-primary dark:peer-focus:text-primary-dark"
            >
                Email
            </label>
          </div>

          <div className="relative group">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="peer w-full rounded-md border border-outline-light dark:border-outline-dark bg-transparent px-4 pt-4 pb-2 text-base text-on-surface-light dark:text-on-surface-dark focus:border-2 focus:border-primary dark:focus:border-primary-dark focus:ring-0 outline-none transition-all placeholder-transparent"
              placeholder="Password"
              id="password"
            />
            <label 
                htmlFor="password"
                className="absolute left-3 top-0 -translate-y-1/2 bg-surface-light dark:bg-[#1e2736] px-1 text-xs text-on-surface-variant-light dark:text-on-surface-variant-dark transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:text-on-surface-variant-light peer-focus:top-0 peer-focus:text-xs peer-focus:text-primary dark:peer-focus:text-primary-dark"
            >
                Password
            </label>
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-medium text-primary dark:text-primary-dark hover:underline">Forgot password?</Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-primary dark:bg-primary-dark font-medium text-on-primary dark:text-on-primary-dark shadow-m3-1 hover:shadow-m3-2 active:scale-[0.98] transition-all disabled:opacity-70 ripple"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-on-primary border-t-transparent"></div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm">
          <span className="text-on-surface-variant-light dark:text-on-surface-variant-dark">Don't have an account? </span>
          <Link to="/register" className="font-bold text-primary dark:text-primary-dark hover:underline">
            Sign Up
          </Link>
        </div>

        <div className="mt-4 pt-4 border-t border-outline-light/20 dark:border-outline-dark/20 text-center">
          <Link to="/customer-login" className="text-sm text-on-surface-variant-light dark:text-on-surface-variant-dark hover:text-primary dark:hover:text-primary-dark">
            Customer Login (Pay EMI)
          </Link>
        </div>
      </div>
      <div className="mt-12 text-center">
        <p className="text-[10px] font-bold text-outline-light dark:text-outline-dark uppercase tracking-widest">
            App Created by LUVI
        </p>
      </div>
    </div>
  );
};

export default Login;