import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import logo from '../assets/logo.png';

interface AnimatedSplashProps {
    onFinish: () => void;
}

const AnimatedSplash: React.FC<AnimatedSplashProps> = ({ onFinish }) => {

    useEffect(() => {
        const timer = setTimeout(onFinish, 5000); // Increased duration to 5s for sequence
        return () => clearTimeout(timer);
    }, [onFinish]);

    const containerVariants = {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
    };

    const logoVariants = {
        initial: { scale: 0.8, opacity: 0, y: 0 },
        appear: { scale: 1, opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
        moveUp: { y: -120, transition: { duration: 0.8, delay: 1, ease: "easeInOut" } }
    };

    const wordVariants = {
        initial: { opacity: 0, y: 20 },
        animate: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: { delay: 1.8 + (i * 0.5), duration: 0.6, ease: "easeOut" }
        })
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-[#2D0A54] flex flex-col items-center justify-center overflow-hidden font-sans">

            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="relative flex flex-col items-center w-full">

                {/* Logo Container - Recreating the premium squircle look */}
                <motion.div
                    variants={logoVariants}
                    initial="initial"
                    animate={["appear", "moveUp"]}
                    className="relative w-48 h-48 bg-white rounded-[40px] shadow-2xl flex items-center justify-center p-6"
                >
                    <div className="w-full h-full bg-gradient-to-br from-[#6366F1] to-[#4F46E5] rounded-[30px] flex items-center justify-center overflow-hidden shadow-inner">
                        <img src={logo} alt="Logo" className="w-24 h-24 object-contain brightness-110 drop-shadow-lg" />
                    </div>
                </motion.div>

                {/* Animated Words */}
                <div className="absolute top-48 flex flex-col items-center gap-6 mt-12 w-full">
                    {['TRUST', 'GROWTH', 'STABILITY'].map((word, i) => (
                        <motion.h2
                            key={word}
                            custom={i}
                            variants={wordVariants}
                            initial="initial"
                            animate="animate"
                            className="text-white text-4xl md:text-5xl font-black italic tracking-[0.2em] leading-none text-center drop-shadow-lg"
                            style={{
                                textShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                filter: 'brightness(1.1)'
                            }}
                        >
                            {word}
                        </motion.h2>
                    ))}
                </div>
            </div>

            {/* Footer - Premium Spaced Style */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.8, duration: 1 }}
                className="absolute bottom-16 w-full flex flex-col items-center"
            >
                <div className="h-[1px] w-12 bg-white/20 mb-4" />
                <p className="text-white/40 text-[10px] md:text-xs font-bold tracking-[0.5em] uppercase text-center pl-[0.5em]">
                    MADE BY LAVNEET RATHI
                </p>
            </motion.div>

        </div>
    );
};

export default AnimatedSplash;
