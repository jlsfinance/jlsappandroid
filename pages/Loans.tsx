import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
}

// --- Helpers ---
const formatCurrency = (value: number) => `Rs. ${new Intl.NumberFormat("en-IN").format(value)}`;

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

async function toBase64(url: string) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Image conversion failed", e);
        throw e;
    }
}

const Loans: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loans, setLoans] = useState<Loan[]>([]);
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

  // Fetch Data
  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
        const q = query(collection(db, "loans"), orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        const loansData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Loan[];
        setLoans(loansData);
    } catch (error) {
        console.error("Error fetching loans:", error);
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

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
          await deleteDoc(doc(db, "loans", loanToDelete.id));
          fetchLoans();
          setShowDeleteConfirm(false);
      } catch (error) {
          console.error("Failed to delete loan:", error);
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
        if(customer.photo_url) {
            try { customerPhotoBase64 = await toBase64(customer.photo_url); } catch (e) {}
        }
        
        const pdfDoc = new jsPDF();
        
        // Header
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(18);
        pdfDoc.text("JLS Finance Company", pdfDoc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        pdfDoc.setFontSize(14);
        pdfDoc.text("LOAN AGREEMENT", pdfDoc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });

        const agreementDate = loan.disbursalDate ? format(new Date(loan.disbursalDate), 'do MMMM yyyy') : format(new Date(), 'do MMMM yyyy');
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Date: ${agreementDate}`, pdfDoc.internal.pageSize.getWidth() - 15, 20, { align: 'right' });
        pdfDoc.text(`Loan ID: ${loan.id}`, pdfDoc.internal.pageSize.getWidth() - 15, 26, { align: 'right' });
        
        let startY = 40;
        const partiesBody = [[`This agreement is made between:\n\nTHE LENDER:\nJLS Finance Company\n[Company Address Here]\n\nAND\n\nTHE BORROWER:\n${customer.name}\n${customer.address || 'Address not provided'}\nMobile: ${customer.phone}`]];

        // Using autoTable for parties layout
        autoTable(pdfDoc, {
            startY: startY,
            head: [[ 'PARTIES INVOLVED' ]],
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
        pdfDoc.text("LOAN SUMMARY", 14, startY);
        startY += 4;
        
        const totalRepayment = loan.emi * loan.tenure;
        const totalInterest = totalRepayment - loan.amount;

        autoTable(pdfDoc, {
            startY: startY,
            body: [
                [{content: 'Loan Amount (Principal)', styles: {fontStyle: 'bold'}}, `${formatCurrency(loan.amount)} (${toWords(loan.amount)} Only)`],
                [{content: 'Loan Tenure', styles: {fontStyle: 'bold'}}, `${loan.tenure} Months`],
                [{content: 'EMI', styles: {fontStyle: 'bold'}}, formatCurrency(loan.emi)],
                [{content: 'Processing Fee', styles: {fontStyle: 'bold'}}, formatCurrency(loan.processingFee || 0)],
                [{content: 'Total Interest Payable', styles: {fontStyle: 'bold'}}, formatCurrency(totalInterest)],
                [{content: 'Total Amount Repayable', styles: {fontStyle: 'bold'}}, formatCurrency(totalRepayment)],
                [{content: 'Disbursal Date', styles: {fontStyle: 'bold'}}, loan.disbursalDate ? format(new Date(loan.disbursalDate), 'do MMMM yyyy') : 'N/A'],
            ],
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 2, font: 'helvetica' },
        });
        
        startY = (pdfDoc as any).lastAutoTable.finalY + 8;
        
        if(customer.guarantor && customer.guarantor.name) {
            pdfDoc.setFontSize(12);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.text("GUARANTOR DETAILS", 14, startY);
            startY += 4;
            autoTable(pdfDoc, {
                startY: startY,
                body: [
                    [{content: 'Name', styles: {fontStyle: 'bold'}}, customer.guarantor.name],
                    [{content: 'Relation', styles: {fontStyle: 'bold'}}, customer.guarantor.relation],
                    [{content: 'Mobile', styles: {fontStyle: 'bold'}}, customer.guarantor.mobile],
                    [{content: 'Address', styles: {fontStyle: 'bold'}}, customer.guarantor.address],
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
              pdfDoc.text(loan.customerName, pageWidth / 2, photoY + photoSize + 7, {align: 'center'});
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
        pdfDoc.text("For JLS Finance Company", 50, startY, { align: 'center' });
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
            try { customerPhotoBase64 = await toBase64(customer.photo_url); } catch (e) {}
        }
        
        const pdfDoc = new jsPDF();
        const pageWidth = pdfDoc.internal.pageSize.width;
        let y = 15;

        pdfDoc.setFontSize(18);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("JLS Finance Company", pageWidth / 2, y, { align: 'center' });
        y += 8;
        pdfDoc.setFontSize(12);
        pdfDoc.text('Loan Summary Card', pageWidth / 2, y, { align: 'center' });
        
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
        let balance = loan.amount;
        const monthlyInterestRate = loan.interestRate / 12 / 100;
        
        for (let i = 1; i <= loan.tenure; i++) {
            const interestPayment = balance * monthlyInterestRate;
            const principalPayment = loan.emi - interestPayment;
            balance -= principalPayment;
            if (balance < 0) balance = 0;
            
            // Calculate hypothetical due date if repayment schedule doesn't exist
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
        
        autoTable(pdfDoc, { head, body, startY: y, theme: 'grid', headStyles: { fillColor: [41, 128, 185] } });

        const pdfBlob = pdfDoc.output('blob');
        setCurrentPdfBlob(pdfBlob);
        setPdfStatus('ready');

    } catch (error: any) {
        console.error(error);
        setPdfStatus('error');
    }
  };

  const handleDownloadPdf = () => {
    if (currentPdfBlob && currentPdfName) {
        const url = window.URL.createObjectURL(currentPdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentPdfName;
        document.body.appendChild(a);
        a.click();
        a.remove();
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
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Loans</h1>
          </div>
        </div>
        {/* Search & Actions */}
        <div className="mt-4 flex gap-2">
            <div className="relative flex-grow">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                    type="text"
                    placeholder="Search name or ID..."
                    className="w-full h-11 pl-10 pr-4 rounded-full border-none bg-white dark:bg-[#1e2736] shadow-sm ring-1 ring-slate-900/5 focus:ring-2 focus:ring-primary outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Link to="/loans/new" className="h-11 px-4 rounded-full bg-primary text-white font-bold flex items-center gap-2 shadow-lg shadow-primary/30 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                <span className="hidden sm:inline">New Loan</span>
            </Link>
        </div>
      </header>

      {/* List */}
      <main className="flex flex-col gap-3 px-4 pt-4">
        {loading ? (
            <div className="flex justify-center p-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            </div>
        ) : filteredLoans.length > 0 ? (
            filteredLoans.map((loan) => (
                <div 
                    key={loan.id} 
                    onClick={() => navigate(`/loans/${loan.id}`)}
                    className="relative bg-white dark:bg-[#1e2736] rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <h3 className="font-bold text-base truncate pr-8">{loan.customerName}</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">#{loan.id}</span>
                                <StatusBadge status={loan.status} />
                            </div>
                            <p className="text-lg font-extrabold text-primary mt-1">{formatCurrency(loan.amount)}</p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {loan.date ? format(parseISO(loan.date), 'dd MMM, yy') : 'N/A'}
                            </span>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === loan.id ? null : loan.id);
                                }}
                                className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className="material-symbols-outlined">more_vert</span>
                            </button>
                        </div>
                    </div>

                    {/* Dropdown Menu */}
                    {activeMenuId === loan.id && (
                        <>
                            <div 
                                className="fixed inset-0 z-20" 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                }}
                            ></div>
                            <div 
                                className="absolute right-4 top-12 z-30 w-48 bg-white dark:bg-[#1e2736] rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Link to={`/loans/${loan.id}`} className="px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">visibility</span> Details
                                </Link>
                                <button 
                                    disabled={!isActionable(loan.status)}
                                    onClick={() => { generateLoanCard(loan); setActiveMenuId(null); }}
                                    className="px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-left disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">credit_card</span> Loan Card
                                </button>
                                <button 
                                    disabled={!isActionable(loan.status)}
                                    onClick={() => { generateLoanAgreement(loan); setActiveMenuId(null); }}
                                    className="px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-left disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">description</span> Agreement
                                </button>
                                <div className="h-px bg-slate-100 dark:bg-slate-700 my-1"></div>
                                <button 
                                    onClick={() => confirmDelete(loan)}
                                    className="px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2 text-left w-full"
                                >
                                    <span className="material-symbols-outlined text-[18px]">delete</span> Delete
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ))
        ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">find_in_page</span>
                <p>No loans found.</p>
            </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
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
      )}

      {/* PDF Generation Modal */}
      {showPdfModal && (
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
                                  className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                              >
                                  <span className="material-symbols-outlined">download</span> Download PDF
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
      )}
    </div>
  );
};

export default Loans;