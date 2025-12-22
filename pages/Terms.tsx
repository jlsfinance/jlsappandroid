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
                    <strong>Note:</strong> JLS Finance Suite is a record management tool for finance companies and personal lenders. We do not directly provide loans or connect users with lenders.
                </div>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">1. Agreement to Terms</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        By installing, accessing, or using the 'JLS Finance Suite' mobile application ("App"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the App.
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
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        To provide specific features, we may request access to your device's Contact list (to facilitate customer creation), Camera (for document uploads), and Storage (for saving reports). These permissions are optional and used strictly for the App's functionality. We do not sell your personal data. Please refer to our Privacy Policy for more details.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">4. User Accounts</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        You are responsible for safeguarding your login credentials. JLS Finance Suite is not liable for any loss or damage arising from your failure to protect your account information.
                    </p>
                </section>

                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">5. Limitation of Liability</h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                        The App is provided "as is" without warranties of any kind. We are not liable for any financial losses, data corruption, or errors in calculations that may occur from the use of the App. Users are advised to verify all financial data independently.
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

export default Terms;
