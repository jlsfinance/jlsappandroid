import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';
import { useSidebar } from '../context/SidebarContext';
import { NotificationService } from '../services/NotificationService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { Loan } from '../types';

// Type definitions for the dashboard


const formatCurrency = (amount: number) => {
    return `Rs. ${new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
    }).format(amount)}`;
};

const Dashboard: React.FC = () => {
    const { currentCompany } = useCompany();
    const { openSidebar } = useSidebar();
    const [activeCard, setActiveCard] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [loans, setLoans] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [partnerTransactions, setPartnerTransactions] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('Admin');

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!currentCompany) return;

            try {
                const user = auth.currentUser;
                if (user?.email) {
                    setUserName(user.email.split('@')[0]);
                }

                const companyId = currentCompany.id;

                const [loansSnap, customersSnap, partnerTxSnap, expensesSnap] = await Promise.all([
                    getDocs(query(collection(db, "loans"), where("companyId", "==", companyId))),
                    getDocs(query(collection(db, "customers"), where("companyId", "==", companyId))),
                    getDocs(query(collection(db, "partner_transactions"), where("companyId", "==", companyId))),
                    getDocs(query(collection(db, "expenses"), where("companyId", "==", companyId)))
                ]);

                const loansData = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const partnerData = partnerTxSnap.docs.map(doc => doc.data());
                const expensesData = expensesSnap.docs.map(doc => doc.data());

                loansData.sort((a: any, b: any) => {
                    const dateA = a.date?.toDate?.() || new Date(a.date) || new Date(0);
                    const dateB = b.date?.toDate?.() || new Date(b.date) || new Date(0);
                    return dateB.getTime() - dateA.getTime();
                });

                setLoans(loansData);
                setCustomers(customersData);
                setPartnerTransactions(partnerData);
                setExpenses(expensesData);

                // Schedule notifications
                NotificationService.scheduleLoanNotifications(loansData as unknown as Loan[]);
            } catch (error) {
                console.error("Error loading dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [currentCompany]);

    const metrics = useMemo(() => {
        let totalDisbursedCount = 0;
        let totalDisbursedPrincipal = 0;
        let activeLoansCount = 0;
        let activeLoansPrincipal = 0;
        let activeLoansOutstandingPI = 0;
        let calculatedBalance = 0;

        partnerTransactions.forEach(tx => {
            if (tx.type === 'investment') calculatedBalance += Number(tx.amount || 0);
            else if (tx.type === 'withdrawal') calculatedBalance -= Number(tx.amount || 0);
        });

        expenses.forEach(exp => {
            calculatedBalance -= Number(exp.amount || 0);
        });

        loans.forEach(loan => {
            const amount = Number(loan.amount) || 0;
            const emi = Number(loan.emi) || 0;
            const tenure = Number(loan.tenure) || 0;
            const processingFee = Number(loan.processingFee) || 0;
            const status = loan.status;

            if (['Disbursed', 'Active', 'Completed', 'Overdue'].includes(status)) {
                totalDisbursedCount++;
                totalDisbursedPrincipal += amount;
                calculatedBalance -= amount;
                calculatedBalance += processingFee;
            }

            let paidAmount = 0;
            if (loan.repaymentSchedule && Array.isArray(loan.repaymentSchedule)) {
                loan.repaymentSchedule.forEach((e: any) => {
                    if (e.status === 'Paid') {
                        const collected = Number(e.amount) || 0;
                        paidAmount += collected;
                        calculatedBalance += collected;
                    }
                });
            }

            // Add foreclosure payment if amountReceived is true
            const foreclosureDetails = (loan as any).foreclosureDetails;
            if (foreclosureDetails && foreclosureDetails.amountReceived) {
                calculatedBalance += Number(foreclosureDetails.totalPaid) || 0;
            }

            if (['Disbursed', 'Active', 'Overdue'].includes(status)) {
                activeLoansCount++;
                activeLoansPrincipal += amount;
                const totalPayablePI = emi * tenure;
                const outstanding = Math.max(0, totalPayablePI - paidAmount);
                activeLoansOutstandingPI += outstanding;
            }
        });

        let totalCollections = 0;
        let totalProcessingFees = 0;

        loans.forEach(loan => {
            const processingFee = Number(loan.processingFee) || 0;
            const status = loan.status;
            if (['Disbursed', 'Active', 'Completed', 'Overdue'].includes(status)) {
                totalProcessingFees += processingFee;
            }
            if (loan.repaymentSchedule && Array.isArray(loan.repaymentSchedule)) {
                loan.repaymentSchedule.forEach((e: any) => {
                    if (e.status === 'Paid') {
                        totalCollections += Number(e.amount) || 0;
                    }
                });
            }
            const foreclosureDetails = (loan as any).foreclosureDetails;
            if (foreclosureDetails && foreclosureDetails.amountReceived) {
                totalCollections += Number(foreclosureDetails.totalPaid) || 0;
            }
        });

        const netDisbursed = totalDisbursedPrincipal - totalProcessingFees;

        return {
            totalDisbursedCount,
            totalDisbursedPrincipal,
            activeLoansCount,
            activeLoansPrincipal,
            activeLoansOutstandingPI,
            customerCount: customers.length,
            cashBalance: calculatedBalance,
            netDisbursed,
            totalCollections,
            totalProcessingFees
        };
    }, [loans, customers, partnerTransactions, expenses]);

    const getModalContent = () => {
        let modalData: any[] = [];
        let columns: string[] = [];
        let renderRow: (row: any, index: number) => React.ReactNode = () => null;

        switch (activeCard) {
            case 'Total Disbursed Loans':
                modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status));
                columns = ['Customer', 'Loan ID', 'Amount', 'Disbursal', 'EMI', 'Status'];
                renderRow = (row, index) => (
                    <tr key={index} className="hover:bg-surface-variant-light/30 dark:hover:bg-surface-variant-dark/30 transition-colors border-b border-outline-light/20 dark:border-outline-dark/20">
                        <td className="px-4 py-4 font-medium">{row.customerName}</td>
                        <td className="px-4 py-4 text-on-surface-variant-light">{row.id}</td>
                        <td className="px-4 py-4 font-bold">{formatCurrency(row.amount)}</td>
                        <td className="px-4 py-4">{row.disbursalDate ? format(parseISO(row.disbursalDate), 'dd-MMM-yy') : '-'}</td>
                        <td className="px-4 py-4">{formatCurrency(row.emi)}</td>
                        <td className="px-4 py-4">
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-primary-container text-on-primary-container">{row.status}</span>
                        </td>
                    </tr>
                );
                break;
            case 'Active Loans':
                modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
                    const totalPI = (Number(l.emi) || 0) * (Number(l.tenure) || 0);
                    const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
                    const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
                    const pendingPI = Math.max(0, totalPI - paidAmount);
                    return { ...l, loanAmountPI: totalPI, emiPI: l.emi, emisPaidCount: `${paidEmis.length} / ${l.tenure}`, amountPendingPI: pendingPI };
                });
                columns = ['Customer', 'Total (P+I)', 'EMI', 'Paid', 'Pending'];
                renderRow = (row, index) => (
                    <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
                        <td className="px-4 py-4 font-medium">{row.customerName}</td>
                        <td className="px-4 py-4">{formatCurrency(row.loanAmountPI)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.emiPI)}</td>
                        <td className="px-4 py-4">{row.emisPaidCount}</td>
                        <td className="px-4 py-4 font-bold text-error">{formatCurrency(row.amountPendingPI)}</td>
                    </tr>
                );
                break;
            case 'Active Loan Value':
                modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
                    const principal = Number(l.amount) || 0;
                    const emi = Number(l.emi) || 0;
                    const tenure = Number(l.tenure) || 0;
                    const totalPI = emi * tenure;
                    const totalInterest = totalPI - principal;
                    const emiPrincipal = tenure > 0 ? principal / tenure : 0;
                    const emiInterest = emi - emiPrincipal;
                    const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
                    const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
                    const pendingPI = Math.max(0, totalPI - paidAmount);
                    return { ...l, principal, totalInterest, totalLoanPI: totalPI, emiPrincipal, emiInterest, emi, totalReceivedPI: paidAmount, balancePI: pendingPI };
                });
                columns = ['Customer', 'Principal', 'Interest', 'Total', 'EMI (P)', 'EMI (I)', 'EMI', 'Received', 'Balance'];
                renderRow = (row, index) => (
                    <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
                        <td className="px-4 py-4 font-medium">{row.customerName}</td>
                        <td className="px-4 py-4">{formatCurrency(row.principal)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.totalInterest)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.totalLoanPI)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.emiPrincipal)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.emiInterest)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.emi)}</td>
                        <td className="px-4 py-4 text-primary">{formatCurrency(row.totalReceivedPI)}</td>
                        <td className="px-4 py-4 font-bold text-tertiary">{formatCurrency(row.balancePI)}</td>
                    </tr>
                );
                break;
            case 'Net Disbursed':
                modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status)).map(l => ({
                    ...l,
                    processingFee: Number(l.processingFee) || 0,
                    netAmount: (Number(l.amount) || 0) - (Number(l.processingFee) || 0)
                }));
                columns = ['Customer', 'Loan Amount', 'Processing Fee', 'Net Disbursed', 'Status'];
                renderRow = (row, index) => (
                    <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
                        <td className="px-4 py-4 font-medium">{row.customerName}</td>
                        <td className="px-4 py-4">{formatCurrency(row.amount)}</td>
                        <td className="px-4 py-4 text-error">{formatCurrency(row.processingFee)}</td>
                        <td className="px-4 py-4 font-bold text-primary">{formatCurrency(row.netAmount)}</td>
                        <td className="px-4 py-4"><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-primary-container text-on-primary-container">{row.status}</span></td>
                    </tr>
                );
                break;
            case 'Portfolio Outstanding':
                modalData = loans.filter(l => ['Disbursed', 'Active', 'Overdue'].includes(l.status)).map(l => {
                    const principal = Number(l.amount) || 0;
                    const emi = Number(l.emi) || 0;
                    const tenure = Number(l.tenure) || 0;
                    const totalPI = emi * tenure;
                    const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
                    const paidAmount = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
                    const outstanding = Math.max(0, totalPI - paidAmount);
                    return { ...l, principal, totalPI, paidAmount, outstanding };
                });
                columns = ['Customer', 'Principal', 'Total (P+I)', 'Collected', 'Outstanding'];
                renderRow = (row, index) => (
                    <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
                        <td className="px-4 py-4 font-medium">{row.customerName}</td>
                        <td className="px-4 py-4">{formatCurrency(row.principal)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.totalPI)}</td>
                        <td className="px-4 py-4 text-primary">{formatCurrency(row.paidAmount)}</td>
                        <td className="px-4 py-4 font-bold text-error">{formatCurrency(row.outstanding)}</td>
                    </tr>
                );
                break;
            case 'Total Collections':
                modalData = loans.filter(l => ['Disbursed', 'Active', 'Completed', 'Overdue'].includes(l.status)).map(l => {
                    const paidEmis = (l.repaymentSchedule || []).filter((e: any) => e.status === 'Paid');
                    const emiCollected = paidEmis.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
                    const foreclosureDetails = (l as any).foreclosureDetails;
                    const foreclosureAmount = (foreclosureDetails && foreclosureDetails.amountReceived) ? (Number(foreclosureDetails.totalPaid) || 0) : 0;
                    const totalCollected = emiCollected + foreclosureAmount;
                    return { ...l, emisPaid: paidEmis.length, emiCollected, foreclosureAmount, totalCollected };
                }).filter(l => l.totalCollected > 0);
                columns = ['Customer', 'EMIs Paid', 'EMI Collected', 'Foreclosure', 'Total Collected'];
                renderRow = (row, index) => (
                    <tr key={index} className="hover:bg-surface-variant-light/30 border-b border-outline-light/20">
                        <td className="px-4 py-4 font-medium">{row.customerName}</td>
                        <td className="px-4 py-4">{row.emisPaid}</td>
                        <td className="px-4 py-4">{formatCurrency(row.emiCollected)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.foreclosureAmount)}</td>
                        <td className="px-4 py-4 font-bold text-primary">{formatCurrency(row.totalCollected)}</td>
                    </tr>
                );
                break;
            default:
                modalData = [];
                break;
        }
        return { data: modalData, columns, renderRow };
    };

    const handleExportPDF = async () => {
        if (!activeCard) return;
        const { data, columns } = getModalContent();
        if (!data || data.length === 0) { alert("No data available."); return; }
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text((currentCompany?.name || "Finance Company") + " Report - " + activeCard, 14, 15);

        let tableRows: any[] = [];

        if (activeCard === 'Total Disbursed Loans') {
            tableRows = data.map((row: any) => [
                row.customerName || '-',
                row.id || '-',
                formatCurrency(row.amount),
                row.disbursalDate ? format(parseISO(row.disbursalDate), 'dd-MMM-yy') : '-',
                formatCurrency(row.emi),
                row.status || '-'
            ]);
        } else if (activeCard === 'Active Loans') {
            tableRows = data.map((row: any) => [
                row.customerName || '-',
                formatCurrency(row.loanAmountPI),
                formatCurrency(row.emiPI),
                row.emisPaidCount || '-',
                formatCurrency(row.amountPendingPI)
            ]);
        } else if (activeCard === 'Active Loan Value') {
            tableRows = data.map((row: any) => [
                row.customerName || '-',
                formatCurrency(row.principal),
                formatCurrency(row.totalInterest),
                formatCurrency(row.totalLoanPI),
                formatCurrency(row.emiPrincipal),
                formatCurrency(row.emiInterest),
                formatCurrency(row.emi),
                formatCurrency(row.totalReceivedPI),
                formatCurrency(row.balancePI)
            ]);
        } else if (activeCard === 'Net Disbursed') {
            tableRows = data.map((row: any) => [
                row.customerName || '-',
                formatCurrency(row.amount),
                formatCurrency(row.processingFee),
                formatCurrency(row.netAmount),
                row.status || '-'
            ]);
        } else if (activeCard === 'Portfolio Outstanding') {
            tableRows = data.map((row: any) => [
                row.customerName || '-',
                formatCurrency(row.principal),
                formatCurrency(row.totalPI),
                formatCurrency(row.paidAmount),
                formatCurrency(row.outstanding)
            ]);
        } else if (activeCard === 'Total Collections') {
            tableRows = data.map((row: any) => [
                row.customerName || '-',
                row.emisPaid?.toString() || '0',
                formatCurrency(row.emiCollected),
                formatCurrency(row.foreclosureAmount),
                formatCurrency(row.totalCollected)
            ]);
        }

        autoTable(doc, { head: [columns], body: tableRows, startY: 25 });
        const today = format(new Date(), 'dd-MMM-yyyy');
        const filename = `report_${today}.pdf`;
        const pdfData = doc.output('dataurlstring').split(',')[1];
        
        try {
            const { DownloadService } = await import('../services/DownloadService');
            await DownloadService.downloadPDF(filename, pdfData);
        } catch (error) {
            // Fallback for web
            doc.save(filename);
        }
    };

    const { data, columns, renderRow } = getModalContent();



    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 bg-slate-50 dark:bg-slate-950 font-sans">
            {/* Background Decor */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-indigo-50/50 via-purple-50/30 to-transparent dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-transparent"></div>
                <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[100px]"></div>
                <div className="absolute top-[20%] left-[-10%] w-[300px] h-[300px] rounded-full bg-purple-500/5 blur-[100px]"></div>
            </div>

            {/* Modern Header */}
            <div className="sticky top-0 z-30 px-6 pb-4 backdrop-blur-md bg-white/70 dark:bg-slate-950/70 border-b border-white/20 dark:border-white/5 transition-all duration-300"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={openSidebar} className="lg:hidden p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <div className="group relative">
                            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px] shadow-lg shadow-purple-500/20">
                                <div className="h-full w-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center">
                                    <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-pink-500 text-lg font-bold">
                                        {userName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
                        </div>
                        <div>
                            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Welcome back,</span>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-white capitalize leading-tight">{userName}</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative px-4 sm:px-6 space-y-6 sm:space-y-8 mt-4 sm:mt-6 max-w-7xl mx-auto w-full">

                {/* Hero Balance Card - Premium 3D Effect */}
                <div className="group relative overflow-hidden rounded-[2rem] bg-slate-900 text-white shadow-2xl shadow-indigo-500/25 transition-all hover:scale-[1.01]">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-700 to-indigo-800"></div>
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>

                    {/* Animated Glows */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-500/30 rounded-full blur-3xl group-hover:bg-purple-500/40 transition-colors duration-500"></div>
                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/30 rounded-full blur-3xl group-hover:bg-indigo-500/40 transition-colors duration-500"></div>

                    <div className="relative z-10 p-8">
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                                <span className="material-symbols-outlined text-indigo-200 text-sm">account_balance_wallet</span>
                                <span className="text-xs font-semibold text-indigo-100 tracking-wide uppercase">Available Balance</span>
                            </div>
                            <Link to="/finance" className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all active:scale-90 ring-1 ring-white/20">
                                <span className="material-symbols-outlined">arrow_outward</span>
                            </Link>
                        </div>

                        <div className="text-center sm:text-left">
                            <span className="text-5xl font-black tracking-tight block mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-indigo-200">
                                {loading ? '...' : formatCurrency(metrics.cashBalance)}
                            </span>
                            <div className="flex items-center gap-2 mt-4 text-indigo-200 text-sm font-medium">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-300">
                                    <span className="material-symbols-outlined text-sm">trending_up</span>
                                </span>
                                <span>Total Liquid Assets</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-6 w-1 rounded-full bg-indigo-600"></div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Quick Actions</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { link: "/loans/new", icon: "add_circle", color: "text-blue-600", bg: "bg-blue-50", label: "New Loan" },
                            { link: "/due-list", icon: "payments", color: "text-emerald-600", bg: "bg-emerald-50", label: "Collect EMI" },
                            { link: "/customers/new", icon: "person_add", color: "text-amber-600", bg: "bg-amber-50", label: "Add Client" },
                            { link: "/finance", icon: "bar_chart", color: "text-purple-600", bg: "bg-purple-50", label: "Reports" }
                        ].map((action, i) => (
                            <Link key={i} to={action.link} className="group flex flex-col items-center justify-center p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 duration-200">
                                <div className={`w-12 h-12 rounded-xl ${action.bg} dark:bg-slate-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                                    <span className={`material-symbols-outlined text-[26px] ${action.color} dark:text-white`}>{action.icon}</span>
                                </div>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{action.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Modern Analytics Cards */}
                <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                        Overview
                    </h3>
                    <div className="flex flex-col gap-4">
                        {/* Feature Card */}
                        <div
                            onClick={() => setActiveCard('Total Disbursed Loans')}
                            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-slate-100 dark:border-slate-800"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>

                            <div className="relative z-10 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                                            <span className="material-symbols-outlined text-xl">account_balance</span>
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Disbursed</h3>
                                    </div>
                                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{loading ? '...' : formatCurrency(metrics.totalDisbursedPrincipal)}</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{metrics.totalDisbursedCount} Loans in total</p>
                                </div>
                                <div className="p-2 rounded-full border border-slate-100 dark:border-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                                    <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div
                                onClick={() => setActiveCard('Active Loans')}
                                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg transition-all border border-slate-100 dark:border-slate-800 cursor-pointer"
                            >
                                <div className="p-2.5 w-fit rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 mb-3 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-lg">trending_up</span>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? '...' : metrics.activeLoansCount}</h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Active Loans</p>
                            </div>

                            <div
                                onClick={() => setActiveCard('Active Loan Value')}
                                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg transition-all border border-slate-100 dark:border-slate-800 cursor-pointer"
                            >
                                <div className="p-2.5 w-fit rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-lg">analytics</span>
                                </div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.activeLoansOutstandingPI)}</h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Portfolio Value</p>
                            </div>
                        </div>

                        <div
                            onClick={() => setActiveCard('Net Disbursed')}
                            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-lg transition-all border border-slate-100 dark:border-slate-800 cursor-pointer"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-900/20 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                                        <span className="material-symbols-outlined text-lg">payments</span>
                                    </span>
                                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Net Disbursed</h3>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.netDisbursed)}</h2>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Earnings: {formatCurrency(metrics.totalProcessingFees)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div
                                onClick={() => setActiveCard('Portfolio Outstanding')}
                                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg transition-all border border-slate-100 dark:border-slate-800 cursor-pointer"
                            >
                                <div className="p-2.5 w-fit rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 mb-3 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-lg">pending_actions</span>
                                </div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.activeLoansOutstandingPI)}</h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">To Collect</p>
                            </div>
                            <div
                                onClick={() => setActiveCard('Total Collections')}
                                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg transition-all border border-slate-100 dark:border-slate-800 cursor-pointer"
                            >
                                <div className="p-2.5 w-fit rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 mb-3 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-lg">savings</span>
                                </div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{loading ? '...' : formatCurrency(metrics.totalCollections)}</h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Collected</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modern Recent Activity */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                            Recent Activity
                        </h3>
                        <Link to="/loans" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
                        </Link>
                    </div>

                    <div className="flex flex-col gap-3">
                        {loans.length === 0 && !loading && (
                            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 border-dashed">
                                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-700 mb-2">receipt_long</span>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-500">No activity yet</p>
                            </div>
                        )}
                        {loans.slice(0, 5).map((loan: any, i) => {
                            const customer = customers.find(c => c.id === loan.customerId);
                            return (
                                <Link key={loan.id} to={`/loans/${loan.id}`} className="group relative flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all border-l-4 border-l-transparent hover:border-l-indigo-500">
                                    <div className="flex items-center gap-4">
                                        <div className="relative h-12 w-12 rounded-2xl shadow-lg transition-transform group-hover:scale-105 overflow-hidden">
                                            {customer?.photo_url ? (
                                                <img src={customer.photo_url} alt={loan.customerName} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className={`h-full w-full flex items-center justify-center ${loan.status === 'Disbursed' || loan.status === 'Active'
                                                    ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/20'
                                                    : loan.status === 'Completed'
                                                        ? 'bg-gradient-to-br from-purple-500 to-violet-600 shadow-purple-500/20'
                                                        : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20'
                                                    }`}>
                                                    <span className="material-symbols-outlined text-white text-xl">
                                                        {loan.status === 'Completed' ? 'check_circle' : loan.status === 'Disbursed' || loan.status === 'Active' ? 'trending_up' : 'schedule'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors capitalize">{loan.customerName.toLowerCase()}</h4>
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono mt-0.5">#{loan.id?.slice(0, 8)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold text-slate-900 dark:text-white block">{formatCurrency(loan.amount)}</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mt-1 ${loan.status === 'Active' || loan.status === 'Disbursed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                            : loan.status === 'Completed' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                            }`}>{loan.status}</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>

            </div>

            {/* Modal */}
            {activeCard && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
                    <div className="w-full max-w-4xl h-[90vh] sm:h-[600px] bg-surface-light dark:bg-surface-dark rounded-t-2xl sm:rounded-2xl flex flex-col shadow-m3-3 overflow-hidden">

                        <div className="p-4 border-b border-outline-light/10 flex justify-between items-center">
                            <h2 className="text-lg font-normal">{activeCard}</h2>
                            <div className="flex gap-2">
                                <button onClick={handleExportPDF} className="p-2 hover:bg-surface-variant-light/30 rounded-full text-primary"><span className="material-symbols-outlined">download</span></button>
                                <button onClick={() => setActiveCard(null)} className="p-2 hover:bg-surface-variant-light/30 rounded-full"><span className="material-symbols-outlined">close</span></button>
                            </div>
                        </div>

                        <div className="p-4 flex-1 overflow-auto bg-surface-light dark:bg-background-dark">
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full mb-4 rounded-lg border border-outline-light/30 bg-transparent px-4 py-2 text-sm focus:border-primary focus:ring-0"
                            />
                            <div className="rounded-lg border border-outline-light/10 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-surface-variant-light/50 dark:bg-surface-variant-dark/20 text-on-surface-variant-light">
                                        <tr>
                                            {columns.map((col, idx) => <th key={idx} className="px-4 py-3 font-medium">{col}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-light/10">
                                        {data.filter((row: any) => JSON.stringify(Object.values(row)).toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map((row: any, index: number) => renderRow(row, index))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Dashboard;