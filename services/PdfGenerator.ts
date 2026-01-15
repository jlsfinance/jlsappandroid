import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid } from 'date-fns';
import { DownloadService } from './DownloadService';

// --- Types --- (Simplified for Service)
interface Company {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    logo_url?: string;
}

interface Customer {
    name: string;
    address?: string;
    phone?: string;
    id?: string;
    photo_url?: string;
    avatar?: string;
    guarantor?: {
        name: string;
        relation: string;
        mobile: string;
        address: string;
        photo?: string;
    };
}

interface Emi {
    emiNumber: number;
    dueDate: string;
    amount: number;
    status: string;
    paymentDate?: string;
    amountPaid?: number;
    paymentMethod?: string;
    remark?: string;
    principal?: number;
    service fee?: number;
}

interface Record {
    id: string;
    amount: number;
    interestRate: number;
    tenure: number;
    installment: number;
    date: string; // Applied/Start Date
    repaymentSchedule?: Emi[];
    amortizationSchedule?: any[];
}

// --- Helpers ---

const formatCurrency = (value: number | undefined) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(value)}`;
};

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

const savePdf = async (pdfDoc: jsPDF, fileName: string) => {
    try {
        const base64Data = pdfDoc.output('datauristring').split(',')[1];
        await DownloadService.downloadPDF(fileName, base64Data);
    } catch (e: any) {
        console.error('File save error', e);
        // alert('Error saving file: ' + e.message); // Service shouldn't alert ideally, but keeping functionality
        throw e;
    }
};

const toBase64 = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = reject;
    });
};

const LOAN_TERMS = [
    "1. The customer agrees to pay the Installment on or before the due date.",
    "2. Default in payment will attract penalty charges as per company policy.",
    "3. The record is secured against the collateral provided (if any).",
    "4. The company reserves the right to recall the record in case of default.",
    "5. Pre-closure charges may add record as per the agreement.",
    "6. This agreement is subject to the jurisdiction of the local courts.",
];


export class PdfGenerator {

    static async generateRecordAgreement(record: Record, customer: Customer, company: Company) {
        const pdf = new jsPDF();

        // Header
        pdf.setFontSize(22);
        pdf.setTextColor(41, 128, 185);
        pdf.text(company.name, 105, 20, { align: "center" });

        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(company.address || "Company Address", 105, 26, { align: "center" });
        pdf.line(20, 32, 190, 32);

        // Title
        pdf.setFontSize(16);
        pdf.setTextColor(0);
        pdf.text("RECORD AGREEMENT", 105, 45, { align: "center" });

        // Record Details Box
        pdf.setDrawColor(200);
        pdf.setFillColor(245, 247, 250);
        pdf.rect(15, 55, 180, 40, "FD");

        pdf.setFontSize(11);
        pdf.text(`Record Account No: ${record.id}`, 20, 65);
        pdf.text(`Date: ${safeFormatDate(record.date)}`, 140, 65);

        pdf.text(`Record Amount: ${formatCurrency(record.amount)}`, 20, 75);
        pdf.text(`Service Rate: ${record.interestRate}% p.a.`, 140, 75);

        pdf.text(`Tenure: ${record.tenure} Months`, 20, 85);
        pdf.text(`Installment Amount: ${formatCurrency(record.installment)}`, 140, 85);

        // Customer Details
        pdf.setFontSize(12);
        pdf.text("Customer Details", 15, 110);
        pdf.setLineWidth(0.5);
        pdf.line(15, 112, 50, 112);

        let yPos = 120;

        // Photo
        if (customer.photo_url || customer.avatar) {
            try {
                const imgData = await toBase64(customer.photo_url || customer.avatar!);
                pdf.addImage(imgData, 'JPEG', 150, 105, 30, 30);
            } catch (e) {
                console.warn("Failed to load customer image for PDF", e);
            }
        }

        pdf.setFontSize(10);
        pdf.text(`Name: ${customer.name}`, 20, yPos);
        yPos += 7;
        pdf.text(`Phone: ${customer.phone || 'N/A'}`, 20, yPos);
        yPos += 7;
        pdf.text(`Address: ${customer.address || "N/A"}`, 20, yPos);

        yPos += 15;

        // Terms
        pdf.setFontSize(12);
        pdf.text("Terms and Conditions", 15, yPos);
        pdf.line(15, yPos + 2, 60, yPos + 2);

        yPos += 10;
        pdf.setFontSize(9);
        LOAN_TERMS.forEach((term) => {
            pdf.text(term, 20, yPos);
            yPos += 6;
        });

        // Signatures
        const signY = 250;
        pdf.line(20, signY, 70, signY);
        pdf.text("Customer's Signature", 25, signY + 5);

        pdf.line(140, signY, 190, signY);
        pdf.text("Authorized Signatory", 145, signY + 5);

        // Footer
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text("Generated by BillBook Suite", 105, 290, { align: 'center' });

        await savePdf(pdf, `Record_Agreement_${record.id}.pdf`);
    }

    static async generateReceipt(record: Record, installment: Emi, customer: Customer, company: Company) {
        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: [210, 99], // 1/3 A4
        });

        // Loop for dual copy (Customer/Office) - Simplified to single for now based on request size, or strictly simple receipt
        // Let's do a simple clean receipt
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        pdf.rect(5, 5, pageWidth - 10, pageHeight - 10);

        // Header
        pdf.setFontSize(14);
        pdf.setTextColor(41, 128, 185);
        pdf.text(company.name, 10, 15);

        pdf.setFontSize(10);
        pdf.setTextColor(0);
        pdf.text("PAYMENT RECEIPT", pageWidth - 10, 15, { align: "right" });

        // Content
        let y = 30;
        pdf.setFontSize(10);
        pdf.text(`Receipt No: RCT-${installment.emiNumber}-${Date.now().toString().slice(-4)}`, 10, y);
        pdf.text(`Date: ${safeFormatDate(installment.paymentDate || new Date().toISOString())}`, pageWidth - 50, y);

        y += 10;
        pdf.text(`Received with thanks from: ${customer.name}`, 10, y);

        y += 8;
        pdf.text(`Record Account No: ${record.id}`, 10, y);

        y += 8;
        pdf.text(`The sum of Rupees: ${toWords(installment.amountPaid || installment.amount)} Only`, 10, y);

        y += 12;
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Amount: ${formatCurrency(installment.amountPaid || installment.amount)}`, 10, y);

        y += 10;
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Toward: Installment #${installment.emiNumber} | Payment Mode: ${installment.paymentMethod || 'Cash'}`, 10, y);

        // Footer
        pdf.setFontSize(8);
        pdf.text("Authorized Signatory", pageWidth - 40, pageHeight - 15);

        await savePdf(pdf, `Receipt_${record.id}_EMI${installment.emiNumber}.pdf`);
    }

    static async generateRecordCard(record: Record, customer: Customer, company: Company) {
        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.width;

        // Header
        pdf.setFillColor(41, 128, 185);
        pdf.rect(0, 0, pageWidth, 40, 'F');

        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(24);
        pdf.text(company.name, pageWidth / 2, 15, { align: 'center' });

        pdf.setFontSize(10);
        pdf.text("RECORD REPAYMENT SCHEDULE", pageWidth / 2, 25, { align: 'center' });
        pdf.text(company.address || "", pageWidth / 2, 32, { align: 'center' });

        // Reset Text Color
        pdf.setTextColor(0, 0, 0);

        // Customer Info Grid
        let y = 50;
        pdf.setFontSize(11);

        pdf.text(`Customer Name: ${customer.name}`, 15, y);
        pdf.text(`Record ID: ${record.id}`, 120, y);
        y += 7;

        pdf.text(`Mobile: ${customer.phone}`, 15, y);
        pdf.text(`Date: ${safeFormatDate(record.date)}`, 120, y);
        y += 7;

        pdf.text(`Address: ${customer.address || 'N/A'}`, 15, y);
        y += 10;

        // Record Summary Box
        pdf.setDrawColor(0);
        pdf.setFillColor(240, 240, 240);
        pdf.rect(15, y, pageWidth - 30, 25, 'FD');

        y += 7;
        pdf.setFont("helvetica", "bold");
        pdf.text("RECORD SUMMARY", 20, y);
        pdf.setFont("helvetica", "normal");
        y += 8;

        pdf.text(`Amount: ${formatCurrency(record.amount)}`, 20, y);
        pdf.text(`Service Fee: ${record.interestRate}%`, 70, y);
        pdf.text(`Tenure: ${record.tenure}M`, 110, y);
        pdf.text(`Installment: ${formatCurrency(record.installment)}`, 150, y);

        y += 20;

        // Schedule Table
        const tableData = record.repaymentSchedule?.map(row => [
            row.emiNumber.toString(),
            safeFormatDate(row.dueDate),
            formatCurrency(row.amount),
            row.status,
            row.paymentDate ? safeFormatDate(row.paymentDate) : '-',
            row.amountPaid ? formatCurrency(row.amountPaid) : '-'
        ]) || [];

        autoTable(pdf, {
            startY: y,
            head: [['#', 'Due Date', 'Installment Amount', 'Status', 'Paid Date', 'Paid Amt']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        await savePdf(pdf, `RecordCard_${record.id}.pdf`);
    }

    static async generateAccountStatement(records: Record[], customer: Customer, company: Company) {
        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.width;

        // Header
        pdf.setFontSize(22);
        pdf.setTextColor(41, 128, 185);
        pdf.text(company.name, 105, 20, { align: "center" });
        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text("ACCOUNT STATEMENT / LEDGER", 105, 30, { align: "center" });
        pdf.line(20, 35, 190, 35);

        // Customer Details
        pdf.setTextColor(0);
        pdf.setFontSize(11);
        pdf.text(`Customer Name: ${customer.name}`, 20, 45);
        pdf.text(`Mobile: ${customer.phone || 'N/A'}`, 20, 52);
        pdf.text(`Address: ${customer.address || "N/A"}`, 20, 59);
        pdf.text(`Statement Date: ${format(new Date(), 'dd-MMM-yyyy HH:mm')}`, 140, 45);

        // Transactions logic
        const transactions: any[] = [];
        records.forEach(record => {
            // Record Finalization
            transactions.push({
                date: record.date,
                type: 'DISBURSAL',
                ref: `Record #${record.id}`,
                debit: record.amount,
                credit: 0
            });

            // Payments
            record.repaymentSchedule?.filter(e => e.status === 'Paid').forEach(e => {
                transactions.push({
                    date: e.paymentDate || record.date,
                    type: 'Installment PAYMENT',
                    ref: `Record #${record.id} - Installment #${e.emiNumber}`,
                    debit: 0,
                    credit: e.amountPaid || e.amount
                });
            });
        });

        // Sort by date
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const tableData = transactions.map(t => [
            safeFormatDate(t.date),
            t.type,
            t.ref,
            t.debit > 0 ? formatCurrency(t.debit) : '-',
            t.credit > 0 ? formatCurrency(t.credit) : '-'
        ]);

        autoTable(pdf, {
            startY: 70,
            head: [['Date', 'Transaction Type', 'Reference', 'Debit (Record)', 'Credit (Payment)']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 8 }
        });

        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text("Generated by BillBook Suite - Self Service Portal", 105, 285, { align: 'center' });

        await savePdf(pdf, `Statement_${customer.name.replace(/\s+/g, '_')}.pdf`);
    }

    static async generateNoDuesCertificate(record: Record, customer: Customer, company: Company) {
        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.width;

        // Border
        pdf.setDrawColor(41, 128, 185);
        pdf.setLineWidth(1);
        pdf.rect(10, 10, pageWidth - 20, 277);

        // Header
        pdf.setFontSize(26);
        pdf.setTextColor(41, 128, 185);
        pdf.text(company.name, pageWidth / 2, 40, { align: "center" });

        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(company.address || "", pageWidth / 2, 48, { align: "center" });
        pdf.text(`Phone: ${company.phone || ''} | Email: ${company.email || ''}`, pageWidth / 2, 53, { align: "center" });

        pdf.setDrawColor(200);
        pdf.line(30, 60, pageWidth - 30, 60);

        // Certificate Title
        pdf.setFontSize(20);
        pdf.setTextColor(0);
        pdf.text("NO DUES CERTIFICATE", pageWidth / 2, 80, { align: "center" });

        // Content
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        let contentY = 100;

        const certificateText = `This is to certify that Mr./Ms. ${customer.name} having Record Account Number ${record.id} has successfully repaid the entire record amount along with all applicable service fee and charges.

As on ${format(new Date(), 'dd-MMM-yyyy')}, there are no outstanding dues against the aforementioned record account.

The company has no further claim or lien on any security/collateral provided for this record. This certificate is issued at the request of the customer for their records.`;

        const splitText = pdf.splitTextToSize(certificateText, pageWidth - 60);
        pdf.text(splitText, 30, contentY);

        // Record Details
        contentY += 60;
        pdf.setFont("helvetica", "bold");
        pdf.text("RECORD DETAILS:", 30, contentY);
        pdf.setFont("helvetica", "normal");
        contentY += 10;
        pdf.text(`Total Sanctioned Amount: ${formatCurrency(record.amount)}`, 35, contentY);
        contentY += 7;
        pdf.text(`Record Closure Date: ${format(new Date(), 'dd-MMM-yyyy')}`, 35, contentY);

        // Signatures
        const signY = 240;
        pdf.setFont("helvetica", "bold");
        pdf.text("For " + company.name, pageWidth - 80, signY);

        pdf.setFont("helvetica", "normal");
        pdf.text("Authorized Signatory", pageWidth - 80, signY + 25);
        pdf.line(pageWidth - 85, signY + 20, pageWidth - 30, signY + 20);

        // Seal/Footer
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text("Certificate Ref: NDC-" + record.id + "-" + Date.now().toString().slice(-6), pageWidth / 2, 275, { align: "center" });

        await savePdf(pdf, `No_Dues_${record.id}.pdf`);
    }
}
