import React from 'react';
import { Link } from 'react-router-dom';

const Tools: React.FC = () => {
    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">

            {/* Header & Settings */}
            <div className="flex justify-between items-center px-6 pt-6 pb-2" style={{ paddingTop: 'calc(2rem + env(safe-area-inset-top))' }}>
                <h1 className="text-3xl font-extrabold tracking-tight">Tools & Reports</h1>
                <Link to="/settings" className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined text-slate-900 dark:text-white">settings</span>
                </Link>
            </div>

            <div className="px-4 space-y-6">

                {/* Search Bar */}
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                    <input
                        type="text"
                        placeholder="Search reports, tools, or client IDs..."
                        className="w-full h-12 pl-12 pr-4 rounded-xl border-none bg-white dark:bg-[#1e2736] shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10 focus:ring-2 focus:ring-primary outline-none text-sm font-medium placeholder:text-slate-400"
                    />
                </div>

                {/* System Online Card */}
                <div className="bg-primary rounded-2xl p-5 text-white shadow-lg shadow-primary/20 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                            <span className="text-xs font-bold tracking-wider uppercase">System Online</span>
                        </div>
                        <p className="text-[10px] text-blue-100 opacity-80">Last sync: Just now</p>
                    </div>
                    <button className="h-10 w-10 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-white">sync</span>
                    </button>
                </div>

                {/* Utilities Section */}
                <div>
                    <h3 className="text-lg font-bold mb-3 px-1">Utilities</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <Link to="/tools/emi" className="bg-white dark:bg-[#1e2736] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-start gap-4 hover:shadow-md transition-all active:scale-95">
                            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                                <span className="material-symbols-outlined">calculate</span>
                            </div>
                            <span className="font-bold text-sm">Loan Calc</span>
                        </Link>

                        <Link to="/loans" className="bg-white dark:bg-[#1e2736] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-start gap-4 hover:shadow-md transition-all active:scale-95">
                            <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
                                <span className="material-symbols-outlined">percent</span>
                            </div>
                            <span className="font-bold text-sm">EMI Check</span>
                        </Link>

                        <Link to="/tools/legal-notice" className="bg-white dark:bg-[#1e2736] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-start gap-4 hover:shadow-md transition-all active:scale-95">
                            <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center">
                                <span className="material-symbols-outlined">gavel</span>
                            </div>
                            <span className="font-bold text-sm">Legal Notice</span>
                        </Link>

                        <Link to="/customers" className="bg-white dark:bg-[#1e2736] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-start gap-4 hover:shadow-md transition-all active:scale-95">
                            <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center">
                                <span className="material-symbols-outlined">search</span>
                            </div>
                            <span className="font-bold text-sm">Lookup</span>
                        </Link>
                    </div>
                </div>

                {/* Operational Reports */}
                <div>
                    <h3 className="text-lg font-bold mb-3 px-1">Operational Reports</h3>
                    <div className="space-y-3">
                        <Link to="/reports" className="flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">bar_chart</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm">Financial Reports</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">All financial analytics</p>
                                </div>
                            </div>
                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                        </Link>

                        <Link to="/due-list" className="flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">receipt_long</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm">Daily Collection Sheet</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">Updated 2h ago</p>
                                </div>
                            </div>
                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                        </Link>

                        <Link to="/due-list" className="flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">warning</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm">Arrears & Default List</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">Critical items</p>
                                </div>
                            </div>
                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                        </Link>

                        <Link to="/approvals" className="flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">fact_check</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm">Pending Approvals</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">Queue status</p>
                                </div>
                            </div>
                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                        </Link>

                        <Link to="/disbursal" className="flex items-center justify-between p-4 bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">payments</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm">Loan Disbursal</h4>
                                    <p className="text-[10px] text-slate-500 font-medium">Approved loans ready for payout</p>
                                </div>
                            </div>
                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Tools;