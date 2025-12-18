import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid, addMonths, startOfMonth } from 'date-fns';
import { useCompany } from '../context/CompanyContext';

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
  isTopUpEmi?: boolean;
  originalEmi?: number;
}

interface TopUpHistoryEntry {
  id: string;
  date: string;
  topUpAmount: number;
  previousOutstanding: number;
  previousEmi: number;
  newEmi: number;
  newTenure: number;
  processingFee: number;
  processingFeePercentage: number;
  interestRate: number;
  firstEmiDate: string;
  ledgerEntries: {
    loanOutstandingDebit: number;
    cashCredit: number;
    processingFeeIncome: number;
  };
  previousScheduleSnapshot: Emi[];
}

interface Loan {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  originalAmount?: number;
  tenure: number;
  interestRate: number;
  processingFee: number;
  emi: number;
  originalEmi?: number;
  date: string;
  status: 'Pending' | 'Approved' | 'Disbursed' | 'Rejected' | 'Completed';
  approvalDate?: string;
  disbursalDate?: string;
  repaymentSchedule: Emi[];
  topUpHistory?: TopUpHistoryEntry[];
  lastTopUpDate?: string;
  emiDueDay?: number;
  totalTopUpAmount?: number;
  topUpCount?: number;
}

interface Customer {
  phone?: string;
  photo_url?: string;
  avatar?: string;
  name?: string;
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
  const [topUpProcessingFee, setTopUpProcessingFee] = useState(2); // Processing fee percentage
  const [amountReceived, setAmountReceived] = useState(true); // Checkbox for amount received
  const [isUndoingForeclosure, setIsUndoingForeclosure] = useState(false);
  const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);
  const [isUndoingTopUp, setIsUndoingTopUp] = useState(false);
  const [showTopUpHistory, setShowTopUpHistory] = useState(false);
  const [showAmortizationSchedule, setShowAmortizationSchedule] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [showSmsModal, setShowSmsModal] = useState(false);

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
        pdfDoc.save(`Foreclosure_Preview_${loan.id}.pdf`);
    } catch(error) {
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

        const pdfDoc = await generateForeclosurePDF({...loan, repaymentSchedule: updatedSchedule}, foreclosureData);
        pdfDoc.save(`Foreclosure_Certificate_${loan.id}.pdf`);

        alert('Loan Pre-closed successfully. Certificate downloaded.');
        setIsPrecloseModalOpen(false);
        fetchLoanAndCustomer();
    } catch(error) {
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
    } catch(error) {
        console.error("Failed to undo foreclosure:", error);
        alert('Error undoing foreclosure.');
    } finally {
        setIsUndoingForeclosure(false);
    }
  };

  // Calculate processing fee amount
  const calculatedProcessingFee = useMemo(() => {
    return Math.round(topUpAmount * (topUpProcessingFee / 100));
  }, [topUpAmount, topUpProcessingFee]);

  // Calculate new EMI for top-up preview
  const previewNewEmi = useMemo(() => {
    if (!loan || topUpAmount <= 0 || topUpTenure <= 0) return 0;
    const newPrincipal = outstandingPrincipal + topUpAmount;
    const monthlyRate = loan.interestRate / 12 / 100;
    return Math.round(
      (newPrincipal * monthlyRate * Math.pow(1 + monthlyRate, topUpTenure)) /
      (Math.pow(1 + monthlyRate, topUpTenure) - 1)
    );
  }, [loan, topUpAmount, topUpTenure, outstandingPrincipal]);

  // Net disbursement after processing fee
  const netDisbursement = useMemo(() => {
    return topUpAmount - calculatedProcessingFee;
  }, [topUpAmount, calculatedProcessingFee]);

  const handleTopUpLoan = async () => {
      if (!loan || topUpAmount <= 0 || topUpTenure <= 0) return;
      setIsToppingUp(true);
      try {
          const previousOutstanding = outstandingPrincipal;
          const previousEmi = loan.emi;
          const processingFeeAmount = calculatedProcessingFee;
          const newPrincipal = previousOutstanding + topUpAmount;
          const monthlyRate = loan.interestRate / 12 / 100;

          const newEmi = Math.round(
              (newPrincipal * monthlyRate * Math.pow(1 + monthlyRate, topUpTenure)) /
              (Math.pow(1 + monthlyRate, topUpTenure) - 1)
          );
          
          // Preserve original EMI due day from existing schedule
          let emiDueDay = loan.emiDueDay || 1;
          const firstPendingEmi = loan.repaymentSchedule.find(e => e.status === 'Pending');
          if (firstPendingEmi) {
              const pendingDate = parseISO(firstPendingEmi.dueDate);
              if (isValid(pendingDate)) {
                  emiDueDay = pendingDate.getDate();
              }
          }
          
          const today = new Date();
          const nextMonth = addMonths(today, 1);
          const firstEmiDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), emiDueDay);
          
          // Keep paid EMIs with their original amounts - NEVER change paid EMIs
          const paidEmis = loan.repaymentSchedule.filter(e => e.status === 'Paid').map(e => ({
            ...e,
            isTopUpEmi: false,
            originalEmi: e.amount
          }));
          
          // Create new pending EMIs with new EMI amount
          const newPendingEmis: Emi[] = [];
          for (let i = 0; i < topUpTenure; i++) {
              const emiDate = addMonths(firstEmiDate, i);
              newPendingEmis.push({
                  emiNumber: paidEmisCount + i + 1,
                  dueDate: format(emiDate, 'yyyy-MM-dd'),
                  amount: newEmi,
                  status: 'Pending',
                  isTopUpEmi: true,
                  originalEmi: previousEmi
              });
          }
          
          const newSchedule = [...paidEmis, ...newPendingEmis];
          const topUpDate = format(today, 'yyyy-MM-dd');
          const newTotalTenure = paidEmisCount + topUpTenure;
          const firstEmiDateStr = format(firstEmiDate, 'yyyy-MM-dd');

          // Create comprehensive top-up history entry
          const topUpHistoryEntry: TopUpHistoryEntry = {
              id: `TU-${Date.now()}`,
              date: new Date().toISOString(),
              topUpAmount: topUpAmount,
              previousOutstanding: previousOutstanding,
              previousEmi: previousEmi,
              newEmi: newEmi,
              newTenure: topUpTenure,
              processingFee: processingFeeAmount,
              processingFeePercentage: topUpProcessingFee,
              interestRate: loan.interestRate,
              firstEmiDate: firstEmiDateStr,
              ledgerEntries: {
                  loanOutstandingDebit: topUpAmount,
                  cashCredit: topUpAmount - processingFeeAmount,
                  processingFeeIncome: processingFeeAmount
              },
              previousScheduleSnapshot: loan.repaymentSchedule.map(e => ({...e}))
          };

          await updateDoc(doc(db, "loans", loan.id), {
              amount: newPrincipal,
              originalAmount: loan.originalAmount || loan.amount,
              emi: newEmi,
              originalEmi: loan.originalEmi || previousEmi,
              tenure: newTotalTenure,
              repaymentSchedule: newSchedule,
              emiDueDay: emiDueDay,
              topUpHistory: [
                  ...(loan.topUpHistory || []),
                  topUpHistoryEntry
              ],
              lastTopUpDate: topUpDate,
              totalTopUpAmount: (loan.totalTopUpAmount || 0) + topUpAmount,
              topUpCount: (loan.topUpCount || 0) + 1
          });

          // Generate SMS/WhatsApp message
          const smsMsg = generateTopUpSmsMessage(newEmi, topUpTenure, firstEmiDateStr);
          setSmsMessage(smsMsg);

          alert(`Loan Topped Up Successfully!\n\nTop-up Amount: ${formatCurrency(topUpAmount)}\nProcessing Fee: ${formatCurrency(processingFeeAmount)}\nNet Disbursement: ${formatCurrency(topUpAmount - processingFeeAmount)}\n\nNew Duration: ${topUpTenure} months\nNew EMI: ${formatCurrency(newEmi)}`);
          setIsTopUpModalOpen(false);
          setShowSmsModal(true);
          setTopUpAmount(0);
          setTopUpTenure(12);
          setTopUpProcessingFee(2);
          
          // Generate agreement and loan card with updated data
          generateTopUpAgreementPDF(newPrincipal, newEmi, topUpTenure, topUpDate, firstEmiDateStr, processingFeeAmount, previousOutstanding, previousEmi);
          generateUpdatedLoanCardPDF(newPrincipal, newEmi, newTotalTenure, true);
          generateTopUpSchedulePDF(newPrincipal, newEmi, topUpTenure, firstEmiDateStr, paidEmis.length, previousEmi);
          
          fetchLoanAndCustomer();
      } catch (error) {
          console.error("Failed to top-up loan:", error);
          alert('Top-up failed.');
      } finally {
          setIsToppingUp(false);
      }
  };

  // Generate SMS/WhatsApp message for top-up
  const generateTopUpSmsMessage = (newEmi: number, tenure: number, firstEmiDate: string) => {
      return `Dear ${loan?.customerName},

Your loan (ID: ${loan?.id}) has been topped up successfully!

Top-up Amount: ${formatCurrency(topUpAmount)}
Processing Fee: ${formatCurrency(calculatedProcessingFee)}
New Principal: ${formatCurrency(outstandingPrincipal + topUpAmount)}
New EMI: ${formatCurrency(newEmi)}
Tenure: ${tenure} months
First EMI Date: ${safeFormatDate(firstEmiDate)}

Thank you for choosing ${companyDetails.name}!
Contact: ${companyDetails.phone}`;
  };

  // Undo last top-up
  const handleUndoLastTopUp = async () => {
      if (!loan || !loan.topUpHistory || loan.topUpHistory.length === 0) return;
      if (!confirm('Are you sure you want to undo the last top-up? This will restore the previous EMI schedule and amounts.')) return;
      
      setIsUndoingTopUp(true);
      try {
          const lastTopUp = loan.topUpHistory[loan.topUpHistory.length - 1];
          const previousSchedule = lastTopUp.previousScheduleSnapshot;
          
          // Calculate previous values
          const previousAmount = loan.amount - lastTopUp.topUpAmount;
          const previousEmi = lastTopUp.previousEmi;
          const previousTenure = previousSchedule.length;
          
          // Restore the previous schedule
          await updateDoc(doc(db, "loans", loan.id), {
              amount: previousAmount,
              emi: previousEmi,
              tenure: previousTenure,
              repaymentSchedule: previousSchedule,
              topUpHistory: loan.topUpHistory.slice(0, -1),
              lastTopUpDate: loan.topUpHistory.length > 1 ? loan.topUpHistory[loan.topUpHistory.length - 2].date : null,
              totalTopUpAmount: (loan.totalTopUpAmount || 0) - lastTopUp.topUpAmount,
              topUpCount: Math.max(0, (loan.topUpCount || 1) - 1)
          });

          alert(`Top-up of ${formatCurrency(lastTopUp.topUpAmount)} has been undone.\n\nEMI restored to: ${formatCurrency(previousEmi)}\nSchedule restored to previous state.`);
          fetchLoanAndCustomer();
      } catch (error) {
          console.error("Failed to undo top-up:", error);
          alert('Failed to undo top-up.');
      } finally {
          setIsUndoingTopUp(false);
      }
  };

  const generateTopUpAgreementPDF = async (newPrincipal: number, newEmi: number, newTenure: number, topUpDate: string, firstEmiDateStr: string, processingFee: number = 0, previousOutstanding: number = 0, previousEmi: number = 0) => {
      if (!loan) return;
      setIsGeneratingAgreement(true);
      try {
          const pdfDoc = new jsPDF();
          
          pdfDoc.setFontSize(18);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
          
          pdfDoc.setFontSize(10);
          pdfDoc.setFont("helvetica", "normal");
          pdfDoc.text(companyDetails.address, pdfDoc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
          pdfDoc.text(`Phone: ${companyDetails.phone}`, pdfDoc.internal.pageSize.getWidth() / 2, 27, { align: 'center' });
          
          pdfDoc.setFontSize(14);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.setFillColor(30, 64, 175);
          pdfDoc.rect(14, 32, 182, 10, 'F');
          pdfDoc.setTextColor(255, 255, 255);
          pdfDoc.text("LOAN TOP-UP AGREEMENT", pdfDoc.internal.pageSize.getWidth() / 2, 39, { align: 'center' });
          pdfDoc.setTextColor(0, 0, 0);
          
          pdfDoc.setFontSize(10);
          pdfDoc.setFont("helvetica", "normal");
          let y = 52;
          
          pdfDoc.text(`Agreement Date: ${safeFormatDate(topUpDate, 'PPP')}`, 14, y);
          pdfDoc.text(`Top-up Reference: TU-${loan.id}-${format(new Date(), 'yyyyMMdd')}`, 120, y);
          y += 8;
          pdfDoc.text(`Loan ID: ${loan.id}`, 14, y);
          pdfDoc.text(`Customer ID: ${loan.customerId}`, 120, y);
          y += 8;
          pdfDoc.text(`Customer Name: ${loan.customerName}`, 14, y);
          y += 12;
          
          // Before Top-up Section
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.setFillColor(240, 240, 240);
          pdfDoc.rect(14, y - 4, 182, 8, 'F');
          pdfDoc.text("BEFORE TOP-UP", 14, y);
          y += 10;
          pdfDoc.setFont("helvetica", "normal");
          
          const beforeData = [
              ["Outstanding Principal", formatCurrency(previousOutstanding || outstandingPrincipal)],
              ["Previous EMI", formatCurrency(previousEmi || loan.emi)],
              ["Interest Rate", `${loan.interestRate}% p.a.`],
          ];
          
          autoTable(pdfDoc, {
              body: beforeData,
              startY: y,
              theme: 'grid',
              styles: { fontSize: 10 },
              columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 70 } },
              margin: { left: 14 },
              tableWidth: 85
          });
          
          y = (pdfDoc as any).lastAutoTable.finalY + 8;
          
          // Top-up Details Section
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.setFillColor(220, 240, 220);
          pdfDoc.rect(14, y - 4, 182, 8, 'F');
          pdfDoc.text("TOP-UP DETAILS", 14, y);
          y += 10;
          pdfDoc.setFont("helvetica", "normal");
          
          const topUpDetails = [
              ["Top-up Amount", formatCurrency(topUpAmount || (newPrincipal - (previousOutstanding || outstandingPrincipal)))],
              ["Processing Fee", formatCurrency(processingFee)],
              ["Net Disbursement", formatCurrency((topUpAmount || (newPrincipal - (previousOutstanding || outstandingPrincipal))) - processingFee)],
          ];
          
          autoTable(pdfDoc, {
              body: topUpDetails,
              startY: y,
              theme: 'grid',
              styles: { fontSize: 10 },
              columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 70 } },
              margin: { left: 14 },
              tableWidth: 85
          });
          
          y = (pdfDoc as any).lastAutoTable.finalY + 8;
          
          // After Top-up Section
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.setFillColor(220, 220, 240);
          pdfDoc.rect(14, y - 4, 182, 8, 'F');
          pdfDoc.text("AFTER TOP-UP", 14, y);
          y += 10;
          pdfDoc.setFont("helvetica", "normal");
          
          const afterData = [
              ["New Principal", formatCurrency(newPrincipal)],
              ["New EMI", formatCurrency(newEmi)],
              ["New Tenure", `${newTenure} months`],
              ["First EMI Date", safeFormatDate(firstEmiDateStr)],
              ["Interest Rate", `${loan.interestRate}% p.a.`],
          ];
          
          autoTable(pdfDoc, {
              body: afterData,
              startY: y,
              theme: 'grid',
              styles: { fontSize: 10 },
              columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 70 } },
              margin: { left: 14 },
              tableWidth: 85
          });
          
          y = (pdfDoc as any).lastAutoTable.finalY + 12;
          
          // Ledger Entry Section
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text("ACCOUNTING ENTRIES:", 14, y);
          y += 8;
          pdfDoc.setFont("helvetica", "normal");
          pdfDoc.setFontSize(9);
          
          const ledgerData = [
              ["Loan Outstanding A/c", "Dr.", formatCurrency(topUpAmount || (newPrincipal - (previousOutstanding || outstandingPrincipal)))],
              ["Cash/Bank A/c", "Cr.", formatCurrency((topUpAmount || (newPrincipal - (previousOutstanding || outstandingPrincipal))) - processingFee)],
              ["Processing Fee Income A/c", "Cr.", formatCurrency(processingFee)],
          ];
          
          autoTable(pdfDoc, {
              body: ledgerData,
              startY: y,
              theme: 'grid',
              styles: { fontSize: 9 },
              columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 20 }, 2: { cellWidth: 50 } },
              margin: { left: 14 },
              tableWidth: 150
          });
          
          y = (pdfDoc as any).lastAutoTable.finalY + 10;
          
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.setFontSize(10);
          pdfDoc.text("TERMS AND CONDITIONS:", 14, y);
          y += 8;
          pdfDoc.setFont("helvetica", "normal");
          pdfDoc.setFontSize(9);
          
          const terms = [
              "1. This agreement supersedes all previous EMI schedules for pending EMIs only.",
              "2. Paid EMIs remain unchanged at the original EMI amount.",
              "3. The borrower agrees to pay the new EMI amount as per the revised schedule.",
              "4. All other terms of the original loan agreement remain unchanged.",
              "5. Pre-closure charges as per original agreement will apply.",
              "6. Processing fee is non-refundable.",
          ];
          
          terms.forEach(term => {
              pdfDoc.text(term, 14, y);
              y += 6;
          });
          
          y += 15;
          pdfDoc.setFontSize(10);
          pdfDoc.text("_______________________", 14, y);
          pdfDoc.text("_______________________", 120, y);
          y += 5;
          pdfDoc.text("Borrower Signature", 14, y);
          pdfDoc.text("Authorized Signatory", 120, y);
          
          pdfDoc.setFontSize(8);
          pdfDoc.setTextColor(150);
          pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
          
          pdfDoc.save(`TopUp_Agreement_${loan.id}_${format(new Date(), 'yyyyMMdd')}.pdf`);
      } catch (error) {
          console.error("Failed to generate agreement PDF:", error);
      } finally {
          setIsGeneratingAgreement(false);
      }
  };

  // Generate Top-up Amortization Schedule PDF
  const generateTopUpSchedulePDF = async (newPrincipal: number, newEmi: number, newTenure: number, firstEmiDateStr: string, paidCount: number, previousEmi: number) => {
      if (!loan) return;
      try {
          const pdfDoc = new jsPDF();
          
          pdfDoc.setFontSize(18);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
          
          pdfDoc.setFontSize(12);
          pdfDoc.setFillColor(30, 64, 175);
          pdfDoc.rect(14, 22, 182, 10, 'F');
          pdfDoc.setTextColor(255, 255, 255);
          pdfDoc.text("LOAN AMORTIZATION SCHEDULE (POST TOP-UP)", pdfDoc.internal.pageSize.getWidth() / 2, 29, { align: 'center' });
          pdfDoc.setTextColor(0, 0, 0);
          
          pdfDoc.setFontSize(10);
          pdfDoc.setFont("helvetica", "normal");
          let y = 40;
          
          pdfDoc.text(`Customer: ${loan.customerName}`, 14, y);
          pdfDoc.text(`Loan ID: ${loan.id}`, 120, y);
          y += 7;
          pdfDoc.text(`New Principal: ${formatCurrency(newPrincipal)}`, 14, y);
          pdfDoc.text(`Interest Rate: ${loan.interestRate}% p.a.`, 120, y);
          y += 7;
          pdfDoc.text(`New EMI: ${formatCurrency(newEmi)}`, 14, y);
          pdfDoc.text(`New Tenure: ${newTenure} months`, 120, y);
          y += 10;
          
          // Generate amortization schedule
          let balance = newPrincipal;
          const monthlyRate = loan.interestRate / 12 / 100;
          const scheduleData: (string | number)[][] = [];
          
          const firstEmiDate = parseISO(firstEmiDateStr);
          
          for (let i = 1; i <= newTenure; i++) {
              const interestPayment = balance * monthlyRate;
              const principalPayment = newEmi - interestPayment;
              const openingBalance = balance;
              balance = Math.max(0, balance - principalPayment);
              
              const emiDate = addMonths(firstEmiDate, i - 1);
              
              scheduleData.push([
                  i,
                  format(emiDate, 'dd-MMM-yyyy'),
                  formatCurrency(openingBalance),
                  formatCurrency(newEmi),
                  formatCurrency(interestPayment),
                  formatCurrency(principalPayment),
                  formatCurrency(balance)
              ]);
          }
          
          autoTable(pdfDoc, {
              head: [["#", "Due Date", "Opening Bal.", "EMI", "Interest", "Principal", "Closing Bal."]],
              body: scheduleData,
              startY: y,
              theme: 'grid',
              headStyles: { fillColor: [41, 128, 185] },
              styles: { fontSize: 8 },
          });
          
          const pageCount = (pdfDoc as any).internal.getNumberOfPages();
          for(let i = 1; i <= pageCount; i++) {
              pdfDoc.setPage(i);
              pdfDoc.setFontSize(8);
              pdfDoc.setTextColor(150);
              pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
              pdfDoc.text(`Page ${i} of ${pageCount}`, pdfDoc.internal.pageSize.getWidth() - 20, 287);
          }
          
          pdfDoc.save(`TopUp_Amortization_${loan.id}_${format(new Date(), 'yyyyMMdd')}.pdf`);
      } catch (error) {
          console.error("Failed to generate amortization PDF:", error);
      }
  };

  const generateLoanCardPDF = async () => {
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
          pdfDoc.text("LOAN CARD", 42.8, 14, { align: 'center' });
          
          pdfDoc.setTextColor(0, 0, 0);
          pdfDoc.setFontSize(8);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text(loan.customerName, 5, 28);
          
          pdfDoc.setFontSize(6);
          pdfDoc.setFont("helvetica", "normal");
          pdfDoc.text(`Loan ID: ${loan.id}`, 5, 34);
          pdfDoc.text(`Amount: ${formatCurrency(loan.amount)}`, 5, 39);
          pdfDoc.text(`EMI: ${formatCurrency(loan.emi)}`, 5, 44);
          pdfDoc.text(`Tenure: ${loan.tenure} months`, 45, 39);
          pdfDoc.text(`Rate: ${loan.interestRate}% p.a.`, 45, 44);
          
          pdfDoc.setFontSize(5);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated: ${format(new Date(), 'dd-MMM-yyyy')}`, 5, 51);
          
          pdfDoc.save(`LoanCard_${loan.id}.pdf`);
      } catch (error) {
          console.error("Failed to generate loan card:", error);
      }
  };

  const generateUpdatedLoanCardPDF = async (newAmount: number, newEmi: number, newTenure: number, isTopUp: boolean = false) => {
      if (!loan) return;
      try {
          const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54] });
          
          // Header with TOP-UP indicator
          pdfDoc.setFillColor(30, 64, 175);
          pdfDoc.rect(0, 0, 85.6, 20, 'F');
          
          pdfDoc.setTextColor(255, 255, 255);
          pdfDoc.setFontSize(10);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text(companyDetails.name, 42.8, 8, { align: 'center' });
          pdfDoc.setFontSize(6);
          pdfDoc.text(isTopUp ? "LOAN CARD (TOP-UP)" : "LOAN CARD", 42.8, 14, { align: 'center' });
          
          // TOP-UP Badge
          if (isTopUp) {
              pdfDoc.setFillColor(255, 200, 0);
              pdfDoc.rect(65, 2, 18, 6, 'F');
              pdfDoc.setFontSize(5);
              pdfDoc.setTextColor(0, 0, 0);
              pdfDoc.text("TOP-UP", 74, 6, { align: 'center' });
          }
          
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
          
          // Show top-up count if applicable
          if (isTopUp && loan.topUpCount) {
              pdfDoc.setFontSize(5);
              pdfDoc.setTextColor(100, 100, 200);
              pdfDoc.text(`Top-up #${(loan.topUpCount || 0) + 1}`, 65, 34);
          }
          
          pdfDoc.setFontSize(5);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated: ${format(new Date(), 'dd-MMM-yyyy')}`, 5, 51);
          
          pdfDoc.save(`LoanCard_${isTopUp ? 'TopUp_' : ''}${loan.id}_${format(new Date(), 'yyyyMMdd')}.pdf`);
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
           <button onClick={() => navigate(`/loans/edit/${loanId}`)} className="flex items-center justify-center p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" title="Edit Loan">
              <span className="material-symbols-outlined">edit</span>
           </button>
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
                    {loan.topUpCount && loan.topUpCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] rounded-full">{loan.topUpCount}</span>
                    )}
                </button>
                {loan.topUpHistory && loan.topUpHistory.length > 0 && (
                    <button 
                      onClick={handleUndoLastTopUp}
                      disabled={isUndoingTopUp}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-bold text-sm hover:bg-amber-200 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                    >
                        {isUndoingTopUp ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-700 border-t-transparent"></div>
                        ) : (
                            <span className="material-symbols-outlined text-[18px]">undo</span>
                        )}
                        Undo Last Top-up
                    </button>
                )}
                {loan.topUpHistory && loan.topUpHistory.length > 0 && (
                    <button 
                      onClick={() => setShowTopUpHistory(!showTopUpHistory)}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 font-bold text-sm hover:bg-purple-200 dark:hover:bg-purple-900/40 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">history</span> 
                        Top-up History ({loan.topUpHistory.length})
                    </button>
                )}
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
             {/* Top-up indicator banner */}
             {loan.topUpCount && loan.topUpCount > 0 && (
                 <div className="px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-t border-blue-200 dark:border-blue-800">
                     <div className="flex items-center justify-between flex-wrap gap-2">
                         <div className="flex items-center gap-2">
                             <span className="material-symbols-outlined text-blue-600">trending_up</span>
                             <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                                 Top-up Active ({loan.topUpCount} {loan.topUpCount === 1 ? 'time' : 'times'})
                             </span>
                         </div>
                         <div className="flex items-center gap-4 text-xs">
                             {loan.originalEmi && (
                                 <span className="text-slate-500">
                                     Original EMI: <span className="font-bold line-through">{formatCurrency(loan.originalEmi)}</span>
                                 </span>
                             )}
                             <span className="text-blue-600 dark:text-blue-400 font-bold">
                                 Current EMI: {formatCurrency(loan.emi)}
                             </span>
                         </div>
                     </div>
                 </div>
             )}
        </div>

        {/* Top-up History Section */}
        {showTopUpHistory && loan.topUpHistory && loan.topUpHistory.length > 0 && (
            <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden print:hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-purple-600">history</span>
                        Top-up History
                    </h3>
                    <button onClick={() => setShowTopUpHistory(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loan.topUpHistory.slice().reverse().map((entry, index) => (
                        <div key={entry.id || index} className="p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-full mb-2">
                                        Top-up #{loan.topUpHistory!.length - index}
                                    </span>
                                    <p className="text-sm text-slate-500">{safeFormatDate(entry.date, 'PPP')}</p>
                                </div>
                                <span className="text-lg font-bold text-green-600 dark:text-green-400">+{formatCurrency(entry.topUpAmount)}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span className="block text-xs text-slate-500 mb-0.5">Previous Outstanding</span>
                                    <span className="font-medium">{formatCurrency(entry.previousOutstanding)}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-slate-500 mb-0.5">Processing Fee</span>
                                    <span className="font-medium text-red-600">{formatCurrency(entry.processingFee)} ({entry.processingFeePercentage}%)</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-slate-500 mb-0.5">Previous EMI</span>
                                    <span className="font-medium line-through text-slate-400">{formatCurrency(entry.previousEmi)}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-slate-500 mb-0.5">New EMI</span>
                                    <span className="font-medium text-blue-600">{formatCurrency(entry.newEmi)}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-slate-500 mb-0.5">New Tenure</span>
                                    <span className="font-medium">{entry.newTenure} months</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-slate-500 mb-0.5">First EMI Date</span>
                                    <span className="font-medium">{safeFormatDate(entry.firstEmiDate)}</span>
                                </div>
                            </div>
                            {/* Ledger Entries */}
                            {entry.ledgerEntries && (
                                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                    <span className="block text-xs font-bold text-slate-500 mb-2">Accounting Entries:</span>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Loan A/c (Dr.)</span>
                                            <span className="font-mono">{formatCurrency(entry.ledgerEntries.loanOutstandingDebit)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Cash A/c (Cr.)</span>
                                            <span className="font-mono">{formatCurrency(entry.ledgerEntries.cashCredit)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Fee Income (Cr.)</span>
                                            <span className="font-mono">{formatCurrency(entry.ledgerEntries.processingFeeIncome)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Schedule Table */}
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                 <h3 className="font-bold text-lg">Repayment Schedule</h3>
                 {loan.topUpCount && loan.topUpCount > 0 && (
                     <span className="text-xs text-slate-500">
                         <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded mr-2">PAID = Old EMI</span>
                         <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded">PENDING = Top-up EMI</span>
                     </span>
                 )}
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
      )}

      {/* Top-up Modal - Enhanced */}
      {isTopUpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
             <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-lg shadow-2xl p-6 my-4">
                 <div className="flex items-center justify-between mb-4">
                     <div>
                         <h3 className="text-lg font-bold">Top-up Loan</h3>
                         <p className="text-sm text-slate-500">Add amount and set new duration. PDFs will be auto-generated.</p>
                     </div>
                     {loan?.topUpCount && loan.topUpCount > 0 && (
                         <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-bold rounded-full">
                             Top-up #{(loan.topUpCount || 0) + 1}
                         </span>
                     )}
                 </div>
                 
                 <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto">
                     {/* Current Status */}
                     <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Current Outstanding</label>
                             <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-sm">
                                 {formatCurrency(outstandingPrincipal)}
                             </div>
                         </div>
                         <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Current EMI</label>
                             <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-sm">
                                 {formatCurrency(loan?.emi || 0)}
                             </div>
                         </div>
                     </div>

                     {/* Top-up Inputs */}
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1">Top-up Amount (Rs.)</label>
                         <input 
                            type="number" 
                            value={topUpAmount || ''}
                            onChange={(e) => setTopUpAmount(Number(e.target.value))}
                            placeholder="Enter top-up amount"
                            className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                         />
                     </div>
                     
                     <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">New Duration (Months)</label>
                             <input 
                                type="number" 
                                value={topUpTenure}
                                onChange={(e) => setTopUpTenure(Number(e.target.value))}
                                min={1}
                                max={120}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                             />
                         </div>
                         <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Processing Fee (%)</label>
                             <input 
                                type="number" 
                                value={topUpProcessingFee}
                                onChange={(e) => setTopUpProcessingFee(Number(e.target.value))}
                                min={0}
                                max={10}
                                step={0.5}
                                className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                             />
                         </div>
                     </div>

                     {/* Calculation Summary */}
                     {topUpAmount > 0 && (
                         <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl space-y-3 border border-blue-200 dark:border-blue-800">
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-slate-600 dark:text-slate-400">Top-up Amount</span>
                                 <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(topUpAmount)}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-slate-600 dark:text-slate-400">Processing Fee ({topUpProcessingFee}%)</span>
                                 <span className="font-bold text-red-600 dark:text-red-400">- {formatCurrency(calculatedProcessingFee)}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm border-t border-blue-200 dark:border-blue-700 pt-2">
                                 <span className="text-slate-600 dark:text-slate-400">Net Disbursement</span>
                                 <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(netDisbursement)}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm border-t border-blue-200 dark:border-blue-700 pt-2">
                                 <span className="text-slate-600 dark:text-slate-400">New Principal</span>
                                 <span className="font-extrabold text-blue-700 dark:text-blue-300">{formatCurrency(outstandingPrincipal + topUpAmount)}</span>
                             </div>
                             {topUpTenure > 0 && (
                                 <>
                                     <div className="flex justify-between items-center text-sm">
                                         <span className="text-slate-600 dark:text-slate-400">Old EMI (Paid)</span>
                                         <span className="font-bold text-slate-500 line-through">{formatCurrency(loan?.emi || 0)}</span>
                                     </div>
                                     <div className="flex justify-between items-center border-t-2 border-blue-300 dark:border-blue-600 pt-3">
                                         <span className="font-bold text-blue-800 dark:text-blue-300">New EMI (Pending)</span>
                                         <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(previewNewEmi)}</span>
                                     </div>
                                 </>
                             )}
                         </div>
                     )}

                     {/* EMI Change Info */}
                     <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                         <div className="flex items-start gap-2">
                             <span className="material-symbols-outlined text-amber-600 text-[18px]">info</span>
                             <div className="text-xs text-amber-700 dark:text-amber-400">
                                 <p className="font-bold mb-1">Important:</p>
                                 <ul className="list-disc list-inside space-y-0.5">
                                     <li>Paid EMIs remain unchanged at original amount</li>
                                     <li>New EMI applies only to pending/future EMIs</li>
                                     <li>EMI due date (day of month) will stay the same</li>
                                 </ul>
                             </div>
                         </div>
                     </div>

                     {/* Documents Info */}
                     <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                         <p className="text-xs text-green-700 dark:text-green-400">
                             <span className="font-bold">Auto-generated documents:</span>
                             <br />• Top-up Agreement PDF (with accounting entries)
                             <br />• Updated Loan Card PDF
                             <br />• Amortization Schedule PDF
                             <br />• SMS/WhatsApp message template
                         </p>
                     </div>
                 </div>
                 
                 <div className="flex gap-3 justify-end flex-wrap border-t border-slate-200 dark:border-slate-700 pt-4">
                     <button onClick={() => setIsTopUpModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">Cancel</button>
                     <button 
                        onClick={handleTopUpLoan}
                        disabled={isToppingUp || topUpAmount <= 0 || topUpTenure <= 0}
                        className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                     >
                         {isToppingUp && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                         <span className="material-symbols-outlined text-[18px]">trending_up</span>
                         Confirm Top-up
                     </button>
                 </div>
             </div>
        </div>
      )}

      {/* SMS/WhatsApp Message Modal */}
      {showSmsModal && smsMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
             <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-md shadow-2xl p-6">
                 <div className="flex items-center justify-between mb-4">
                     <h3 className="text-lg font-bold flex items-center gap-2">
                         <span className="material-symbols-outlined text-green-600">sms</span>
                         Customer Message
                     </h3>
                     <button onClick={() => setShowSmsModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                         <span className="material-symbols-outlined">close</span>
                     </button>
                 </div>
                 
                 <div className="mb-4">
                     <p className="text-sm text-slate-500 mb-3">Copy this message to send via SMS or WhatsApp:</p>
                     <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg font-mono text-sm whitespace-pre-wrap border border-slate-200 dark:border-slate-700 max-h-[300px] overflow-y-auto">
                         {smsMessage}
                     </div>
                 </div>
                 
                 <div className="flex gap-3 justify-end">
                     <button 
                        onClick={() => {
                            navigator.clipboard.writeText(smsMessage);
                            alert('Message copied to clipboard!');
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-2"
                     >
                         <span className="material-symbols-outlined text-[16px]">content_copy</span>
                         Copy Message
                     </button>
                     <button 
                        onClick={() => {
                            const whatsappUrl = `https://wa.me/${customer?.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(smsMessage)}`;
                            window.open(whatsappUrl, '_blank');
                        }}
                        disabled={!customer?.phone}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                     >
                         <span className="material-symbols-outlined text-[16px]">chat</span>
                         Send WhatsApp
                     </button>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
}

export default LoanDetails;