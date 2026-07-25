import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SubscriptionPlan, SUBSCRIPTION_PLANS, PlanId } from '../constants/subscriptionPlans';

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockedFeature?: string;
  currentPlan: SubscriptionPlan;
  requiredPlanId?: PlanId;
  reason?: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  blockedFeature = 'Limit Reached',
  currentPlan,
  requiredPlanId = 'pro',
  reason = "You've reached your current plan limit. Upgrade your subscription to continue.",
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const targetPlan = SUBSCRIPTION_PLANS[requiredPlanId] || SUBSCRIPTION_PLANS.pro;

  const handleUpgrade = () => {
    onClose();
    navigate('/pricing');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>

          {/* Icon Header */}
          <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-3xl">workspace_premium</span>
          </div>

          {/* Title & Plan Status */}
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-display mb-1">
            Upgrade Required
          </h3>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-4">
            <span>Current Plan: <strong>{currentPlan.name}</strong></span>
          </div>

          {/* Blocked Feature Callout */}
          <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4 mb-4 text-left">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1">
              {blockedFeature}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
              {reason}
            </p>
          </div>

          {/* Dynamic Plan Comparison Matrix */}
          <div className="bg-slate-50 dark:bg-slate-950/80 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 mb-6">
            {Object.values(SUBSCRIPTION_PLANS).map((plan) => {
              const isCurrent = plan.id === currentPlan.id;
              const isTarget = plan.id === targetPlan.id;
              return (
                <div
                  key={plan.id}
                  className={`flex justify-between items-center p-2 rounded-xl text-xs font-semibold transition-all ${
                    isTarget
                      ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                      : isCurrent
                      ? 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-400'
                      : 'text-slate-400 opacity-60'
                  }`}
                >
                  <span>{plan.name}</span>
                  <span className="font-bold">
                    {isTarget ? `⭐ Rerecommended` : isCurrent ? `Current` : `₹${plan.monthlyPrice}/mo`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Action Buttons with Dynamic Smart Button Text */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleUpgrade}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-500/25 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base text-amber-400">rocket_launch</span>
              Upgrade to {targetPlan.name}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UpgradeModal;
