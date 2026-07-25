import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useSubscription } from '../context/SubscriptionContext';
import UpgradeModal from '../components/UpgradeModal';
import { UsageService } from '../services/UsageService';
import { Company } from '../types';
import { collection, getDocs, doc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { SubscriptionGuard } from '../services/SubscriptionGuard';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptionPlans';

const CompanySelector: React.FC = () => {
  const navigate = useNavigate();
  const { companies, currentCompany, setCurrentCompany, addCompany, deleteCompany, updateCompany, loading, refreshCompanies } = useCompany();
  const { canAddCompany, showUpgradeModal, hideUpgradeModal, upgradeModalState, activePlan } = useSubscription();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompanyLimitModal, setShowCompanyLimitModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyAddress, setNewCompanyAddress] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [newCompanyGstin, setNewCompanyGstin] = useState('');
  const [newCompanyUpi, setNewCompanyUpi] = useState('9413821007@superyes');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [deletedCompany, setDeletedCompany] = useState<Company | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<Company | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyAddress, setEditCompanyAddress] = useState('');
  const [editCompanyPhone, setEditCompanyPhone] = useState('');
  const [editCompanyGstin, setEditCompanyGstin] = useState('');
  const [editCompanyUpi, setEditCompanyUpi] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const handleSelectCompany = (company: Company) => {
    setCurrentCompany(company);
    navigate('/');
  };

  const handleDeleteClick = (e: React.MouseEvent, company: Company) => {
    e.stopPropagation();
    setCompanyToDelete(company);
    setShowDeleteConfirm(true);
  };

  const handleEditClick = (e: React.MouseEvent, company: Company) => {
    e.stopPropagation();
    setCompanyToEdit(company);
    setEditCompanyName(company.name);
    setEditCompanyAddress(company.address || '');
    setEditCompanyPhone(company.phone || '');
    setEditCompanyGstin(company.gstin || '');
    setEditCompanyUpi(company.upiId || '9413821007@superyes');
    setShowEditModal(true);
  };

  const handleEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyToEdit || !editCompanyName.trim()) {
      alert("Company name is required");
      return;
    }

    setIsUpdating(true);
    try {
      await updateCompany(companyToEdit.id, {
        name: editCompanyName,
        address: editCompanyAddress,
        phone: editCompanyPhone,
        gstin: editCompanyGstin,
        upiId: editCompanyUpi
      });
      setShowEditModal(false);
      setCompanyToEdit(null);
      alert("Company updated successfully!");
    } catch (error) {
      console.error("Error updating company:", error);
      alert("Failed to update company");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!companyToDelete) return;

    setIsDeleting(true);
    try {
      const companyData = { ...companyToDelete };
      await deleteCompany(companyToDelete.id);
      setDeletedCompany(companyData);
      setShowDeleteConfirm(false);
      setCompanyToDelete(null);
      setShowUndoToast(true);

      setTimeout(() => {
        setShowUndoToast(false);
        setDeletedCompany(null);
      }, 5000);
    } catch (error) {
      console.error("Error deleting company:", error);
      alert("Failed to delete company");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedCompany) return;

    try {
      await addCompany(
        deletedCompany.name,
        deletedCompany.address,
        deletedCompany.phone,
        deletedCompany.gstin,
        deletedCompany.upiId
      );
      setShowUndoToast(false);
      setDeletedCompany(null);
    } catch (error) {
      console.error("Error restoring company:", error);
      alert("Failed to restore company");
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      alert("Company name is required");
      return;
    }

    // Subscription Company Guard Check via Usage Tracking (0 Firestore Reads)
    const guardRes = canAddCompany();
    if (!guardRes.allowed) {
      setShowAddModal(false);
      showUpgradeModal(guardRes);
      return;
    }

    setIsSubmitting(true);
    try {
      await addCompany(newCompanyName, newCompanyAddress, newCompanyPhone, newCompanyGstin, newCompanyUpi);
      if (auth.currentUser?.uid) {
        await UsageService.incrementUsage(auth.currentUser.uid, 'companies', 1);
      }
      setShowAddModal(false);
      setNewCompanyName('');
      setNewCompanyAddress('');
      setNewCompanyPhone('');
      setNewCompanyGstin('');
      setNewCompanyUpi('9413821007@superyes');
      alert("Company added successfully!");
    } catch (error: any) {
      console.error("Error adding company:", error);
      if (error) {
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      alert(`Failed to add company: ${error?.message || error?.code || 'Unknown error'}`);
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

  const maxCompanies = activePlan.limits.maxCompanies;
  const maxCompaniesDisplay = maxCompanies === -1 ? '∞' : maxCompanies;
  const companyUsageRatio = maxCompanies === -1 ? 0 : companies.length / maxCompanies;
  const isNearLimit = companyUsageRatio >= 0.8;

  const targetUnlockingPlan = SubscriptionGuard.getFirstUnlockingPlan(activePlan.id, (cand) => {
    const candLimit = cand.limits.maxCompanies === -1 ? 999999 : cand.limits.maxCompanies;
    const curLimit = maxCompanies === -1 ? 999999 : maxCompanies;
    return candLimit > curLimit;
  });

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark text-on-surface-light dark:text-on-surface-dark pb-10">
      <div className="sticky top-0 z-10 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md px-4 py-4 border-b border-outline-light/10 dark:border-outline-dark/10">
        <h1 className="text-xl font-bold text-center">Select Company</h1>
        <p className="text-sm text-center text-on-surface-variant-light dark:text-on-surface-variant-dark mt-1">
          Choose a company to manage
        </p>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Company Usage Card & Limit Alert Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-wider">Company Allocation</span>
            <span className="font-black px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Current Plan: {activePlan.name}
            </span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-sm font-extrabold text-white">Companies</span>
            <span className="text-base font-black text-amber-400">
              {companies.length} / {maxCompaniesDisplay} Used
            </span>
          </div>

          {/* Warning Banner when usage >= 80% */}
          {isNearLimit && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 font-medium">
              <span className="material-symbols-outlined text-amber-400 text-base shrink-0">warning</span>
              <span>You're almost at your limit. Upgrade now to avoid interruptions.</span>
            </div>
          )}
        </div>
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
              className={`bg-surface-light dark:bg-[#1e2736] rounded-2xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md ${currentCompany?.id === company.id
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-outline-light/10 dark:border-outline-dark/10'
                }`}
            >
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${currentCompany?.id === company.id
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
                <div className="flex items-center gap-2">
                  {currentCompany?.id === company.id && (
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const code = company.name.substring(0, 3).toLowerCase();
                      navigator.clipboard.writeText(code);
                      setCopiedLinkId(company.id);
                      setTimeout(() => setCopiedLinkId(null), 2000);
                    }}
                    className="px-2 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/20 text-green-600 transition-colors flex items-center gap-1"
                    title="Copy Company Code for Customer Login"
                  >
                    <span className="font-mono font-bold text-sm uppercase">{company.name.substring(0, 3)}</span>
                    <span className="material-symbols-outlined text-sm">
                      {copiedLinkId === company.id ? 'check' : 'content_copy'}
                    </span>
                  </button>
                  <button
                    onClick={(e) => handleEditClick(e, company)}
                    className="p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"
                    title="Edit company"
                  >
                    <span className="material-symbols-outlined text-xl">edit</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, company)}
                    className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                    title="Delete company"
                  >
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {(!canAddCompany().allowed || (activePlan.limits.maxCompanies !== 999999 && companies.length >= activePlan.limits.maxCompanies)) ? (
          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={() => setShowCompanyLimitModal(true)}
              className="w-full bg-slate-900 text-amber-400 font-bold py-4 rounded-2xl border border-amber-500/40 hover:border-amber-400 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer group active:scale-98"
            >
              <span className="material-symbols-outlined text-amber-400 group-hover:scale-110 transition-transform">lock</span>
              Upgrade to {targetUnlockingPlan.name}
            </button>
            <div className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
              Current Usage: <strong className="text-amber-500">{companies.length} / {maxCompaniesDisplay}</strong> Companies Used
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-6"
          >
            <span className="material-symbols-outlined">add_business</span>
            Add New Company
          </button>
        )}
      </div>

      {/* Dynamic Company Limit Reached Intercept Modal */}
      {showCompanyLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">lock_clock</span>
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-xl font-black text-white font-display">Company Limit Reached</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your <strong>{activePlan.name}</strong> allows only <strong>{maxCompaniesDisplay}</strong> Company. You have already created <strong>{companies.length} / {maxCompaniesDisplay}</strong> Companies. Upgrade to <strong>{targetUnlockingPlan.name}</strong> to create more companies.
              </p>
            </div>

            {/* Dynamic Plan Comparison Matrix from subscriptionPlans.ts */}
            <div className="bg-slate-950/80 rounded-2xl p-3 border border-slate-800 text-xs space-y-2">
              {Object.values(SUBSCRIPTION_PLANS).map((p) => {
                const isTarget = p.id === targetUnlockingPlan.id;
                const isCurrent = p.id === activePlan.id;
                const maxC = p.limits.maxCompanies === -1 ? 'Unlimited' : `${p.limits.maxCompanies} Company`;
                return (
                  <div
                    key={p.id}
                    className={`flex justify-between items-center p-2.5 rounded-xl border transition-all ${
                      isTarget
                        ? 'bg-gradient-to-r from-indigo-950/70 to-purple-950/70 border-indigo-500/50 text-indigo-200 shadow-sm'
                        : isCurrent
                        ? 'bg-slate-900/80 border-slate-700 text-slate-300'
                        : 'bg-slate-900/30 border-slate-800/50 text-slate-400 opacity-60'
                    }`}
                  >
                    <span className="font-bold">{p.name} {isTarget && '⭐'}</span>
                    <span className="font-black">✓ {maxC}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCompanyLimitModal(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCompanyLimitModal(false);
                  navigate('/pricing');
                }}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm text-amber-400">rocket_launch</span>
                Upgrade to {targetUnlockingPlan.name}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Company UPI ID (for QR Payments)</label>
                <input
                  type="text"
                  value={newCompanyUpi}
                  onChange={(e) => setNewCompanyUpi(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="e.g. 91xxxxxxxx@upi"
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

      {showEditModal && companyToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-light dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-lg p-6">
            <h3 className="text-xl font-bold mb-6 text-on-surface-light dark:text-on-surface-dark">Edit Company</h3>
            <form onSubmit={handleEditCompany} className="space-y-4">
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter company name"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Address</label>
                <input
                  type="text"
                  value={editCompanyAddress}
                  onChange={(e) => setEditCompanyAddress(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter address"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Phone</label>
                <input
                  type="tel"
                  value={editCompanyPhone}
                  onChange={(e) => setEditCompanyPhone(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">GSTIN</label>
                <input
                  type="text"
                  value={editCompanyGstin}
                  onChange={(e) => setEditCompanyGstin(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter GSTIN"
                />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant-light block mb-1">Company UPI ID (for QR Payments)</label>
                <input
                  type="text"
                  value={editCompanyUpi}
                  onChange={(e) => setEditCompanyUpi(e.target.value)}
                  className="w-full rounded-xl border border-outline-light dark:border-outline-dark bg-transparent px-4 py-3 text-on-surface-light dark:text-on-surface-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="e.g. 91xxxxxxxx@upi"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setCompanyToEdit(null);
                  }}
                  className="flex-1 px-4 py-3 text-primary font-medium border border-primary rounded-xl hover:bg-primary/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 px-4 py-3 bg-primary text-on-primary font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isUpdating ? 'Updating...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && companyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-light dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/20">
                <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface-light dark:text-on-surface-dark">Delete Company?</h3>
            </div>
            <p className="text-on-surface-variant-light dark:text-on-surface-variant-dark mb-6">
              Are you sure you want to delete <strong>"{companyToDelete.name}"</strong>? This action can be undone within 5 seconds.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setCompanyToDelete(null);
                }}
                className="flex-1 px-4 py-3 text-primary font-medium border border-outline-light rounded-xl hover:bg-surface-variant-light/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUndoToast && deletedCompany && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="bg-slate-800 dark:bg-slate-900 text-white rounded-xl p-4 shadow-lg flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400">delete</span>
              <span className="text-sm">"{deletedCompany.name}" deleted</span>
            </div>
            <button
              onClick={handleUndoDelete}
              className="px-4 py-2 bg-primary text-on-primary font-bold rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              UNDO
            </button>
          </div>
        </div>
      )}

      <UpgradeModal
        isOpen={upgradeModalState.isOpen}
        onClose={hideUpgradeModal}
        blockedFeature="Company Limit Reached"
        currentPlan={activePlan}
        requiredPlanId={upgradeModalState.result?.requiredPlanId}
        reason={upgradeModalState.result?.reason}
      />
    </div>
  );
};

export default CompanySelector;