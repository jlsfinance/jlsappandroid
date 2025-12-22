import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, deleteField } from "firebase/firestore";
import { db } from "../firebaseConfig";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid, addMonths, startOfMonth } from 'date-fns';
import { useCompany } from '../context/CompanyContext';
import { Capacitor } from '@capacitor/core';
import LazyImage from '../components/LazyImage';
import { DownloadService } from '../services/DownloadService';

// Helper function to save/download PDF using the centralized service
const savePdf = async (pdfDoc: jsPDF, fileName: string) => {
    try {
        const base64Data = pdfDoc.output('datauristring').split(',')[1];
        await DownloadService.downloadPDF(fileName, base64Data);
    } catch (e: any) {
        console.error('File save error', e);
        alert('Error saving file: ' + e.message);
    }
};

// --- Interfaces ---
interface Emi {
    emiNumber: number;
    dueDate: string;
    amount: number;
    status: 'Paid' | 'Pending' | 'Cancelled';
    paymentDate?: string;
    paymentMethod?: string;
    amountPaid?: number;
    remark?: string;
}

interface Loan {
    id: string;
    customerId: string;
    customerName: string;
    amount: number;
    tenure: number;
    interestRate: number;
    processingFee: number;
    emi: number;
    originalEmi?: number;
    topUpEmi?: number;
    date: string; // Applied date
    status: 'Pending' | 'Approved' | 'Disbursed' | 'Rejected' | 'Completed';
    approvalDate?: string;
    disbursalDate?: string;
    repaymentSchedule: Emi[];
    topUpHistory?: { date: string; amount: number; previousAmount: number; newTenure?: number; }[];
    lastTopUpDate?: string;
    emiDueDay?: number; // Day of month for EMI (1-28)
    amortizationSchedule?: AmortizationRow[];
}

interface Customer {
    phone?: string;
    photo_url?: string;
    avatar?: string;
}

interface AmortizationRow {
    emiNo: number;
    dueDate: string;
    openingBalance: number;
    emi: number;
    interest: number;
    principal: number;
    closingBalance: number;
}

// --- Helpers ---
const safeFormatDate = (dateString: string | undefined | null, formatStr: string = 'dd-MMM-yyyy') => {
    if (!dateString) return '---';
    try {
        const date = parseISO(dateString);
        if (isValid(date)) {
            return format(date, formatStr);
        }
        return '---';
    } catch (e) {
        return '---';
    }
}

const formatCurrency = (value: number | undefined) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(value)}`;
};

const toWords = (num: number): string => {
    if (num === 0) return 'Zero';
    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const inWords = (n: number): string => {
        let str = '';
        if (n > 99) {
            str += a[Math.floor(n / 100)] + 'hundred ';
            n %= 100;
        }
        if (n > 19) {
            str += b[Math.floor(n / 10)] + (a[n % 10] ? '' + a[n % 10] : '');
        } else {
            str += a[n];
        }
        return str;
    };
    let words = '';
    if (num >= 10000000) {
        words += inWords(Math.floor(num / 10000000)) + 'crore ';
        num %= 10000000;
    }
    if (num >= 100000) {
        words += inWords(Math.floor(num / 100000)) + 'lakh ';
        num %= 100000;
    }
    if (num >= 1000) {
        words += inWords(Math.floor(num / 1000)) + 'thousand ';
        num %= 1000;
    }
    if (num > 0) {
        words += inWords(num);
    }
    return words.replace(/\s+/g, ' ').trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const generateAmortizationSchedule = (
    principal: number,
    emi: number,
    interestRate: number,
    tenure: number,
    firstEmiDate: Date
): AmortizationRow[] => {

    const monthlyRate = interestRate / 12 / 100;
    let balance = principal;

    const schedule: AmortizationRow[] = [];

    for (let i = 1; i <= tenure; i++) {
        const interest = Math.round(balance * monthlyRate);
        const principalPaid = Math.round(emi - interest);
        const closing = Math.max(balance - principalPaid, 0);

        const dueDate = new Date(
            firstEmiDate.getFullYear(),
            firstEmiDate.getMonth() + (i - 1),
            firstEmiDate.getDate()
        );

        schedule.push({
            emiNo: i,
            dueDate: dueDate.toISOString().split("T")[0],
            openingBalance: balance,
            emi,
            interest,
            principal: principalPaid,
            closingBalance: closing
        });

        balance = closing;
    }

    return schedule;
};

const generateTopUpMessage = ({
    customerName,
    loanId,
    outstanding,
    topUpAmount,
    newEmi,
    tenure,
    firstEmiDate,
    companyName
}: any) => {
    return `
Dear ${customerName},

Your loan (ID: ${loanId}) has been successfully TOP-UPPED.

Outstanding before top-up: Rs. ${outstanding}
Top-up amount: Rs. ${topUpAmount}

New EMI: Rs. ${newEmi}
Tenure: ${tenure} months
First EMI Date: ${firstEmiDate}

