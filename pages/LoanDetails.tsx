import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid, addMonths, startOfMonth } from 'date-fns';

// --- Configuration ---
const companyDetails = {
    name: "JLS Finance Company",
    address: "123 Finance Street, City Center",
    phone: "+91 98765 43210"
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
  date: string; // Applied date
  status: 'Pending' | 'Approved' | 'Disbursed' | 'Rejected' | 'Completed';
  approvalDate?: string;
  disbursalDate?: string;
  repaymentSchedule: Emi[];
  topUpHistory?: { date: string; amount: number; previousAmount: number; }[];
}

interface Customer {
  phone?: string;
  photo_url?: string;
  avatar?: string;
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
        console.error("Image load failed", e);
        throw e;
    }
}

const LoanDetails: React.FC = () => {
  const navigate = useNavigate();
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

  // Form State
  const [foreclosureCharges, setForeclosureCharges] = useState(2); // Default 2%
  const [topUpAmount, setTopUpAmount] = useState(0);

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

    let balance = amount;
    const schedule = [];
    const monthlyInterestRate = interestRate / 12 / 100;

    for (let i = 1; i <= tenure; i++) {
      const interestPayment = balance * monthlyInterestRate;
      const principalPayment = emi - interestPayment;
      balance -= principalPayment;
      
      const existingEmi = repaymentSchedule.find((e: any) => e.emiNumber === i);

      schedule.push({
        month: i,
        dueDate: existingEmi?.dueDate || null,
        principal: principalPayment,
        interest: interestPayment,
        totalPayment: emi,
        balance: balance > 0 ? balance : 0,
        status: existingEmi?.status || 'Pending',
        paymentDate: existingEmi?.paymentDate || null,
        remark: existingEmi?.remark || '---',
        receiptDownloadable: existingEmi?.status === 'Paid'
      });
    }
    return schedule;
  }, [loan]);


  // Actions
  const handlePrecloseLoan = async () => {
    if (!loan) return;
    setIsPreclosing(true);
    try {
        const updatedSchedule = loan.repaymentSchedule.map(emi => 
            emi.status === 'Pending' ? { ...emi, status: 'Cancelled' as 'Cancelled' } : emi
        );

        await updateDoc(doc(db, "loans", loan.id), {
            status: 'Completed',
            repaymentSchedule: updatedSchedule,
            foreclosureDetails: {
                date: new Date().toISOString(),
                outstandingPrincipal: outstandingPrincipal,
                chargesPercentage: foreclosureCharges,
                totalPaid: foreclosureAmount,
            }
        });
        alert('Loan Pre-closed successfully.');
        setIsPrecloseModalOpen(false);
        fetchLoanAndCustomer();
    } catch(error) {
        console.error("Failed to pre-close loan:", error);
        alert('Error pre-closing loan.');
    } finally {
        setIsPreclosing(false);
    }
  };

  const handleTopUpLoan = async () => {
      if (!loan || topUpAmount <= 0) return;
      setIsToppingUp(true);
      try {
          const newPrincipal = outstandingPrincipal + topUpAmount;
          const monthlyRate = loan.interestRate / 12 / 100;
          const remainingTenure = loan.tenure - paidEmisCount;

          if (remainingTenure <= 0) {
              alert('Cannot Top-up: This loan is already fully paid.');
              return;
          }

          const newEmi = Math.round(
              (newPrincipal * monthlyRate * Math.pow(1 + monthlyRate, remainingTenure)) /
              (Math.pow(1 + monthlyRate, remainingTenure) - 1)
          );
          
          const lastPaidEmi = loan.repaymentSchedule.filter(e => e.status === 'Paid').pop();
          const startDate = lastPaidEmi ? addMonths(parseISO(lastPaidEmi.dueDate), 1) : startOfMonth(addMonths(new Date(loan.disbursalDate!), 1));
          
          const newSchedule = loan.repaymentSchedule.filter(e => e.status === 'Paid');
          for (let i = 0; i < remainingTenure; i++) {
              newSchedule.push({
                  emiNumber: paidEmisCount + i + 1,
                  dueDate: format(addMonths(startDate, i), 'yyyy-MM-dd'),
                  amount: newEmi,
                  status: 'Pending',
              });
          }

          await updateDoc(doc(db, "loans", loan.id), {
              amount: newPrincipal,
              emi: newEmi,
              repaymentSchedule: newSchedule,
              topUpHistory: [
                  ...(loan.topUpHistory || []),
                  { date: new Date().toISOString(), amount: topUpAmount, previousAmount: loan.amount }
              ],
          });

          alert(`Loan Topped Up! Added ${formatCurrency(topUpAmount)}. New EMI is ${formatCurrency(newEmi)}.`);
          setIsTopUpModalOpen(false);
          setTopUpAmount(0);
          fetchLoanAndCustomer();
      } catch (error) {
          console.error("Failed to top-up loan:", error);
          alert('Top-up failed.');
      } finally {
          setIsToppingUp(false);
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

        const tableColumn = ["EMI No.", "Due Date", "Principal", "Interest", "Total EMI", "Balance After", "Paid Date", "Status", "Remark"];
        const tableRows: (string | number)[][] = [];

        detailedRepaymentSchedule.forEach(emi => {
            const emiData = [
                `${emi.month}/${loan.tenure}`,
                safeFormatDate(emi.dueDate),
                formatCurrency(emi.principal),
                formatCurrency(emi.interest),
                formatCurrency(emi.totalPayment),
                formatCurrency(emi.balance),
                safeFormatDate(emi.paymentDate),
                emi.status,
                emi.remark
            ];
            tableRows.push(emiData);
        });

        autoTable(pdfDoc, {
            head: [tableColumn],
            body: tableRows,
            startY: contentStartY,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { font: "helvetica", fontSize: 8 },
        });

        const pageCount = (pdfDoc as any).internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            pdfDoc.setPage(i);
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
            pdfDoc.text(`Page ${i} of ${pageCount}`, pdfDoc.internal.pageSize.getWidth() - 20, 287);
        }
        
        pdfDoc.save(`Payment_Schedule_${loan.id}.pdf`);
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
        if(customerData?.photo_url) {
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
        for(let i = 1; i <= pageCount; i++) {
            pdfDoc.setPage(i);
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
            pdfDoc.text(`Page ${i} of ${pageCount}`, pdfDoc.internal.pageSize.getWidth() - 20, 287);
        }
        
        pdfDoc.save(`Receipt_${loan.id}_EMI_${emi.month}.pdf`);
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
    <div className="bg-background-light dark:bg-background-dark min-h-screen pb-10 text-slate-900 dark:text-white print:bg-white print:text-black">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md p-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-bold text-sm hidden sm:inline">Back</span>
        </button>
        <h1 className="text-lg font-bold">Loan Details</h1>
        <div className="flex gap-2">
           <button onClick={handleDownloadSchedule} disabled={isDownloadingSchedule} className="flex items-center justify-center p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              {isDownloadingSchedule ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div> : <span className="material-symbols-outlined">download</span>}
           </button>
           <button onClick={() => window.print()} className="flex items-center justify-center p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
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

        {/* Main Info Card */}
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
             <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-slate-50/50 dark:bg-slate-800/30">
                 <div className="flex items-center gap-4">
                     {customer?.photo_url || customer?.avatar ? (
                         <img src={customer.photo_url || customer.avatar} alt={loan.customerName} className="h-16 w-16 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm" />
                     ) : (
                         <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl border-2 border-white dark:border-slate-700 shadow-sm">
                             {loan.customerName.charAt(0)}
                         </div>
                     )}
                     <div>
                         <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loan.customerName}</h2>
                         <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">ID: {loan.id}</p>
                     </div>
                 </div>
                 <StatusBadge status={loan.status} />
             </div>
             <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Loan Amount</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{formatCurrency(loan.amount)}</span>
                 </div>
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Monthly EMI</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{formatCurrency(loan.emi)}</span>
                 </div>
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Disbursed Date</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{safeFormatDate(loan.disbursalDate)}</span>
                 </div>
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Interest Rate</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{loan.interestRate}% p.a.</span>
                 </div>
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Tenure</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{loan.tenure} Months</span>
                 </div>
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Progress</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{paidEmisCount} / {loan.tenure} Paid</span>
                 </div>
                 <div>
                     <span className="block text-xs text-slate-500 mb-1">Outstanding</span>
                     <span className="block font-bold text-slate-900 dark:text-white">{formatCurrency(outstandingPrincipal)}</span>
                 </div>
             </div>
        </div>

        {/* Schedule Table */}
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                 <h3 className="font-bold text-lg">Repayment Schedule</h3>
             </div>
             <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                     <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                         <tr>
                             <th className="px-4 py-3">#</th>
                             <th className="px-4 py-3">Due Date</th>
                             <th className="px-4 py-3">Principal</th>
                             <th className="px-4 py-3">Interest</th>
                             <th className="px-4 py-3">Total</th>
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
                                 <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{formatCurrency(emi.totalPayment)}</td>
                                 <td className="px-4 py-3">
                                     <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                         emi.status === 'Paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
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
      </div>

      {/* Pre-close Modal */}
      {isPrecloseModalOpen && (
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
                 </div>
                 
                 <div className="flex gap-3 justify-end">
                     <button onClick={() => setIsPrecloseModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">Cancel</button>
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
      )}

      {/* Top-up Modal */}
      {isTopUpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
             <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
                 <h3 className="text-lg font-bold mb-1">Top-up Loan</h3>
                 <p className="text-sm text-slate-500 mb-4">Add amount to principal and recalculate EMI.</p>
                 
                 <div className="space-y-4 mb-6">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1">Current Principal</label>
                         <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white font-mono">
                             {formatCurrency(outstandingPrincipal)}
                         </div>
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1">Top-up Amount</label>
                         <input 
                            type="number" 
                            value={topUpAmount}
                            onChange={(e) => setTopUpAmount(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                         />
                     </div>
                     <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                         <span className="text-sm font-bold text-blue-800 dark:text-blue-300">New Principal</span>
                         <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(outstandingPrincipal + topUpAmount)}</span>
                     </div>
                 </div>
                 
                 <div className="flex gap-3 justify-end">
                     <button onClick={() => setIsTopUpModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">Cancel</button>
                     <button 
                        onClick={handleTopUpLoan}
                        disabled={isToppingUp || topUpAmount <= 0}
                        className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                     >
                         {isToppingUp && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                         Confirm Top-up
                     </button>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
}

export default LoanDetails;