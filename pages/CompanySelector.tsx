import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { Company } from '../types';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const CompanySelector: React.FC = () => {
  const navigate = useNavigate();
  const { companies, currentCompany, setCurrentCompany, addCompany, deleteCompany, updateCompany, loading, refreshCompanies } = useCompany();
  const [showAddModal, setShowAddModal] = useState(false);
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

  const [orphanedData, setOrphanedData] = useState<{ customers: number, loans: number, partners: number, expenses: number }>({ customers: 0, loans: 0, partners: 0, expenses: 0 });
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [selectedCompanyForMigration, setSelectedCompanyForMigration] = useState<Company | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<Company | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyAddress, setEditCompanyAddress] = useState('');
  const [editCompanyPhone, setEditCompanyPhone] = useState('');
  const [editCompanyGstin, setEditCompanyGstin] = useState('');
  const [editCompanyUpi, setEditCompanyUpi] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  useEffect(() => {
    const checkOrphanedData = async () => {
      try {
        const [customersSnap, loansSnap, partnersSnap, expensesSnap] = await Promise.all([
          getDocs(query(collection(db, "customers"), where("companyId", "==", null))),
          getDocs(query(collection(db, "loans"), where("companyId", "==", null))),
          getDocs(query(collection(db, "partner_transactions"), where("companyId", "==", null))),
          getDocs(query(collection(db, "expenses"), where("companyId", "==", null)))
        ]);

        const customersWithoutCompany = customersSnap.docs.filter(doc => !doc.data().companyId).length;
        const loansWithoutCompany = loansSnap.docs.filter(doc => !doc.data().companyId).length;
        const partnersWithoutCompany = partnersSnap.docs.filter(doc => !doc.data().companyId).length;
        const expensesWithoutCompany = expensesSnap.docs.filter(doc => !doc.data().companyId).length;

        const allCustomers = await getDocs(collection(db, "customers"));
        const allLoans = await getDocs(collection(db, "loans"));
        const allPartners = await getDocs(collection(db, "partner_transactions"));
        const allExpenses = await getDocs(collection(db, "expenses"));

        const orphanCustomers = allCustomers.docs.filter(d => !d.data().companyId).length;
        const orphanLoans = allLoans.docs.filter(d => !d.data().companyId).length;
        const orphanPartners = allPartners.docs.filter(d => !d.data().companyId).length;
        const orphanExpenses = allExpenses.docs.filter(d => !d.data().companyId).length;

        setOrphanedData({
          customers: orphanCustomers,
          loans: orphanLoans,
          partners: orphanPartners,
          expenses: orphanExpenses
        });
      } catch (error) {
        console.error("Error checking orphaned data:", error);
      }
    };

    checkOrphanedData();
  }, []);

  const handleMigrateData = async () => {
    if (!selectedCompanyForMigration) return;

    setIsMigrating(true);
    try {
      const batch = writeBatch(db);
      const companyId = selectedCompanyForMigration.id;

      const [customersSnap, loansSnap, partnersSnap, expensesSnap] = await Promise.all([
        getDocs(collection(db, "customers")),
        getDocs(collection(db, "loans")),
        getDocs(collection(db, "partner_transactions")),
        getDocs(collection(db, "expenses"))
      ]);

      customersSnap.docs.forEach(docSnap => {
        if (!docSnap.data().companyId) {
          batch.update(doc(db, "customers", docSnap.id), { companyId });
        }
      });

      loansSnap.docs.forEach(docSnap => {
        if (!docSnap.data().companyId) {
          batch.update(doc(db, "loans", docSnap.id), { companyId });
        }
      });

      partnersSnap.docs.forEach(docSnap => {
        if (!docSnap.data().companyId) {
          batch.update(doc(db, "partner_transactions", docSnap.id), { companyId });
        }
      });

      expensesSnap.docs.forEach(docSnap => {
        if (!docSnap.data().companyId) {
          batch.update(doc(db, "expenses", docSnap.id), { companyId });
        }
      });

      await batch.commit();

      setOrphanedData({ customers: 0, loans: 0, partners: 0, expenses: 0 });
      setShowMigrateModal(false);
      alert("Data successfully migrated to " + selectedCompanyForMigration.name);

      setCurrentCompany(selectedCompanyForMigration);
      navigate('/');
    } catch (error) {
      console.error("Error migrating data:", error);
      alert("Failed to migrate data. Please try again.");
    } finally {
      setIsMigrating(false);
    }
  };

  const hasOrphanedData = orphanedData.customers > 0 || orphanedData.loans > 0 || orphanedData.partners > 0 || orphanedData.expenses > 0;

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

    setIsSubmitting(true);
    try {
      await addCompany(newCompanyName, newCompanyAddress, newCompanyPhone, newCompanyGstin, newCompanyUpi);
      setShowAddModal(false);
      setNewCompanyName('');
      setNewCompanyAddress('');
      setNewCompanyPhone('');
      setNewCompanyGstin('');
      setNewCompanyUpi('9413821007@superyes');
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

        {hasOrphanedData && companies.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mt-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">info</span>
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800 dark:text-amber-300">Existing Data Found</h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  You have data that needs to be linked to a company:
                </p>
                <ul className="text-sm text-amber-600 dark:text-amber-400 mt-2 space-y-1">
                  {orphanedData.customers > 0 && <li>{orphanedData.customers} Customers</li>}
                  {orphanedData.loans > 0 && <li>{orphanedData.loans} Loans</li>}
                  {orphanedData.partners > 0 && <li>{orphanedData.partners} Partner Transactions</li>}
                  {orphanedData.expenses > 0 && <li>{orphanedData.expenses} Expenses</li>}
                </ul>
                <button
                  onClick={() => setShowMigrateModal(true)}
                  className="mt-3 bg-amber-600 text-white font-medium px-4 py-2 rounded-lg text-sm hover:bg-amber-700 transition-colors"
                >
                  Link to Company
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-6"
        >
          <span className="material-symbols-outlined">add_business</span>
          Add New Company
        </button>
      </div>

      {showMigrateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-light dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-lg p-6">
            <h3 className="text-xl font-bold mb-4 text-on-surface-light dark:text-on-surface-dark">Link Data to Company</h3>
            <p className="text-sm text-on-surface-variant-light dark:text-on-surface-variant-dark mb-4">
              Select a company to link your existing data:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {companies.map((company) => (
                <div
                  key={company.id}
                  onClick={() => setSelectedCompanyForMigration(company)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedCompanyForMigration?.id === company.id
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-light/20 hover:bg-surface-variant-light/30'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">business</span>
                    <span className="font-medium">{company.name}</span>
                    {selectedCompanyForMigration?.id === company.id && (
                      <span className="material-symbols-outlined text-primary ml-auto">check_circle</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-6">
              <button
                type="button"
                onClick={() => {
                  setShowMigrateModal(false);
                  setSelectedCompanyForMigration(null);
                }}
                className="flex-1 px-4 py-3 text-primary font-medium border border-primary rounded-xl hover:bg-primary/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMigrateData}
                disabled={!selectedCompanyForMigration || isMigrating}
                className="flex-1 px-4 py-3 bg-primary text-on-primary font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isMigrating ? 'Migrating...' : 'Link Data'}
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
    </div>
  );
};

export default CompanySelector;