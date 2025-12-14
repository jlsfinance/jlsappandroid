import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const EMICalculator: React.FC = () => {
  const [amount, setAmount] = useState(10000);
  const [rate, setRate] = useState(12.5);
  const [tenure, setTenure] = useState(2); // in years

  // Simple EMI Calculation Logic (Mock visualization of updates)
  const monthlyInterest = rate / 12 / 100;
  const months = tenure * 12;
  const emi = (amount * monthlyInterest * Math.pow(1 + monthlyInterest, months)) / (Math.pow(1 + monthlyInterest, months) - 1);
  const totalPayment = emi * months;
  const totalInterest = totalPayment - amount;

  return (
    <div className="bg-background-light dark:bg-background-dark font-display min-h-screen flex flex-col text-slate-900 dark:text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <Link to="/tools" className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-lg font-bold flex-1 text-center pr-10">EMI Calculator</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Result Visualization */}
        <div className="bg-white dark:bg-[#1a2233] rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-6">Monthly Installment</h2>
          <div className="relative size-56 rounded-full flex items-center justify-center mb-6 shadow-inner bg-gradient-to-tr from-primary to-blue-300 p-1">
             <div className="bg-white dark:bg-[#1a2233] w-full h-full rounded-full flex flex-col items-center justify-center shadow-lg">
                <span className="text-3xl font-extrabold text-primary">₹{emi.toFixed(2)}</span>
                <span className="text-xs text-slate-500 mt-1 font-medium">per month</span>
             </div>
          </div>
          <div className="flex items-center justify-between w-full gap-4 px-2">
            <div className="flex flex-col items-center flex-1 p-3 rounded-xl bg-background-light dark:bg-background-dark">
              <span className="text-xs text-slate-500">Interest</span>
              <span className="text-sm font-bold text-primary">₹{totalInterest.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center flex-1 p-3 rounded-xl bg-background-light dark:bg-background-dark">
              <span className="text-xs text-slate-500">Principal</span>
              <span className="text-sm font-bold">₹{amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div className="bg-white dark:bg-[#1a2233] rounded-2xl p-5 shadow-sm space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="font-semibold text-base">Loan Amount</label>
              <div className="flex items-center bg-background-light dark:bg-background-dark rounded-lg px-3 py-2 w-32 border border-transparent focus-within:border-primary transition-all">
                <span className="text-slate-500 font-medium mr-1">₹</span>
                <input className="bg-transparent border-none p-0 w-full text-right font-bold focus:ring-0" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
            </div>
            <input type="range" min="1000" max="50000" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-primary h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"/>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="font-semibold text-base">Interest Rate</label>
              <div className="flex items-center bg-background-light dark:bg-background-dark rounded-lg px-3 py-2 w-24">
                <input className="bg-transparent border-none p-0 w-full text-right font-bold focus:ring-0" type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                <span className="text-slate-500 font-medium ml-1">%</span>
              </div>
            </div>
            <input type="range" min="1" max="30" step="0.1" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-primary h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"/>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EMICalculator;
