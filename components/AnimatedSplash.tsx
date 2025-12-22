import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import logo from '../assets/logo.png';

interface AnimatedSplashProps {
    onFinish: () => void;
}

const AnimatedSplash: React.FC<AnimatedSplashProps> = ({ onFinish }) => {

    useEffect(() => {
        const timer = setTimeout(onFinish, 4500); // Total duration 4.5s
        return () => clearTimeout(timer);
    }, [onFinish]);

    return (
        <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca] flex flex-col items-center justify-center overflow-hidden">

            {/* Background Effects */}
            <div className="absolute top-[-20%] right-[-20%] w-96 h-96 bg-purple-500/20 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-20%] left-[-20%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px]" />

            <div className="relative z-10 flex flex-col items-center">
                {/* Logo Animation */}
                <motion.div
                    initial={{ scale: 0.5, opacity: 0, y: 0 }}
                    animate={{
                        scale: [0.5, 1.2, 1],
                        opacity: 1,
                        y: -80 // Move up
                    }}
                    transition={{
                        duration: 1.2,
                        times: [0, 0.6, 1],
                        ease: "easeOut"
                    }}
                    className="w-32 h-32 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/20 shadow-2xl"
                >
                    <img src={logo} alt="JLS Logo" className="w-20 h-20 object-contain" />
                </motion.div>

                {/* Motivational Words - J L S */}
                <div className="absolute top-24 mt-16 flex flex-col items-center gap-4">
                    {/* J */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.2, duration: 0.6 }}
                        className="flex items-center gap-3"
                    >
                        <span className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl shadow-lg border border-white/20">J</span>
                        <span className="text-2xl font-light text-white tracking-widest uppercase">Journey</span>
                    </motion.div>

                    {/* L */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.8, duration: 0.6 }}
                        className="flex items-center gap-3"
                    >
                        <span className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-lg border border-white/20">L</span>
                        <span className="text-2xl font-light text-white tracking-widest uppercase">Legacy</span>
                    </motion.div>

                    {/* S */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 2.4, duration: 0.6 }}
                        className="flex items-center gap-3"
                    >
                        <span className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-lg border border-white/20">S</span>
                        <span className="text-2xl font-light text-white tracking-widest uppercase">Success</span>
                    </motion.div>
                </div>
            </div>

            {/* Footer */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3.2, duration: 0.8 }}
                className="absolute bottom-10 flex flex-col items-center gap-1"
            >
                <p className="text-white/60 text-xs tracking-widest uppercase font-medium">Made with</p>
                <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-sm">
                    <span className="text-red-500 animate-pulse text-lg">❤️</span>
                    <span className="text-white/90 text-sm font-bold tracking-wider">by LAVNEET RATHI</span>
                </div>
            </motion.div>

        </div>
    );
};

export default AnimatedSplash;