Thank you for choosing ${companyName}.
`;
};

async function toBase64(url: string, maxWidth: number = 200, quality: number = 0.6): Promise<string> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();

        return new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressedBase64);
                } else {
                    reject(new Error('Canvas context not available'));
                }
            };

            img.onerror = () => reject(new Error('Image load failed'));
            img.src = URL.createObjectURL(blob);
        });
    } catch (e) {
        console.error("Image load failed", e);
        throw e;
    }
}

const TOPUP_TERMS = [
    "1. This agreement revises only the EMI schedule of the original loan.",
    "2. All EMIs already paid by the borrower shall remain valid and unchanged.",
    "3. The outstanding principal as on the top-up date is acknowledged by the borrower.",
    "4. An additional amount has been disbursed as top-up and merged with outstanding.",
    "5. The borrower agrees to pay revised EMI as per the new repayment schedule.",
    "6. Processing fees and other charges are applicable as per company policy.",
    "7. All other terms and conditions of the original loan agreement remain unchanged.",
    "7. All other terms and conditions of the original loan agreement remain unchanged.",
];

const LOAN_TERMS = [
    "1. The borrower agrees to pay the EMI on or before the due date.",
    "2. Default in payment will attract penalty charges as per company policy.",
    "3. The loan is secured against the collateral provided (if any).",
    "4. The company reserves the right to recall the loan in case of default.",
    "5. Pre-closure charges may apply as per the agreement.",
    "6. This agreement is subject to the jurisdiction of the local courts.",
];



const getEmiAmountForDisplay = (emi: any, loan: Loan) => {
    if (emi.status === "Paid") {
        return loan.originalEmi || loan.emi;
    }
    return loan.topUpEmi || loan.emi;
};

const LoanDetails: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();
    const { id: loanId } = useParams(); // React Router uses 'id' usually, depends on route definition

    const [loan, setLoan] = useState<Loan | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);

    // Modals
    const [isPrecloseModalOpen, setIsPrecloseModalOpen] = useState(false);
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);

    // Loaders
    const [isDownloadingSchedule, setIsDownloadingSchedule] = useState(false);
    const [isDownloadingReceipt, setIsDownloadingReceipt] = useState<number | null>(null);
    const [isPreclosing, setIsPreclosing] = useState(false);
    const [isToppingUp, setIsToppingUp] = useState(false);
    const [isPreviewingForeclosure, setIsPreviewingForeclosure] = useState(false);

    // Form State
    const [foreclosureCharges, setForeclosureCharges] = useState(2); // Default 2%
    const [topUpAmount, setTopUpAmount] = useState(0);
    const [topUpTenure, setTopUpTenure] = useState(12); // New tenure for topup
    const [topUpInterestRate, setTopUpInterestRate] = useState<number>(18);
    const [topUpProcessingFeePercent, setTopUpProcessingFeePercent] = useState<number>(1);
    const [amountReceived, setAmountReceived] = useState(true); // Checkbox for amount received
    const [isUndoingForeclosure, setIsUndoingForeclosure] = useState(false);
    const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);

    const companyDetails = useMemo(() => ({
        name: currentCompany?.name || "Finance Company",
        address: currentCompany?.address || "",
        phone: currentCompany?.phone || ""
    }), [currentCompany]);

    const fetchLoanAndCustomer = useCallback(async () => {
        if (!loanId) return;
        setLoading(true);
        try {
            const loanRef = doc(db, "loans", loanId);
            const docSnap = await getDoc(loanRef);

            if (docSnap.exists()) {
                const loanData = { id: docSnap.id, ...docSnap.data() } as Loan;

                // Auto-complete check
                const allPaid = loanData.repaymentSchedule?.every((emi: Emi) => emi.status === 'Paid' || emi.status === 'Cancelled');
                if (allPaid && loanData.status === 'Disbursed' && loanData.repaymentSchedule?.length > 0) {
                    loanData.status = 'Completed';
                    await updateDoc(loanRef, { status: 'Completed' });
                }
                setLoan(loanData);
                if (loanData.interestRate) setTopUpInterestRate(loanData.interestRate);

                if (loanData.customerId) {
                    const customerRef = doc(db, "customers", loanData.customerId);
                    const customerSnap = await getDoc(customerRef);
                    if (customerSnap.exists()) {
                        setCustomer(customerSnap.data() as Customer);
                    }
                }

            } else {
                console.error("No such loan document!");
            }
        } catch (error) {
            console.error("Failed to load loan data:", error);
        } finally {
            setLoading(false);
        }
    }, [loanId]);

    useEffect(() => {
        fetchLoanAndCustomer();
    }, [fetchLoanAndCustomer]);

    // Derived State
    const paidEmisCount = loan?.repaymentSchedule?.filter(e => e.status === 'Paid').length || 0;
    const dueEmisCount = (loan?.tenure || 0) - paidEmisCount;

    const outstandingPrincipal = useMemo(() => {
        if (!loan || loan.status !== 'Disbursed') return 0;

        // Handle Top-Up Scenario
        const lastTopUp = loan.topUpHistory?.[loan.topUpHistory.length - 1];
        if (lastTopUp && lastTopUp.tenure) { // Fix: use .tenure instead of .newTenure
            let balance = loan.amount; // This is the New Principal (Reset point)
            const monthlyInterestRate = loan.interestRate / 12 / 100;
            const currentEmi = loan.topUpEmi || loan.emi;

            // The NEW schedule consists of the last 'tenure' items
            const startIndex = Math.max(0, loan.repaymentSchedule.length - lastTopUp.tenure); // Fix: use .tenure

            for (let i = startIndex; i < loan.repaymentSchedule.length; i++) {
                const emi = loan.repaymentSchedule[i];
                if (emi.status === 'Paid') {
                    const interestPayment = balance * monthlyInterestRate;
                    const principalPayment = currentEmi - interestPayment;
                    balance -= principalPayment;
                }
            }
            return Math.max(0, balance);
        }

        // Standard Logic (Original Loan)
        let balance = loan.amount;
        const monthlyInterestRate = loan.interestRate / 12 / 100;

        for (let i = 1; i <= loan.tenure; i++) {
            const emi = loan.repaymentSchedule.find(e => e.emiNumber === i);
            if (emi?.status === 'Paid') {
                const interestPayment = balance * monthlyInterestRate;
                const principalPayment = loan.emi - interestPayment;
                balance -= principalPayment;
            }
        }
        return Math.max(0, balance);
    }, [loan]);

    const foreclosureAmount = useMemo(() => {
        const charges = outstandingPrincipal * (foreclosureCharges / 100);
        return outstandingPrincipal + charges;
    }, [outstandingPrincipal, foreclosureCharges]);

    const detailedRepaymentSchedule = useMemo(() => {
        if (!loan) return [];

        const { amount, interestRate, tenure, emi, repaymentSchedule } = loan;
        if (!emi || !amount || !interestRate || !tenure || !repaymentSchedule) return [];

        const schedule = [];
        const monthlyInterestRate = interestRate / 12 / 100;

        // Check Top-Up Split
        const lastTopUp = loan.topUpHistory?.[loan.topUpHistory.length - 1];

        // Fix: use .tenure instead of .newTenure
        const topUpStartIndex = lastTopUp && lastTopUp.tenure ? repaymentSchedule.length - lastTopUp.tenure : 0;

        // Amortization Balance (Only valid for the current active segment)
        let balance = amount;

        for (let i = 0; i < repaymentSchedule.length; i++) {
            const existingEmi = repaymentSchedule[i];
            const isOldEmi = lastTopUp ? i < topUpStartIndex : false; // Only mark as Old if Top-Up exists

            let principalPayment = 0;
            let interestPayment = 0;
            let currentBalance = 0;
            let totalPayment = existingEmi.amount; // Default to stored amount

            if (isOldEmi) {
                // --- OLD EMI (Before Top-Up) ---
                // We do not calculate P/I split because we might not have the original start amount
                // Just show the Total Amount
                totalPayment = loan.originalEmi || existingEmi.amount;
                currentBalance = 0; // Unknown/Irrelevant for display
            } else {
                // --- NEW EMI (Post Top-Up) ---
                // Amortize starting from 'loan.amount' (New Principal)
                interestPayment = balance * monthlyInterestRate;
                principalPayment = (loan.topUpEmi || loan.emi) - interestPayment;
                balance -= principalPayment;
                currentBalance = balance > 0 ? balance : 0;
                totalPayment = loan.topUpEmi || loan.emi;
            }

            schedule.push({
                month: existingEmi.emiNumber,
                dueDate: existingEmi.dueDate || null,
                principal: isOldEmi ? 0 : principalPayment, // Hide Principal for Old
                interest: isOldEmi ? 0 : interestPayment,   // Hide Interest for Old
                totalPayment: totalPayment,
                balance: isOldEmi ? 0 : currentBalance,     // Hide Balance for Old
                status: existingEmi.status || 'Pending',
                paymentDate: existingEmi.paymentDate || null,
                remark: existingEmi.remark || '---',
                receiptDownloadable: existingEmi.status === 'Paid',
                type: isOldEmi ? 'OLD EMI' : 'TOP-UP EMI'
            });
        }
        return schedule;
    }, [loan]);


    const generateForeclosurePDF = async (loanData: Loan, foreclosureData: { date: string; outstandingPrincipal: number; chargesPercentage: number; totalPaid: number; }) => {
        const pdfDoc = new jsPDF();
        let y = 15;

        pdfDoc.setFontSize(18);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 8;
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(companyDetails.address, pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 5;
        pdfDoc.text(`Phone: ${companyDetails.phone}`, pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 10;

        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("LOAN FORECLOSURE CERTIFICATE", pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 10;

        pdfDoc.line(14, y, 196, y);
        y += 8;

        pdfDoc.setFontSize(11);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Foreclosure Date: ${safeFormatDate(foreclosureData.date, 'dd MMMM yyyy')}`, 14, y);
        y += 7;
        pdfDoc.text(`Certificate No: FC-${loanData.id}`, 14, y);
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("CUSTOMER DETAILS", 14, y);
        y += 7;
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Customer Name: ${loanData.customerName}`, 14, y);
        y += 6;
        pdfDoc.text(`Customer ID: ${loanData.customerId}`, 14, y);
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("LOAN DETAILS", 14, y);
        y += 7;
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Loan ID: ${loanData.id}`, 14, y);
        y += 6;
        pdfDoc.text(`Original Loan Amount: ${formatCurrency(loanData.amount)}`, 14, y);
        y += 6;
        pdfDoc.text(`Interest Rate: ${loanData.interestRate}% p.a.`, 14, y);
        y += 6;
        pdfDoc.text(`Tenure: ${loanData.tenure} Months`, 14, y);
        y += 6;
        pdfDoc.text(`Monthly EMI: ${formatCurrency(loanData.emi)}`, 14, y);
        y += 6;
        pdfDoc.text(`Disbursement Date: ${safeFormatDate(loanData.disbursalDate)}`, 14, y);
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("PAYMENT SUMMARY", 14, y);
        y += 7;

        const paidEmis = loanData.repaymentSchedule.filter(e => e.status === 'Paid');
        const totalEmiPaid = paidEmis.reduce((sum, e) => sum + (e.amountPaid || e.amount), 0);

        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`EMIs Paid: ${paidEmis.length} of ${loanData.tenure}`, 14, y);
        y += 6;
        pdfDoc.text(`Total EMI Amount Paid: ${formatCurrency(totalEmiPaid)}`, 14, y);
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("FORECLOSURE CALCULATION", 14, y);
        y += 7;

        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Outstanding Principal: ${formatCurrency(foreclosureData.outstandingPrincipal)}`, 14, y);
        y += 6;
        pdfDoc.text(`Foreclosure Charges (${foreclosureData.chargesPercentage}%): ${formatCurrency(foreclosureData.outstandingPrincipal * (foreclosureData.chargesPercentage / 100))}`, 14, y);
        y += 8;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFillColor(240, 240, 240);
        pdfDoc.rect(14, y - 5, 182, 12, 'F');
        pdfDoc.text(`TOTAL FORECLOSURE AMOUNT PAID: ${formatCurrency(foreclosureData.totalPaid)}`, 14, y + 2);
        y += 15;

        pdfDoc.line(14, y, 196, y);
        y += 8;

        pdfDoc.setFont("helvetica", "italic");
        pdfDoc.setFontSize(10);
        pdfDoc.text("This certificate confirms that the above loan has been foreclosed and all dues have been cleared.", 14, y);
        y += 6;
        pdfDoc.text("The customer has no further liability towards this loan.", 14, y);
        y += 15;

        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text("Authorized Signature: ____________________", 14, y);
        pdfDoc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 140, y);

        const pageCount = (pdfDoc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdfDoc.setPage(i);
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
        }

        return pdfDoc;
    };

    // Check if foreclosure charges percentage is valid
    const isForeclosureChargesValid = foreclosureCharges >= 0 && foreclosureCharges !== null && !isNaN(foreclosureCharges);

    // Preview Foreclosure PDF (without closing the loan)
    const handlePreviewForeclosurePDF = async () => {
        if (!loan) return;
        setIsPreviewingForeclosure(true);
        try {
            const foreclosureData = {
                date: new Date().toISOString(),
                outstandingPrincipal: outstandingPrincipal,
                chargesPercentage: foreclosureCharges,
                totalPaid: foreclosureAmount,
            };

            const pdfDoc = await generateForeclosurePDF(loan, foreclosureData);

            if (Capacitor.isNativePlatform()) {
                const base64 = pdfDoc.output('datauristring');
                const win = window.open();
                if (win) {
                    win.document.write('<iframe src="' + base64 + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
                } else {
                    savePdf(pdfDoc, `Foreclosure_Preview_${loan.id}.pdf`);
                }
            } else {
                window.open(pdfDoc.output('bloburl'), '_blank');
            }
            // pdfDoc.save(`Foreclosure_Preview_${loan.id}.pdf`);
        } catch (error) {
            console.error("Failed to generate preview PDF:", error);
            alert('Error generating preview PDF.');
        } finally {
            setIsPreviewingForeclosure(false);
        }
    };

    // Actions
    const handlePrecloseLoan = async () => {
        if (!loan) return;
        setIsPreclosing(true);
        try {
            const foreclosureData = {
                date: new Date().toISOString(),
                outstandingPrincipal: outstandingPrincipal,
                chargesPercentage: foreclosureCharges,
                totalPaid: foreclosureAmount,
                amountReceived: amountReceived,
            };

            const updatedSchedule = loan.repaymentSchedule.map(emi =>
                emi.status === 'Pending' ? { ...emi, status: 'Cancelled' as 'Cancelled' } : emi
            );

            await updateDoc(doc(db, "loans", loan.id), {
                status: 'Completed',
                repaymentSchedule: updatedSchedule,
                foreclosureDetails: foreclosureData
            });

            const pdfDoc = await generateForeclosurePDF({ ...loan, repaymentSchedule: updatedSchedule }, foreclosureData);
            await savePdf(pdfDoc, `Foreclosure_Certificate_${loan.id}.pdf`);

            alert('Loan Pre-closed successfully. Certificate downloaded.');
            setIsPrecloseModalOpen(false);
            fetchLoanAndCustomer();
        } catch (error) {
            console.error("Failed to pre-close loan:", error);
            alert('Error pre-closing loan.');
        } finally {
            setIsPreclosing(false);
        }
    };

    const handleUndoForeclosure = async () => {
        if (!loan) return;
        if (!confirm('Are you sure you want to undo this foreclosure? The loan will become active again with pending EMIs restored.')) return;

        setIsUndoingForeclosure(true);
        try {
            const updatedSchedule = loan.repaymentSchedule.map(emi =>
                emi.status === 'Cancelled' ? { ...emi, status: 'Pending' as 'Pending' } : emi
            );

            await updateDoc(doc(db, "loans", loan.id), {
                status: 'Disbursed',
                repaymentSchedule: updatedSchedule,
                foreclosureDetails: null
            });

            alert('Foreclosure undone successfully. Loan is now active again.');
            fetchLoanAndCustomer();
        } catch (error) {
            console.error("Failed to undo foreclosure:", error);
            alert('Error undoing foreclosure.');
        } finally {
            setIsUndoingForeclosure(false);
        }
    };

    const getTopUpCalculations = useCallback(() => {
        if (!loan || topUpAmount <= 0 || topUpTenure <= 0) return null;
        const outstanding = outstandingPrincipal;
        const newPrincipal = outstanding + topUpAmount;
        const monthlyRate = topUpInterestRate / 12 / 100;
        const newEmi = Math.round(
            (newPrincipal * monthlyRate * Math.pow(1 + monthlyRate, topUpTenure)) /
            (Math.pow(1 + monthlyRate, topUpTenure) - 1)
        );

        let emiDueDay = loan.emiDueDay || 1;
        const firstPending = loan.repaymentSchedule.find(e => e.status === "Pending");
        if (firstPending) {
            const d = new Date(firstPending.dueDate);
            if (!isNaN(d.getTime())) emiDueDay = d.getDate();
        }

        const today = new Date();
        const firstEmiDate = new Date(today.getFullYear(), today.getMonth() + 1, emiDueDay);
        const processingFee = Math.round((topUpAmount * topUpProcessingFeePercent) / 100);

        return {
            newPrincipal,
            newEmi,
            processingFee,
            firstEmiDate,
            topUpDate: today.toISOString()
        };
    }, [loan, topUpAmount, topUpTenure, outstandingPrincipal, topUpInterestRate, topUpProcessingFeePercent]);

    const handlePreviewTopUpAgreement = () => {
        const calcs = getTopUpCalculations();
        if (!calcs) return;
        const { newPrincipal, newEmi, processingFee, firstEmiDate, topUpDate } = calcs;
        const firstEmiDateStr = firstEmiDate.toISOString().split("T")[0];
        // Generate in Preview Mode
        generateTopUpAgreementPDF(newPrincipal, newEmi, topUpTenure, topUpDate, firstEmiDateStr, processingFee, topUpAmount, 'preview');
    };

    // Preview Updated Loan Card
    const handlePreviewUpdatedLoanCard = () => {
        const calcs = getTopUpCalculations();
        if (!calcs) return;
        generateUpdatedLoanCardPDF(calcs.newPrincipal, calcs.newEmi, (paidEmisCount + topUpTenure), 'preview');
    };

    const handleTopUpLoan = async () => {
        const calcs = getTopUpCalculations();
        if (!calcs) return;
        const { newPrincipal, newEmi, processingFee, firstEmiDate, topUpDate } = calcs;

        setIsToppingUp(true);

        try {
            // Re-calculate basic vars for DB Update logic (kept inline for safety or derived)
            // Or use the calcs.
            // We need 'newSchedule' which is heavy logic, let's keep it here or extract.
            // For safety and minimal diff risk, I will re-implement the DB update part here using the calc values where possible.

            const emiDueDay = firstEmiDate.getDate(); // derived from calc

            // ===============================
            // 3️⃣ BUILD NEW SCHEDULE
            // ===============================
            const paidEmis = loan!.repaymentSchedule.filter(e => e.status === "Paid");
            const newSchedule: Emi[] = [...paidEmis];

            for (let i = 0; i < topUpTenure; i++) {
                const emiDate = new Date(
                    firstEmiDate.getFullYear(),
                    firstEmiDate.getMonth() + i,
                    emiDueDay
                );

                newSchedule.push({
                    emiNumber: paidEmis.length + i + 1,
                    dueDate: emiDate.toISOString().split("T")[0],
                    amount: newEmi,
                    status: "Pending"
                });
            }

            // ===============================
            // 🆕 AMORTIZATION SCHEDULE
            // ===============================
            const amortizationSchedule = generateAmortizationSchedule(
                newPrincipal,
                newEmi,
                topUpInterestRate,
                topUpTenure,
                firstEmiDate
            );

            // ===============================
            // 5️⃣ UPDATE LOAN
            // ===============================
            await updateDoc(doc(db, "loans", loan!.id), {
                amount: newPrincipal,
                tenure: paidEmis.length + topUpTenure,
                originalEmi: loan!.originalEmi || loan!.emi,
                topUpEmi: newEmi,
                emi: newEmi, // FIX: Update main EMI to new value so Loan Card and Dashboard show correct current EMI
                interestRate: topUpInterestRate, // Update global Interest Rate? Or keep old? Usually Top-Up resets rate for whole.
                repaymentSchedule: newSchedule,
                amortizationSchedule: amortizationSchedule,
                emiDueDay,
                processingFee: (loan!.processingFee || 0) + processingFee,
                lastTopUpDate: topUpDate,
                topUpHistory: [
                    ...(loan!.topUpHistory || []),
                    {
                        date: topUpDate,
                        topUpAmount,
                        outstandingBefore: outstandingPrincipal,
                        newEmi,
                        tenure: topUpTenure,
                        processingFee
                    }
                ]
            });

            // ===============================
            // 6️⃣ LEDGER ENTRY
            // ===============================
            await addDoc(collection(db, "ledger"), {
                date: topUpDate,
                companyId: currentCompany?.id,
                loanId: loan!.id,
                customerId: loan!.customerId,
                narration: `Top-up loan disbursement for Loan ${loan!.id}`,
                entries: [
                    { type: "Debit", account: "Loan Outstanding", amount: topUpAmount },
                    { type: "Credit", account: "Cash / Bank", amount: topUpAmount - processingFee },
                    { type: "Credit", account: "Processing Fee Income", amount: processingFee }
                ]
            });

            alert(`Top-up successful! New EMI: Rs. ${newEmi}`);

            // Generate Message
            const message = generateTopUpMessage({
                customerName: loan!.customerName,
                loanId: loan!.id,
                outstanding: outstandingPrincipal,
                topUpAmount,
                newEmi,
                tenure: topUpTenure,
                firstEmiDate: firstEmiDate.toISOString().split("T")[0],
                companyName: companyDetails.name
            });
            console.log("Top-up Message:", message);
            // In a real app, you would verify this with a backend API call here
            // await sendSMS(customer.phone, message);

            // Save PDF
            const firstEmiDateStr = firstEmiDate.toISOString().split("T")[0];
            generateTopUpAgreementPDF(newPrincipal, newEmi, topUpTenure, topUpDate, firstEmiDateStr, processingFee, topUpAmount, 'save');

            setIsTopUpModalOpen(false);
            setTopUpAmount(0);
            setTopUpTenure(12);

            fetchLoanAndCustomer();
        } catch (err) {
            console.error(err);
            alert("Top-up failed");
        } finally {
            setIsToppingUp(false);
        }
    };

    const generateLoanAgreementPDF = async (mode: 'save' | 'preview' = 'save') => {
        if (!loan || !customer) return;
        setIsGeneratingAgreement(true);
        try {
            const pdfDoc = new jsPDF();

            let customerPhotoBase64 = null;
            if (customer.photo_url) {
                try {
                    customerPhotoBase64 = await toBase64(customer.photo_url);
                } catch (e) { }
            } else if (customer.avatar) {
                try {
                    customerPhotoBase64 = await toBase64(customer.avatar);
                } catch (e) { }
            }

            // Header
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setFontSize(18);
            pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
            pdfDoc.setFontSize(14);
            pdfDoc.text("LOAN AGREEMENT", pdfDoc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });

            const agreementDate = loan.disbursalDate ? safeFormatDate(loan.disbursalDate, 'do MMMM yyyy') : format(new Date(), 'do MMMM yyyy');
            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.text(`Date: ${agreementDate}`, pdfDoc.internal.pageSize.getWidth() - 15, 20, { align: 'right' });
            pdfDoc.text(`Loan ID: ${loan.id}`, pdfDoc.internal.pageSize.getWidth() - 15, 26, { align: 'right' });

            let startY = 40;
            const partiesBody = [[`This agreement is made between:\n\nTHE LENDER:\n${companyDetails.name}\n${companyDetails.address || '[Company Address]'}\n\nAND\n\nTHE BORROWER:\n${loan.customerName}\n${(customer as any).address || 'Address not provided'}\nMobile: ${(customer as any).phone || 'N/A'}`]];

            // Using autoTable for parties layout
            autoTable(pdfDoc, {
                startY: startY,
                head: [['PARTIES INVOLVED']],
                body: partiesBody,
                theme: 'plain',
                headStyles: { fontStyle: 'bold', textColor: '#000', halign: 'center', fillColor: undefined },
                styles: { fontSize: 9, cellPadding: 3, font: 'helvetica' },
                didDrawCell: (data: any) => {
                    if (data.section === 'body' && customerPhotoBase64) {
                        pdfDoc.addImage(customerPhotoBase64, 'JPEG', pdfDoc.internal.pageSize.getWidth() - 45, startY + 20, 30, 30);
                    }
                }
            });

            startY = (pdfDoc as any).lastAutoTable.finalY + 8;

            pdfDoc.setFontSize(12);
            pdfDoc.setFont("helvetica", "bold");
            const agreementTitle = loan.topUpHistory && loan.topUpHistory.length > 0 ? "LOAN SUMMARY (TOP-UP UPDATED)" : "LOAN SUMMARY";
            pdfDoc.text(agreementTitle, 14, startY);
            startY += 4;

            const totalRepayment = loan.emi * loan.tenure;
            const totalInterest = totalRepayment - loan.amount;

            const summaryBody = [
                [{ content: 'Loan Amount (Principal)', styles: { fontStyle: 'bold' } }, `${formatCurrency(loan.amount)} (${toWords(loan.amount)} Only)`],
                [{ content: 'Loan Tenure', styles: { fontStyle: 'bold' } }, `${loan.tenure} Months`],
                [{ content: 'EMI', styles: { fontStyle: 'bold' } }, formatCurrency(loan.emi)],
                [{ content: 'Processing Fee', styles: { fontStyle: 'bold' } }, formatCurrency(loan.processingFee || 0)],
                [{ content: 'Total Interest Payable', styles: { fontStyle: 'bold' } }, formatCurrency(totalInterest)],
                [{ content: 'Total Amount Repayable', styles: { fontStyle: 'bold' } }, formatCurrency(totalRepayment)],
                [{ content: 'Disbursal Date', styles: { fontStyle: 'bold' } }, safeFormatDate(loan.disbursalDate, 'do MMMM yyyy')],
            ];

            if (loan.topUpHistory && loan.topUpHistory.length > 0) {
                const lastTopUp = loan.topUpHistory[loan.topUpHistory.length - 1];
                summaryBody.push(
                    [{ content: 'Last Top-Up Amount', styles: { fontStyle: 'bold' as 'bold' } }, formatCurrency((lastTopUp as any).topUpAmount || lastTopUp.amount)],
                    [{ content: 'Last Top-Up Date', styles: { fontStyle: 'bold' as 'bold' } }, safeFormatDate(lastTopUp.date)]
                );
            }

            autoTable(pdfDoc, {
                startY: startY,
                body: summaryBody as any,
                theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2, font: 'helvetica' },
            });

            startY = (pdfDoc as any).lastAutoTable.finalY + 8;

            if ((customer as any).guarantor && (customer as any).guarantor.name) {
                pdfDoc.setFontSize(12);
                pdfDoc.setFont("helvetica", "bold");
                pdfDoc.text("GUARANTOR DETAILS", 14, startY);
                startY += 4;
                autoTable(pdfDoc, {
                    startY: startY,
                    body: [
                        [{ content: 'Name', styles: { fontStyle: 'bold' } }, (customer as any).guarantor.name],
                        [{ content: 'Relation', styles: { fontStyle: 'bold' } }, (customer as any).guarantor.relation],
                        [{ content: 'Mobile', styles: { fontStyle: 'bold' } }, (customer as any).guarantor.mobile],
                        [{ content: 'Address', styles: { fontStyle: 'bold' } }, (customer as any).guarantor.address],
                    ],
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 2, font: 'helvetica' },
                });
                startY = (pdfDoc as any).lastAutoTable.finalY + 8;
            }

            pdfDoc.addPage();
            startY = 20;
            pdfDoc.setFontSize(12);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text("TERMS & CONDITIONS", 14, startY);
            startY += 8;

            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "normal");

            const clauses = [
                "The Borrower agrees to repay the loan amount along with interest in the form of EMIs as specified in the loan summary.",
                "All payments shall be made on or before the due date of each month.",
                "In case of a delay in payment of EMI, a penal interest/late fee as per the company's prevailing policy will be charged.",
                "Default in repayment of three or more consecutive EMIs shall entitle the Lender to recall the entire loan amount and initiate legal proceedings for recovery.",
                "The Borrower confirms that all information provided in the loan application is true and correct.",
                "This loan is unsecured. No collateral has been provided by the Borrower.",
                "Any disputes arising out of this agreement shall be subject to the jurisdiction of the courts.",
            ];

            clauses.forEach((clause, index) => {
                const splitText = pdfDoc.splitTextToSize(`${index + 1}. ${clause}`, 180);
                pdfDoc.text(splitText, 14, startY);
                startY += (splitText.length * 6) + 4;
            });

            // Add photo on page 2
            if (customerPhotoBase64) {
                const photoSize = 60;
                const pageWidth = pdfDoc.internal.pageSize.getWidth();
                const photoX = (pageWidth / 2) - (photoSize / 2);
                const photoY = startY + 10;
                if (photoY + photoSize < pdfDoc.internal.pageSize.getHeight() - 70) {
                    pdfDoc.addImage(customerPhotoBase64, 'JPEG', photoX, photoY, photoSize, photoSize);
                    pdfDoc.setFontSize(9);
                    pdfDoc.text(loan.customerName, pageWidth / 2, photoY + photoSize + 7, { align: 'center' });
                }
            }

            startY = pdfDoc.internal.pageSize.getHeight() - 50;
            pdfDoc.text("IN WITNESS WHEREOF, the parties have executed this agreement.", 14, startY);
            startY += 20;
            pdfDoc.line(20, startY, 80, startY);
            pdfDoc.line(130, startY, 190, startY);
            startY += 5;
            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(`For ${companyDetails.name}`, 50, startY, { align: 'center' });
            pdfDoc.text("Borrower's Signature", 160, startY, { align: 'center' });

            if (mode === 'preview' && !Capacitor.isNativePlatform()) {
                window.open(pdfDoc.output('bloburl'), '_blank');
            } else {
                await savePdf(pdfDoc, `Loan_Agreement_${loan.id}.pdf`);
            }
        } catch (error) {
            console.error("Failed to generate agreement PDF:", error);
            alert("Failed to generate Agreement PDF");
        } finally {
            setIsGeneratingAgreement(false);
        }
    };

    const generateTopUpAgreementPDF = async (newPrincipal: number, newEmi: number, newTenure: number, topUpDate: string, firstEmiDateStr: string, processingFee: number, topUpAmountVal: number, mode: 'save' | 'preview' = 'save') => {
        if (!loan) return;
        setIsGeneratingAgreement(true);
        try {
            const pdfDoc = new jsPDF();

            pdfDoc.setFontSize(18);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

            pdfDoc.setFontSize(14);
            pdfDoc.text("LOAN TOP-UP AGREEMENT", pdfDoc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });

            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "normal");
            let y = 40;

            pdfDoc.text(`Agreement Date: ${safeFormatDate(topUpDate, 'PPP')}`, 14, y);
            y += 8;
            pdfDoc.text(`Loan ID: ${loan.id}`, 14, y);
            y += 8;
            pdfDoc.text(`Customer Name: ${loan.customerName}`, 14, y);
            y += 15;

            // --- 1. PREVIOUS LOAN DETAILS (Crossed Out) ---
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setTextColor(150, 0, 0); // Dark Red
            pdfDoc.text("PREVIOUS LOAN DETAILS (CANCELLED)", 14, y);
            pdfDoc.setTextColor(0, 0, 0); // Reset
            y += 6;

            const oldDetailsBody = [
                ["Item", "Details"],
                ["Old EMI", formatCurrency(loan.emi)], // Current EMI before update
                ["Outstanding Principal (Before Top-Up)", formatCurrency(outstandingPrincipal)],
                ["Remaining Tenure (Approx)", `${loan.tenure - paidEmisCount} Months`]
            ];

            autoTable(pdfDoc, {
                startY: y,
                body: oldDetailsBody,
                theme: 'grid',
                headStyles: { fillColor: [200, 200, 200], textColor: [100, 100, 100] }, // Grey header
                styles: { textColor: [100, 100, 100] }, // Grey text
                didDrawCell: (data) => {
                    // Strikethrough effect
                    if (data.section === 'body') {
                        const { x, y, width, height } = data.cell;
                        const lineY = y + height / 2;
                        pdfDoc.setDrawColor(200, 50, 50); // Red line
                        pdfDoc.setLineWidth(0.5);
                        pdfDoc.line(x + 2, lineY, x + width - 2, lineY);
                    }
                }
            });

            y = (pdfDoc as any).lastAutoTable.finalY + 15;

            // --- 2. NEW LOAN DETAILS ---
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setTextColor(0, 100, 0); // Dark Green
            pdfDoc.text("NEW TOP-UP LOAN DETAILS (EFFECTIVE)", 14, y);
            pdfDoc.setTextColor(0, 0, 0);
            y += 6;

            const newDetailsBody = [
                ["Item", "Details"],
                ["Top-up Amount Added", formatCurrency(topUpAmountVal)],
                ["New Principal Amount", formatCurrency(newPrincipal)],
                ["New EMI Amount", formatCurrency(newEmi)],
                ["New Total Tenure", `${newTenure + paidEmisCount} Months (Total)`],
                ["Incremental Tenure", `${newTenure} Months`],
                ["Processing Fee", formatCurrency(processingFee)],
                ["First New EMI Date", safeFormatDate(firstEmiDateStr)]
            ];

            autoTable(pdfDoc, {
                startY: y,
                body: newDetailsBody,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { cellWidth: 80 } },
            });

            y = (pdfDoc as any).lastAutoTable.finalY + 15;

            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text("TERMS AND CONDITIONS:", 14, y);
            y += 8;
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.setFontSize(9);

            TOPUP_TERMS.forEach(term => {
                pdfDoc.text(term, 14, y);
                y += 6;
            });

            y += 20;
            pdfDoc.setFontSize(10);
            pdfDoc.text("_______________________", 14, y);
            pdfDoc.text("_______________________", 120, y);
            y += 5;
            pdfDoc.text("Borrower Signature", 14, y);
            pdfDoc.text("Authorized Signatory", 120, y);

            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });

            if (mode === 'preview' && !Capacitor.isNativePlatform()) {
                window.open(pdfDoc.output('bloburl'), '_blank');
            } else {
                await savePdf(pdfDoc, `TopUp_Agreement_${loan.id}_${format(new Date(), 'yyyyMMdd')}.pdf`);
            }
        } catch (error) {
            console.error("Failed to generate agreement PDF:", error);
        } finally {
            setIsGeneratingAgreement(false);
        }
    };

    const generateLoanCardPDF = async (mode: 'save' | 'preview' = 'save') => {
        if (!loan) return;
        try {
            const pdfDoc = new jsPDF();
            const pageWidth = pdfDoc.internal.pageSize.width;
            let y = 15;

            let customerPhotoBase64 = null;
            if (customer?.photo_url) {
                try {
                    customerPhotoBase64 = await toBase64(customer.photo_url);
                } catch (e) { }
            }

            pdfDoc.setFontSize(18);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(companyDetails.name, pageWidth / 2, y, { align: 'center' });
            y += 8;
            pdfDoc.setFontSize(12);
            pdfDoc.text('Loan Summary Card', pageWidth / 2, y, { align: 'center' });

            // Show Top-Up Status (Same as LoanDetails)
            if (loan.topUpHistory && loan.topUpHistory.length > 0) {
                pdfDoc.setFillColor(220, 38, 38); // Red
                pdfDoc.rect(pageWidth - 70, y - 5, 25, 6, 'F');
                pdfDoc.setTextColor(255, 255, 255);
                pdfDoc.setFontSize(8);
                pdfDoc.text("TOP-UP ACTIVE", pageWidth - 57.5, y - 1, { align: 'center' });
                pdfDoc.setTextColor(0, 0, 0);
            }

            if (customerPhotoBase64) {
                pdfDoc.addImage(customerPhotoBase64, 'JPEG', pageWidth - 35, y - 8, 20, 20);
            }
            y += 17;

            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.setFontSize(10);

            const details = [
                [{ label: "Customer Name", value: loan.customerName }, { label: "Loan ID", value: loan.id }],
                [{ label: "Loan Amount", value: formatCurrency(loan.amount) }, { label: "Tenure", value: `${loan.tenure} Months` }],
                [{ label: "Monthly EMI", value: formatCurrency(loan.emi) }, { label: "Disbursal Date", value: safeFormatDate(loan.disbursalDate) }],
            ];

            details.forEach(row => {
                pdfDoc.setFont(undefined, "bold"); pdfDoc.text(`${row[0].label}:`, 15, y);
                pdfDoc.setFont(undefined, "normal"); pdfDoc.text(String(row[0].value), 50, y);
                if (row[1]) {
                    pdfDoc.setFont(undefined, "bold"); pdfDoc.text(`${row[1].label}:`, 110, y);
                    pdfDoc.setFont(undefined, "normal"); pdfDoc.text(String(row[1].value), 145, y);
                }
                y += 7;
            });
            y += 3;

            // Schedule
            const head = [["No", "Due Date", "Amount", "Principal", "Interest", "Balance"]];
            const body: any[] = [];

            if (detailedRepaymentSchedule && detailedRepaymentSchedule.length > 0) {
                // Use the detailed schedule already calculated in this component
                detailedRepaymentSchedule.forEach(emi => {
                    body.push([
                        emi.month,
                        safeFormatDate(emi.dueDate),
                        formatCurrency(emi.totalPayment),
                        emi.type === 'OLD EMI' ? '-' : formatCurrency(emi.principal),
                        emi.type === 'OLD EMI' ? '-' : formatCurrency(emi.interest),
                        emi.type === 'OLD EMI' ? '-' : formatCurrency(emi.balance)
                    ]);
                });
            } else if (loan.amortizationSchedule) {
                loan.amortizationSchedule.forEach(row => {
                    body.push([
                        row.emiNo,
                        safeFormatDate(row.dueDate),
                        formatCurrency(row.emi),
                        formatCurrency(row.principal),
                        formatCurrency(row.interest),
                        formatCurrency(row.closingBalance)
                    ]);
                });
            }

            autoTable(pdfDoc, { head, body, startY: y, theme: 'grid', headStyles: { fillColor: [41, 128, 185] } });

            if (mode === 'preview' && !Capacitor.isNativePlatform()) {
                window.open(pdfDoc.output('bloburl'), '_blank');
            } else {
                await savePdf(pdfDoc, `LoanCard_${loan.id}.pdf`);
            }
        } catch (error) {
            console.error("Failed to generate loan card:", error);
        }
    };

    const generateUpdatedLoanCardPDF = async (newAmount: number, newEmi: number, newTenure: number, mode: 'save' | 'preview' = 'save') => {
        if (!loan) return;
        try {
            const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54] });

            pdfDoc.setFillColor(30, 64, 175);
            pdfDoc.rect(0, 0, 85.6, 20, 'F');

            pdfDoc.setTextColor(255, 255, 255);
            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(companyDetails.name, 42.8, 8, { align: 'center' });
            pdfDoc.setFontSize(6);
            pdfDoc.text("LOAN CARD (TOP-UP)", 42.8, 14, { align: 'center' });

            pdfDoc.setTextColor(0, 0, 0);
            pdfDoc.setFontSize(8);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(loan.customerName, 5, 28);

            pdfDoc.setFontSize(6);
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.text(`Loan ID: ${loan.id}`, 5, 34);
            pdfDoc.text(`Amount: ${formatCurrency(newAmount)}`, 5, 39);
            pdfDoc.text(`EMI: ${formatCurrency(newEmi)}`, 5, 44);
            pdfDoc.text(`Tenure: ${newTenure} months`, 45, 39);
            pdfDoc.text(`Rate: ${loan.interestRate}% p.a.`, 45, 44);

            pdfDoc.setFontSize(5);
            pdfDoc.setTextColor(100);
            pdfDoc.text(`Generated: ${format(new Date(), 'dd-MMM-yyyy')}`, 5, 51);

            if (mode === 'preview' && !Capacitor.isNativePlatform()) {
                window.open(pdfDoc.output('bloburl'), '_blank');
            } else {
                await savePdf(pdfDoc, `LoanCard_TopUp_${loan.id}_${format(new Date(), 'yyyyMMdd')}.pdf`);
            }
        } catch (error) {
            console.error("Failed to generate updated loan card:", error);
        }
    };

    const handleDownloadSchedule = async () => {
        if (!loan) return;
        setIsDownloadingSchedule(true);
        try {
            const pdfDoc = new jsPDF();

            pdfDoc.setFontSize(18);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            pdfDoc.setFontSize(14);
            pdfDoc.text('Loan Repayment Schedule', pdfDoc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });

            pdfDoc.setFontSize(10);
            let contentStartY = 40;
            pdfDoc.text(`Customer: ${loan.customerName}`, 15, contentStartY);
            contentStartY += 7;
            pdfDoc.text(`Loan ID: ${loan.id}`, 15, contentStartY);
            contentStartY += 8;

            const tableColumn = ["EMI No.", "Due Date", "Principal", "Interest", "Total EMI", "Balance", "Paid Date", "Status", "Type"];
            const tableRows: (string | number)[][] = [];

            detailedRepaymentSchedule.forEach(emi => {
                const emiData = [
                    `${emi.month}/${loan.tenure}`,
                    safeFormatDate(emi.dueDate),
                    emi.type === 'OLD EMI' ? '-' : formatCurrency(emi.principal),
                    emi.type === 'OLD EMI' ? '-' : formatCurrency(emi.interest),
                    formatCurrency(emi.totalPayment),
                    emi.type === 'OLD EMI' ? '-' : formatCurrency(emi.balance),
                    safeFormatDate(emi.paymentDate),
                    emi.status,
                    emi.type
                ];
                tableRows.push(emiData);
            });

            // Add Top-Up Summary at the top of PDF content
            if (loan.topUpHistory && loan.topUpHistory.length > 0) {
                pdfDoc.setFontSize(10);
                pdfDoc.setTextColor(192, 57, 43); // Red color
                const lastTopUp = loan.topUpHistory[loan.topUpHistory.length - 1];
                pdfDoc.text(`*** LOAN TOP-UP ACTIVE ***`, 150, 30);
                pdfDoc.setFontSize(8);
                pdfDoc.setTextColor(0);
                // Fix: use .topUpAmount instead of .amount
                pdfDoc.text(`Top-Up Amount: ${formatCurrency(lastTopUp.topUpAmount)} | Date: ${safeFormatDate(lastTopUp.date)}`, 150, 35);
            }

            autoTable(pdfDoc, {
                head: [tableColumn],
                body: tableRows,
                startY: contentStartY,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] },
                styles: { font: "helvetica", fontSize: 8 },
            });

            const pageCount = (pdfDoc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdfDoc.setPage(i);
                pdfDoc.setFontSize(8);
                pdfDoc.setTextColor(150);
                pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
                pdfDoc.text(`Page ${i} of ${pageCount}`, pdfDoc.internal.pageSize.getWidth() - 20, 287);
            }

            await savePdf(pdfDoc, `Payment_Schedule_${loan.id}.pdf`);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert('Download failed.');
        } finally {
            setIsDownloadingSchedule(false);
        }
    };

    const handleDownloadReceipt = async (emi: any) => {
        if (!loan) return;
        setIsDownloadingReceipt(emi.month);
        try {
            const receiptData = loan.repaymentSchedule.find(e => e.emiNumber === emi.month);
            if (!receiptData || !loan.customerId || !loan.customerName) {
                alert('Cannot generate receipt: Missing data.');
                setIsDownloadingReceipt(null);
                return;
            }

            const pdfDoc = new jsPDF();

            const customerRef = doc(db, "customers", loan.customerId);
            const customerSnap = await getDoc(customerRef);
            const customerData = customerSnap.exists() ? customerSnap.data() : {};

            let customerPhotoBase64 = null;
            if (customerData?.photo_url) {
                try {
                    customerPhotoBase64 = await toBase64(customerData.photo_url);
                } catch (e) {
                    // Ignore image error
                }
            }

            let y = 15;

            pdfDoc.setFontSize(18);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
            y += 10;
            pdfDoc.setFontSize(14);
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.text("Payment Receipt", pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

            if (customerPhotoBase64) {
                pdfDoc.addImage(customerPhotoBase64, 'JPEG', pdfDoc.internal.pageSize.getWidth() - 35, y - 5, 20, 20);
            }

            y += 15;

            pdfDoc.setFontSize(11);
            pdfDoc.text(`Receipt ID: RCPT-${loan.id}-${emi.month}`, 14, y);
            y += 7;
            pdfDoc.text(`Payment Date: ${safeFormatDate(receiptData.paymentDate, 'PPP')}`, 14, y);
            y += 8;
            pdfDoc.line(14, y, 196, y);
            y += 10;

            pdfDoc.text(`Customer Name: ${loan.customerName}`, 14, y);
            if (customerData?.phone) { y += 7; pdfDoc.text(`Mobile: ${customerData.phone}`, 14, y); }
            if (customerData?.address) { y += 7; pdfDoc.text(`Address: ${customerData.address}`, 14, y); }
            y += 7;
            pdfDoc.text(`Loan ID: ${loan.id}`, 14, y);
            y += 8;
            pdfDoc.line(14, y, 196, y);
            y += 7;

            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text("Description", 14, y);
            pdfDoc.text("Amount", 180, y, { align: 'right' });
            y += 8;
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.text(`EMI Payment (No. ${emi.month}/${loan.tenure})`, 14, y);
            pdfDoc.text(formatCurrency(loan.emi), 180, y, { align: 'right' });
            y += 10;

            pdfDoc.line(14, y, 196, y);
            y += 7;
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text("Total Paid:", 130, y);
            pdfDoc.text(formatCurrency(receiptData?.amountPaid || loan.emi), 180, y, { align: 'right' });
            y += 13;

            const paymentMethod = receiptData?.paymentMethod || 'N/A';
            pdfDoc.text(`Payment Method: ${paymentMethod.toUpperCase()}`, 14, y);

            const pageCount = (pdfDoc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdfDoc.setPage(i);
                pdfDoc.setFontSize(8);
                pdfDoc.setTextColor(150);
                pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
                pdfDoc.text(`Page ${i} of ${pageCount}`, pdfDoc.internal.pageSize.getWidth() - 20, 287);
            }

            await savePdf(pdfDoc, `Receipt_${loan.id}_EMI_${emi.month}.pdf`);
        } catch (error: any) {
            console.error("Failed to generate PDF:", error);
            alert('Receipt download failed.');
        } finally {
            setIsDownloadingReceipt(null);
        }
    }

    const StatusBadge = ({ status }: { status: string }) => {
        let classes = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ";
        if (status === 'Approved') classes += "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-400";
        else if (status === 'Disbursed' || status === 'Active') classes += "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400";
        else if (status === 'Completed') classes += "bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/30 dark:text-purple-400";
        else if (status === 'Rejected' || status === 'Overdue') classes += "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400";
        else classes += "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";

        return <span className={classes}>{status}</span>;
    };

    const downloadAmortizationPDF = async () => {
        if (!loan || !loan.amortizationSchedule) {
            alert("Amortization data not found");
            return;
        }

        const pdf = new jsPDF();

        // ===== HEADER =====
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text(companyDetails.name, 105, 15, { align: "center" });

        pdf.setFontSize(12);
        pdf.text("Loan Amortization Schedule", 105, 25, { align: "center" });

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");

        let y = 40;
        pdf.text(`Customer: ${loan.customerName}`, 14, y);
        y += 6;
        pdf.text(`Loan ID: ${loan.id}`, 14, y);
        y += 6;
        pdf.text(`Interest Rate: ${loan.interestRate}%`, 14, y);
        y += 6;
        pdf.text(`EMI: ${formatCurrency(loan.topUpEmi || loan.emi)}`, 14, y);
        y += 10;

        // ===== TABLE =====
        const tableHead = [
            ["EMI#", "Opening", "EMI", "Interest", "Principal", "Closing", "Due Date"]
        ];

        const tableBody = loan.amortizationSchedule.map(row => ([
            row.emiNo,
            formatCurrency(row.openingBalance),
            formatCurrency(row.emi),
            formatCurrency(row.interest),
            formatCurrency(row.principal),
            formatCurrency(row.closingBalance),
            safeFormatDate(row.dueDate)
        ]));

        autoTable(pdf, {
            startY: y,
            head: tableHead,
            body: tableBody,
            styles: { fontSize: 8 },
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185] }
        });

        // ===== FOOTER =====
        const pageCount = (pdf as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text(
                `© ${new Date().getFullYear()} ${companyDetails.name}`,
                105,
                290,
                { align: "center" }
            );
        }

        savePdf(pdf, `Amortization_${loan.id}.pdf`);
    };

    const undoLastTopUp = async () => {
        if (!loan || !loan.topUpHistory || loan.topUpHistory.length === 0) {
            alert("No top-up to undo");
            return;
        }

        if (!confirm("Are you sure you want to undo the last top-up?")) return;

        try {
            const lastTopUp = loan.topUpHistory[loan.topUpHistory.length - 1];

            // =========================
            // 1️⃣ RESTORE OLD VALUES
            // =========================
            const restoredAmount = lastTopUp.outstandingBefore;
            // If historical original EMI is not preserved, we assume current 'emi' was the top-up emi,
            // so we fallback to originalEmi field.
            const restoredEmi = loan.originalEmi || loan.emi;

            const paidEmis = loan.repaymentSchedule.filter(e => e.status === "Paid");

            // =========================
            // 2️⃣ REBUILD OLD SCHEDULE
            // =========================

            // Determine the start date for the restored schedule
            let nextDueDate = new Date();
            const emiDueDay = loan.emiDueDay || 1;

            if (paidEmis.length > 0) {
                // If EMIs were paid, the next one is 1 month after the last paid/due date
                const lastPaidEmi = paidEmis[paidEmis.length - 1];
                const lastDueDate = new Date(lastPaidEmi.dueDate);
                if (!isNaN(lastDueDate.getTime())) {
                    nextDueDate = new Date(lastDueDate);
                    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                    // Keep the same day of month if possible
                    // nextDueDate.setDate(emiDueDay); // Optional: Strict enforcement
                }
            } else {
                // If no EMIs paid, fallback to simple logic (next month from now? Or original start?)
                // Since we don't have original start date stored easily if it was long ago, 
                // we'll assume 'next month' from today is a safe fallback for a blank slate,
                // OR better: derive from Disbursal Date if close?
                // Let's stick to "Next Month from Today" if completely fresh, 
                // BUT better: check 'lastTopUp.date'. The schedule should resume from *that* point if we undo immediately?
                // Actually, if zero paid, it means it's a fresh loan. 
                // We should probably just use the current 'Pending' date?
                // Let's use the Date of the First Pending EMI in the *current* schedule as a proxy if available, 
                // assuming Undo happens quickly.
                const firstPendingCurrent = loan.repaymentSchedule.find(e => e.status === 'Pending');
                if (firstPendingCurrent) {
                    nextDueDate = new Date(firstPendingCurrent.dueDate);
                } else {
                    const today = new Date();
                    nextDueDate = new Date(today.getFullYear(), today.getMonth() + 1, emiDueDay);
                }
            }

            // Calculate remaining tenure for restored amount
            const monthlyRate = (loan.interestRate || 18) / 12 / 100;
            // Robust calculation:
            // If restoredEmi is 0 or invalid, this crashes. Ensure restoredEmi > 0.
            const validEmi = restoredEmi > 0 ? restoredEmi : (restoredAmount * 0.02); // Fallback

            const numPendingEmis = Math.ceil(
                -Math.log(1 - (monthlyRate * restoredAmount) / validEmi) / Math.log(1 + monthlyRate)
            );

            const safePending = (isFinite(numPendingEmis) && numPendingEmis > 0) ? numPendingEmis : 12; // Fallback 12 if calculation fails (infinite tenure)
            const remainingTenure = safePending;

            const restoredSchedule: Emi[] = [...paidEmis];

            for (let i = 0; i < remainingTenure; i++) {
                const d = new Date(nextDueDate);
                d.setMonth(d.getMonth() + i);

                restoredSchedule.push({
                    emiNumber: paidEmis.length + i + 1,
                    dueDate: d.toISOString().split("T")[0],
                    amount: restoredEmi,
                    status: "Pending"
                });
            }

            // =========================
            // 3️⃣ UPDATE FIRESTORE
            // =========================
            await updateDoc(doc(db, "loans", loan.id), {
                amount: restoredAmount,
                emi: restoredEmi,
                topUpEmi: deleteField(),
                tenure: paidEmis.length + remainingTenure,
                repaymentSchedule: restoredSchedule,
                amortizationSchedule: deleteField(),
                lastTopUpDate: deleteField(),
                topUpHistory: loan.topUpHistory.slice(0, -1)
            });

            // =========================
            // 4️⃣ LEDGER REVERSAL ENTRY
            // =========================
            await addDoc(collection(db, "ledger"), {
                date: new Date().toISOString(),
                companyId: currentCompany?.id,
                loanId: loan.id,
                customerId: loan.customerId,
                narration: `Top-up rollback for Loan ${loan.id}`,
                entries: [
                    {
                        type: "Credit",
                        account: "Loan Outstanding",
                        amount: lastTopUp.topUpAmount || lastTopUp.amount || 0
                    },
                    {
                        type: "Debit",
                        account: "Cash / Bank",
                        amount: (lastTopUp.topUpAmount || lastTopUp.amount || 0) - (lastTopUp.processingFee || 0)
                    },
                    {
                        type: "Debit",
                        account: "Processing Fee Income",
                        amount: lastTopUp.processingFee || 0
                    }
                ]
            });

            alert("Last top-up successfully undone");
            fetchLoanAndCustomer();

        } catch (err) {
            console.error(err);
            alert("Undo failed: " + err);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>;
    }

    if (!loan) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-4">
                <h2 className="text-xl font-bold mb-2">Loan Not Found</h2>
                <button onClick={() => navigate('/loans')} className="px-4 py-2 bg-primary text-white rounded-lg">Back to Loans</button>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen pb-10 text-slate-900 dark:text-white font-sans overflow-x-hidden">
            {/* Background Decor */}
            <div className="fixed inset-0 pointer-events-none -z-10">
                <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-indigo-50/50 via-purple-50/30 to-transparent dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-transparent"></div>
                <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[100px]"></div>
                <div className="absolute top-[20%] left-[-10%] w-[300px] h-[300px] rounded-full bg-purple-500/5 blur-[100px]"></div>
            </div>

            {/* Top Bar */}
            <div className="sticky top-0 z-30 flex items-center justify-between px-6 pb-4 glass border-b border-white/20 dark:border-slate-800/50 print:hidden"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
                <button onClick={() => navigate(-1)} className="group flex items-center gap-2 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-all active:scale-95">
                    <span className="material-symbols-outlined transition-transform group-hover:-translate-x-1">arrow_back</span>
                    <span className="font-bold text-sm hidden sm:inline">Back</span>
                </button>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">Loan Details</h1>
                <div className="flex gap-2">
                    <button onClick={() => navigate(`/loans/edit/${loanId}`)} className="p-2.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 transition-all hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95" title="Edit Loan">
                        <span className="material-symbols-outlined">edit</span>
                    </button>
                    <button onClick={handleDownloadSchedule} disabled={isDownloadingSchedule} className="p-2.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 transition-all hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95" title="Download Schedule">
                        {isDownloadingSchedule ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div> : <span className="material-symbols-outlined">calendar_month</span>}
                    </button>
                    <button onClick={() => generateLoanCardPDF('save')} className="p-2.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 transition-all hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95" title="Download Loan Card">
                        <span className="material-symbols-outlined">id_card</span>
                    </button>
                    <button onClick={() => generateLoanAgreementPDF('save')} disabled={isGeneratingAgreement} className="p-2.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 transition-all hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95" title="Download Agreement">
                        {isGeneratingAgreement ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div> : <span className="material-symbols-outlined">description</span>}
                    </button>
                    <button onClick={() => window.print()} className="p-2.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 transition-all hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95" title="Print">
                        <span className="material-symbols-outlined">print</span>
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

                {/* Actions Bar */}
                {loan.status === 'Disbursed' && (
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar print:hidden">
                        <button
                            onClick={() => setIsPrecloseModalOpen(true)}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-bold text-sm hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">cancel</span> Pre-close Loan
                        </button>
                        <button
                            onClick={() => setIsTopUpModalOpen(true)}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold text-sm hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">trending_up</span> Top-up Loan
                        </button>

                    </div>
                )}

                {/* Undo Top-Up Button (Only if Top-Up History exists) */}
                {loan && loan.topUpHistory && loan.topUpHistory.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar print:hidden mt-2">
                        <button
                            onClick={undoLastTopUp}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-bold text-sm hover:bg-orange-200 dark:hover:bg-orange-900/40 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">undo</span> Undo Last Top-Up
                        </button>
                    </div>
                )}

                {/* Undo Foreclosure for Completed Loans */}
                {loan.status === 'Completed' && (loan as any).foreclosureDetails && (
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar print:hidden">
                        <button
                            onClick={handleUndoForeclosure}
                            disabled={isUndoingForeclosure}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-bold text-sm hover:bg-orange-200 dark:hover:bg-orange-900/40 transition-colors disabled:opacity-50"
                        >
                            {isUndoingForeclosure ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-700 border-t-transparent"></div>
                            ) : (
                                <span className="material-symbols-outlined text-[18px]">undo</span>
                            )}
                            Undo Foreclosure
                        </button>
                    </div>
                )}

                {/* Main Info Card */}
                <div className="glass-card rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-indigo-500/10 transition-shadow duration-300">
                    <div className="p-6 border-b border-slate-100/50 dark:border-slate-700/50 flex justify-between items-start bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-800/30">
                        <div className="flex items-center gap-5">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <LazyImage
                                    src={customer?.photo_url || customer?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.customerName)}&background=random`}
                                    alt={loan.customerName}
                                    className="relative h-16 w-16 rounded-full object-cover border-4 border-white dark:border-slate-800 shadow-md group-hover:scale-105 transition-transform duration-300"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight truncate leading-tight mb-1">{loan.customerName}</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                                    <span>ID: <span className="font-semibold">{loan.id}</span></span>
                                </p>
                            </div>
                        </div>
                        <div className="shrink-0 ml-2">
                            <StatusBadge status={loan.status} />
                        </div>
                    </div>
                    <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-6">
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Loan Amount</span>
                            <div className="text-xl font-bold text-slate-900 dark:text-white flex items-baseline gap-1">
                                {formatCurrency(loan.amount)}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Monthly EMI</span>
                            <div className="text-xl font-bold text-slate-900 dark:text-white">
                                {formatCurrency(loan.emi)}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Disbursed Date</span>
                            <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                {safeFormatDate(loan.disbursalDate)}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Interest Rate</span>
                            <div className="text-lg font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50 inline-block px-2 py-0.5 rounded-md">
                                {loan.interestRate}% <span className="text-xs font-normal opacity-70">p.a.</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Tenure</span>
                            <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                {loan.tenure} <span className="text-sm font-normal text-slate-400">Months</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Progress</span>
                            <div className="relative pt-1">
                                <div className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    {paidEmisCount} <span className="text-slate-400">/ {loan.tenure}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: `${(paidEmisCount / loan.tenure) * 100}%` }}></div>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-2 sm:col-span-1 space-y-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">Outstanding</span>
                            <div className="text-2xl font-bold text-red-500 dark:text-red-400 tracking-tight">
                                {formatCurrency(outstandingPrincipal)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Schedule Table */}
                <div className="glass-card rounded-2xl overflow-hidden shadow-lg shadow-indigo-500/5">
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/30 dark:bg-slate-800/20">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500">calendar_month</span>
                            Repayment Schedule
                        </h3>
                        <div className="text-xs font-semibold text-slate-500 px-3 py-1 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                            {detailedRepaymentSchedule.length} Installments
                        </div>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 dark:bg-slate-800/50 tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">Due Date</th>
                                    <th className="px-4 py-3">Principal</th>
                                    <th className="px-4 py-3">Interest</th>
                                    <th className="px-4 py-3">Total</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-center no-print">Receipt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {detailedRepaymentSchedule.length > 0 ? detailedRepaymentSchedule.map((emi) => (
                                    <tr key={emi.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{emi.month}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{safeFormatDate(emi.dueDate)}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(emi.principal)}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(emi.interest)}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{formatCurrency(getEmiAmountForDisplay(emi, loan))}</td>
                                        <td>
                                            {emi.status === "Paid" ? (
                                                <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded">
                                                    OLD EMI
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded">
                                                    TOP-UP EMI
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${emi.status === 'Paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                emi.status === 'Cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                }`}>
                                                {emi.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center no-print">
                                            {emi.receiptDownloadable ? (
                                                <button
                                                    onClick={() => handleDownloadReceipt(emi)}
                                                    disabled={isDownloadingReceipt === emi.month}
                                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                                                >
                                                    {isDownloadingReceipt === emi.month ?
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div> :
                                                        <span className="material-symbols-outlined text-[18px]">download</span>
                                                    }
                                                </button>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                                            No repayment schedule generated yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Amortization Schedule (Optional - Visible if data exists) */}
                {loan.amortizationSchedule && loan.amortizationSchedule.length > 0 && (
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mt-6">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="font-bold text-lg">Amortization Schedule (New Principal)</h3>
                        </div>
                        <div className="overflow-x-auto max-h-64 no-scrollbar">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2">EMI</th>
                                        <th className="px-4 py-2">Opening</th>
                                        <th className="px-4 py-2">EMI</th>
                                        <th className="px-4 py-2">Interest</th>
                                        <th className="px-4 py-2">Principal</th>
                                        <th className="px-4 py-2">Closing</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {loan.amortizationSchedule.map(row => (
                                        <tr key={row.emiNo} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                            <td className="px-4 py-2">{row.emiNo}</td>
                                            <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{formatCurrency(row.openingBalance)}</td>
                                            <td className="px-4 py-2 font-medium">{formatCurrency(row.emi)}</td>
                                            <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{formatCurrency(row.interest)}</td>
                                            <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{formatCurrency(row.principal)}</td>
                                            <td className="px-4 py-2 font-medium">{formatCurrency(row.closingBalance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                            <button
                                onClick={downloadAmortizationPDF}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 transition"
                            >
                                <span className="material-symbols-outlined text-[18px]">download</span> Download Amortization PDF
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Pre-close Modal */}
            {
                isPrecloseModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                        <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                            <h3 className="text-lg font-bold mb-1">Pre-close Loan</h3>
                            <p className="text-sm text-slate-500 mb-4">Calculate foreclosure amount and close loan.</p>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Outstanding Principal</label>
                                    <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white font-mono">
                                        {formatCurrency(outstandingPrincipal)}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Foreclosure Charges (%)</label>
                                    <input
                                        type="number"
                                        value={foreclosureCharges}
                                        onChange={(e) => setForeclosureCharges(Number(e.target.value))}
                                        className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                                    <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Total Payable</span>
                                    <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(foreclosureAmount)}</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <input
                                        type="checkbox"
                                        id="amountReceived"
                                        checked={amountReceived}
                                        onChange={(e) => setAmountReceived(e.target.checked)}
                                        className="w-5 h-5 rounded border-green-400 text-green-600 focus:ring-green-500"
                                    />
                                    <label htmlFor="amountReceived" className="text-sm font-bold text-green-800 dark:text-green-300 cursor-pointer">
                                        Amount Received - Add to Cash
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end flex-wrap">
                                <button onClick={() => setIsPrecloseModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">Cancel</button>
                                <button
                                    onClick={handlePreviewForeclosurePDF}
                                    disabled={!isForeclosureChargesValid || isPreviewingForeclosure}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isPreviewingForeclosure && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                    Preview PDF
                                </button>
                                <button
                                    onClick={handlePrecloseLoan}
                                    disabled={isPreclosing}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isPreclosing && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                    Confirm Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Top-up Modal */}
            {
                isTopUpModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                        <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-md shadow-2xl p-6">
                            <h3 className="text-lg font-bold mb-1">Top-up Loan</h3>
                            <p className="text-sm text-slate-500 mb-4">Add amount and set new duration. New agreement will be generated.</p>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Current Outstanding</label>
                                    <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white font-mono">
                                        {formatCurrency(outstandingPrincipal)}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Top-up Amount (Rs.)</label>
                                    <input
                                        type="number"
                                        value={topUpAmount}
                                        onChange={(e) => setTopUpAmount(Number(e.target.value))}
                                        placeholder="Enter top-up amount"
                                        className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">New Duration (Months)</label>
                                    <input
                                        type="number"
                                        value={topUpTenure}
                                        onChange={(e) => setTopUpTenure(Number(e.target.value))}
                                        min={1}
                                        max={120}
                                        placeholder="Enter new tenure"
                                        className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">This will be the new loan duration from today</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Interest Rate (%)</label>
                                        <input
                                            type="number"
                                            value={topUpInterestRate}
                                            onChange={(e) => setTopUpInterestRate(Number(e.target.value))}
                                            placeholder="%"
                                            className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Proc. Fee (%)</label>
                                        <input
                                            type="number"
                                            value={topUpProcessingFeePercent}
                                            onChange={(e) => setTopUpProcessingFeePercent(Number(e.target.value))}
                                            placeholder="%"
                                            className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-blue-800 dark:text-blue-300">New Principal</span>
                                        <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(outstandingPrincipal + topUpAmount)}</span>
                                    </div>
                                    {topUpAmount > 0 && topUpTenure > 0 && loan && (
                                        <div className="flex justify-between items-center border-t border-blue-200 dark:border-blue-800 pt-2">
                                            <span className="text-sm font-bold text-blue-800 dark:text-blue-300">New EMI (approx)</span>
                                            <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
                                                {formatCurrency(Math.round(
                                                    ((outstandingPrincipal + topUpAmount) * (loan.interestRate / 12 / 100) * Math.pow(1 + (loan.interestRate / 12 / 100), topUpTenure)) /
                                                    (Math.pow(1 + (loan.interestRate / 12 / 100), topUpTenure) - 1)
                                                ))}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <p className="text-xs text-green-700 dark:text-green-400">
                                        <span className="font-bold">Note:</span> New Loan Agreement and Loan Card will be automatically generated after top-up.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end flex-wrap">
                                <button onClick={() => setIsTopUpModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">Cancel</button>
                                <button
                                    onClick={handlePreviewUpdatedLoanCard}
                                    disabled={!loan || topUpAmount <= 0}
                                    className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-bold hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                                    Card
                                </button>
                                <button
                                    onClick={handlePreviewTopUpAgreement}
                                    disabled={!loan || topUpAmount <= 0}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[16px]">description</span>
                                    Agreement
                                </button>
                                <button
                                    onClick={handleTopUpLoan}
                                    disabled={isToppingUp || topUpAmount <= 0 || topUpTenure <= 0}
                                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isToppingUp && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                    Confirm Top-up
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
}

export default LoanDetails;