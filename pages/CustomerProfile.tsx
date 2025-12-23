import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { fetchCustomerById, fetchLoansByCustomerId, deleteCustomer } from '../services/dataService';
import { Customer, Loan } from '../types';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const CustomerProfile: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper to get initials

  // Helper to get initials
  const getInitials = (name: string) => {
    return name?.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase() || '??';
  };

  // Helper to format currency
  const formatCurrency = (value: number | undefined) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `Rs. ${new Intl.NumberFormat("en-IN").format(value)}`;
  };

  // Helper for Status Badge
  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset";
    switch (status) {
      case 'Approved':
      case 'Active':
      case 'Disbursed':
        return <span className={`${baseClasses} bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-green-600/20`}>{status}</span>;
      case 'Completed':
      case 'Paid Off':
        return <span className={`${baseClasses} bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-600/20`}>{status}</span>;
      case 'Rejected':
      case 'Overdue':
        return <span className={`${baseClasses} bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20`}>{status}</span>;
      default:
        return <span className={`${baseClasses} bg-gray-50 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 ring-gray-500/10`}>{status}</span>;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      const customerData = await fetchCustomerById(id);
      setCustomer(customerData);

      if (customerData) {
        const loansData = await fetchLoansByCustomerId(id);
        setLoans(loansData);
      }

      setLoading(false);
    };
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background-light dark:bg-background-dark text-slate-900 dark:text-white p-4 text-center">
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
          <span className="material-symbols-outlined text-4xl text-slate-400">person_off</span>
        </div>
        <div>
          <h2 className="text-xl font-bold">Customer Not Found</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">The customer profile you are trying to access does not exist.</p>
        </div>
        <Link to="/customers" className="px-4 py-2 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all mt-2">
          Go back to List
        </Link>
      </div>
    );
  }

  const InfoRow = ({ label, value, icon }: { label: string; value?: string | null; icon: string }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <span className="material-symbols-outlined text-slate-400 mt-0.5 text-[20px]">{icon}</span>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
          <span className="block text-sm font-medium text-slate-900 dark:text-white mt-0.5">{value}</span>
        </div>
      </div>
    );
  };

  const photoSrc = customer.photo_url || customer.avatar;

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen pb-10 text-slate-900 dark:text-white print:bg-white print:text-black">
      {/* Top Navigation - Hidden on Print */}
      <div className="sticky top-0 z-50 flex items-center justify-between bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md p-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold text-center">Customer Profile</h1>
        <div className="flex gap-2">
          <Link to={`/customers/edit/${id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined text-sm">edit</span>
            <span className="font-bold text-xs hidden sm:inline">Edit</span>
          </Link>
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <span className="material-symbols-outlined text-sm">delete</span>
            <span className="font-bold text-xs hidden sm:inline">Delete</span>
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span className="material-symbols-outlined text-sm">print</span>
            <span className="font-bold text-xs hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Main Profile Card */}
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden print:shadow-none print:border-black">
          {/* Header Section */}
          <div className="bg-slate-50/50 dark:bg-slate-800/30 p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 border-b border-slate-100 dark:border-slate-800">
            <div className="relative shrink-0">
              {photoSrc ? (
                <img src={photoSrc} alt={customer.name} className="h-28 w-28 rounded-full object-cover border-4 border-white dark:border-[#1e2736] shadow-md bg-slate-200" />
              ) : (
                <div className="h-28 w-28 rounded-full bg-primary/10 flex items-center justify-center border-4 border-white dark:border-[#1e2736] shadow-md text-3xl font-bold text-primary">
                  {getInitials(customer.name)}
                </div>
              )}
              <div className={`absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-white dark:border-[#1e2736] ${customer.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 justify-center sm:justify-start">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{customer.name}</h1>
                {getStatusBadge(customer.status)}
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-mono text-sm bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">ID: {customer.id}</p>

              <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-2">
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    <span className="material-symbols-outlined text-sm">mail</span> Email
                  </a>
                )}
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors">
                  <span className="material-symbols-outlined text-sm">call</span> Call
                </a>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Contact Information */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
                  <span className="material-symbols-outlined">contact_phone</span> Contact Details
                </h3>
                <div className="grid grid-cols-1 gap-1">
                  <InfoRow icon="call" label="Mobile Number" value={customer.phone} />
                  <InfoRow icon="mail" label="Email Address" value={customer.email || 'N/A'} />
                  <InfoRow icon="home_pin" label="Address" value={`${customer.address || ''} ${customer.city ? `, ${customer.city}` : ''}`} />
                  <InfoRow icon="map" label="State / Pincode" value={`${customer.state || ''} ${customer.pincode ? `- ${customer.pincode}` : ''}`} />
                </div>
              </div>

              {/* KYC Information */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
                  <span className="material-symbols-outlined">badge</span> KYC Details
                </h3>
                <div className="grid grid-cols-1 gap-1">
                  <InfoRow icon="fingerprint" label="Aadhaar Number" value={customer.aadhaar || 'Not Verified'} />
                  <InfoRow icon="id_card" label="PAN Number" value={customer.pan || 'Not Provided'} />
                  <InfoRow icon="how_to_vote" label="Voter ID" value={customer.voterId || 'Not Provided'} />
                </div>
              </div>
            </div>

            {/* Guarantor Details */}
            {customer.guarantor?.name && (
              <div className="mt-8">
                <h3 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
                  <span className="material-symbols-outlined">verified_user</span> Guarantor Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                  <InfoRow icon="person" label="Guarantor Name" value={customer.guarantor.name} />
                  <InfoRow icon="diversity_3" label="Relation" value={customer.guarantor.relation} />
                  <InfoRow icon="call" label="Mobile" value={customer.guarantor.mobile} />
                  <InfoRow icon="home" label="Address" value={customer.guarantor.address} />
                </div>
              </div>
            )}

            {/* Loan History */}
            {loans.length > 0 && (
              <div className="mt-8">
                <h3 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
                  <span className="material-symbols-outlined">history_edu</span> Loan History
                </h3>
                <div className="space-y-4">
                  {loans.map((loan) => (
                    <div key={loan.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-[#1e2736] border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="space-y-1 mb-4 sm:mb-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base">Loan #{loan.id}</span>
                          {getStatusBadge(loan.status)}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Applied on: {new Date(loan.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 text-sm w-full sm:w-auto">
                        <div>
                          <span className="block text-xs text-slate-500">Amount</span>
                          <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(loan.amount)}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-slate-500">EMI</span>
                          <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(loan.emi)}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-slate-500">Tenure</span>
                          <span className="font-bold text-slate-900 dark:text-white">{loan.tenure} M</span>
                        </div>
                        <div>
                          <span className="block text-xs text-slate-500">Rate</span>
                          <span className="font-bold text-slate-900 dark:text-white">{loan.interestRate}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents Preview (Existing) */}
            <div className="mt-8 print:hidden">
              <h3 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
                <span className="material-symbols-outlined">folder_shared</span> Documents
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer">
                  {photoSrc ? (
                    <img src={photoSrc} alt="Customer" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <span className="material-symbols-outlined text-4xl">image</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-bold px-2 py-1 bg-black/50 rounded">View Photo</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/80 p-2 text-center text-xs font-bold border-t border-slate-200 dark:border-slate-700">
                    Profile Photo
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-lg p-6">
            <div className="text-center mb-4">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-red-600">warning</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Customer?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to delete <strong>{customer?.name}</strong>? This action cannot be undone.
              </p>
              {loans.length > 0 && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">
                  Warning: This customer has {loans.length} loan(s) linked to them.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!id) return;
                  setIsDeleting(true);
                  try {
                    await deleteCustomer(id);
                    navigate('/customers');
                  } catch (error) {
                    console.error('Error deleting customer:', error);
                    alert('Failed to delete customer');
                  } finally {
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerProfile;