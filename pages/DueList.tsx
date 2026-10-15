import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, runTransaction, getDoc } from "firebase/firestore";
import { format, parseISO, isPast } from 'date-fns';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCompany } from '../context/CompanyContext';
import { useToast } from '../components/Toast';
import { SkeletonList, SkeletonStyles } from '../components/Skeleton';
import { getAllDueEmis, parseLocalDate } from '../services/emiSchedule';

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
    const { success, error, info, toast } = useToast();
    const [loading, setLoading] = useState(true);

    // Summary Stats
    const [totalDue, setTotalDue] = useState(0);
    const [overdueCount, setOverdueCount] = useState(0); // EMIs past due date

    // Modal State
    const [selectedEmi, setSelectedEmi] = useState<PendingEmi | null>(null);
    const [customerDueEmis, setCustomerDueEmis] = useState<PendingEmi[]>([]);
    const [selectedEmiKeys, setSelectedEmiKeys] = useState<Set<string>>(new Set());
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [customAmount, setCustomAmount] = useState<number>(0);
    const [paymentRemark, setPaymentRemark] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [pendingReceiptData, setPendingReceiptData] = useState<any>(null);

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
        const totalRemaining = allPendingEmis.reduce((sum, item) => sum + Math.max(0, item.amount - (item.amountPaid || 0)), 0);
        setTotalDue(totalRemaining);
        setOverdueCount(allPendingEmis.filter(emi => isPast(parseISO(emi.dueDate))).length);
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

    // ── Month-wise collection: open modal with ALL of this customer's due EMIs ──
    const openCollectModal = (emi: PendingEmi) => {
        // Same customer + same loan: all due installments (previous + current month)
        const related = allPendingEmis
            .filter(e => e.customerId === emi.customerId && e.loanId === emi.loanId)
            .sort((a, b) => a.emiNumber - b.emiNumber);
        setCustomerDueEmis(related);
        setSelectedEmi(emi);
        setSelectedEmiKeys(new Set([`${emi.loanId}-${emi.emiNumber}`]));
        setCustomAmount(0);
        setPaymentRemark('');
    };

    const emiKey = (e: PendingEmi) => `${e.loanId}-${e.emiNumber}`;
    const emiRemaining = (e: PendingEmi) => Math.max(0, e.amount - (e.amountPaid || 0));

    const toggleEmiSelection = (emi: PendingEmi) => {
        setSelectedEmiKeys(prev => {
            const next = new Set(prev);
            const key = emiKey(emi);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const selectedEmis = customerDueEmis.filter(e => selectedEmiKeys.has(emiKey(e)));
    const selectedTotalRemaining = selectedEmis.reduce((s, e) => s + emiRemaining(e), 0);

    // Highlight helpers — previous-month unpaid (rose) vs final EMI (amber)
    const isLastMonthEmi = (emi: PendingEmi) => {
        const due = parseLocalDate(emi.dueDate);
        const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        return due.getTime() < thisMonthStart.getTime();
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

    const handlePreviewPdf = () => {
        if (!selectedEmi) return;

        const amountToPay = customAmount > 0 ? customAmount : selectedTotalRemaining;
        const isExtra = amountToPay > selectedTotalRemaining;

        const receiptData = {
            receiptId: `RCPT-PREVIEW`,
            customerName: selectedEmi.customerName,
            customerId: selectedEmi.customerId,
            loanId: selectedEmi.loanId,
            emiNumber: selectedEmis[0]?.emiNumber ?? selectedEmi.emiNumber,
            tenure: selectedEmi.tenure,
            emiAmount: selectedEmis.length === 1 ? selectedEmis[0].amount : selectedTotalRemaining,
            amountPaid: amountToPay,
            paymentDate: format(new Date(), 'yyyy-MM-dd'),
            paymentMethod: paymentMethod,
            remark: paymentRemark,
            isExtraPayment: isExtra,
            phoneNumber: selectedEmi.phoneNumber
        };

        const pdfDoc = generatePaymentReceiptPDF(receiptData as any);
        pdfDoc.save(`Receipt_Preview_${selectedEmi.loanId}_EMI_${receiptData.emiNumber}.pdf`);
    };

    const handleCollectEmi = async () => {
        if (!selectedEmi || isSubmitting) return;
        if (selectedEmis.length === 0) {
            error("Kam se kam ek EMI select karo.");
            return;
        }

        const totalRemaining = selectedTotalRemaining;
        const amountToPay = customAmount > 0 ? customAmount : totalRemaining;

        if (amountToPay <= 0) {
            error("Enter a valid amount.");
            return;
        }

        setIsSubmitting(true);
        let paymentLog: { emiNumber: number; paid: number; fullyPaid: boolean }[] = [];
        let amountLeftAfter = 0;
        let remarkText = '';
        try {
            let receiptDocId = '';

            await runTransaction(db, async (transaction) => {
                const loanRef = doc(db, "loans", selectedEmi.loanId);
                const receiptCounterRef = doc(db, 'counters', 'receiptId_counter');

                const loanDoc = await transaction.get(loanRef);
                const counterDoc = await transaction.get(receiptCounterRef);

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

                let nextReceiptId = 1;
                if (counterDoc.exists()) {
                    nextReceiptId = (counterDoc.data().lastId || 0) + 1;
                }

                receiptDocId = `RCPT-${nextReceiptId}`;
                const receiptRef = doc(db, "receipts", receiptDocId);

                transaction.update(loanRef, { repaymentSchedule: updatedSchedule });
                transaction.set(receiptRef, {
                    receiptId: receiptDocId,
                    loanId: selectedEmi.loanId,
                    customerId: selectedEmi.customerId,
                    customerName: selectedEmi.customerName,
                    amount: amountToPay,
                    emiAmount: selectedEmis.length === 1 ? selectedEmis[0].amount : totalRemaining,
                    isExtraPayment: amountLeft > 0,
                    extraAmount: amountLeft > 0 ? amountLeft : 0,
                    paymentDate: paymentDate,
                    paymentMethod: paymentMethod,
                    emiNumber: paymentLog[0]?.emiNumber ?? selectedEmi.emiNumber,
                    emisCovered: paymentLog.map(p => p.emiNumber),
                    remark: remarkText,
                    createdAt: new Date().toISOString(),
                });
                transaction.set(receiptCounterRef, { lastId: nextReceiptId }, { merge: true });
            });

            // ── PDF receipt (single-EMI layout if one, summary if many) ──
            const receiptData = {
                receiptId: receiptDocId,
                customerName: selectedEmi.customerName,
                customerId: selectedEmi.customerId,
                loanId: selectedEmi.loanId,
                emiNumber: paymentLog[0]?.emiNumber ?? selectedEmi.emiNumber,
                tenure: selectedEmi.tenure,
                emiAmount: selectedEmis.length === 1 ? selectedEmis[0].amount : totalRemaining,
                amountPaid: amountToPay,
                paymentDate: format(new Date(), 'yyyy-MM-dd'),
                paymentMethod: paymentMethod,
                remark: remarkText,
                isExtraPayment: amountLeftAfter > 0,
                phoneNumber: selectedEmi.phoneNumber
            };

            const pdfDoc = generatePaymentReceiptPDF(receiptData as any);
            pdfDoc.save(`Receipt_${receiptDocId}.pdf`);

            setLastCollectedEmi({ ...selectedEmi, amount: amountToPay });

            // Refresh the whole list from source of truth
            await fetchPendingEmis();
            setSelectedEmi(null);
            setCustomerDueEmis([]);
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
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-safe text-slate-900 dark:text-white">
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

            <div className="max-w-4xl mx-auto p-4 space-y-6">

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

                {/* List View */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="p-4">
                            <SkeletonStyles />
                            <SkeletonList count={6} />
                        </div>
                    ) : filteredEmis.length > 0 ? (
                        filteredEmis.map((emi) => {
                            const finalEmi = !!emi.isFinalEmi;
                            const lastMonthEmi = isLastMonthEmi(emi);
                            return (
                            <div key={`${emi.loanId}-${emi.emiNumber}`} className={`bg-white dark:bg-[#1e2736] rounded-2xl p-3 shadow-sm hover:shadow-md transition-all overflow-hidden ${lastMonthEmi ? 'ring-2 ring-rose-400/70 bg-rose-50/50 dark:bg-rose-900/10' : finalEmi ? 'ring-2 ring-amber-400/70 bg-amber-50/50 dark:bg-amber-900/10' : 'border border-slate-100 dark:border-slate-800'}`}>
                                <div className="flex items-center gap-3">
                                    <div className="relative h-11 w-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                                        {emi.customerPhoto ? (
                                            <img src={emi.customerPhoto} alt={emi.customerName} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                                <span className="material-symbols-outlined text-[22px]">person</span>
                                            </div>
                                        )}
                                        {lastMonthEmi && (
                                            <div className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-rose-500 rounded-full border-2 border-white dark:border-[#1e2736]"></div>
                                        )}
                                        {finalEmi && !lastMonthEmi && (
                                            <div className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-amber-500 rounded-full border-2 border-white dark:border-[#1e2736]"></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-sm text-slate-900 dark:text-white capitalize truncate">{emi.customerName.toLowerCase()}</h3>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">EMI {emi.emiNumber}/{emi.tenure}</span>
                                            {lastMonthEmi ? (
                                                <span className="text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 px-1.5 py-0.5 rounded">Pichle Mahine</span>
                                            ) : finalEmi ? (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">Aakhri EMI</span>
                                            ) : null}
                                            {isPast(parseISO(emi.dueDate)) ? (
                                                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Overdue</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400">{format(parseISO(emi.dueDate), 'dd MMM')}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-base font-extrabold text-slate-800 dark:text-white">{formatCurrency(Math.max(0, emi.amount - (emi.amountPaid || 0)))}</p>
                                        {(emi.amountPaid || 0) > 0 && (
                                            <span className="text-[10px] font-bold text-emerald-600 block">{formatCurrency(emi.amountPaid || 0)} paid</span>
                                        )}
                                        {emi.phoneNumber && emi.phoneNumber !== 'N/A' && (
                                            <button onClick={() => handleDirectCall(emi)} className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[110px] ml-auto">
                                                {emi.phoneNumber.slice(-10)}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => openCollectModal(emi)}
                                        className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all"
                                    >
                                        Collect
                                    </button>
                                    <button
                                        onClick={() => handleDirectCall(emi)}
                                        title="Call"
                                        className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">call</span>
                                    </button>
                                    <button
                                        onClick={() => handleSendReminder(emi)}
                                        title="WhatsApp Reminder"
                                        className="px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">chat</span>
                                    </button>
                                </div>
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

            {/* Collection Modal */}
            {selectedEmi && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold mb-1">Collect Payment</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {selectedEmi.customerName} — {customerDueEmis.length} due EMIs
                        </p>

                        <div className="space-y-4 mb-6">
                            {/* Month-wise EMI selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">Kaunsi EMI jama kar rahe ho (month select karo)</label>
                                <div className="space-y-2 max-h-52 overflow-y-auto">
                                    {customerDueEmis.map((emi) => {
                                        const remaining = emiRemaining(emi);
                                        const selected = selectedEmiKeys.has(emiKey(emi));
                                        return (
                                            <button
                                                key={emiKey(emi)}
                                                onClick={() => toggleEmiSelection(emi)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selected
                                                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                            >
                                                <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600'}`}>
                                                    {selected && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold">EMI {emi.emiNumber}/{emi.tenure}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{format(parseLocalDate(emi.dueDate), 'MMM yyyy')}</span>
                                                        {(emi.amountPaid || 0) > 0 && (
                                                            <span className="text-[10px] font-bold text-emerald-600">{formatCurrency(emi.amountPaid || 0)} paid</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400">Due: {format(parseLocalDate(emi.dueDate), 'dd MMM yyyy')}</p>
                                                </div>
                                                <span className="text-sm font-extrabold text-slate-700 dark:text-white shrink-0">{formatCurrency(remaining)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {selectedEmis.length > 0 && (
                                    <div className="flex justify-between items-center mt-3 p-3 bg-primary/10 dark:bg-primary/20 rounded-xl">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{selectedEmis.length} EMIs selected</span>
                                        <span className="text-lg font-extrabold text-primary">{formatCurrency(selectedTotalRemaining)}</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">Amount Received (partial ya extra dono chalega)</label>
                                <input
                                    type="number"
                                    value={customAmount || selectedTotalRemaining}
                                    onChange={(e) => setCustomAmount(Number(e.target.value))}
                                    placeholder={`Default: ${selectedTotalRemaining}`}
                                    className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none text-lg font-bold"
                                />
                                {customAmount > 0 && customAmount < selectedTotalRemaining && selectedEmis.length > 0 && (
                                    <p className="text-xs text-amber-600 mt-1">Partial: {formatCurrency(customAmount)} — purani EMIs pehle adjust hongi (oldest first), baaki {formatCurrency(selectedTotalRemaining - customAmount)} due rahega</p>
                                )}
                                {customAmount > selectedTotalRemaining && selectedEmis.length > 0 && (
                                    <p className="text-xs text-green-600 mt-1">Extra Payment: {formatCurrency(customAmount - selectedTotalRemaining)}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">Payment Method</label>
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
                                <label className="block text-xs font-bold text-slate-500 mb-2">Remark (Optional)</label>
                                <input
                                    type="text"
                                    value={paymentRemark}
                                    onChange={(e) => setPaymentRemark(e.target.value)}
                                    placeholder="Any notes..."
                                    className="w-full px-3 py-2 bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handlePreviewPdf}
                                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                                Preview PDF (Save se pehle download)
                            </button>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => { setSelectedEmi(null); setCustomAmount(0); setPaymentRemark(''); }}
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
                                    Save & Download PDF
                                </button>
                            </div>
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