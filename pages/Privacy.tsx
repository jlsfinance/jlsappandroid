import React from 'react';
import { useNavigate } from 'react-router-dom';

const Privacy: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-full flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white pb-20 overflow-y-auto font-sans">
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-3 flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h1 className="text-lg font-bold">Privacy Policy</h1>
            </div>

            <div className="p-6 max-w-2xl mx-auto w-full space-y-8">
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">1. Introduction</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        JLS Finance Suite ("we," "our," or "us") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">2. Collection of Information</h2>

                    <div className="space-y-2">
                        <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">A. Personal Data</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">
                            We may collect personally identifiable information, such as your name, email address, and telephone number, only when you voluntarily provide it to us (e.g., during registration or customer creation).
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">B. Device Permissions</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                            The App may request access to the following device features:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-400 text-sm">
                            <li>
                                <strong>Camera:</strong> To allow you to take photos of loan documents or customer profiles for record-keeping.
                            </li>
                            <li>
                                <strong>Contacts:</strong> To simplify the process of adding new customer details from your address book. (Optional)
                            </li>
                            <li>
                                <strong>Storage / Media:</strong> To save generated PDF reports, receipts, and downloaded documents to your device.
                            </li>
                        </ul>
                    </div>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">3. Use of Your Information</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we use information collected via the App to:
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600 dark:text-slate-400 text-sm">
                        <li>Create and manage your account.</li>
                        <li>Process loan records and calculate repayments.</li>
                        <li>Generate reports and receipts you request.</li>
                        <li>Notify you of updates or loan maturity.</li>
                    </ul>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">4. Disclosure of Your Information</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        We do not sell, trade, or otherwise transfer to outside parties your Personally Identifiable Information. Data is stored securely on Google Firebase servers.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">5. Security of Your Information</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        We use administrative, technical, and physical security measures (including Firebase Authentication and Firestore Security Rules) to help protect your personal information.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">6. Policy for Children</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        We do not knowingly solicit information from or market to children under the age of 13.
                    </p>
                </section>

                <div className="pt-10 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
                    <p>Contact Us: admin@jlsfinance.com</p>
                    <p className="mt-1">Last updated: December 22, 2025</p>
                </div>
            </div>
        </div>
    );
};

export default Privacy;
