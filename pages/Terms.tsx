import React from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAME, SUPPORT_EMAIL } from '../constants';

const Terms: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-full flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-white pb-20 overflow-y-auto font-sans">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-3 flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h1 className="text-lg font-bold">Terms & Conditions</h1>
            </div>

            <div className="p-6 max-w-2xl mx-auto w-full space-y-8">

                {/* Critical Red Disclosure */}
                <div className="bg-red-50 dark:bg-red-900/10 border-2 border-red-100 dark:border-red-900/30 rounded-[2rem] p-8 text-center">
                    <p className="text-red-600 dark:text-red-400 font-black text-lg leading-relaxed">
                        “This app is only for personal loan record and management. We do not provide loans, nor connect users with lenders.”
                    </p>
                </div>

                {/* Loan Disclosure Box */}
                <div className="bg-[#f0f7ff] dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-[2.5rem] p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                            <span className="material-symbols-outlined text-xl">info</span>
                        </div>
                        <h2 className="text-xl font-black text-[#004a99] dark:text-blue-300">Loan Disclosure (APR & Tenure)</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <p className="text-slate-900 dark:text-white font-black">Repayment Period:</p>
                            <p className="text-slate-600 dark:text-slate-400 text-sm">Minimum 3 months (90 days) to Maximum 24 months (730 days).</p>
                        </div>
                        <div>
                            <p className="text-slate-900 dark:text-white font-black">Annual Percentage Rate (APR):</p>
                            <p className="text-slate-600 dark:text-slate-400 text-sm">Maximum 36% per annum. This includes interest plus processing fees.</p>
                        </div>

                        <div className="bg-white dark:bg-slate-900/50 rounded-3xl p-6 border border-blue-50 dark:border-blue-800">
                            <p className="text-slate-900 dark:text-white font-black mb-4">Representative Example:</p>
                            <p className="text-slate-500 text-xs mb-4">For a loan of ₹10,000 at 24% APR for 12 months:</p>
                            <ul className="space-y-2">
                                <li className="flex justify-between text-sm">
                                    <span className="text-slate-500">• Principal Amount:</span>
                                    <span className="font-bold">₹10,000</span>
                                </li>
                                <li className="flex justify-between text-sm">
                                    <span className="text-slate-500">• Interest (24%):</span>
                                    <span className="font-bold">₹2,400</span>
                                </li>
                                <li className="flex justify-between text-sm">
                                    <span className="text-slate-500">• Processing Fee (3%):</span>
                                    <span className="font-bold">₹300</span>
                                </li>
                                <li className="flex justify-between text-sm pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                                    <span className="text-slate-900 dark:text-white font-bold">• Total Cost of Loan:</span>
                                    <span className="font-black text-blue-600">₹12,700</span>
                                </li>
                                <li className="flex justify-between text-sm">
                                    <span className="text-slate-900 dark:text-white font-bold">• Monthly EMI:</span>
                                    <span className="font-black text-blue-600">₹1,058.33</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Numbered Sections */}
                <div className="space-y-10">
                    <section className="space-y-3">
                        <h2 className="text-2xl font-black text-[#004a99] dark:text-blue-300 leading-tight">1. Eligibility</h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                            Eligibility criteria (age, income, citizenship) are determined by the finance company managing your records. {APP_NAME} only facilitates the digital record-keeping of these assessments and does not influence approval or rejection decisions.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-2xl font-black text-[#004a99] dark:text-blue-300 leading-tight">2. Service Charges</h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                            Any processing fees or documentation charges are levied by your respective finance company. {APP_NAME} is a platform to view and manage these records and does not collect any loan-related fees from users directly.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-2xl font-black text-[#004a99] dark:text-blue-300 leading-tight">3. Late Payments</h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                            Delay in EMI payment will attract late payment penalties as per the loan agreement. Continuous defaults may lead to legal action and will negatively impact your credit score (CIBIL).
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-2xl font-black text-[#004a99] dark:text-blue-300 leading-tight">4. Data Usage Agreement</h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                            By using {APP_NAME}, you agree to our collection of financial data as per our Privacy Policy. This data is used solely for credit evaluation and loan management.
                        </p>
                    </section>
                </div>

                {/* Footer Info */}
                <div className="pt-10 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
                    <p>Contact Support: {SUPPORT_EMAIL}</p>
                    <p className="mt-1">Last updated: December 23, 2025</p>
                </div>
            </div>
        </div>
    );
};

export default Terms;
