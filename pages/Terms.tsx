import React from 'react';
import { Link } from 'react-router-dom';

const Terms: React.FC = () => {
    return (
        <div className="flex h-screen w-full flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pb-20 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-3 flex items-center gap-4 border-b border-slate-200 dark:border-slate-800">
                <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </Link>
                <h1 className="text-lg font-bold">Terms & Conditions</h1>
            </div>

            <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">1. Introduction</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        Welcome to JLS Finance Suite. By using our app, you agree to these terms.
                        Please read them carefully.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">2. Loan Terms</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        All loans are subject to approval and credit checks. Repayment schedules must be adhered to as per the agreement signed during disbursal.
                        Late fees may apply for missed payments.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">3. User Responsibilities</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">4. Modifications</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        We reserve the right to modify these terms at any time. Continued use of the app constitutes acceptance of new terms.
                    </p>
                </section>

                <div className="pt-8 text-center text-xs text-slate-400">
                    Last updated: December 2025
                </div>
            </div>
        </div>
    );
};

export default Terms;
