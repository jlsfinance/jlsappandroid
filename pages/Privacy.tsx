import React from 'react';
import { Link } from 'react-router-dom';

const Privacy: React.FC = () => {
    return (
        <div className="flex h-screen w-full flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pb-20 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-3 flex items-center gap-4 border-b border-slate-200 dark:border-slate-800">
                <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </Link>
                <h1 className="text-lg font-bold">Privacy Policy</h1>
            </div>

            <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
                <section className="space-y-3">
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        Your privacy is important to us. It is JLS Finance Ltd's policy to respect your privacy regarding any information we may collect from you across our application.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Information We Collect</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        We only ask for personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent.
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600 dark:text-slate-400">
                        <li>Personal identification (Name, Email, Phone)</li>
                        <li>Financial information for loan processing</li>
                        <li>Device information for app security</li>
                    </ul>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Data Usage</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        We generally use the information to process your loan applications, manage your account, and improve our services. We do not share your data publicly or with third-parties, except when required to by law.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Data Deletion</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        You are free to refuse our request for your personal information, with the understanding that we may be unable to provide you with some of your desired services. You can request deletion of your data via the Settings menu.
                    </p>
                </section>

                <div className="pt-8 text-center text-xs text-slate-400">
                    Last updated: December 2025
                </div>
            </div>
        </div>
    );
};

export default Privacy;
