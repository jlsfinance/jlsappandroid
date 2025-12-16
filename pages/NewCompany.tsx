import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useCompany } from '../contexts/CompanyContext';

const NewCompany: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshCompanies, switchCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    pan: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Company name is required');
      return;
    }

    if (!user) {
      setError('You must be logged in to create a company');
      return;
    }

    setLoading(true);
    try {
      const companyRef = await addDoc(collection(db, "companies"), {
        ...formData,
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

      await updateDoc(doc(db, 'users', user.uid), {
        activeCompanyId: companyRef.id
      });

      await refreshCompanies();
      await switchCompany(companyRef.id);
      
      navigate('/');
      window.location.reload();
    } catch (err: any) {
      console.error('Error creating company:', err);
      setError('Failed to create company. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 bg-background-light dark:bg-background-dark border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg className="w-6 h-6 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Add New Company</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
              Company Information
            </h2>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Company Name *</label>
                <input
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Enter company name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Phone</label>
                  <input
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="9876543210"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="company@email.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Address</label>
                <input
                  name="address"
                  type="text"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Company Address"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">City</label>
                  <input
                    name="city"
                    type="text"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="City"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">State</label>
                  <input
                    name="state"
                    type="text"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="State"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Pincode</label>
                  <input
                    name="pincode"
                    type="text"
                    value={formData.pincode}
                    onChange={handleChange}
                    className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="123456"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
              Tax Information
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">GSTIN</label>
                <input
                  name="gstin"
                  type="text"
                  value={formData.gstin}
                  onChange={handleChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="GSTIN Number"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">PAN</label>
                <input
                  name="pan"
                  type="text"
                  value={formData.pan}
                  onChange={handleChange}
                  className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="PAN Number"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex h-14 items-center justify-center rounded-xl bg-primary font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-70"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
            ) : (
              'Create Company'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewCompany;