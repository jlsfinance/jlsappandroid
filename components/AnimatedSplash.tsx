import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import finance3d from '../assets/finance_3d.png';
import logo from '../assets/logo.png';

interface AnimatedSplashProps {
    onFinish: () => void;
}

const AnimatedSplash: React.FC<AnimatedSplashProps> = ({ onFinish }) => {

    // Auto-finish after 5s if user stares at it, but primarily waiting for click
    useEffect(() => {
        const timer = setTimeout(onFinish, 5000);
        return () => clearTimeout(timer);
    }, [onFinish]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-[#5B21B6] flex flex-col overflow-hidden"
        >
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-1/3 left-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -translate-x-1/2" />

            {/* Top Section */}
            <div className="flex-1 relative flex flex-col items-center justify-center p-6 mt-10">
                {/* Header */}
                <div className="absolute top-12 left-6 flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl flex items-center justify-center shadow-lg">
                        <img src={logo} className="w-6 h-6 object-contain" alt="Logo" />
                    </div>
                    <span className="text-white font-bold text-xl tracking-tight">JLS Finance</span>
                </div>

                {/* 3D Illustration */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "backOut" }}
                    className="relative z-10"
                >
                    <motion.img
                        src={finance3d}
                        alt="Finance 3D"
                        className="w-[340px] h-[340px] object-contain drop-shadow-2xl"
                        animate={{ y: [0, -20, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                </motion.div>
            </div>

            {/* Bottom Sheet */}
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.4, duration: 0.6, ease: "circOut" }}
                className="bg-white rounded-t-[40px] p-8 pb-10 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col items-center text-center relative z-20"
            >
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mb-6" />

                <h2 className="text-3xl font-bold text-slate-900 mb-3 leading-tight">
                    Manage Finance <br />
                    <span className="text-[#6D28D9]">Effortlessly</span>
                </h2>

                <p className="text-slate-500 mb-8 max-w-xs leading-relaxed text-sm">
                    Track loans, manage customers, and monitor growth in seconds.
                </p>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onFinish}
                    className="w-full max-w-sm bg-[#6D28D9] text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-500/30 flex items-center justify-center gap-2"
                >
                    Get Started
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </motion.button>

            </motion.div>
        </motion.div>
    );
};

export default AnimatedSplash;
