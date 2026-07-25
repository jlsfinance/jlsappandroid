import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSubscription } from '../context/SubscriptionContext';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptionPlans';
import { format, parseISO, differenceInDays } from 'date-fns';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const SubscriptionDetails: React.FC = () => {
  const navigate = useNavigate();
  const { subscription, usage, activePlan } = useSubscription();
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState<boolean>(true);

  // Fetch Payment History safely for current user
  useEffect(() => {
    const fetchPaymentHistory = async () => {
      const user = auth.currentUser;
      if (!user) {
        setLoadingPayments(false);
        return;
      }
      try {
        const q = query(
          collection(db, 'payment_history'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPayments(list);
      } catch (err) {
        console.warn('Payment history fetch notice (empty or index pending):', err);
      } finally {
        setLoadingPayments(false);
      }
    };
    fetchPaymentHistory();
  }, []);

  // Usage Math & Progress Bar Colors
  const customerCount = usage?.customers ?? 0;
  const maxCustomers = activePlan.limits.maxCustomers;
  const customerPercent = maxCustomers === 999999 ? 5 : Math.min(Math.round((customerCount / maxCustomers) * 100), 100);
  const customerColor = customerPercent > 90 ? 'bg-rose-500' : customerPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  const companyCount = usage?.companies ?? 1;
  const maxCompanies = activePlan.limits.maxCompanies;
  const companyPercent = maxCompanies === 999999 ? 10 : Math.min(Math.round((companyCount / maxCompanies) * 100), 100);
  const companyColor = companyPercent > 90 ? 'bg-rose-500' : companyPercent > 70 ? 'bg-amber-500' : 'bg-purple-500';

  // Days remaining calculation
  let daysRemaining = 'N/A';
  if (subscription?.expiryDate) {
    try {
      const diff = differenceInDays(parseISO(subscription.expiryDate), new Date());
      daysRemaining = diff > 0 ? `${diff} Days` : 'Expired';
    } catch (e) {
      daysRemaining = 'N/A';
    }
  } else if (activePlan.id === 'free') {
    daysRemaining = 'Lifetime';
  }

  // Next Plan Key
  const nextPlanKey = activePlan.id === 'free' ? 'starter' : activePlan.id === 'starter' ? 'pro' : activePlan.id === 'pro' ? 'enterprise' : null;
  const nextPlan = nextPlanKey ? SUBSCRIPTION_PLANS[nextPlanKey] : null;

  const upgradeButtonLabel =
    activePlan.id === 'free'
      ? 'Upgrade to Starter'
      : activePlan.id === 'starter'
      ? 'Upgrade to Pro'
      : activePlan.id === 'pro'
      ? 'Upgrade to Enterprise'
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8 font-sans selection:bg-indigo-500 selection:text-white pb-20">
      
      {/* Background Ambient Lights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/3 left-10 w-96 h-96 bg-purple-600/15 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        
        {/* Navigation & Header Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Dashboard
          </button>

          <Link
            to="/pricing"
            className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/25 transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-amber-400 text-base">rocket_launch</span>
            Upgrade Plan
          </Link>
        </div>

        {/* SECTION A: Current Plan Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-purple-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <span className="material-symbols-outlined text-4xl">diamond</span>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-black text-white capitalize font-display">
                    {activePlan.name}
                  </h1>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white ${
                    subscription?.status === 'active' ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-indigo-600'
                  }`}>
                    {subscription?.status === 'active' ? 'Active' : 'Free Tier'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  {activePlan.description}
                </p>
              </div>
            </div>

            {/* Quick Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-500 block font-medium">Billing Cycle</span>
                <span className="font-bold text-white capitalize">{subscription?.billingCycle || 'Free'}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Expiry Date</span>
                <span className="font-bold text-white">
                  {activePlan.id === 'free' ? 'Lifetime' : (subscription?.expiryDate ? format(parseISO(subscription.expiryDate), 'dd MMM yyyy') : 'N/A')}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Days Left</span>
                <span className="font-bold text-indigo-400">{daysRemaining}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Auto Renewal</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">sync</span>
                  {subscription?.autoRenewal ? 'Active' : 'N/A'}
                </span>
              </div>
            </div>

          </div>
        </motion.div>

        {/* SECTION B: Usage Analytics (Animated Progress Bars) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 font-display">
              <span className="material-symbols-outlined text-indigo-400">bar_chart</span>
              Usage Analytics & Capacity
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Real-Time Sync</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customers Progress */}
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-300">Active Customers</span>
                <span className="text-xs font-black text-white">
                  {customerCount} / {maxCustomers === 999999 ? '∞ Unlimited' : maxCustomers}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${customerPercent}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full ${customerColor} transition-all`}
                ></motion.div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2">
                <span>{customerPercent}% Used</span>
                <span>{maxCustomers === 999999 ? 'Unlimited' : `${maxCustomers - customerCount} slots remaining`}</span>
              </div>
            </div>

            {/* Companies Progress */}
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-300">Created Companies</span>
                <span className="text-xs font-black text-white">
                  {companyCount} / {maxCompanies === 999999 ? '∞ Unlimited' : maxCompanies}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${companyPercent}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full ${companyColor} transition-all`}
                ></motion.div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2">
                <span>{companyPercent}% Used</span>
                <span>{maxCompanies === 999999 ? 'Unlimited' : `${maxCompanies - companyCount} slots remaining`}</span>
              </div>
            </div>
          </div>

          {/* Module Capabilities Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Loan Tenure Limit</span>
              <span className="text-sm font-black text-white">
                {activePlan.limits.maxLoanTenureMonths === 999999 ? 'Unlimited' : `Max ${activePlan.limits.maxLoanTenureMonths / 12} Yrs`}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Deposit Module</span>
              <span className={`text-sm font-black ${activePlan.limits.allowDepositModule ? 'text-emerald-400' : 'text-slate-500'}`}>
                {activePlan.limits.allowDepositModule ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Staff Allocation</span>
              <span className="text-sm font-black text-white">
                {activePlan.limits.allowMultiStaff ? 'Multi-Staff Enabled' : 'Owner Only'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 opacity-70">
              <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider block mb-1">Cloud Storage</span>
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">cloud</span>
                Coming Soon
              </span>
            </div>
          </div>
        </motion.div>

        {/* SECTION C: Current Plan Features */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 backdrop-blur-xl shadow-xl"
        >
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 font-display">
            <span className="material-symbols-outlined text-emerald-400">verified</span>
            Included Capabilities in Your Plan
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activePlan.features.map((feat, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs font-semibold text-slate-200">
                <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* SECTION D: Locked Features & Next Tier Comparison */}
        {nextPlan && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-3xl bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-slate-900/80 border border-indigo-500/30 p-6 sm:p-8 backdrop-blur-xl shadow-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2 font-display">
                  <span className="material-symbols-outlined text-amber-400">lock</span>
                  Locked Features (Unlock in {nextPlan.name})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Upgrade your account to unlock advanced SaaS capabilities</p>
              </div>

              <Link
                to="/pricing"
                className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs uppercase tracking-wider hover:bg-amber-500/30 transition-all"
              >
                Unlock All
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nextPlan.features
                .filter((feat) => !activePlan.features.includes(feat))
                .slice(0, 8)
                .map((feat, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80">
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-300">
                      <span className="material-symbols-outlined text-amber-400 text-base">lock</span>
                      <span>{feat}</span>
                    </div>

                    <Link
                      to="/pricing"
                      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/50 transition-colors"
                    >
                      Unlock
                    </Link>
                  </div>
                ))}
            </div>
          </motion.div>
        )}

        {/* SECTION E: Benefits - Why Upgrade? */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <span className="material-symbols-outlined text-purple-400">auto_awesome</span>
            Why Upgrade Your Business Suite?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: 'groups', title: 'Expand Customer Capacity', desc: 'Scale up from 10 to 100+ active customer accounts effortlessly.' },
              { icon: 'apartment', title: 'Multi-Company Profiles', desc: 'Manage separate loan & deposit ledgers for different branches.' },
              { icon: 'table_chart', title: 'Excel Ledger Exports', desc: 'Export monthly financial reports, EMI history, and customer statements.' },
              { icon: 'analytics', title: 'Advanced Financial Analytics', desc: 'Gain deep insights into net interest income and recovery ratios.' },
              { icon: 'shield_person', title: 'Priority Support & Onboarding', desc: 'Direct technical assistance for ledger data migration.' },
              { icon: 'psychology', title: 'Future AI Risk Insights', desc: 'Upcoming automated credit score and EMI default prediction models.' },
            ].map((benefit, i) => (
              <div key={i} className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
                  <span className="material-symbols-outlined text-xl">{benefit.icon}</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">{benefit.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* SECTION F: Payment History Table */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-4"
        >
          <h2 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <span className="material-symbols-outlined text-indigo-400">history</span>
            Payment History & Billing Invoices
          </h2>

          {loadingPayments ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading payment history...</div>
          ) : payments.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Amount</th>
                    <th className="p-3.5">Gateway</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Invoice ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="p-3.5">{p.timestamp ? format(parseISO(p.timestamp), 'dd MMM yyyy') : 'N/A'}</td>
                      <td className="p-3.5 font-bold text-white">₹{p.amount || 0}</td>
                      <td className="p-3.5 capitalize">{p.gateway || 'Razorpay'}</td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase">
                          {p.status || 'Success'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono text-[10px] text-slate-400">{p.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl bg-slate-950/50 border border-slate-800/60 space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-2xl">receipt_long</span>
              </div>
              <h4 className="text-xs font-bold text-white">No Previous Transactions Found</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                When you activate or upgrade a subscription, your billing invoices and transaction records will appear here.
              </p>
            </div>
          )}
        </motion.div>

        {/* SECTION G: Support & Assistance */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <a
            href="https://wa.me/919413821007"
            target="_blank"
            rel="noopener noreferrer"
            className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 transition-all flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">chat</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">WhatsApp Support</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Instant assistance with subscription</p>
            </div>
          </a>

          <a
            href="mailto:support@jlssuite.com"
            className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 transition-all flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">mail</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors">Email Billing Help</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">support@jlssuite.com</p>
            </div>
          </a>

          <Link
            to="/pricing"
            className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">help</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">Pricing & FAQ</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">View plan comparisons</p>
            </div>
          </Link>
        </motion.div>

        {/* SECTION H: Upgrade CTA Card */}
        {activePlan.id !== 'enterprise' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            className="rounded-3xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 p-8 text-white shadow-2xl shadow-indigo-500/25 flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-2xl font-black font-display tracking-tight">Upgrade Your Account Today</h3>
              <p className="text-xs text-indigo-100/90 max-w-lg">
                Unlock multi-company profiles, deposit ledgers, Excel report downloads, and higher active customer limits with instant activation.
              </p>
            </div>

            <Link
              to="/pricing"
              className="px-8 py-4 rounded-2xl bg-white text-indigo-950 font-black text-xs uppercase tracking-wider hover:bg-slate-100 shadow-xl transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base text-amber-500">rocket_launch</span>
              {upgradeButtonLabel}
            </Link>
          </motion.div>
        )}

      </div>
    </div>
  );
};

export default SubscriptionDetails;
