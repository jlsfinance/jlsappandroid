import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, getDoc, where } from 'firebase/firestore';
import { useCompany } from '../context/CompanyContext';

interface Receipt {
    id: string;
    loanId: string;
    customerId: string;
    customerName: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    receiptId: string;
    emiNumber: number;
    companyId?: string;
}

const Receipts: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const companyDetails = useMemo(() => ({
    name: currentCompany?.name || "Finance Company",
    address: currentCompany?.address || "",
    phone: currentCompany?.phone || ""
  }), [currentCompany]);

  const loadData = useCallback(async () => {
    if (!currentCompany) return;
    setLoading(true);
    try {
        const q = query(collection(db, "receipts"), where("companyId", "==", currentCompany.id), orderBy("paymentDate", "desc"));
        const querySnapshot = await getDocs(q);
        const receiptsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Receipt[];
        setReceipts(receiptsData);
    } catch (error) {
        console.error("Failed to load receipts:", error);
    } finally {
        setLoading(false);
    }
  }, [currentCompany]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  const formatCurrency = (value: number) => {
    return `Rs. ${new Intl.NumberFormat("en-IN").format(value)}`;
  };
  
  const handleDownloadReceipt = async (receipt: Receipt) => {
    setIsDownloading(receipt.id);
    try {
        if (!receipt || !receipt.customerId || !receipt.receiptId) {
            alert("Cannot generate receipt due to incomplete data.");
            setIsDownloading(null);
            return;
        }

        const pdfDoc = new jsPDF();
        
        let customerData: any = {};
        try {
            const customerRef = doc(db, "customers", receipt.customerId);
            const customerSnap = await getDoc(customerRef);
            if (customerSnap.exists()) {
                customerData = customerSnap.data();
            }
        } catch(e) {
            console.warn("Could not fetch customer details for receipt", e);
        }
        
        let y = 15;
        
        // Header
        pdfDoc.setFontSize(18);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(companyDetails.name, pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 10;
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text("Payment Receipt", pdfDoc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += 15;

        pdfDoc.setFontSize(11);
        pdfDoc.text(`Receipt ID: ${receipt.receiptId}`, 14, y);
        y += 7;

        let formattedDate = 'N/A';
        try {
            formattedDate = format(parseISO(receipt.paymentDate), 'PPP');
        } catch (e) {
            console.error("Invalid date format for receipt:", receipt.paymentDate);
        }
        pdfDoc.text(`Payment Date: ${formattedDate}`, 14, y);
        y += 8;

        pdfDoc.line(14, y, 196, y);
        y += 10;

        pdfDoc.text(`Customer Name: ${receipt.customerName}`, 14, y);
        y += 7;
        pdfDoc.text(`Loan ID: ${receipt.loanId}`, 14, y);
        y += 8;

        pdfDoc.line(14, y, 196, y);
        y += 7;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Description", 14, y);
        pdfDoc.text("Amount", 180, y, { align: 'right' });
        y += 8;
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`EMI Payment (No. ${receipt.emiNumber || 'N/A'})`, 14, y);
        pdfDoc.text(formatCurrency(receipt.amount), 180, y, { align: 'right' });
        y += 10;

        pdfDoc.line(14, y, 196, y);
        
        y += 7;
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Total Paid:", 130, y);
        pdfDoc.text(formatCurrency(receipt.amount), 180, y, { align: 'right' });
        y += 13;

        pdfDoc.text(`Payment Method: ${(receipt.paymentMethod || 'N/A').toUpperCase()}`, 14, y);

        // Footer
        const pageCount = (pdfDoc as any).internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            pdfDoc.setPage(i);
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text(`© ${new Date().getFullYear()} ${companyDetails.name}`, pdfDoc.internal.pageSize.getWidth() / 2, 287, { align: 'center' });
            pdfDoc.text(`Page ${i} of ${pageCount}`, pdfDoc.internal.pageSize.getWidth() - 20, 287);
        }
        
        pdfDoc.save(`Receipt_${receipt.receiptId}.pdf`);
    } catch (error: any) {
        console.error("Failed to generate PDF:", error);
        alert("Could not generate the PDF receipt.");
    } finally {
        setIsDownloading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-2xl font-bold tracking-tight">Payment Receipts</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-bold text-lg">All Receipts</h2>
                <p className="text-sm text-slate-500">View and download historical payment receipts.</p>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="px-4 py-3 whitespace-nowrap">Receipt ID</th>
                            <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                            <th className="px-4 py-3 whitespace-nowrap">Loan ID</th>
                            <th className="px-4 py-3 whitespace-nowrap">Amount</th>
                            <th className="px-4 py-3 whitespace-nowrap">Payment Date</th>
                            <th className="px-4 py-3 whitespace-nowrap">Method</th>
                            <th className="px-4 py-3 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center">
                                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                </td>
                            </tr>
                        ) : receipts.length > 0 ? (
                            receipts.map((receipt) => (
                                <tr key={receipt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{receipt.receiptId}</td>
                                    <td className="px-4 py-3">{receipt.customerName}</td>
                                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{receipt.loanId}</td>
                                    <td className="px-4 py-3 font-bold">{formatCurrency(receipt.amount)}</td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {receipt.paymentDate ? format(parseISO(receipt.paymentDate), 'dd MMM, yyyy') : 'N/A'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                                            {receipt.paymentMethod}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button 
                                            onClick={() => handleDownloadReceipt(receipt)}
                                            disabled={isDownloading === receipt.id}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold"
                                        >
                                            {isDownloading === receipt.id ? (
                                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                                            ) : (
                                                <span className="material-symbols-outlined text-[16px]">download</span>
                                            )}
                                            Download
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                                    <p>No receipts found.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
}

export default Receipts;