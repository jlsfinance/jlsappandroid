import React from 'react';
import { APP_NAME, APP_VERSION, APP_BUILD, DEVELOPER_NAME } from '../constants';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-[#0f172a] rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">

                {/* Close Button Header */}
                <div className="flex justify-end p-6 pb-0">
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                <div className="px-8 pb-10 text-center">
                    {/* App Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-[#6366f1] to-[#a855f7] p-0.5 shadow-2xl shadow-indigo-500/30">
                            <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[1.9rem] flex items-center justify-center">
                                <span className="text-4xl font-black bg-gradient-to-br from-[#6366f1] to-[#a855f7] bg-clip-text text-transparent">J</span>
                            </div>
                        </div>
                    </div>

                    <h2 className="text-2xl font-black text-[#6366f1] dark:text-white mb-1">{APP_NAME}</h2>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-8">Enterprise Management Suite</p>

                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-3xl p-6 space-y-4 border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">Version</span>
                            <span className="text-sm font-black text-slate-900 dark:text-white">{APP_VERSION}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">Build</span>
                            <span className="text-sm font-black text-slate-900 dark:text-white">{APP_BUILD}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">Platform</span>
                            <span className="text-sm font-black text-slate-900 dark:text-white">Android</span>
                        </div>
                    </div>

                    <div className="mt-10 space-y-2">
                        <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600">© 2025 {APP_NAME}. All rights reserved.</p>
                        <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 flex items-center justify-center gap-1.5">
                            Developed with <span className="text-rose-500 animate-pulse">❤️</span> by <span className="text-slate-400 dark:text-slate-400">{DEVELOPER_NAME}</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AboutModal;
