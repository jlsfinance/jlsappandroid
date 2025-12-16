import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [companyData, setCompanyData] = useState({
    companyName: '',
    companyPhone: '',
    companyEmail: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyPincode: '',
    companyGstin: '',
    companyPan: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCompanyData({ ...companyData, [e.target.name]: e.target.value });
  };

  const handleNextStep = (e: React.FormEvent) => {
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

    setStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!companyData.companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: formData.name });

      const companyRef = await addDoc(collection(db, "companies"), {
        name: companyData.companyName,
        email: companyData.companyEmail || formData.email,
        phone: companyData.companyPhone,
        address: companyData.companyAddress,
        city: companyData.companyCity,
        state: companyData.companyState,
        pincode: companyData.companyPincode,
        gstin: companyData.companyGstin,
        pan: companyData.companyPan,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
      });

      await addDoc(collection(db, "companyUsers"), {
        companyId: companyRef.id,
        userId: user.uid,
        role: "owner",
        permissions: ["all"],
        joinedAt: new Date().toISOString(),
      });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: formData.name,
        email: formData.email,
        role: "owner",
        activeCompanyId: companyRef.id,
        createdAt: new Date().toISOString(),
      });

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
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {step === 1 ? 'Create Account' : 'Company Details'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {step === 1 ? 'Join JLS FINANCE SUITE today' : 'Setup your company profile'}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <div className={`h-2 w-8 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-slate-300'}`}></div>
            <div className={`h-2 w-8 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-slate-300'}`}></div>
          </div>
        </div>

        {step === 1 ? (
          <form onSubmit={handleNextStep} className="flex flex-col gap-4">
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
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all"
            >
              Next - Company Details
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Company Name *</label>
              <input
                name="companyName"
                type="text"
                required
                value={companyData.companyName}
                onChange={handleCompanyChange}
                className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Your Company Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Phone</label>
                <input
                  name="companyPhone"
                  type="tel"
                  value={companyData.companyPhone}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="9876543210"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email</label>
                <input
                  name="companyEmail"
                  type="email"
                  value={companyData.companyEmail}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="company@email.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Address</label>
              <input
                name="companyAddress"
                type="text"
                value={companyData.companyAddress}
                onChange={handleCompanyChange}
                className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Company Address"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">City</label>
                <input
                  name="companyCity"
                  type="text"
                  value={companyData.companyCity}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="City"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">State</label>
                <input
                  name="companyState"
                  type="text"
                  value={companyData.companyState}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="State"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Pincode</label>
                <input
                  name="companyPincode"
                  type="text"
                  value={companyData.companyPincode}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="123456"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">GSTIN</label>
                <input
                  name="companyGstin"
                  type="text"
                  value={companyData.companyGstin}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="GSTIN Number"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">PAN</label>
                <input
                  name="companyPan"
                  type="text"
                  value={companyData.companyPan}
                  onChange={handleCompanyChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="PAN Number"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-200 font-bold text-slate-700 hover:bg-slate-300 active:scale-95 transition-all dark:bg-slate-700 dark:text-white"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-70"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>
        )}

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