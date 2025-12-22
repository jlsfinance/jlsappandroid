
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, getDoc, deleteDoc, where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import LazyImage from '../components/LazyImage';
import { useCompany } from '../context/CompanyContext';
import { DownloadService } from '../services/DownloadService';

// --- Types ---
interface Loan {
    id: string;
    customerId: string;
    customerName: string;
    amount: number;
    status: string;
    date: string;
    emi: number;
    tenure: number;
    processingFee: number;
    disbursalDate?: string;
    approvalDate?: string;
    interestRate: number;
    repaymentSchedule?: any[];
    topUpHistory?: { date: string; amount: number; topUpAmount?: number; previousAmount: number; tenure?: number; }[];
}

// --- Helpers ---
const formatCurrency = (value: number) => `Rs.${new Intl.NumberFormat("en-IN").format(value)} `;
const safeFormatDate = (dateString: string | undefined | null, formatStr: string = 'dd-MMM-yyyy') => {
    if (!dateString) return '---';
    try {
        const date = parseISO(dateString);
        return format(date, formatStr);
    } catch (e) {
        return '---';
    }
}

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
        console.error("Image conversion failed", e);
        throw e;
    }
}

const Loans: React.FC = () => {
    const navigate = useNavigate();
    const { currentCompany } = useCompany();
    const [searchTerm, setSearchTerm] = useState('');
    const [loans, setLoans] = useState<Loan[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [loanToDelete, setLoanToDelete] = useState<Loan | null>(null);

    // PDF Generation State
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfStatus, setPdfStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
    const [currentPdfBlob, setCurrentPdfBlob] = useState<Blob | null>(null);
    const [currentPdfName, setCurrentPdfName] = useState('');
    const [showPdfModal, setShowPdfModal] = useState(false);

    const companyDetails = useMemo(() => ({
        name: currentCompany?.name || "Finance Company",
        address: currentCompany?.address || "",
        phone: currentCompany?.phone || ""
    }), [currentCompany]);

    // Fetch Data
    const fetchLoans = useCallback(async () => {
        if (!currentCompany) return;

        setLoading(true);
        try {
            const q = query(collection(db, "loans"), where("companyId", "==", currentCompany.id));
            const querySnapshot = await getDocs(q);
            const loansData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Loan[];
            loansData.sort((a: any, b: any) => {
                const dateA = a.date?.toDate?.() || new Date(a.date) || new Date(0);
                const dateB = b.date?.toDate?.() || new Date(b.date) || new Date(0);
                return dateB.getTime() - dateA.getTime();
            });
            setLoans(loansData);
        } catch (error) {
            console.error("Error fetching loans:", error);
        } finally {
            setLoading(false);
        }
    }, [currentCompany]);

    const fetchCustomers = useCallback(async () => {
        if (!currentCompany) return;
        try {
            const q = query(collection(db, "customers"), where("companyId", "==", currentCompany.id));
            const querySnapshot = await getDocs(q);
            const customersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(customersData);
        } catch (error) {
            console.error("Error fetching customers:", error);
        }
    }, [currentCompany]);

    useEffect(() => {
        fetchLoans();
        fetchCustomers();
    }, [fetchLoans, fetchCustomers]);

    // Filtering
    const filteredLoans = useMemo(() => {
        if (!searchTerm) return loans;
        const lowercasedFilter = searchTerm.toLowerCase();
        return loans.filter(loan =>
            (loan.customerName && loan.customerName.toLowerCase().includes(lowercasedFilter)) ||
            (loan.id && loan.id.toLowerCase().includes(lowercasedFilter))
        );
    }, [searchTerm, loans]);

    // Handlers
    const confirmDelete = (loan: Loan) => {
        setLoanToDelete(loan);
        setShowDeleteConfirm(true);
        setActiveMenuId(null);
    };

    const handleDeleteLoan = async () => {
        if (!loanToDelete) return;

        setDeletingId(loanToDelete.id);
        try {
            // 1. Delete associated Ledger entries
            const ledgerQuery = query(collection(db, "ledger"), where("loanId", "==", loanToDelete.id));
            const ledgerSnapshot = await getDocs(ledgerQuery);

            const deletePromises = ledgerSnapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);

            // 2. Delete the Loan document
            await deleteDoc(doc(db, "loans", loanToDelete.id));

            fetchLoans();
            setShowDeleteConfirm(false);
            alert("Loan and associated records deleted permanently.");
        } catch (error) {
            console.error("Failed to delete loan:", error);
            alert("Failed to delete loan. Please try again.");
        } finally {
            setDeletingId(null);
            setLoanToDelete(null);
        }
    };

    // --- PDF GENERATORS ---

    const generateLoanAgreement = async (loan: Loan) => {
        setShowPdfModal(true);
        setPdfStatus('generating');
        setCurrentPdfName(`Loan_Agreement_${loan.id}.pdf`);

        try {
            const customerRef = doc(db, "customers", loan.customerId);
            const customerSnap = await getDoc(customerRef);
            if (!customerSnap.exists()) throw new Error("Customer details not found.");

            const customer = customerSnap.data();
            let customerPhotoBase64 = null;
            if (customer.photo_url) {
                try { customerPhotoBase64 = await toBase64(customer.photo_url); } catch (e) { }
            }

            const pdfDoc = new jsPDF();

            // Header
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setFontSize(18);
            pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
            pdfDoc.setFontSize(14);
            pdfDoc.text("LOAN AGREEMENT", pdfDoc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });

            const agreementDate = loan.disbursalDate ? format(new Date(loan.disbursalDate), 'do MMMM yyyy') : format(new Date(), 'do MMMM yyyy');
            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.text(`Date: ${agreementDate} `, pdfDoc.internal.pageSize.getWidth() - 15, 20, { align: 'right' });
            pdfDoc.text(`Loan ID: ${loan.id} `, pdfDoc.internal.pageSize.getWidth() - 15, 26, { align: 'right' });

            let startY = 40;
            const partiesBody = [[`This agreement is made between: \n\nTHE LENDER: \n${companyDetails.name} \n${companyDetails.address || '[Company Address]'} \n\nAND\n\nTHE BORROWER: \n${customer.name} \n${customer.address || 'Address not provided'} \nMobile: ${customer.phone} `]];

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
                [{ content: 'Disbursal Date', styles: { fontStyle: 'bold' } }, loan.disbursalDate ? format(new Date(loan.disbursalDate), 'do MMMM yyyy') : 'N/A'],
            ];

            if (loan.topUpHistory && loan.topUpHistory.length > 0) {
                const lastTopUp = loan.topUpHistory[loan.topUpHistory.length - 1];
                summaryBody.push(
                    [{ content: 'Last Top-Up Amount', styles: { fontStyle: 'bold' as 'bold' } }, formatCurrency(lastTopUp.topUpAmount || lastTopUp.amount)],
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

            if (customer.guarantor && customer.guarantor.name) {
                pdfDoc.setFontSize(12);
                pdfDoc.setFont("helvetica", "bold");
                pdfDoc.text("GUARANTOR DETAILS", 14, startY);
                startY += 4;
                autoTable(pdfDoc, {
                    startY: startY,
                    body: [
                        [{ content: 'Name', styles: { fontStyle: 'bold' } }, customer.guarantor.name],
                        [{ content: 'Relation', styles: { fontStyle: 'bold' } }, customer.guarantor.relation],
                        [{ content: 'Mobile', styles: { fontStyle: 'bold' } }, customer.guarantor.mobile],
                        [{ content: 'Address', styles: { fontStyle: 'bold' } }, customer.guarantor.address],
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
                const splitText = pdfDoc.splitTextToSize(`${index + 1}. ${clause} `, 180);
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
            pdfDoc.text(`For ${companyDetails.name} `, 50, startY, { align: 'center' });
            pdfDoc.text("Borrower's Signature", 160, startY, { align: 'center' });

            const pdfBlob = pdfDoc.output('blob');
            setCurrentPdfBlob(pdfBlob);
            setPdfStatus('ready');

        } catch (error: any) {
            console.error(error);
            setPdfStatus('error');
        }
    };

    const generateLoanCard = async (loan: Loan) => {
        setShowPdfModal(true);
        setPdfStatus('generating');
        setCurrentPdfName(`Loan_Card_${loan.id}.pdf`);

        try {
            if (!loan.amount || !loan.interestRate || !loan.tenure) {
                throw new Error("Incomplete loan details.");
            }

            const customerRef = doc(db, "customers", loan.customerId);
            const customerSnap = await getDoc(customerRef);
            if (!customerSnap.exists()) throw new Error("Customer details not found.");
            const customer = customerSnap.data();

            let customerPhotoBase64 = null;
            if (customer.photo_url) {
                try { customerPhotoBase64 = await toBase64(customer.photo_url); } catch (e) { }
            }

            const pdfDoc = new jsPDF();
            const pageWidth = pdfDoc.internal.pageSize.width;
            let y = 15;

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
                [{ label: "Monthly EMI", value: formatCurrency(loan.emi) }, { label: "Disbursal Date", value: loan.disbursalDate ? format(parseISO(loan.disbursalDate), 'dd-MMM-yyyy') : 'N/A' }],
            ];

            details.forEach(row => {
                pdfDoc.setFont(undefined, "bold"); pdfDoc.text(`${row[0].label}: `, 15, y);
                pdfDoc.setFont(undefined, "normal"); pdfDoc.text(String(row[0].value), 50, y);
                if (row[1]) {
                    pdfDoc.setFont(undefined, "bold"); pdfDoc.text(`${row[1].label}: `, 110, y);
                    pdfDoc.setFont(undefined, "normal"); pdfDoc.text(String(row[1].value), 145, y);
                }
                y += 7;
            });
            y += 3;

            // Schedule
            const head = [["No", "Due Date", "Amount", "Principal", "Interest", "Balance"]];
            const body: any[] = [];

            if (loan.repaymentSchedule && loan.repaymentSchedule.length > 0) {
                // Use ACTUAL schedule from DB

                // We need to reconstruct the running balance for display if it's not explicitly stored in simple Emi objects
                // However, the Loan Card usually shows the Plan. 
                // For Top-Up, 'repaymentSchedule' contains the mixed history.
                // Let's try to calculate balance dynamically or use a simplified view.

                let balance = loan.amount; // Start with current total amount? No, that's wrong for history.
                // Actually, for the Loan Card, we want to show the schedule matching the current tenure.
                // The 'repaymentSchedule' in DB has the correct dates and statuses.

                // Re-calculating Principal/Interest split for display is complex with mixed history without 'amortizationSchedule'.
                // If we have 'amortizationSchedule', use it!

                // Fallback: If no amortization schedule, we just list the EMIs without detailed P/I split for old ones if missing.

                loan.repaymentSchedule.forEach((emi: any, index: number) => {
                    body.push([
                        emi.emiNumber,
                        emi.dueDate ? format(new Date(emi.dueDate), 'dd-MMM-yy') : 'N/A',
                        formatCurrency(emi.amount),
                        '-', // Principal split might be missing in simple schedule object
                        '-', // Interest split might be missing
                        '-'  // Balance might be missing
                    ]);
                });
                // IF we have the detailed amortization schedule (new system), use that instead!
                if ((loan as any).amortizationSchedule) {
                    // clear body
                    body.length = 0;
                    (loan as any).amortizationSchedule.forEach((row: any) => {
                        body.push([
                            row.emiNo,
                            format(new Date(row.dueDate), 'dd-MMM-yy'),
                            formatCurrency(row.emi),
                            formatCurrency(row.principal),
                            formatCurrency(row.interest),
                            formatCurrency(row.closingBalance)
                        ]);
                    });
                }

            } else {
                // Legacy/Fallback Calculation (Only for loans without schedule)
                let balance = loan.amount;
                const monthlyInterestRate = loan.interestRate / 12 / 100;

                for (let i = 1; i <= loan.tenure; i++) {
                    const interestPayment = balance * monthlyInterestRate;
                    const principalPayment = loan.emi - interestPayment;
                    balance -= principalPayment;
                    if (balance < 0) balance = 0;

                    let dateStr = '';
                    if (loan.disbursalDate) {
                        const d = new Date(loan.disbursalDate);
                        d.setMonth(d.getMonth() + i);
                        dateStr = format(d, 'dd-MMM-yy');
                    }

                    body.push([
                        i,
                        dateStr,
                        formatCurrency(loan.emi),
                        formatCurrency(principalPayment),
                        formatCurrency(interestPayment),
                        formatCurrency(balance)
                    ]);
                }
            }

            autoTable(pdfDoc, { head, body, startY: y, theme: 'grid', headStyles: { fillColor: [41, 128, 185] } });

            const pdfBlob = pdfDoc.output('blob');
            setCurrentPdfBlob(pdfBlob);
            setPdfStatus('ready');

        } catch (error: any) {
            console.error(error);
            setPdfStatus('error');
        }
    };

    const handleDownloadPdf = async () => {
        if (currentPdfBlob && currentPdfName) {
            const reader = new FileReader();
            reader.readAsDataURL(currentPdfBlob);
            reader.onloadend = async () => {
                const base64data = (reader.result as string).split(',')[1];
                await DownloadService.downloadPDF(currentPdfName, base64data);
                setShowPdfModal(false);
            };
        }
    };

    const isActionable = (status: string) => ['Approved', 'Disbursed', 'Completed', 'Active'].includes(status);

    // Status Badge Component
    const StatusBadge = ({ status }: { status: string }) => {
        let classes = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ";
        if (status === 'Approved') classes += "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-400";
        else if (status === 'Disbursed' || status === 'Active') classes += "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400";
        else if (status === 'Rejected') classes += "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400";
        else classes += "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";

        return <span className={classes}>{status}</span>;
    };

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-32 pb-safe bg-slate-50 dark:bg-slate-950 font-sans">
            {/* Background Decor */}
            <div className="fixed inset-0 pointer-events-none -z-10">
                <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-blue-50/50 via-indigo-50/30 to-transparent dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-transparent"></div>
                <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px]"></div>
                <div className="absolute top-[30%] left-[-10%] w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-[100px]"></div>
            </div>

            {/* Header */}
            {/* Header */}
            <header className="sticky top-0 z-20 px-4 pb-4 glass border-b border-white/20 dark:border-slate-800/50" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 shadow-sm">
                            <span className="material-symbols-outlined transition-transform group-hover:-translate-x-1">arrow_back</span>
                        </Link>
                        <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">Loans</h1>
                    </div>
                </div>
                {/* Search & Actions */}
                <div className="mt-5 flex gap-3">
                    <div className="relative flex-grow group">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">search</span>
                        <input
                            type="text"
                            placeholder="Search name or ID..."
                            className="w-full h-11 pl-10 pr-4 rounded-xl border-none bg-white/80 dark:bg-slate-900/80 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Link to="/loans/new" className="h-11 px-5 rounded-xl btn-kadak flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[20px] material-symbols-fill">add_circle</span>
                        <span className="hidden sm:inline">New Loan</span>
                    </Link>
                </div>
            </header>

            {/* List */}
            <main className="flex flex-col gap-3 px-4 pt-4">
                {loading ? (
                    <div className="flex justify-center p-10">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                    </div>
                ) : filteredLoans.length > 0 ? (
                    filteredLoans.map((loan) => (
                        <div key={loan.id}>
                            <div
                                onClick={() => navigate(`/ loans / ${loan.id} `)}
                                className="glass-card relative rounded-2xl p-5 hover:bg-white/90 dark:hover:bg-slate-800/90 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer transition-all duration-300 group border border-white/40 dark:border-slate-700/40"
                            >
                                <div className="absolute left-0 top-6 bottom-6 w-1 bg-gradient-to-b from-indigo-500 to-blue-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4 pl-2 flex-1 min-w-0">
                                        {(() => {
                                            const customer = customers.find(c => c.id === loan.customerId);
                                            return (
                                                <div className="relative h-12 w-12 rounded-2xl shadow-sm overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200 dark:border-slate-700">
                                                    <LazyImage
                                                        src={customer?.photo_url || customer?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.customerName)}&background=random`}
                                                        alt={loan.customerName}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div >
                                            );
                                        })()}
                                        <div className="space-y-1 min-w-0 flex-1">
                                            <h3 className="font-bold text-lg truncate text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors capitalize">{loan.customerName.toLowerCase()}</h3>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md text-slate-500 border border-slate-200 dark:border-slate-700">#{loan.id?.slice(0, 8)}</span>
                                                <StatusBadge status={loan.status} />
                                            </div>
                                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{formatCurrency(loan.amount)}</p>
                                        </div>
                                    </div >
                                    <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className="text-xs font-medium text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-lg whitespace-nowrap">
                                            {loan.date ? format(parseISO(loan.date), 'dd MMM, yy') : 'N/A'}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenuId(activeMenuId === loan.id ? null : loan.id);
                                            }}
                                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0"
                                        >
                                            <span className="material-symbols-outlined">more_vert</span>
                                        </button>
                                    </div>
                                </div >
                            </div >


                        </div >
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <div className="h-20 w-20 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-4xl opacity-50">search_off</span>
                        </div>
                        <p className="font-medium">No loans found</p>
                        <p className="text-sm opacity-60">Try adjusting your search</p>
                    </div>
                )}
            </main >

            {/* Bottom Sheet / Modal Action Menu */}
            {
                activeMenuId && (() => {
                    const selectedLoan = loans.find(l => l.id === activeMenuId);
                    if (!selectedLoan) return null;

                    return (
                        <>
                            <div
                                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity"
                                onClick={() => setActiveMenuId(null)}
                            ></div>
                            <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center pointer-events-none">
                                <div className="bg-white dark:bg-slate-900 shadow-2xl overflow-hidden pointer-events-auto
                                w-full rounded-t-3xl border-t border-white/10
                                md:max-w-sm md:rounded-2xl md:border-t-0 md:ring-1 md:ring-slate-900/5
                                transform transition-all duration-300 ease-out animate-in slide-in-from-bottom
                                md:duration-200 md:zoom-in-95 md:slide-in-from-bottom-8
                            ">
                                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-2 md:hidden"></div>

                                    <div className="p-4 pt-2 md:p-6">
                                        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                                            <div className="h-12 w-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 shrink-0">
                                                <span className="material-symbols-outlined text-2xl">description</span>
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-lg text-slate-900 dark:text-white truncate">{selectedLoan.customerName}</h3>
                                                <p className="text-sm text-slate-500 truncate">Loan ID: #{selectedLoan.id.slice(0, 8)}</p>
                                            </div>
                                            <button
                                                onClick={() => setActiveMenuId(null)}
                                                className="ml-auto p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hidden md:block"
                                            >
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            <Link
                                                to={`/loans/${selectedLoan.id}`}
                                                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined">visibility</span>
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="font-semibold text-slate-900 dark:text-white truncate">View Details</p>
                                                    <p className="text-xs text-slate-500 truncate">Repayment schedule & history</p>
                                                </div>
                                                <span className="material-symbols-outlined text-slate-400 shrink-0">chevron_right</span>
                                            </Link>

                                            <button
                                                disabled={!isActionable(selectedLoan.status)}
                                                onClick={() => { generateLoanCard(selectedLoan); setActiveMenuId(null); }}
                                                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined">credit_card</span>
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="font-semibold text-slate-900 dark:text-white truncate">Loan Card</p>
                                                    <p className="text-xs text-slate-500 truncate">Download customer ID card</p>
                                                </div>
                                                <span className="material-symbols-outlined text-slate-400 shrink-0">chevron_right</span>
                                            </button>

                                            <button
                                                disabled={!isActionable(selectedLoan.status)}
                                                onClick={() => { generateLoanAgreement(selectedLoan); setActiveMenuId(null); }}
                                                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined">description</span>
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="font-semibold text-slate-900 dark:text-white truncate">Agreement</p>
                                                    <p className="text-xs text-slate-500 truncate">Download loan agreement</p>
                                                </div>
                                                <span className="material-symbols-outlined text-slate-400 shrink-0">chevron_right</span>
                                            </button>

                                            <button
                                                onClick={() => confirmDelete(selectedLoan)}
                                                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 group-hover:bg-red-100 dark:group-hover:bg-red-900/30 flex items-center justify-center transition-colors shrink-0">
                                                    <span className="material-symbols-outlined">delete</span>
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="font-semibold text-red-600 dark:text-red-400 truncate">Delete Loan</p>
                                                    <p className="text-xs text-red-400/70 truncate">Permanently remove record</p>
                                                </div>
                                            </button>
                                        </div>
                                        <div className="mt-4 pb-safe md:pb-0"></div>
                                    </div>
                                </div>
                            </div>
                        </>
                    );
                })()
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-[#1e2736] rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                            <h3 className="text-lg font-bold mb-2">Delete Loan?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                                Are you sure you want to delete the loan for <strong>{loanToDelete?.customerName}</strong>? This action cannot be undone.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="px-4 py-2 rounded-lg font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteLoan}
                                    disabled={!!deletingId}
                                    className="px-4 py-2 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
                                >
                                    {deletingId ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* PDF Generation Modal */}
            {
                showPdfModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
                            <div className="p-6 text-center">
                                {pdfStatus === 'generating' && (
                                    <div className="flex flex-col items-center py-4">
                                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4"></div>
                                        <h3 className="font-bold text-lg">Generating Document...</h3>
                                        <p className="text-sm text-slate-500">Please wait while we prepare the PDF.</p>
                                    </div>
                                )}
                                {pdfStatus === 'ready' && (
                                    <div className="flex flex-col items-center py-4">
                                        <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-2xl">check</span>
                                        </div>
                                        <h3 className="font-bold text-lg">Document Ready</h3>
                                        <p className="text-sm text-slate-500 mb-6">{currentPdfName}</p>
                                        <button
                                            onClick={handleDownloadPdf}
                                            className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined font-variation-FILL">download</span> Download PDF
                                        </button>
                                    </div>
                                )}
                                {pdfStatus === 'error' && (
                                    <div className="flex flex-col items-center py-4">
                                        <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-2xl">error</span>
                                        </div>
                                        <h3 className="font-bold text-lg">Generation Failed</h3>
                                        <p className="text-sm text-slate-500">Could not generate the PDF.</p>
                                    </div>
                                )}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 flex justify-center border-t border-slate-100 dark:border-slate-800">
                                <button
                                    onClick={() => setShowPdfModal(false)}
                                    className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Loans;