import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, runTransaction, getDoc } from "firebase/firestore";
import { format, parseISO, isPast, subMonths, addMonths } from 'date-fns';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// WhatsApp Icon Component
const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={`bi bi-whatsapp ${className}`} viewBox="0 0 16 16">
        <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
    </svg>
);

interface PendingEmi {
    loanId: string;
    customerId: string;
    customerName: string;
    emiNumber: number;
    dueDate: string;
    amount: number;
    tenure: number;
    phoneNumber?: string;
}

const companyDetails = {
    name: "JLS Finance Company",
    address: "123 Finance Street, City Center",
    phone: "+91 98765 43210"
};

const DueList: React.FC = () => {
    const [allPendingEmis, setAllPendingEmis] = useState<PendingEmi[]>([]);
    const [filteredEmis, setFilteredEmis] = useState<PendingEmi[]>([]);
    const [viewDate, setViewDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    
    // Summary Stats
    const [totalDue, setTotalDue] = useState(0);
    const [collectedCount, setCollectedCount] = useState(0); // Mock for now or calculated if we fetch paid ones
    
    // Modal State
    const [selectedEmi, setSelectedEmi] = useState<PendingEmi | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [lastCollectedEmi, setLastCollectedEmi] = useState<PendingEmi | null>(null);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

    const formatCurrency = (value: number) => `Rs. ${new Intl.NumberFormat("en-IN").format(value)}`;

    const fetchPendingEmis = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch all disbursed loans and customers
            const loansQuery = query(collection(db, "loans"), where("status", "in", ["Disbursed", "Active", "Overdue"]));
            const customersQuery = query(collection(db, "customers"));

            const [loansSnapshot, customersSnapshot] = await Promise.all([
                getDocs(loansQuery),
                getDocs(customersQuery)
            ]);
            
            const customerMap = new Map<string, any>();
            customersSnapshot.docs.forEach(doc => {
                customerMap.set(doc.id, doc.data());
            });
            
            const pendingEmisList: PendingEmi[] = [];

            loansSnapshot.docs.forEach(loanDoc => {
                const loan = loanDoc.data();
                const customerData = customerMap.get(loan.customerId);

                if (loan.repaymentSchedule) {
                    loan.repaymentSchedule.forEach((emi: any) => {
                        if (emi.status === 'Pending') {
                            pendingEmisList.push({
                                loanId: loanDoc.id,
                                customerId: loan.customerId,
                                customerName: loan.customerName,
                                emiNumber: emi.emiNumber,
                                dueDate: emi.dueDate,
                                amount: emi.amount,
                                tenure: loan.tenure,
                                phoneNumber: customerData?.phone || 'N/A'
                            });
                        }
                    });
                }
            });
            
            pendingEmisList.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
            setAllPendingEmis(pendingEmisList);

        } catch (error) {
            console.error("Failed to load pending EMIs:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPendingEmis();
    }, [fetchPendingEmis]);

    useEffect(() => {
        const monthKey = format(viewDate, 'yyyy-MM');
        const filtered = allPendingEmis.filter(emi => format(parseISO(emi.dueDate), 'yyyy-MM') === monthKey);
        setFilteredEmis(filtered);
        setTotalDue(filtered.reduce((sum, item) => sum + item.amount, 0));
    }, [viewDate, allPendingEmis]);

    // --- Actions ---

    const handleSendReminder = (emi: PendingEmi) => {
        const customerPhone = emi.phoneNumber;
        if (!customerPhone || customerPhone === 'N/A' || customerPhone.length < 10) {
            alert("Customer phone number not found or invalid.");
            return;
        }

        const formattedPhone = `91${customerPhone.replace(/\D/g, '').slice(-10)}`;
        const dueDateFormatted = format(parseISO(emi.dueDate), 'dd MMMM, yyyy');
        const amountFormatted = `Rs. ${emi.amount.toLocaleString('en-IN')}`;
        
        let message;
        const isOverdue = isPast(parseISO(emi.dueDate));

        if (isOverdue) {
            message = `चेतावनी: ${emi.customerName},\n\nJLS Finance Company से आपकी EMI (किश्त संख्या ${emi.emiNumber}) जिसका भुगतान ${dueDateFormatted} को होना था, अभी तक नहीं चुकाई गई है। राशि: ${amountFormatted}.\n\nकानूनी कार्रवाई और अतिरिक्त शुल्क से बचने के लिए तुरंत भुगतान करें।\n\nJLS Finance Company`;
        } else {
            message = `नमस्ते ${emi.customerName},\n\nJLS Finance Company की ओर से यह आपकी आने वाली EMI के लिए एक विनम्र अनुस्मारक है।\n\nराशि: ${amountFormatted}\nदेय तिथि: ${dueDateFormatted}\nEMI संख्या: ${emi.emiNumber}\n\nअतिरिक्त शुल्क से बचने के लिए कृपया समय पर भुगतान सुनिश्चित करें। धन्यवाद।`;
        }
        
        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const handleBulkSendReminders = () => {
        if (filteredEmis.length === 0) return alert("No EMIs to remind.");
        
        let count = 0;
        filteredEmis.forEach((emi, index) => {
            if (emi.phoneNumber && emi.phoneNumber.length >= 10) {
                setTimeout(() => handleSendReminder(emi), index * 500);
                count++;
            }
        });
        alert(`Opening WhatsApp for ${count} customers... allow popups if blocked.`);
    };

    const handleCollectEmi = async () => {
        if (!selectedEmi || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await runTransaction(db, async (transaction) => {
                const loanRef = doc(db, "loans", selectedEmi.loanId);
                const receiptCounterRef = doc(db, 'counters', 'receiptId_counter');
                
                const loanDoc = await transaction.get(loanRef);
                const counterDoc = await transaction.get(receiptCounterRef);

                if (!loanDoc.exists()) throw new Error("Loan not found!");

                const loanData = loanDoc.data();
                const today = new Date();
                const paymentDate = format(today, 'yyyy-MM-dd');

                const updatedSchedule = loanData.repaymentSchedule.map((emi: any) => {
                    if (emi.emiNumber === selectedEmi.emiNumber) {
                        return { 
                            ...emi, 
                            status: 'Paid', 
                            paymentDate: paymentDate, 
                            paymentMethod: paymentMethod, 
                            amountPaid: emi.amount,
                        };
                    }
                    return emi;
                });
                
                let nextReceiptId = 1;
                if(counterDoc.exists()){
                    nextReceiptId = (counterDoc.data().lastId || 0) + 1;
                }
                
                const receiptDocId = `RCPT-${nextReceiptId}`;
                const receiptRef = doc(db, "receipts", receiptDocId);

                transaction.update(loanRef, { repaymentSchedule: updatedSchedule });
                transaction.set(receiptRef, {
                    receiptId: receiptDocId,
                    loanId: selectedEmi.loanId,
                    customerId: selectedEmi.customerId,
                    customerName: selectedEmi.customerName,
                    amount: selectedEmi.amount,
                    paymentDate: paymentDate,
                    paymentMethod: paymentMethod,
                    emiNumber: selectedEmi.emiNumber,
                    createdAt: new Date().toISOString(),
                });
                transaction.set(receiptCounterRef, { lastId: nextReceiptId }, { merge: true });
            });
            
            setLastCollectedEmi(selectedEmi);
            setAllPendingEmis(prev => prev.filter(e => !(e.emiNumber === selectedEmi.emiNumber && e.loanId === selectedEmi.loanId)));
            setSelectedEmi(null);
            setIsNotificationModalOpen(true);
            alert("Collection Successful!");
            
        } catch (error: any) {
            console.error("Error collecting EMI:", error);
            alert("Collection Failed: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadReport = () => {
        try {
            const doc = new jsPDF();
            const monthName = format(viewDate, 'MMMM yyyy');
            const totalDue = filteredEmis.reduce((sum, emi) => sum + emi.amount, 0);

            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text(`${companyDetails.name}`, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center'});
            doc.setFontSize(14);
            doc.text(`Monthly EMI Due Report - ${monthName}`, doc.internal.pageSize.getWidth() / 2, 25, { align: 'center'});
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Generated: ${format(new Date(), 'dd-MMM-yyyy HH:mm')}`, 14, 35);
            doc.text(`Total Due: ${formatCurrency(totalDue)}`, 14, 40);

            const tableColumns = ["Customer", "Loan ID", "Amount", "Due Date", "Phone"];
            const tableRows = filteredEmis.map(emi => [
                emi.customerName,
                emi.loanId,
                formatCurrency(emi.amount),
                format(parseISO(emi.dueDate), 'dd-MMM-yyyy'),
                emi.phoneNumber || 'N/A'
            ]);

            autoTable(doc, {
                head: [tableColumns],
                body: tableRows,
                startY: 45,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] },
            });
            
            doc.save(`Due_List_${format(viewDate, 'yyyy_MM')}.pdf`);
        } catch (error) {
            console.error("PDF Error", error);
            alert("Failed to download PDF");
        }
    };

    const handleSendConfirmation = async () => {
        if (!lastCollectedEmi?.phoneNumber) {
             alert("No phone number available for confirmation.");
             setIsNotificationModalOpen(false);
             return;
        }
        
        const formattedPhone = `91${lastCollectedEmi.phoneNumber.replace(/\D/g, '').slice(-10)}`;
        const message = `Payment Received!\n\nDear ${lastCollectedEmi.customerName},\nWe have received your payment of ${formatCurrency(lastCollectedEmi.amount)} for EMI #${lastCollectedEmi.emiNumber}.\n\nThank you,\nJLS Finance Company`;
        
        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
        setIsNotificationModalOpen(false);
        setLastCollectedEmi(null);
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Link to="/tools" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">Due List</h1>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleDownloadReport} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined">download</span>
                    </button>
                    <button onClick={handleBulkSendReminders} className="p-2 rounded-full bg-green-100 text-green-600">
                        <WhatsAppIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-6">
                
                {/* Month Selector & Summary */}
                <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">chevron_left</span></button>
                        <h2 className="font-bold text-lg">{format(viewDate, 'MMMM yyyy')}</h2>
                        <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">chevron_right</span></button>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <div className="text-center w-full">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Total Due</span>
                            <span className="block text-xl font-extrabold text-primary">{formatCurrency(totalDue)}</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="text-center w-full">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Pending Count</span>
                            <span className="block text-xl font-extrabold text-slate-700 dark:text-white">{filteredEmis.length}</span>
                        </div>
                    </div>
                </div>

                {/* List View */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
                    ) : filteredEmis.length > 0 ? (
                        filteredEmis.map((emi) => (
                            <div key={`${emi.loanId}-${emi.emiNumber}`} className="bg-white dark:bg-[#1e2736] rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <div className="flex flex-col gap-1">
                                    <h3 className="font-bold text-base text-slate-900 dark:text-white">{emi.customerName}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">EMI {emi.emiNumber}/{emi.tenure}</span>
                                        {isPast(parseISO(emi.dueDate)) ? (
                                            <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Overdue</span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-500">{format(parseISO(emi.dueDate), 'dd MMM')}</span>
                                        )}
                                    </div>
                                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-1">{formatCurrency(emi.amount)}</p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setSelectedEmi(emi)}
                                        className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/30 active:scale-95 transition-all"
                                    >
                                        Collect
                                    </button>
                                    <button 
                                        onClick={() => handleSendReminder(emi)}
                                        className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center hover:bg-green-100 hover:text-green-600 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">chat</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                            <p>No pending EMIs for this month.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Collection Modal */}
            {selectedEmi && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-1">Collect Payment</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            EMI #{selectedEmi.emiNumber} from {selectedEmi.customerName}
                        </p>
                        
                        <div className="space-y-4 mb-6">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                                <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Amount Due</span>
                                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(selectedEmi.amount)}</span>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">Payment Method</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['cash', 'upi', 'bank'].map((method) => (
                                        <button
                                            key={method}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`py-2 rounded-lg text-sm font-bold capitalize border ${
                                                paymentMethod === method 
                                                ? 'bg-primary text-white border-primary' 
                                                : 'bg-white dark:bg-[#1a2230] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                            }`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setSelectedEmi(null)} 
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCollectEmi}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSubmitting && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Modal */}
            {isNotificationModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
                        <div className="mx-auto h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-3xl">check</span>
                        </div>
                        <h3 className="text-lg font-bold mb-2">Payment Collected!</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            Would you like to send a confirmation WhatsApp message to {lastCollectedEmi?.customerName}?
                        </p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={handleSendConfirmation}
                                className="w-full py-3 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-2"
                            >
                                <WhatsAppIcon className="w-5 h-5" /> Send WhatsApp
                            </button>
                            <button 
                                onClick={() => setIsNotificationModalOpen(false)}
                                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DueList;