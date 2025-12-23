import React from 'react';
import { useNavigate } from 'react-router-dom';

const Terms: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-full flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pb-20 overflow-y-auto font-sans">
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-3 flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h1 className="text-lg font-bold">Terms & Conditions</h1>
            </div>

            <div className="p-6 max-w-2xl mx-auto w-full space-y-8">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300">
                    <strong>Note:</strong> JLS Suite is a record management tool for finance companies and personal lenders. We do not directly provide loans or connect users with lenders.
                </div>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">1. Agreement to Terms</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        By installing, accessing, or using the 'JLS Suite' mobile application ("App"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the App.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">2. Use of the App</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        The App is provided solely for the purpose of managing personal lending records, calculating EMIs, and tracking repayments for finance businesses. You agree to use the App only for lawful purposes and in accordance with all applicable local, state, and national laws.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">3. Data Privacy & Permissions</h2>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">3. Data Usage & Record Safety</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        To provide record management features, we request access to your Camera (for document scanning) and Storage (for report exports). These permissions are strictly for manual data entry initiated by you. We <strong>DO NOT</strong> harvest contacts, SMS, or call logs.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">4. User Responsibility</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        Users are responsible for ensuring that the financial records they manage within this App comply with their local jurisdiction's money lending and financial reporting laws. JLS Suite is a facilitator of data organization and does not verify the legality of user entries.
                    </p>
                </section>

                <section className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">5. Fair Practice Guidelines (Record Keeping)</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        As a technology provider, JLS Suite encourages ethical bookkeeping practices. Users managing professional ledgers should adhere to transparency and fair practice standards:
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800 flex flex-col items-center text-center">
                            <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400">gavel</span>
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-2 uppercase tracking-wider">Local Compliance</span>
                            <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60 mt-2 leading-tight">Interest rates must comply with your state's money lending acts.</span>
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex flex-col items-center text-center">
                            <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400">visibility</span>
                            <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mt-2 uppercase tracking-wider">Transparency</span>
                            <span className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 mt-2 leading-tight">All fees must be clearly disclosed in the generated statements.</span>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800 flex flex-col items-center text-center">
                            <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400">task_alt</span>
                            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 mt-2 uppercase tracking-wider">Zero Compounding</span>
                            <span className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-2 leading-tight">Interest on interest is discouraged in fair bookkeeping practices.</span>
                        </div>

                        <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-800 flex flex-col items-center text-center">
                            <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400">volunteer_activism</span>
                            <span className="text-xs font-bold text-rose-800 dark:text-rose-300 mt-2 uppercase tracking-wider">No Harassment</span>
                            <span className="text-[10px] text-rose-600/70 dark:text-rose-400/60 mt-2 leading-tight">Strict prohibition on coercive methods or improper data usage.</span>
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-900 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                        <p><strong>Record Keeping Tool Only:</strong> JLS Suite does not act as a credit bureau, recovery agent, or financial intermediary. Data stored is private to the user account.</p>
                    </div>
                </section>

                <div className="pt-10 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
                    <p>Contact Us: admin@jlsfinance.com</p>
                    <p className="mt-1">Last updated: December 22, 2025</p>
                </div>
            </div>
        </div>
    );
};

export default Terms;
