import React from 'react';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header with Image or Gradient */}
                <div className="h-32 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>
                    <h1 className="text-3xl font-bold text-white tracking-tight relative z-10">JLS Finance</h1>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">

                    <div className="mb-6 text-center">
                        <p className="text-sm font-medium text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-2">Premium Financial Suite</p>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            Experience the future of financial management with JLS Finance Suite. Designed for speed, security, and simplicity.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-start gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                                <span className="material-symbols-outlined">rocket_launch</span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Lightning Fast</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Optimized performance for instant access to your financial data.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                <span className="material-symbols-outlined">security</span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Bank-Grade Security</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Your data is fast, encrypted, and safely stored in the cloud.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                                <span className="material-symbols-outlined">analytics</span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Smart Analytics</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Gain insights with beautiful, data-driven dashboards.</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-500">Version 1.0.1</p>
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Created by</span>
                            <span className="text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Luvi</span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AboutModal;
