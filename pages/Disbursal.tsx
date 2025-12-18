import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { addMonths, startOfMonth, format, parse, isValid } from 'date-fns';
import { useCompany } from '../context/CompanyContext';

interface ApprovedLoan {
    id: string;
    customerName: string;
    customerId: string;
    amount: number;
    approvalDate?: string;
    tenure: number;
    emi: number;
    processingFee: number;
}

const Disbursal: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();
    const [approvedLoans, setApprovedLoans] = useState<ApprovedLoan[]>([]);
    const [loading, setLoading] = useState(true);

    const companyName = useMemo(() => currentCompany?.name || "Finance Company", [currentCompany]);
    
    // Modal State
    const [selectedLoan, setSelectedLoan] = useState<ApprovedLoan | null>(null);
    const [disbursalDate, setDisbursalDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [emiDueDay, setEmiDueDay] = useState<number>(1); // Default to 1st of month
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const fetchApprovedLoans = async () => {
            if (!currentCompany) {
                setLoading(false);
                return;
            }
            
            setLoading(true);
            try {
                const q = query(
                    collection(db, "loans"), 
                    where("status", "==", "Approved"),
                    where("companyId", "==", currentCompany.id)
                );
                const querySnapshot = await getDocs(q);
                const approved = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ApprovedLoan[];
                setApprovedLoans(approved);
            } catch (error) {
                console.error("Failed to load approved loans:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchApprovedLoans();
    }, [currentCompany]);

    const handleDisburse = async () => {
        if (!selectedLoan || !disbursalDate) {
            alert("Please select a valid date.");
            return;
        }
        setProcessing(true);

        try {
            const loanRef = doc(db, "loans", selectedLoan.id);
            const dateObj = new Date(disbursalDate);

            // Generate EMI schedule with selected due day
            const repaymentSchedule = [];
            const nextMonth = addMonths(dateObj, 1);
            const year = nextMonth.getFullYear();
            const month = nextMonth.getMonth();
            const firstEmiDate = new Date(year, month, emiDueDay);
            
            for (let i = 0; i < selectedLoan.tenure; i++) {
                const emiDate = addMonths(firstEmiDate, i);
                repaymentSchedule.push({
                    emiNumber: i + 1,
                    dueDate: format(emiDate, 'yyyy-MM-dd'),
                    amount: selectedLoan.emi,
                    status: 'Pending'
                });
            }
            
            const actualDisbursed = selectedLoan.amount - (selectedLoan.processingFee || 0);

            await updateDoc(loanRef, {
                status: 'Disbursed',
                disbursalDate: disbursalDate,
                repaymentSchedule: repaymentSchedule,
                actualDisbursed: actualDisbursed,
                emiDueDay: emiDueDay,
            });
            
            // Success Handling
            setApprovedLoans(prev => prev.filter(app => app.id !== selectedLoan.id));
            
            // Notification logic
            try {
                const customerRef = doc(db, "customers", selectedLoan.customerId);
                const customerSnap = await getDoc(customerRef);
                if(customerSnap.exists()){
                    const customerData = customerSnap.data();
                    if(customerData.phone){
                        // Clean phone number
                        const cleanPhone = customerData.phone.replace(/\D/g, '').slice(-10);
                        const formattedPhone = `91${cleanPhone}`;
                        const amountFormatted = `Rs. ${selectedLoan.amount.toLocaleString('en-IN')}`;
                        const dateFormatted = format(dateObj, 'dd MMMM, yyyy');

                        const message = `Namaste ${selectedLoan.customerName},\n\nAapka ${companyName} se ${amountFormatted} ka loan aaj dinank ${dateFormatted} ko disburse kar diya gaya hai.\n\nDhanyavaad.`;
                        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
                        
                        window.open(whatsappUrl, '_blank');
                    }
                }
            } catch (e) {
                console.error("WhatsApp redirect failed", e);
            }

            alert("Loan Disbursed Successfully!");
            setSelectedLoan(null);

        } catch (error) {
            console.error(`Failed to disburse loan:`, error);
            alert("Disbursal failed. Please try again.");
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
                    <h1 className="text-2xl font-bold tracking-tight">Disbursal Queue</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-6">
                <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <h2 className="font-bold text-lg">Ready for Disbursal</h2>
                        <p className="text-sm text-slate-500">Loans approved and waiting for payout.</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap">App ID</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Applicant</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Amount</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Approved Date</th>
                                    <th className="px-4 py-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center">
                                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                        </td>
                                    </tr>
                                ) : approvedLoans.length > 0 ? (
                                    approvedLoans.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3 font-medium">{app.id}</td>
                                            <td className="px-4 py-3 font-bold">{app.customerName}</td>
                                            <td className="px-4 py-3">Rs. {app.amount.toLocaleString('en-IN')}</td>
                                            <td className="px-4 py-3 text-slate-500">
                                                {app.approvalDate ? new Date(app.approvalDate).toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button 
                                                    onClick={() => setSelectedLoan(app)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 text-xs font-bold transition-colors shadow-lg shadow-primary/30"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">payments</span> Disburse
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                            <span className="material-symbols-outlined text-4xl mb-2">savings</span>
                                            <p>No loans pending disbursal.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {selectedLoan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-1">Confirm Disbursal</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            For {selectedLoan.customerName} (Loan #{selectedLoan.id})
                        </p>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Disbursal Date</label>
                                <input 
                                    type="date"
                                    value={disbursalDate}
                                    onChange={(e) => setDisbursalDate(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">EMI Due Day (Har Mahine Ki Tarikh)</label>
                                <select
                                    value={emiDueDay}
                                    onChange={(e) => setEmiDueDay(Number(e.target.value))}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                >
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                        <option key={day} value={day}>
                                            {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`} of every month
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 mt-2">
                                    * First EMI: {emiDueDay === 1 ? '1st' : emiDueDay === 2 ? '2nd' : emiDueDay === 3 ? '3rd' : `${emiDueDay}th`} of next month
                                </p>
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                                <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Net Amount</span>
                                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
                                    Rs. {(selectedLoan.amount - (selectedLoan.processingFee || 0)).toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setSelectedLoan(null)} 
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleDisburse}
                                disabled={processing}
                                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                            >
                                {processing && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Disbursal;