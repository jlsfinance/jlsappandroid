import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '../context/SubscriptionContext';
import { SUBSCRIPTION_PLANS, PlanId, BillingCycle } from '../constants/subscriptionPlans';
import { useNavigate } from 'react-router-dom';
import { GooglePlayBillingService } from '../services/GooglePlayBillingService';
import { RazorpayService } from '../services/RazorpayService';
import { auth } from '../firebaseConfig';
import { Capacitor } from '@capacitor/core';

const PricingPage: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [faqSearchQuery, setFaqSearchQuery] = useState<string>('');
  const [faqCategory, setFaqCategory] = useState<string>('All');
  
  // Checkout Confirmation Modal State
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PlanId | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState<boolean>(false);
  const [activatedPlanName, setActivatedPlanName] = useState<string>('');

  const { activePlan } = useSubscription();
  const navigate = useNavigate();

  // Helper function to render Plan Badges with subtle glowing styling
  const renderPlanBadge = (planId: PlanId) => {
    switch (planId) {
      case 'free':
        return (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 shadow-sm shadow-slate-500/10">
            FREE
          </span>
        );
      case 'starter':
        return (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-sky-950/80 text-sky-300 border border-sky-500/50 shadow-md shadow-sky-500/20">
            STARTER
          </span>
        );
      case 'pro':
        return (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/50 shadow-md shadow-purple-500/30">
            PRO
          </span>
        );
      case 'enterprise':
        return (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-lg shadow-amber-500/30">
            ENTERPRISE
          </span>
        );
      default:
        return null;
    }
  };

  const handleOpenCheckoutModal = (planId: PlanId) => {
    if (planId === activePlan.id) {
      alert(`You are currently on the ${activePlan.name} plan.`);
      return;
    }

    if (planId === 'free') {
      alert('Free plan is active by default.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert('Please sign in to upgrade your subscription.');
      return;
    }

    setSelectedPlanForCheckout(planId);
  };

  const handleConfirmCheckout = async () => {
    if (!selectedPlanForCheckout) return;
    const planId = selectedPlanForCheckout;
    setSelectedPlanForCheckout(null);

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setIsProcessing(true);
    try {
      if (Capacitor.getPlatform() === 'android') {
        const playRes = await GooglePlayBillingService.purchaseSubscription(planId, billingCycle);
        if (playRes.success) {
          setActivatedPlanName(SUBSCRIPTION_PLANS[planId].name);
          setShowSuccessOverlay(true);
        } else {
          const rzpRes = await RazorpayService.startPayment(
            planId,
            billingCycle,
            currentUser.email || '',
            currentUser.displayName || ''
          );
          if (rzpRes.success) {
            setActivatedPlanName(SUBSCRIPTION_PLANS[planId].name);
            setShowSuccessOverlay(true);
          } else if (rzpRes.error && !rzpRes.error.includes('cancelled')) {
            alert(`Payment failed: ${rzpRes.error}`);
          }
        }
      } else {
        const rzpRes = await RazorpayService.startPayment(
          planId,
          billingCycle,
          currentUser.email || '',
          currentUser.displayName || ''
        );
        if (rzpRes.success) {
          setActivatedPlanName(SUBSCRIPTION_PLANS[planId].name);
          setShowSuccessOverlay(true);
        } else if (rzpRes.error && !rzpRes.error.includes('cancelled')) {
          alert(`Payment failed: ${rzpRes.error}`);
        }
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      alert('An error occurred while processing payment.');
    } finally {
      setIsProcessing(false);
    }
  };

  const plansList = Object.values(SUBSCRIPTION_PLANS);

  const testimonials = [
    {
      name: 'Rajesh Sharma',
      role: 'Managing Director, City Finance Corp',
      comment: 'JLS Finance Suite revolutionized our daily collection ledgers. Upgrading to Pro gave us multi-branch isolation and instant Excel report exports.',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    },
    {
      name: 'Priya Patel',
      role: 'Lead Account Manager, MicroCredit Ltd',
      comment: 'Managing over 100 customer accounts with automated interest and deposit calculations saved us hours every week. Worth every rupee.',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    },
    {
      name: 'Vikram Singh',
      role: 'Independent Micro-Lender',
      comment: 'The Free tier helped me start, and upgrading to Starter was completely seamless via Google Play Billing. Highly recommended!',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    },
  ];

  const allFaqs = [
    {
      cat: 'Billing',
      q: 'Can I upgrade or downgrade my plan at any time?',
      a: 'Yes! Upgrades take effect immediately with instant capability unlocking. Downgrading to Free re-applies free tier limits without altering or deleting any existing customer, loan, or deposit records.',
    },
    {
      cat: 'Billing',
      q: 'Which payment options are supported?',
      a: 'Android users can complete purchases directly via Google Play In-App Billing. Web and mobile users can also pay using Razorpay (UPI, Credit/Debit Cards, NetBanking, and Wallets).',
    },
    {
      cat: 'Plans',
      q: 'What happens when I reach my active customer or company limit?',
      a: 'You will receive an upgrade prompt. All existing customer accounts remain 100% readable and accessible. Upgrading to Starter, Pro, or Enterprise instantly expands your limits.',
    },
    {
      cat: 'Security',
      q: 'Is client financial data stored securely?',
      a: 'Yes. Firestore Security Rules restrict data reads and updates strictly to authenticated company owners and assigned staff members.',
    },
    {
      cat: 'Plans',
      q: 'How does yearly billing save money?',
      a: 'Selecting Yearly Billing provides up to ~20% discount compared to 12 individual monthly renewal cycles.',
    },
  ];

  const filteredFaqs = allFaqs.filter((f) => {
    const matchesCat = faqCategory === 'All' || f.cat === faqCategory;
    const matchesSearch = f.q.toLowerCase().includes(faqSearchQuery.toLowerCase()) || f.a.toLowerCase().includes(faqSearchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-20">
      
      {/* Ambient Glow Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[30rem] h-[30rem] bg-indigo-600/15 rounded-full blur-[140px]"></div>
        <div className="absolute top-1/3 -right-40 w-[30rem] h-[30rem] bg-purple-600/15 rounded-full blur-[140px]"></div>
        <div className="absolute -bottom-40 left-1/3 w-[30rem] h-[30rem] bg-amber-600/10 rounded-full blur-[140px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Top Navbar Bar */}
        <div className="flex justify-between items-center mb-8 sm:mb-12">
          <button
            onClick={() => navigate('/subscription')}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Subscription
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Current Plan:</span>
            {renderPlanBadge(activePlan.id)}
          </div>
        </div>

        {/* HERO SECTION */}
        <div className="text-center max-w-4xl mx-auto mb-14 sm:mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-widest mb-4 shadow-md">
              <span className="material-symbols-outlined text-sm animate-pulse">workspace_premium</span>
              Transparent SaaS Subscription Plans
            </span>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-200 leading-tight">
              Scale Your Finance Business Without Boundaries
            </h1>

            <p className="text-sm sm:text-lg text-slate-400 mt-4 max-w-2xl mx-auto">
              Empower your loan ledgers, deposit management, multi-staff access, and PDF reports with predictable pricing.
            </p>
          </motion.div>

          {/* Billing Cycle Switcher */}
          <div className="mt-8 inline-flex items-center gap-3 p-1.5 rounded-full bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-inner">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>

            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Yearly Billing</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] uppercase shadow-sm">
                SAVE 20%
              </span>
            </button>
          </div>
        </div>

        {/* PRICING CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-24">
          {plansList.map((plan) => {
            const isCurrent = plan.id === activePlan.id;
            const isPopular = plan.id === 'pro';
            const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
            const savings = plan.monthlyPrice > 0 ? (plan.monthlyPrice * 12) - plan.yearlyPrice : 0;

            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -8, rotateX: 2 }}
                transition={{ duration: 0.2 }}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all backdrop-blur-md ${
                  isPopular
                    ? 'bg-slate-900/95 border-2 border-purple-500 shadow-2xl shadow-purple-500/25 ring-1 ring-purple-400/30'
                    : 'bg-slate-900/60 border border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {/* Popular / Recommended Ribbon */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
                    ⭐ Recommended
                  </div>
                )}

                <div>
                  {/* Card Header & Badge */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xl font-bold text-white capitalize">{plan.name}</h3>
                      {renderPlanBadge(plan.id)}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{plan.description}</p>
                  </div>

                  {/* Pricing Display */}
                  <div className="my-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-white">
                        {price === 0 ? '₹0' : `₹${price}`}
                      </span>
                      {price > 0 && (
                        <span className="text-xs font-semibold text-slate-400">
                          / {billingCycle === 'yearly' ? 'year' : 'month'}
                        </span>
                      )}
                    </div>

                    {billingCycle === 'yearly' && price > 0 && (
                      <div className="mt-2 space-y-1">
                        <span className="text-[11px] text-emerald-400 font-bold block">
                          ≈ ₹{Math.round(price / 12)}/month
                        </span>
                        {savings > 0 && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 inline-block">
                            Save ₹{savings} yearly
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <hr className="border-slate-800 my-6" />

                  {/* Feature Checklist */}
                  <div className="space-y-3 mb-8">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                      Included Capabilities
                    </span>
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs text-slate-300">
                        <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Action Button */}
                <div>
                  <button
                    onClick={() => handleOpenCheckoutModal(plan.id)}
                    disabled={isCurrent || isProcessing}
                    className={`w-full py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      isCurrent
                        ? 'bg-slate-800/80 text-slate-400 cursor-default border border-slate-700'
                        : isPopular
                        ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-purple-500/25 active:scale-95'
                        : 'bg-white text-slate-950 hover:bg-slate-100 active:scale-95'
                    }`}
                  >
                    {isProcessing ? (
                      <span className="animate-spin material-symbols-outlined text-base">sync</span>
                    ) : isCurrent ? (
                      'Current Active Plan'
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CHECKOUT CONFIRMATION MODAL */}
        {selectedPlanForCheckout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-slate-800 text-white rounded-3xl w-full max-w-md shadow-2xl p-6 sm:p-8 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block mb-1">
                    Checkout Confirmation
                  </span>
                  <h3 className="text-xl font-black text-white capitalize">
                    {SUBSCRIPTION_PLANS[selectedPlanForCheckout].name} Plan
                  </h3>
                </div>
                {renderPlanBadge(selectedPlanForCheckout)}
              </div>

              {/* Price Details */}
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Billing Cycle</span>
                  <span className="font-bold text-white capitalize">{billingCycle}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Price ({billingCycle})</span>
                  <span className="font-extrabold text-white text-sm">
                    ₹{billingCycle === 'yearly' ? SUBSCRIPTION_PLANS[selectedPlanForCheckout].yearlyPrice : SUBSCRIPTION_PLANS[selectedPlanForCheckout].monthlyPrice}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-slate-800">
                  <span>Payment Gateway</span>
                  <span className="font-semibold text-emerald-400">Google Play / Razorpay SSL</span>
                </div>
              </div>

              {/* Key Unlocked Features */}
              <div className="space-y-2 text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">Features Included</span>
                {SUBSCRIPTION_PLANS[selectedPlanForCheckout].features.slice(0, 4).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-300">
                    <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSelectedPlanForCheckout(null)}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCheckout}
                  className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base text-amber-400">lock</span>
                  Continue to Payment
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* PAYMENT SUCCESS OVERLAY MODAL */}
        {showSuccessOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-slate-800 text-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <span className="material-symbols-outlined text-4xl">check_circle</span>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white font-display">Congratulations! 🎉</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your payment was verified successfully. You are now subscribed to the <strong>{activatedPlanName}</strong> plan.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowSuccessOverlay(false);
                  navigate('/subscription');
                }}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
              >
                Go to Subscription Dashboard
              </button>
            </motion.div>
          </div>
        )}

        {/* COMPARISON MATRIX SECTION */}
        <div className="mb-24">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white font-display">Plan Feature Comparison Matrix</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Comprehensive side-by-side breakdown of all SaaS capabilities</p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-md">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="p-4 sm:p-5">Feature</th>
                  <th className="p-4 text-center">Free</th>
                  <th className="p-4 text-center">Starter</th>
                  <th className="p-4 text-center text-indigo-400">Pro</th>
                  <th className="p-4 text-center text-amber-400">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                <tr>
                  <td className="p-4 font-bold text-white">Company Profiles</td>
                  <td className="p-4 text-center">1</td>
                  <td className="p-4 text-center">1</td>
                  <td className="p-4 text-center font-bold text-white">2</td>
                  <td className="p-4 text-center font-bold text-amber-400">Unlimited</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Active Customers</td>
                  <td className="p-4 text-center">10</td>
                  <td className="p-4 text-center">50</td>
                  <td className="p-4 text-center font-bold text-white">100</td>
                  <td className="p-4 text-center font-bold text-amber-400">Unlimited</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Loan Tenure Limit</td>
                  <td className="p-4 text-center">2 Years</td>
                  <td className="p-4 text-center">3 Years</td>
                  <td className="p-4 text-center">5 Years</td>
                  <td className="p-4 text-center font-bold text-amber-400">Unlimited</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Deposit Module</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center">3 Years</td>
                  <td className="p-4 text-center">5 Years</td>
                  <td className="p-4 text-center font-bold text-emerald-400">Unlimited</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Excel Report Export</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center text-emerald-400 font-bold">✓</td>
                  <td className="p-4 text-center text-emerald-400 font-bold">✓</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Custom Logo & Stamp</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center text-emerald-400 font-bold">✓</td>
                  <td className="p-4 text-center text-emerald-400 font-bold">✓</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Multi-Staff Collaboration</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center text-slate-600">✕</td>
                  <td className="p-4 text-center">Max 2 Staff</td>
                  <td className="p-4 text-center font-bold text-amber-400">Unlimited Staff</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* WHY CHOOSE JLS FINANCE SUITE (6 PREMIUM CARDS) */}
        <div className="mb-24">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white font-display">Why Choose JLS Finance Suite?</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Built specifically for financial managers, micro-lenders, and deposit managers</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: 'shield_lock', title: 'Per-Company Isolation', desc: 'Firestore rules strictly enforce company boundary checks on all financial ledgers.' },
              { icon: 'bolt', title: 'Instant Upgrade Activation', desc: 'Google Play and Razorpay tokens automatically activate your plan in real-time.' },
              { icon: 'history_edu', title: 'Audit Trail & PDF Statements', desc: 'Generate branded passbooks, EMI payment receipts, and collection slips instantly.' },
              { icon: 'savings', title: 'Dual Loan & Deposit Ledgers', desc: 'Manage borrowing and deposit portfolios under one unified dashboard.' },
              { icon: 'phone_android', title: 'Native Android & Web Sync', desc: 'Capacitor Android app syncs seamlessly with web browser sessions.' },
              { icon: 'support_agent', title: 'Dedicated Technical Support', desc: 'Assistance with onboarding, data migration, and team staff management.' },
            ].map((card, i) => (
              <div key={i} className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 backdrop-blur-md flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
                  <span className="material-symbols-outlined text-2xl">{card.icon}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{card.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CUSTOMER TESTIMONIALS */}
        <div className="mb-24">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white font-display">Trusted By Financial Managers</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Hear from leaders scaling their credit operations with JLS Suite</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md flex flex-col justify-between space-y-4">
                <p className="text-xs text-slate-300 italic leading-relaxed">"{t.comment}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-800/60">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-indigo-500/30" />
                  <div>
                    <h5 className="text-xs font-bold text-white">{t.name}</h5>
                    <span className="text-[10px] text-slate-400 block">{t.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* INTERACTIVE SEARCHABLE FAQ SECTION */}
        <div className="mb-24 max-w-4xl mx-auto space-y-6">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-black text-white font-display">Frequently Asked Questions</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Search and explore answers to common billing and plan queries</p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-slate-500 text-lg">search</span>
              <input
                type="text"
                placeholder="Search FAQ questions..."
                value={faqSearchQuery}
                onChange={(e) => setFaqSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2">
              {['All', 'Billing', 'Plans', 'Security'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFaqCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    faqCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq, i) => (
                <div key={i} className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden transition-all">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full p-5 text-left font-bold text-sm text-white flex justify-between items-center"
                  >
                    <span>{faq.q}</span>
                    <span className="material-symbols-outlined text-slate-400">
                      {openFaq === i ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-5 pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3"
                      >
                        {faq.a}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">No matching questions found.</div>
            )}
          </div>
        </div>

        {/* BOTTOM CTA BANNER */}
        <div className="rounded-3xl bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 p-8 sm:p-12 border border-indigo-500/30 text-center relative overflow-hidden shadow-2xl">
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black text-white font-display">
              Ready to Grow Your Business?
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200">
              Upgrade today and experience high-performance financial ledger management.
            </p>
            <div className="pt-4">
              <button
                onClick={() => handleOpenCheckoutModal('pro')}
                className="px-8 py-4 rounded-2xl bg-white text-indigo-950 font-black text-xs uppercase tracking-wider hover:bg-slate-100 shadow-xl transition-all active:scale-95"
              >
                Upgrade to Pro Plan Today
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PricingPage;
