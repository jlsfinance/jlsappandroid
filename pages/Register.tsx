import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (formData.password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
    }

    setLoading(true);
    try {
      // 1. Create Authentication User
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // 2. Update Profile Name
      await updateProfile(user, { displayName: formData.name });

      // 3. Create User Document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: formData.name,
        email: formData.email,
        role: "customer", // Default role
        createdAt: new Date().toISOString(),
      });

      // 4. Create Customer Document (Optional: Syncs auth user to customers collection for consistency if needed)
      // For now, we just stick to the 'users' collection for auth management logic.

      navigate('/');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Email is already in use.');
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark p-6 text-slate-900 dark:text-white">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-surface-dark p-8 shadow-xl ring-1 ring-slate-900/5 dark:ring-white/10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Create Account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Join JLS FINANCE SUITE today</p>
        </div>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Name</label>
            <input
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email</label>
            <input
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Password</label>
            <input
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="••••••••"
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
              'Create Account'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-slate-500 dark:text-slate-400">Already have an account? </span>
          <Link to="/login" className="font-bold text-primary hover:underline">
            Sign In
          </Link>
        </div>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
            App Created by LUVI
        </p>
      </div>
    </div>
  );
};

export default Register;