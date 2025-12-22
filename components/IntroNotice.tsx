import React from 'react';
import { motion } from 'framer-motion';

interface IntroNoticeProps {
    onAccept: () => void;
}

const IntroNotice: React.FC<IntroNoticeProps> = ({ onAccept }) => {
    return (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-slate-900">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-[50px] w-full max-w-sm overflow-hidden shadow-2xl p-10 flex flex-col items-center text-center"
            >
                {/* Warning Icon/Circle */}
                <div className="w-24 h-24 bg-[#FFF8E6] rounded-full flex items-center justify-center mb-8">
                    <span className="text-[#E67E22] font-semibold text-[22px] tracking-tight" style={{ fontFamily: 'sans-serif' }}>warning</span>
                </div>

                {/* Content */}
                <h3 className="text-[28px] font-black text-[#1A2533] mb-3 leading-tight">Important Notice</h3>

                <div className="space-y-6">
                    <p className="text-[#5E6D82] font-semibold text-lg leading-snug px-2">
                        We do not provide any type of loans through this application.
                    </p>

                    <div className="h-[1.5px] w-28 bg-[#F0F2F5] mx-auto" />

                    <p className="text-[#1A2533] font-black text-[22px] leading-tight px-2">
                        हम इस एप्लिकेशन के माध्यम से किसी भी प्रकार का ऋण प्रदान नहीं करते हैं।
                    </p>
                </div>

                {/* Action Button */}
                <button
                    onClick={onAccept}
                    className="w-full mt-10 py-5 rounded-[30px] text-white font-black text-lg uppercase tracking-wider active:scale-95 transition-all shadow-xl shadow-blue-500/20"
                    style={{
                        background: 'linear-gradient(90deg, #1A69A9 0%, #A81AF5 100%)'
                    }}
                >
                    I UNDERSTAND / ठीक है
                </button>
            </motion.div>
        </div>
    );
};

export default IntroNotice;
