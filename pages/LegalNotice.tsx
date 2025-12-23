import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPPORT_PHONE } from '../constants';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { addMonths, format, parseISO, differenceInDays, startOfDay, isPast, isValid } from 'date-fns';
import jsPDF from 'jspdf';
import { useCompany } from '../context/CompanyContext';

// --- Icons ---
const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={`bi bi-whatsapp ${className}`} viewBox="0 0 16 16">
        <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
    </svg>
);

// --- Types ---
interface Customer {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    photo_url?: string;
    avatar?: string;
}

interface Loan {
    id: string;
    customerId: string;
    disbursalDate: string;
    repaymentSchedule: { emiNumber: number; amount: number; dueDate: string; status: 'Pending' | 'Paid' | 'Cancelled' }[];
}

interface NoticeForm {
    customerName: string;
    customerAddress: string;
    loanAccountNumber: string;
    emiNumber: number;
    emiAmount: number;
    disbursalDate: string;
    issueDate: string;
    paymentDeadlineHours: number;
    lateFeePerDay: number;
    paymentDetails: string;
    signatoryName: string;
    customDueDate: string;
}

interface Template extends NoticeForm {
    templateName: string;
}

const formatCurrency = (value: number) => `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(value)}`;

const LegalNotice: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();

    const companyDetails = useMemo(() => ({
        name: currentCompany?.name || "Finance Company",
        address: currentCompany?.address || "",
        phone: currentCompany?.phone || ""
    }), [currentCompany]);

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Template State
    const [templates, setTemplates] = useState<Template[]>([]);
    const [showTemplateSave, setShowTemplateSave] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');

    // Form State
    const [form, setForm] = useState<NoticeForm>({
        customerName: '',
        customerAddress: '',
        loanAccountNumber: '',
        emiNumber: 0,
        emiAmount: 0,
        disbursalDate: '',
        issueDate: format(new Date(), 'yyyy-MM-dd'),
        paymentDeadlineHours: 48,
        lateFeePerDay: 50,
        paymentDetails: `UPI ID: ${SUPPORT_PHONE}-3@ybl\nBank Account: [Account No]\nIFSC: [IFSC Code]`,
        signatoryName: 'Authorized Signatory',
        customDueDate: ''
    });

    // Fetch Smart Data (Customers with Overdue EMIs)
    const fetchSmartData = useCallback(async () => {
        if (!currentCompany) {
            setLoadingData(false);
            return;
        }

        setLoadingData(true);
        try {
            const [customersSnap, loansSnap] = await Promise.all([
                getDocs(query(
                    collection(db, "customers"),
                    where("companyId", "==", currentCompany.id)
                )),
                getDocs(query(
                    collection(db, "loans"),
                    where("status", "in", ["Disbursed", "Active", "Overdue"]),
                    where("companyId", "==", currentCompany.id)
                ))
            ]);

            const allCustomers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Customer[];
            const allLoans = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Loan[];

            // Filter for customers who have at least one overdue pending EMI
            const overdueCustomerIds = new Set<string>();
            allLoans.forEach(loan => {
                if (loan.repaymentSchedule) {
                    const hasOverdue = loan.repaymentSchedule.some(emi =>
                        emi.status === 'Pending' && isPast(parseISO(emi.dueDate))
                    );
                    if (hasOverdue) overdueCustomerIds.add(loan.customerId);
                }
            });

            const filteredCustomers = allCustomers.filter(c => overdueCustomerIds.has(c.id));
            setCustomers(filteredCustomers);
            setLoans(allLoans);

        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoadingData(false);
        }
    }, [currentCompany]);

    useEffect(() => {
        fetchSmartData();
        // Load Templates
        const saved = localStorage.getItem('legalNoticeTemplates');
        if (saved) setTemplates(JSON.parse(saved));
    }, [fetchSmartData]);

    // Handle Customer Selection & Auto-fill
    const handleCustomerSelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        const customerLoans = loans.filter(l => l.customerId === customer.id);

        // Find the oldest overdue EMI
        let targetLoan: Loan | undefined;
        let targetEmi: any;

        for (const loan of customerLoans) {
            if (!loan.repaymentSchedule) continue;
            const overdueEmi = loan.repaymentSchedule.find(emi =>
                emi.status === 'Pending' && isPast(parseISO(emi.dueDate))
            );
            if (overdueEmi) {
                targetLoan = loan;
                targetEmi = overdueEmi;
                break;
            }
        }

        if (targetLoan && targetEmi) {
            setForm(prev => ({
                ...prev,
                customerName: customer.name,
                customerAddress: customer.address || '',
                loanAccountNumber: targetLoan!.id,
                emiNumber: targetEmi.emiNumber,
                emiAmount: targetEmi.amount,
                disbursalDate: targetLoan!.disbursalDate,
                customDueDate: targetEmi.dueDate,
                issueDate: format(new Date(), 'yyyy-MM-dd')
            }));
        } else {
            // Fallback if manual selection or no overdue found (shouldn't happen with filter)
            setForm(prev => ({
                ...prev,
                customerName: customer.name,
                customerAddress: customer.address || '',
                loanAccountNumber: customerLoans[0]?.id || '',
                disbursalDate: customerLoans[0]?.disbursalDate || '',
                issueDate: format(new Date(), 'yyyy-MM-dd')
            }));
        }
    };

    // Calculations
    const calculatedDueDate = useMemo(() => {
        if (form.customDueDate) return form.customDueDate;
        return '';
    }, [form.customDueDate]);

    const daysOverdue = useMemo(() => {
        if (!calculatedDueDate || !form.issueDate) return 0;
        try {
            const due = startOfDay(parseISO(calculatedDueDate));
            const issue = startOfDay(parseISO(form.issueDate));
            if (issue > due) return differenceInDays(issue, due);
            return 0;
        } catch { return 0; }
    }, [calculatedDueDate, form.issueDate]);

    const totalAmountDue = useMemo(() => {
        const lateFee = daysOverdue * form.lateFeePerDay;
        return form.emiAmount + lateFee;
    }, [form.emiAmount, daysOverdue, form.lateFeePerDay]);

    const fullNoticeText = useMemo(() => {
        return `To:
Mr./Ms. ${form.customerName}
${form.customerAddress}
Loan Account: ${form.loanAccountNumber}

Subject: IMMEDIATE PAYMENT DEMAND for Overdue Equated Monthly Installment (EMI)

This notice serves as a FINAL WARNING regarding your outstanding loan from ${companyDetails.name}.

Your EMI (Installment No. ${form.emiNumber}), which was due on ${calculatedDueDate ? format(parseISO(calculatedDueDate), 'dd MMMM, yyyy') : '---'}, remains unpaid. This payment is now overdue by ${daysOverdue} days.

OUTSTANDING DETAILS:
- EMI Amount: ${formatCurrency(form.emiAmount)}
- Late Fees (${daysOverdue} days): ${formatCurrency(daysOverdue * form.lateFeePerDay)}
- TOTAL DUE: ${formatCurrency(totalAmountDue)}

You are instructed to pay the total amount of ${formatCurrency(totalAmountDue)} within ${form.paymentDeadlineHours} hours.

PAYMENT DETAILS:
${form.paymentDetails}

Failure to comply will result in reporting to credit bureaus and initiation of legal recovery proceedings.

Sincerely,
${form.signatoryName}
For ${companyDetails.name}`;
    }, [form, calculatedDueDate, daysOverdue, totalAmountDue]);

    // PDF Generation
    const generatePdf = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        let y = margin;

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text(companyDetails.name, pageWidth / 2, y, { align: 'center' });
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(companyDetails.address, pageWidth / 2, y, { align: 'center' });
        y += 5;
        doc.text(companyDetails.phone, pageWidth / 2, y, { align: 'center' });

        y += 10;
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 15;

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text("LEGAL NOTICE", pageWidth / 2, y, { align: 'center' });
        y += 15;

        // Date
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${format(parseISO(form.issueDate), 'dd MMMM, yyyy')}`, pageWidth - margin, y, { align: 'right' });
        y += 10;

        // Content
        doc.setFontSize(11);
        const splitText = doc.splitTextToSize(fullNoticeText, pageWidth - (margin * 2));
        doc.text(splitText, margin, y);

        // Footer
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text("This is a computer-generated document.", pageWidth / 2, pageHeight - 15, { align: 'center' });

        doc.save(`Notice_${form.customerName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    };

    // Templates
    const saveTemplate = () => {
        if (!newTemplateName) return alert("Enter a template name");
        const newTemp = { templateName: newTemplateName, ...form };
        const updated = [...templates, newTemp];
        setTemplates(updated);
        localStorage.setItem('legalNoticeTemplates', JSON.stringify(updated));
        setNewTemplateName('');
        setShowTemplateSave(false);
    };

    const loadTemplate = (tempName: string) => {
        const temp = templates.find(t => t.templateName === tempName);
        if (temp) setForm({ ...temp });
    };

    const deleteTemplate = (tempName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = templates.filter(t => t.templateName !== tempName);
        setTemplates(updated);
        localStorage.setItem('legalNoticeTemplates', JSON.stringify(updated));
    }

    // --- Render ---

    if (!selectedCustomer) {
        return (
            <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
                <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h1 className="text-2xl font-bold tracking-tight">Legal Notice Generator</h1>
                    </div>
                </div>

                <div className="max-w-xl mx-auto p-4 space-y-6">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-bold text-base">Select Customer</h2>
                            <p className="text-xs text-slate-500">Only showing customers with overdue EMIs</p>
                        </div>

                        <div className="p-4">
                            <div className="relative mb-4">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                <input
                                    type="text"
                                    placeholder="Search overdue customers..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2230] focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>

                            {loadingData ? (
                                <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>
                            ) : customers.length > 0 ? (
                                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                                    {customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(customer => (
                                        <button
                                            key={customer.id}
                                            onClick={() => handleCustomerSelect(customer)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center shrink-0 font-bold">
                                                {customer.name.charAt(0)}
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-sm group-hover:text-primary transition-colors">{customer.name}</h3>
                                                <p className="text-xs text-slate-500">ID: {customer.id}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                                    <p>No customers with overdue EMIs found!</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
            <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedCustomer(null)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-bold tracking-tight truncate">Notice for {selectedCustomer.name}</h1>
                    </div>
                    <button onClick={generatePdf} className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[18px]">download</span> PDF
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Form Column */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                        <h2 className="font-bold text-lg border-b border-slate-100 dark:border-slate-800 pb-2">Notice Details</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500">Loan Account No.</label>
                                <input type="text" value={form.loanAccountNumber} onChange={e => setForm({ ...form, loanAccountNumber: e.target.value })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500">Notice Date</label>
                                <input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500">EMI Amount</label>
                                <input type="number" value={form.emiAmount} onChange={e => setForm({ ...form, emiAmount: Number(e.target.value) })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500">Due Date</label>
                                <input type="date" value={form.customDueDate} onChange={e => setForm({ ...form, customDueDate: e.target.value })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500">Address / Notes</label>
                            <textarea rows={3} value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm resize-none"></textarea>
                        </div>

                        <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 flex justify-between items-center text-sm">
                            <span className="font-bold text-red-800 dark:text-red-300">{daysOverdue} Days Overdue</span>
                            <div className="text-right">
                                <span className="block text-xs text-red-600">Total Demand</span>
                                <span className="font-extrabold text-red-700 dark:text-red-400">{formatCurrency(totalAmountDue)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500">Payment Deadline (Hours)</label>
                                <input type="number" value={form.paymentDeadlineHours} onChange={e => setForm({ ...form, paymentDeadlineHours: Number(e.target.value) })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500">Late Fee / Day</label>
                                <input type="number" value={form.lateFeePerDay} onChange={e => setForm({ ...form, lateFeePerDay: Number(e.target.value) })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500">Payment Instructions</label>
                            <textarea rows={3} value={form.paymentDetails} onChange={e => setForm({ ...form, paymentDetails: e.target.value })} className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm resize-none"></textarea>
                        </div>
                    </div>

                    {/* Templates Card */}
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5">
                        <h2 className="font-bold text-base mb-3">Templates</h2>
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                            {templates.map(t => (
                                <div key={t.templateName} onClick={() => loadTemplate(t.templateName)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap border border-slate-200 dark:border-slate-700">
                                    <span className="text-xs font-bold">{t.templateName}</span>
                                    <button onClick={(e) => deleteTemplate(t.templateName, e)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined text-[14px]">close</span></button>
                                </div>
                            ))}
                        </div>
                        {showTemplateSave ? (
                            <div className="flex gap-2">
                                <input type="text" placeholder="Template Name" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
                                <button onClick={saveTemplate} className="bg-primary text-white px-3 rounded-lg"><span className="material-symbols-outlined">save</span></button>
                                <button onClick={() => setShowTemplateSave(false)} className="text-slate-500 px-2"><span className="material-symbols-outlined">close</span></button>
                            </div>
                        ) : (
                            <button onClick={() => setShowTemplateSave(true)} className="text-sm font-bold text-primary hover:underline">Save current as template</button>
                        )}
                    </div>
                </div>

                {/* Preview Column */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex flex-col h-full min-h-[500px]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-bold text-lg">Live Preview</h2>
                            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-mono rounded">TEXT FORMAT</span>
                        </div>
                        <div className="flex-1 bg-slate-50 dark:bg-[#151b26] p-4 rounded-xl border border-slate-100 dark:border-slate-700 overflow-auto">
                            <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                                {fullNoticeText}
                            </pre>
                        </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-900/30 p-5">
                        <h3 className="font-bold text-green-800 dark:text-green-400 text-sm mb-2 flex items-center gap-2">
                            <WhatsAppIcon className="w-4 h-4" /> WhatsApp Message
                        </h3>
                        <div className="bg-white dark:bg-[#151b26] p-3 rounded-lg text-xs border border-green-100 dark:border-green-900/20 text-slate-600 dark:text-slate-300">
                            🚨 *FINAL REMINDER* 🚨<br /><br />
                            Dear {form.customerName},<br />
                            Your EMI of *{formatCurrency(totalAmountDue)}* due on {calculatedDueDate} is overdue.<br />
                            Please pay within {form.paymentDeadlineHours} hours to avoid legal action.<br /><br />
                            UPI: {form.paymentDetails.split('\n')[0].split(':')[1] || 'As per notice'}
                        </div>
                        <button
                            onClick={() => {
                                const msg = `🚨 *FINAL REMINDER* 🚨\n\nDear ${form.customerName},\nYour EMI of *${formatCurrency(totalAmountDue)}* due on ${calculatedDueDate} is overdue.\nPlease pay within ${form.paymentDeadlineHours} hours to avoid legal action.\n\nUPI: ${form.paymentDetails.split('\n')[0].split(':')[1] || 'As per notice'}`;
                                const phone = selectedCustomer.phone?.replace(/\D/g, '').slice(-10);
                                if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                                else alert("Customer phone number not available.");
                            }}
                            className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                        >
                            <WhatsAppIcon className="w-4 h-4" /> Send via WhatsApp
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default LegalNotice;