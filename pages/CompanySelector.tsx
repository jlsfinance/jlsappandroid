import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { Company } from '../types';

const CompanySelector: React.FC = () => {
  const navigate = useNavigate();
  const { companies, currentCompany, setCurrentCompany, addCompany, loading } = useCompany();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyAddress, setNewCompanyAddress] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [newCompanyGstin, setNewCompanyGstin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectCompany = (company: Company) => {
    setCurrentCompany(company);
    navigate('/');
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      alert("Company name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await addCompany(newCompanyName, newCompanyAddress, newCompanyPhone, newCompanyGstin);
      setShowAddModal(false);
      setNewCompanyName('');
      setNewCompanyAddress('');
      setNewCompanyPhone('');
      setNewCompanyGstin('');
      alert("Company added successfully!");
    } catch (error) {
      console.error("Error adding company:", error);
      alert("Failed to add company");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark text-on-surface-light dark:text-on-surface-dark pb-10">
      <div className="sticky top-0 z-10 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md px-4 py-4 border-b border-outline-light/10 dark:border-outline-dark/10">
        <h1 className="text-xl font-bold text-center">Select Company</h1>
        <p className="text-sm text-center text-on-surface-variant-light dark:text-on-surface-variant-dark mt-1">
          Choose a company to manage
        </p>
      </div>

      <div className="px-4 py-6 space-y-4">
        {companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant-light opacity-40 mb-4">business</span>
            <p className="text-on-surface-variant-light dark:text-on-surface-variant-dark mb-2">No companies found</p>
            <p className="text-sm text-on-surface-variant-light dark:text-on-surface-variant-dark opacity-70">Add your first company to get started</p>
          </div>
        ) : (
          companies.map((company) => (
            <div
              key={company.id}
              onClick={() => handleSelectCompany(company)}
              className={`bg-surface-light dark:bg-[#1e2736] rounded-2xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md ${
                currentCompany?.id === company.id 
                  ? 'border-primary ring-2 ring-primary/20' 
                  : 'border-outline-light/10 dark:border-outline-dark/10'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                  currentCompany?.id === company.id 
                    ? 'bg-primary text-on-primary' 
                    : 'bg-primary-container text-on-primary-container'
                }`}>
                  <span className="material-symbols-outlined text-2xl">business</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-on-surface-light dark:text-on-surface-dark truncate">
                    {company.name}
                  </h3>
                  {company.address && (
                    <p className="text-sm text-on-surface-variant-light dark:text-on-surface-variant-dark truncate">
                      {company.address}
                    </p>
                  )}
                </div>
                {currentCompany?.id === company.id && (
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                )}
              </div>
            </div>
          ))
        )}

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-6"
        >
          <span className="material-symbols-outlined">add_business</span>
          Add New Company
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-light dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-lg p-6">
            <h3 className="text-xl font-bold mb-6 text-on-surface-light dark:text-on-surface-dark">Add New Company</h3>
            <form onSubmit={handleAddCompany} className="space-y-4">
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter company name"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Address</label>
                <input
                  type="text"
                  value={newCompanyAddress}
                  onChange={(e) => setNewCompanyAddress(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter address"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Phone</label>
                <input
                  type="tel"
                  value={newCompanyPhone}
                  onChange={(e) => setNewCompanyPhone(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">GSTIN</label>
                <input
                  type="text"
                  value={newCompanyGstin}
                  onChange={(e) => setNewCompanyGstin(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter GSTIN"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 text-primary font-medium border border-primary rounded-xl hover:bg-primary/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-primary text-on-primary font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanySelector;