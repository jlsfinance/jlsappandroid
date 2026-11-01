import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, runTransaction, getDoc, setDoc } from "firebase/firestore";
import { format, parseISO, isPast } from 'date-fns';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCompany } from '../context/CompanyContext';
import { useToast } from '../components/Toast';
import { SkeletonList, SkeletonStyles } from '../components/Skeleton';
import { getAllDueEmis, parseLocalDate, groupDueEmisByLoan, previewAllocation, CustomerDueGroup, AllocationLine } from '../services/emiSchedule';

// WhatsApp Icon Component
const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={`bi bi-whatsapp ${className}`} viewBox="0 0 16 16">
        <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
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
    customerPhoto?: string;
    amountPaid?: number;   // partial payments already made on this installment
    isFinalEmi?: boolean;
}

const DueList: React.FC = () => {
    const { currentCompany } = useCompany();
    const [allPendingEmis, setAllPendingEmis] = useState<PendingEmi[]>([]);
    const [filteredEmis, setFilteredEmis] = useState<PendingEmi[]>([]);
    const [customerGroups, setCustomerGroups] = useState<CustomerDueGroup[]>([]);
    const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
    const [selectedEmiKeys, setSelectedEmiKeys] = useState<Set<string>>(new Set());
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const { success, error, info, toast } = useToast();
    const [loading, setLoading] = useState(true);

    // Summary Stats
    const [totalDue, setTotalDue] = useState(0);
    const [overdueCount, setOverdueCount] = useState(0); // EMIs past due date

    // Collection State
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [customAmount, setCustomAmount] = useState<number>(0);
    const [paymentRemark, setPaymentRemark] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [lastCollectedEmi, setLastCollectedEmi] = useState<PendingEmi | null>(null);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

    const companyDetails = useMemo(() => ({
        name: currentCompany?.name || "Finance Company",
        address: currentCompany?.address || "",
        phone: currentCompany?.phone || ""
    }), [currentCompany]);

    const formatCurrency = (value: number) => `Rs. ${new Intl.NumberFormat("en-IN").format(value)}`;

    const fetchPendingEmis = useCallback(async () => {
        if (!currentCompany) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // 1. Fetch all disbursed loans and customers filtered by company
            const loansQuery = query(
                collection(db, "loans"),
                where("status", "in", ["Disbursed", "Active", "Overdue"]),
                where("companyId", "==", currentCompany.id)
            );
            const customersQuery = query(
                collection(db, "customers"),
                where("companyId", "==", currentCompany.id)
            );

            const [loansSnapshot, customersSnapshot] = await Promise.all([
                getDocs(loansQuery),
                getDocs(customersQuery)
            ]);

            const customerMap = new Map<string, any>();
            customersSnapshot.docs.forEach(doc => {
                customerMap.set(doc.id, doc.data());
            });

            // Build loan list, then delegate due-filtering to the pure service
            // (single source of truth — rules covered by tests/emiSchedule.test.mjs)
            const loansForDue: any[] = [];
            loansSnapshot.docs.forEach(loanDoc => {
                const loan = loanDoc.data();
                const customerData = customerMap.get(loan.customerId);
                loansForDue.push({
                    id: loanDoc.id,
                    customerId: loan.customerId,
                    customerName: loan.customerName,
                    tenure: loan.tenure,
                    repaymentSchedule: loan.repaymentSchedule || []
                });
            });

            const dueList = getAllDueEmis(loansForDue);
            const pendingEmisList: PendingEmi[] = dueList.map(d => {
                const customerData = customerMap.get(d.customerId);
                return {
                    loanId: d.loanId,
                    customerId: d.customerId,
                    customerName: d.customerName,
                    emiNumber: d.emiNumber,
                    dueDate: d.dueDate,
                    amount: d.amount,
                    tenure: d.tenure,
                    phoneNumber: customerData?.phone || 'N/A',
                    customerPhoto: customerData?.photo_url,
                    amountPaid: d.amountPaid,
                    isFinalEmi: d.isFinalEmi
                };
            });

            setAllPendingEmis(pendingEmisList);

        } catch (error) {
            console.error("Failed to load pending EMIs:", error);
        } finally {
            setLoading(false);
        }
    }, [currentCompany]);

    useEffect(() => {
        fetchPendingEmis();
    }, [fetchPendingEmis]);

    useEffect(() => {
        // All unpaid installments whose due date has arrived (previous + current month).
        // Future-month EMIs were already excluded in fetchPendingEmis.
        setFilteredEmis(allPendingEmis);
        const groups = groupDueEmisByLoan(allPendingEmis);
        setCustomerGroups(groups);
        const totalRemaining = allPendingEmis.reduce((sum, item) => {
            const amt = Number(item.amount) || 0;
            const paid = Number(item.amountPaid) || 0;
            return sum + Math.max(0, amt - paid);
        }, 0);
        setTotalDue(totalRemaining);
        setOverdueCount(allPendingEmis.filter(emi => isPast(parseLocalDate(emi.dueDate))).length);
    }, [allPendingEmis]);

    // --- Actions ---

    const handleSendReminder = (emi: PendingEmi) => {
        const customerPhone = emi.phoneNumber;
        if (!customerPhone || customerPhone === 'N/A' || customerPhone.length < 10) {
            error("Customer phone number not found or invalid.");
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

        const whatsappUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_system');
    };

    // Direct call — opens phone dialer
    const handleDirectCall = (emi: PendingEmi) => {
        const customerPhone = emi.phoneNumber;
        if (!customerPhone || customerPhone === 'N/A' || customerPhone.replace(/\D/g, '').length < 10) {
            error("Customer phone number not found or invalid.");
            return;
        }
        const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
        const telUrl = `tel:+91${cleanPhone}`;
        try {
            window.location.href = telUrl;
        } catch {
            window.open(telUrl, '_system');
        }
    };

    // ── Expandable card: one card per loan, month-wise EMI selection inside ──
    const emiKey = (e: PendingEmi) => `${e.loanId}-${e.emiNumber}`;
    const emiRemaining = (e: PendingEmi) => Math.max(0, e.amount - (e.amountPaid || 0));

    const expandedGroup = customerGroups.find(g => g.loanId === expandedLoanId) || null;

    const toggleExpand = (loanId: string) => {
        if (expandedLoanId === loanId) {
            // Collapse — clear selection
            setExpandedLoanId(null);
            setSelectedEmiKeys(new Set());
            setCustomAmount(0);
            setPaymentRemark('');
        } else {
            // Expand — NO auto-selection (spec: don't select any month automatically)
            setExpandedLoanId(loanId);
            setSelectedEmiKeys(new Set());
            setCustomAmount(0);
            setPaymentRemark('');
        }
    };

    const toggleEmiSelection = (emi: PendingEmi) => {
        setSelectedEmiKeys(prev => {
            const next = new Set(prev);
            const key = emiKey(emi);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const selectAllInExpanded = () => {
        if (!expandedGroup) return;
        // Select every eligible pending EMI in the expanded group
        const allKeys = new Set(expandedGroup.emis.map(e => emiKey(e)));
        const allSelected = expandedGroup.emis.every(e => selectedEmiKeys.has(emiKey(e)));
        setSelectedEmiKeys(allSelected ? new Set() : allKeys);
    };

    // Selected EMIs scoped to the EXPANDED group only (never mix loans)
    const expandedEmis = expandedGroup?.emis || [];
    const selectedEmis = expandedEmis.filter(e => selectedEmiKeys.has(emiKey(e)));
    const selectedTotalRemaining = selectedEmis.reduce((s, e) => s + emiRemaining(e), 0);

    // Allocation preview for the amount the user entered (default = selected total)
    const enteredAmount = customAmount > 0 ? customAmount : selectedTotalRemaining;
    const allocationPreview: { lines: AllocationLine[]; totalAllocated: number; leftover: number } | null =
        selectedEmis.length > 0 && enteredAmount > 0
            ? previewAllocation(selectedEmis.map(e => ({ emiNumber: e.emiNumber, remaining: emiRemaining(e) })), enteredAmount)
            : null;

    // Validation
    const amountError: string | null = (() => {
        if (selectedEmis.length === 0) return 'Kam se kam ek EMI select karo.';
        if (enteredAmount <= 0) return 'Amount 0 se zyada hona chahiye.';
        if (enteredAmount > selectedTotalRemaining) return `Selected total (${formatCurrency(selectedTotalRemaining)}) se zyada nahi de sakte.`;
        return null;
    })();

    const canCollect = selectedEmis.length > 0 && !amountError && !isSubmitting;

    const closeExpanded = () => {
        setExpandedLoanId(null);
        setSelectedEmiKeys(new Set());
        setCustomAmount(0);
        setPaymentRemark('');
        setShowConfirmDialog(false);
    };

    const handleBulkSendReminders = () => {
        if (filteredEmis.length === 0) return error("No EMIs to remind.");

        let count = 0;
        filteredEmis.forEach((emi, index) => {
            if (emi.phoneNumber && emi.phoneNumber.length >= 10) {
                setTimeout(() => handleSendReminder(emi), index * 500);
                count++;
            }
        });
        info(`Opening WhatsApp for ${count} customers... allow popups if blocked.`);
    };

    const generatePaymentReceiptPDF = (receiptData: {
        receiptId: string;
        customerName: string;
        customerId: string;
        loanId: string;
        emiNumber: number;
        tenure: number;
        emiAmount: number;
        amountPaid: number;
        paymentDate: string;
        paymentMethod: string;
        remark: string;
        isExtraPayment: boolean;
        phoneNumber?: string;
    }) => {
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
        pdfDoc.text(receiptData.isExtraPayment ? "EXTRA PAYMENT RECEIPT" : "PAYMENT RECEIPT", pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 10;

        pdfDoc.line(14, y, 196, y);
        y += 8;

        pdfDoc.setFontSize(11);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Receipt No: ${receiptData.receiptId}`, 14, y);
        pdfDoc.text(`Date: ${format(parseISO(receiptData.paymentDate), 'dd MMMM yyyy')}`, 140, y);
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("CUSTOMER DETAILS", 14, y);
        y += 7;
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Name: ${receiptData.customerName}`, 14, y);
        y += 6;
        pdfDoc.text(`Customer ID: ${receiptData.customerId}`, 14, y);
        if (receiptData.phoneNumber) {
            y += 6;
            pdfDoc.text(`Phone: ${receiptData.phoneNumber}`, 14, y);
        }
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("LOAN DETAILS", 14, y);
        y += 7;
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Loan ID: ${receiptData.loanId}`, 14, y);
        y += 6;
        pdfDoc.text(`EMI Number: ${receiptData.emiNumber} of ${receiptData.tenure}`, 14, y);
        y += 6;
        pdfDoc.text(`Regular EMI Amount: ${formatCurrency(receiptData.emiAmount)}`, 14, y);
        y += 10;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("PAYMENT DETAILS", 14, y);
        y += 7;

        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Payment Method: ${receiptData.paymentMethod.toUpperCase()}`, 14, y);
        y += 6;

        if (receiptData.isExtraPayment) {
            const extraAmount = receiptData.amountPaid - receiptData.emiAmount;
            pdfDoc.text(`Regular EMI: ${formatCurrency(receiptData.emiAmount)}`, 14, y);
            y += 6;
            pdfDoc.text(`Extra Payment: ${formatCurrency(extraAmount)}`, 14, y);
            y += 8;
        }

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFillColor(240, 240, 240);
        pdfDoc.rect(14, y - 5, 182, 12, 'F');
        pdfDoc.text(`TOTAL AMOUNT PAID: ${formatCurrency(receiptData.amountPaid)}`, 14, y + 2);
        y += 15;

        if (receiptData.remark) {
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.text(`Remark: ${receiptData.remark}`, 14, y);
            y += 10;
        }

        pdfDoc.line(14, y, 196, y);
        y += 10;

        pdfDoc.setFont("helvetica", "italic");
        pdfDoc.setFontSize(10);
        pdfDoc.text("Thank you for your payment. This is a computer generated receipt.", 14, y);
        y += 15;

        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text("Authorized Signature: ____________________", 14, y);

        const pageCount = (pdfDoc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdfDoc.setPage(i);
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
        }

        return pdfDoc;
    };

    const handleCollectEmi = async () => {
        if (!expandedGroup || isSubmitting) return;
        if (selectedEmis.length === 0) {
            error("Kam se kam ek EMI select karo.");
            return;
        }
        if (amountError) {
            error(amountError);
            return;
        }

        const totalRemaining = selectedTotalRemaining;
        const amountToPay = enteredAmount;

        setIsSubmitting(true);
        let paymentLog: { emiNumber: number; paid: number; fullyPaid: boolean }[] = [];
        let amountLeftAfter = 0;
        let remarkText = '';
        try {
            let receiptDocId = '';

            // ── Transaction 1 (CRITICAL): update loan repaymentSchedule only ──
            // Receipt creation is separate/best-effort so a counters/receipts
            // rule can never block an actual EMI collection.
            await runTransaction(db, async (transaction) => {
                const loanRef = doc(db, "loans", expandedGroup.loanId);

                const loanDoc = await transaction.get(loanRef);
                if (!loanDoc.exists()) throw new Error("Loan not found!");

                const loanData = loanDoc.data();
                const today = new Date();
                const paymentDate = format(today, 'yyyy-MM-dd');

                // ── Allocation: pay selected EMIs oldest-first, partial-aware ──
                let amountLeft = amountToPay;

                const updatedSchedule = loanData.repaymentSchedule.map((emi: any) => {
                    const isSelected = selectedEmis.some(s => s.emiNumber === emi.emiNumber);
                    if (!isSelected || amountLeft <= 0) return emi;

                    const alreadyPaid = Number(emi.amountPaid) || 0;
                    const remaining = Math.max(0, emi.amount - alreadyPaid);
                    if (remaining <= 0) return emi;

                    const payNow = Math.min(remaining, amountLeft);
                    amountLeft -= payNow;
                    const newPaid = alreadyPaid + payNow;
                    const fullyPaid = newPaid >= emi.amount - 1; // 1-rupee tolerance

                    paymentLog.push({ emiNumber: emi.emiNumber, paid: payNow, fullyPaid });

                    return {
                        ...emi,
                        status: fullyPaid ? 'Paid' : 'Pending',
                        paymentDate: fullyPaid ? paymentDate : (emi.paymentDate || null),
                        paymentMethod: paymentMethod,
                        amountPaid: newPaid,
                        remark: paymentRemark || emi.remark || null,
                    };
                });

                const fullyPaidCount = paymentLog.filter(p => p.fullyPaid).length;
                const partialCount = paymentLog.filter(p => !p.fullyPaid).length;
                const emiListText = paymentLog.map(p => `#${p.emiNumber}`).join(', ');
                const remarkTextLocal = [
                    paymentRemark,
                    paymentLog.length > 1 ? `EMIs ${emiListText}` : '',
                    partialCount > 0 ? `(${partialCount} partial)` : '',
                    amountLeft > 0 ? `Extra: ${formatCurrency(amountLeft)}` : '',
                ].filter(Boolean).join(' - ');
                remarkText = remarkTextLocal;
                amountLeftAfter = amountLeft;

                let nextReceiptId = Date.now(); // unique, no counters read needed
                receiptDocId = `RCPT-${expandedGroup.loanId}-${nextReceiptId}`;

                // Only the loan update is inside the transaction
                transaction.update(loanRef, { repaymentSchedule: updatedSchedule });
            });

            // ── Best-effort: receipt save (never blocks the payment) ──
            try {
                await setDoc(doc(db, "receipts", receiptDocId), {
                    receiptId: receiptDocId,
                    loanId: expandedGroup.loanId,
                    customerId: expandedGroup.customerId,
                    customerName: expandedGroup.customerName,
                    amount: amountToPay,
                    emiAmount: selectedEmis.length === 1 ? selectedEmis[0].amount : totalRemaining,
                    isExtraPayment: amountLeftAfter > 0,
                    extraAmount: amountLeftAfter > 0 ? amountLeftAfter : 0,
                    paymentDate: format(new Date(), 'yyyy-MM-dd'),
                    paymentMethod: paymentMethod,
                    emiNumber: paymentLog[0]?.emiNumber ?? selectedEmis[0].emiNumber,
                    emisCovered: paymentLog.map(p => p.emiNumber),
                    remark: remarkText,
                    createdAt: new Date().toISOString(),
                });
            } catch (receiptErr) {
                console.warn("Receipt save skipped (permission) — payment was saved:", receiptErr);
            }

            // ── PDF receipt (single-EMI layout if one, summary if many) ──
            const receiptData = {
                receiptId: receiptDocId,
                customerName: expandedGroup.customerName,
                customerId: expandedGroup.customerId,
                loanId: expandedGroup.loanId,
                emiNumber: paymentLog[0]?.emiNumber ?? selectedEmis[0].emiNumber,
                tenure: expandedGroup.tenure,
                emiAmount: selectedEmis.length === 1 ? selectedEmis[0].amount : totalRemaining,
                amountPaid: amountToPay,
                paymentDate: format(new Date(), 'yyyy-MM-dd'),
                paymentMethod: paymentMethod,
                remark: remarkText,
                isExtraPayment: amountLeftAfter > 0,
                phoneNumber: selectedEmis[0].phoneNumber
            };

            const pdfDoc = generatePaymentReceiptPDF(receiptData as any);
            pdfDoc.save(`Receipt_${receiptDocId}.pdf`);

            setLastCollectedEmi({ ...selectedEmis[0], amount: amountToPay });

            // Refresh the whole list from source of truth
            await fetchPendingEmis();
            setExpandedLoanId(null);
            setSelectedEmiKeys(new Set());
            setCustomAmount(0);
            setPaymentRemark('');
            setIsNotificationModalOpen(true);
            success(selectedEmis.length > 1
                ? `${selectedEmis.length} EMIs ka payment save ho gaya!`
                : "Collection Successful! Receipt downloaded.");

        } catch (error: any) {
            console.error("Error collecting EMI:", error);
            toast("Collection Failed: " + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadReport = () => {
        try {
            const doc = new jsPDF();
            const monthName = format(new Date(), 'MMMM yyyy');
            const totalRemaining = filteredEmis.reduce((sum, emi) => sum + Math.max(0, emi.amount - (emi.amountPaid || 0)), 0);
            const overdue = filteredEmis.filter(emi => isPast(parseISO(emi.dueDate))).length;

            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text(`${companyDetails.name}`, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            doc.setFontSize(14);
            doc.text(`Outstanding Due Report - as of ${monthName}`, doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Generated: ${format(new Date(), 'dd-MMM-yyyy HH:mm')}`, 14, 35);
            doc.text(`Total Outstanding: ${formatCurrency(totalRemaining)}`, 14, 40);
            doc.text(`Pending EMIs: ${filteredEmis.length}  |  Overdue: ${overdue}`, 14, 45);

            const tableColumns = ["Customer", "Loan ID", "EMI", "Remaining", "Due Date", "Phone"];
            const tableRows = filteredEmis.map(emi => [
                emi.customerName,
                emi.loanId,
                `${emi.emiNumber}/${emi.tenure}`,
                formatCurrency(Math.max(0, emi.amount - (emi.amountPaid || 0))),
                format(parseISO(emi.dueDate), 'dd-MMM-yyyy'),
                emi.phoneNumber || 'N/A'
            ]);

            autoTable(doc, {
                head: [tableColumns],
                body: tableRows,
                startY: 52,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] },
            });

            doc.save(`Due_List_Outstanding_${format(new Date(), 'yyyy_MM')}.pdf`);
        } catch (error) {
            console.error("PDF Error", error);
            toast("Failed to download PDF", 'error');
        }
    };

    const handleSendConfirmation = async () => {
        if (!lastCollectedEmi?.phoneNumber) {
            error("No phone number available for confirmation.");
            setIsNotificationModalOpen(false);
            return;
        }

        const formattedPhone = `91${lastCollectedEmi.phoneNumber.replace(/\D/g, '').slice(-10)}`;
        const message = `Payment Received!\n\nDear ${lastCollectedEmi.customerName},\nWe have received your payment of ${formatCurrency(lastCollectedEmi.amount)} for EMI #${lastCollectedEmi.emiNumber}.\n\nThank you,\nJLS Finance Company`;

        window.open(`whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`, '_system');
        setIsNotificationModalOpen(false);
        setLastCollectedEmi(null);
    };

    const handleBack = () => {
        window.history.back();
    };

    return (
        <div className="min-h-[100dvh] pb-nav text-slate-900 dark:text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 pb-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-2xl font-bold tracking-tight">Due List</h1>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleDownloadReport} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 active:scale-95 transition-all">
                        <span className="material-symbols-outlined font-variation-FILL">download</span>
                    </button>
                    <button onClick={handleBulkSendReminders} className="p-2.5 rounded-xl bg-green-600 text-white shadow-md shadow-green-500/30 active:scale-95 transition-all">
                        <WhatsAppIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-3">

                {/* Summary — all due EMIs (previous + current month) */}
                <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-bold text-lg">Total Outstanding</h2>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            {format(new Date(), 'MMMM yyyy')} tak
                        </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <div className="text-center w-full">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Total Due</span>
                            <span className="block text-xl font-extrabold text-primary">{formatCurrency(totalDue)}</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="text-center w-full">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Pending EMIs</span>
                            <span className="block text-xl font-extrabold text-slate-700 dark:text-white">{filteredEmis.length}</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="text-center w-full">
                            <span className="block text-xs font-bold text-slate-500 uppercase">Overdue</span>
                            <span className="block text-xl font-extrabold text-rose-500">{overdueCount}</span>
                        </div>
                    </div>
                </div>

                {/* List View — ONE card per customer/loan */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="p-4">
                            <SkeletonStyles />
                            <SkeletonList count={6} />
                        </div>
                    ) : customerGroups.length > 0 ? (
                        customerGroups.map((group) => {
                            const isExpanded = expandedLoanId === group.loanId;
                            const groupEmi = group.emis[0]; // for photo/phone
                            const lastMonthEmi = group.previousMonthCount > 0;
                            const finalEmi = group.emis.some(e => e.isFinalEmi);
                            return (
                                <div key={group.loanId} className={`bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden ${lastMonthEmi ? 'ring-2 ring-rose-400/70' : finalEmi ? 'ring-2 ring-amber-400/70' : 'border border-slate-100 dark:border-slate-800'}`}>
                                    {/* ── Card header (collapsed summary) ── */}
                                    <button onClick={() => toggleExpand(group.loanId)} className="w-full text-left p-3 flex items-center gap-3">
                                        <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                                            {groupEmi.customerPhoto ? (
                                                <img src={groupEmi.customerPhoto} alt={group.customerName} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                                    <span className="material-symbols-outlined text-[24px]">person</span>
                                                </div>
                                            )}
                                            {lastMonthEmi && (
                                                <div className="absolute -top-1 -right-1 h-4 w-4 bg-rose-500 rounded-full border-2 border-white dark:border-[#1e2736]"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-sm text-slate-900 dark:text-white capitalize truncate">{group.customerName.toLowerCase()}</h3>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                <span className="text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 px-1.5 py-0.5 rounded">
                                                    {group.previousMonthCount > 0
                                                        ? `${group.previousMonthCount} Month${group.previousMonthCount > 1 ? 's' : ''} Pending`
                                                        : `${group.pendingCount} EMI Pending`}
                                                </span>
                                                {group.overdueCount > 0 && (
                                                    <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{group.overdueCount} Overdue</span>
                                                )}
                                            </div>
                                            {groupEmi.phoneNumber && groupEmi.phoneNumber !== 'N/A' && (
                                                <p className="text-[10px] text-slate-400 mt-0.5">{groupEmi.phoneNumber.slice(-10)}</p>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-base font-extrabold text-slate-800 dark:text-white">{formatCurrency(group.totalRemaining)}</p>
                                            <span className="text-[10px] font-bold text-slate-400">{group.pendingCount} EMIs</span>
                                        </div>
                                        <span className={`material-symbols-outlined text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                    </button>

                                    {/* ── Expanded section: month-wise EMI selection ── */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-3">
                                            {/* Select All */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-500">Kaunsi EMI jama kar rahe ho?</span>
                                                <button onClick={selectAllInExpanded} className="text-xs font-bold text-primary">
                                                    {group.emis.every(e => selectedEmiKeys.has(emiKey(e))) ? 'Sab deselect karo' : 'Select All'}
                                                </button>
                                            </div>

                                            {/* EMI table header */}
                                            <div className="grid grid-cols-[24px_1fr_auto] gap-2 text-[10px] font-bold text-slate-400 uppercase px-1">
                                                <span></span>
                                                <span>EMI Month / No.</span>
                                                <span>Paid → Balance</span>
                                            </div>

                                            {/* EMI rows */}
                                            <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                                {group.emis.map((emi) => {
                                                    const remaining = emiRemaining(emi);
                                                    const selected = selectedEmiKeys.has(emiKey(emi));
                                                    const paid = emi.amountPaid || 0;
                                                    return (
                                                        <button
                                                            key={emiKey(emi)}
                                                            onClick={() => toggleEmiSelection(emi)}
                                                            className={`w-full grid grid-cols-[24px_1fr_auto] gap-2 items-center p-2.5 rounded-xl border text-left transition-all ${selected
                                                                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                                                : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                                }`}
                                                        >
                                                            <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600'}`}>
                                                                {selected && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="text-xs font-bold">{format(parseLocalDate(emi.dueDate), 'MMMM yyyy')}</span>
                                                                    <span className="text-[10px] font-mono text-slate-400">{emi.emiNumber}/{emi.tenure}</span>
                                                                    {emi.isFinalEmi && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1 rounded">Aakhri</span>}
                                                                    {emi.isOverdue && <span className="text-[9px] font-bold text-red-500">Overdue</span>}
                                                                </div>
                                                                <p className="text-[10px] text-slate-400">EMI: {formatCurrency(emi.amount)} · Due: {format(parseLocalDate(emi.dueDate), 'dd MMM yyyy')}</p>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-sm font-extrabold text-slate-700 dark:text-white">{formatCurrency(remaining)}</p>
                                                                {paid > 0 && <p className="text-[10px] font-bold text-emerald-600">{formatCurrency(paid)} paid</p>}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Selected summary + amount input */}
                                            <div className="space-y-3 pt-1">
                                                <div className="p-3 bg-primary/10 dark:bg-primary/20 rounded-xl space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Selected Total ({selectedEmis.length} EMIs)</span>
                                                        <span className="text-lg font-extrabold text-primary">{formatCurrency(selectedTotalRemaining)}</span>
                                                    </div>
                                                    {allocationPreview && allocationPreview.lines.filter(l => l.allocated > 0).length > 0 && (
                                                        <div className="text-[10px] text-slate-500 space-y-0.5 pt-1 border-t border-primary/20">
                                                            {allocationPreview.lines.filter(l => l.allocated > 0).map(l => (
                                                                <div key={l.emiNumber} className="flex justify-between">
                                                                    <span>EMI #{l.emiNumber}</span>
                                                                    <span>{formatCurrency(l.allocated)} paid{l.remainingAfter > 1 ? ` · ${formatCurrency(l.remainingAfter)} baaki` : ' · ✓'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Actual Amount Received</label>
                                                    <input
                                                        type="number"
                                                        value={customAmount || selectedTotalRemaining}
                                                        onChange={(e) => setCustomAmount(Number(e.target.value))}
                                                        placeholder={`Default: ${selectedTotalRemaining}`}
                                                        className={`w-full px-3 py-2 bg-white dark:bg-[#1a2230] border rounded-lg focus:ring-2 focus:ring-primary outline-none text-lg font-bold ${amountError ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'}`}
                                                    />
                                                    {amountError ? (
                                                        <p className="text-xs text-rose-500 mt-1 font-medium">{amountError}</p>
                                                    ) : enteredAmount < selectedTotalRemaining && selectedEmis.length > 0 ? (
                                                        <p className="text-xs text-amber-600 mt-1">Partial: {formatCurrency(selectedTotalRemaining - enteredAmount)} baaki rahega (oldest first adjust hoga)</p>
                                                    ) : null}
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Payment Method</label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {['cash', 'upi', 'bank'].map((method) => (
                                                            <button
                                                                key={method}
                                                                onClick={() => setPaymentMethod(method)}
                                                                className={`py-2 rounded-lg text-sm font-bold capitalize border ${paymentMethod === method
                                                                    ? 'bg-primary text-white border-primary'
                                                                    : 'bg-white dark:bg-[#1a2230] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                                                    }`}
                                                            >
                                                                {method}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Remark (Optional)</label>
                                                    <input
                                                        type="text"
                                                        value={paymentRemark}
                                                        onChange={(e) => setPaymentRemark(e.target.value)}
                                                        placeholder="Any notes..."
                                                        className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>

                                                {/* Collect button */}
                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        onClick={() => handleDirectCall(groupEmi)}
                                                        title="Call"
                                                        className="px-3 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">call</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleSendReminder(groupEmi)}
                                                        title="WhatsApp Reminder"
                                                        className="px-3 py-2.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">chat</span>
                                                    </button>
                                                    <button
                                                        onClick={() => { if (canCollect) setShowConfirmDialog(true); }}
                                                        disabled={!canCollect}
                                                        title={amountError || undefined}
                                                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${canCollect
                                                            ? 'bg-green-600 text-white shadow-md shadow-green-500/30 active:scale-[0.98] hover:bg-green-700'
                                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                                            }`}
                                                    >
                                                        {isSubmitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                                        {isSubmitting ? 'Saving...' : `Collect ${formatCurrency(enteredAmount)}`}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                            <p>No pending EMIs — sab up to date hain!</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Final Confirmation Dialog */}
            {showConfirmDialog && expandedGroup && selectedEmis.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold mb-1">Confirm Collection</h3>
                        <p className="text-sm text-slate-500 mb-4">{expandedGroup.customerName}</p>

                        <div className="space-y-2 mb-4">
                            {selectedEmis.map((emi, idx) => {
                                const line = allocationPreview?.lines.find(l => l.emiNumber === emi.emiNumber);
                                return (
                                    <div key={emiKey(emi)} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-bold">{format(parseLocalDate(emi.dueDate), 'MMMM yyyy')}</span>
                                            <span className="text-[10px] font-mono text-slate-400">EMI {emi.emiNumber}/{emi.tenure}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>Balance: {formatCurrency(emiRemaining(emi))}</span>
                                            <span className="font-bold text-green-600">Pay: {formatCurrency(line?.allocated ?? 0)}</span>
                                        </div>
                                        {(line?.remainingAfter ?? 0) > 1 && (
                                            <p className="text-[10px] text-amber-600">Baaki rahega: {formatCurrency(line?.remainingAfter ?? 0)}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl mb-4 space-y-1">
                            <div className="flex justify-between text-sm font-bold">
                                <span>Total Received</span>
                                <span className="text-green-700 dark:text-green-400">{formatCurrency(enteredAmount)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Selected Total</span>
                                <span>{formatCurrency(selectedTotalRemaining)}</span>
                            </div>
                            {enteredAmount < selectedTotalRemaining && (
                                <div className="flex justify-between text-xs text-amber-600">
                                    <span>Remaining After Payment</span>
                                    <span>{formatCurrency(selectedTotalRemaining - enteredAmount)}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleCollectEmi}
                                disabled={isSubmitting}
                                className="w-full py-3 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSubmitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                                {isSubmitting ? 'Saving...' : 'Confirm & Collect'}
                            </button>
                            <button
                                onClick={() => setShowConfirmDialog(false)}
                                disabled={isSubmitting}
                                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                            >
                                Edit / Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Modal */}
            {isNotificationModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-4 text-center">
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