import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useCompany } from '../context/CompanyContext';

interface LoanApplication {
    id: string;
    customerName: string;
    amount: number;
    date: string;
    status: string;
}

const Approvals: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();
    const [applications, setApplications] = useState<LoanApplication[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalType, setModalType] = useState<'approve' | 'reject' | null>(null);
    const [selectedApp, setSelectedApp] = useState<LoanApplication | null>(null);
    const [comment, setComment] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const fetchPendingApplications = async () => {
            if (!currentCompany) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const q = query(
                    collection(db, "loans"),
                    where("status", "==", "Pending"),
                    where("companyId", "==", currentCompany.id)
                );
                const querySnapshot = await getDocs(q);
                const pendingApps = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LoanApplication[];
                setApplications(pendingApps);
            } catch (error) {
                console.error("Failed to load loans:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchPendingApplications();
    }, [currentCompany]);

    const openModal = (type: 'approve' | 'reject', app: LoanApplication) => {
        setModalType(type);
        setSelectedApp(app);
        setComment('');
    };

    const closeModal = () => {
        setModalType(null);
        setSelectedApp(null);
        setComment('');
    };

    const handleStatusUpdate = async () => {
        if (!selectedApp || !modalType) return;
        setProcessing(true);

        const newStatus = modalType === 'approve' ? 'Approved' : 'Rejected';

        try {
            const loanRef = doc(db, "loans", selectedApp.id);

            const updateData: any = {
                status: newStatus,
                adminComment: comment,
            };

            if (newStatus === 'Approved') {
                updateData.approvalDate = new Date().toISOString();
            }

            await updateDoc(loanRef, updateData);

            setApplications(prev => prev.filter(app => app.id !== selectedApp.id));
            alert(`Application ${newStatus} Successfully`);
            closeModal();

        } catch (error) {
            console.error(`Failed to update application:`, error);
            alert("An error occurred while updating the loan.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-2xl font-bold tracking-tight">Approvals Queue</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-6">
                <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <h2 className="font-bold text-lg">Pending Applications</h2>
                        <p className="text-sm text-slate-500">Review and process new loan requests.</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap">App ID</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Applicant</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Amount</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center">
                                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                        </td>
                                    </tr>
                                ) : applications.length > 0 ? (
                                    applications.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3 font-medium">{app.id}</td>
                                            <td className="px-4 py-3 font-bold">{app.customerName}</td>
                                            <td className="px-4 py-3">Rs. {app.amount.toLocaleString('en-IN')}</td>
                                            <td className="px-4 py-3 text-slate-500">{new Date(app.date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 flex justify-center gap-2">
                                                <button
                                                    onClick={() => openModal('approve', app)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 shadow-sm border border-green-700 active:scale-95 transition-all text-xs font-black uppercase tracking-wider"
                                                >
                                                    <span className="material-symbols-outlined text-[16px] material-symbols-fill">check_circle</span> Approve
                                                </button>
                                                <button
                                                    onClick={() => openModal('reject', app)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm border border-red-700 active:scale-95 transition-all text-xs font-black uppercase tracking-wider"
                                                >
                                                    <span className="material-symbols-outlined text-[16px] material-symbols-fill">cancel</span> Reject
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                            <span className="material-symbols-outlined text-4xl mb-2">assignment_turned_in</span>
                                            <p>No pending applications.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {modalType && selectedApp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-1">
                            {modalType === 'approve' ? 'Approve Loan?' : 'Reject Loan?'}
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {modalType === 'approve'
                                ? `You are approving a loan of Rs. ${selectedApp.amount.toLocaleString('en-IN')} for ${selectedApp.customerName}.`
                                : `You are rejecting the application for ${selectedApp.customerName}.`}
                        </p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    {modalType === 'approve' ? 'Comments (Optional)' : 'Reason for Rejection'}
                                </label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder={modalType === 'approve' ? "E.g. Verified documents..." : "E.g. Low credit score..."}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none resize-none h-24"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStatusUpdate}
                                disabled={processing}
                                className={`px-4 py-2 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2 ${modalType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                                    }`}
                            >
                                {processing && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                Confirm {modalType === 'approve' ? 'Approval' : 'Rejection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Approvals;