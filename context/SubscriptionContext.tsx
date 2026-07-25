import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { UserSubscription, GuardCheckResult, UserUsage } from '../types';
import { SUBSCRIPTION_PLANS, SubscriptionPlan } from '../constants/subscriptionPlans';
import { SubscriptionGuard } from '../services/SubscriptionGuard';
import { UsageService } from '../services/UsageService';

interface SubscriptionContextType {
  subscription: UserSubscription | null;
  usage: UserUsage | null;
  activePlan: SubscriptionPlan;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  upgradeModalState: {
    isOpen: boolean;
    result: GuardCheckResult | null;
  };
  showUpgradeModal: (result?: GuardCheckResult) => void;
  hideUpgradeModal: () => void;
  // Guard Helper Methods
  canAddCustomer: (currentCount?: number) => GuardCheckResult;
  canCreateLoan: (tenureMonths: number) => GuardCheckResult;
  canCreateDeposit: (tenureMonths: number) => GuardCheckResult;
  canAddCompany: (currentCount?: number) => GuardCheckResult;
  canAddStaff: () => GuardCheckResult;
  canExportExcel: () => GuardCheckResult;
  canUseAdvancedReports: () => GuardCheckResult;
  canUseCustomLogoAndStamp: () => GuardCheckResult;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [upgradeModalState, setUpgradeModalState] = useState<{
    isOpen: boolean;
    result: GuardCheckResult | null;
  }>({
    isOpen: false,
    result: null,
  });

  // Auto-expiry evaluation: If past expiryDate, fallback activePlan to Free
  const isExpired = subscription?.status === 'active' && new Date() > new Date(subscription.expiryDate);
  const activePlan = isExpired ? SUBSCRIPTION_PLANS.free : SubscriptionGuard.getActivePlan(subscription);

  const fetchSubscription = async (userId: string, userEmail: string) => {
    setLoading(true);
    try {
      const subRef = doc(db, 'subscriptions', userId);
      const subSnap = await getDoc(subRef);

      if (subSnap.exists()) {
        const data = subSnap.data() as UserSubscription;
        setSubscription(data);
        setLoading(false);
      } else {
        const defaultFreeSub: UserSubscription = {
          userId,
          userEmail,
          planId: 'free',
          billingCycle: 'monthly',
          status: 'free_tier',
          startDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          autoRenewal: false,
          paymentSource: 'free_tier',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSubscription(defaultFreeSub);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubscribeSub: (() => void) | null = null;
    let unsubscribeUsage: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeSub) { unsubscribeSub(); unsubscribeSub = null; }
      if (unsubscribeUsage) { unsubscribeUsage(); unsubscribeUsage = null; }

      if (user) {
        setLoading(true);
        // Realtime listener for subscription updates
        const subRef = doc(db, 'subscriptions', user.uid);
        unsubscribeSub = onSnapshot(
          subRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setSubscription(docSnap.data() as UserSubscription);
            } else {
              fetchSubscription(user.uid, user.email || '');
            }
            setLoading(false);
          },
          (err) => {
            console.error('Subscription snapshot error:', err);
            fetchSubscription(user.uid, user.email || '');
          }
        );

        // Realtime listener for usage counters (Usage Tracking System)
        const usageRef = doc(db, 'usage', user.uid);
        unsubscribeUsage = onSnapshot(
          usageRef,
          (usageSnap) => {
            if (usageSnap.exists()) {
              setUsage(usageSnap.data() as UserUsage);
            } else {
              UsageService.getUsage(user.uid).then(setUsage);
            }
          },
          (err) => console.error('Usage snapshot error:', err)
        );
      } else {
        setSubscription(null);
        setUsage(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSub) unsubscribeSub();
      if (unsubscribeUsage) unsubscribeUsage();
    };
  }, []);

  const refreshSubscription = async () => {
    const user = auth.currentUser;
    if (user) {
      await fetchSubscription(user.uid, user.email || '');
    }
  };

  const showUpgradeModal = (result?: GuardCheckResult) => {
    setUpgradeModalState({
      isOpen: true,
      result: result || {
        allowed: false,
        reason: 'Upgrade your subscription to unlock premium features.',
      },
    });
  };

  const hideUpgradeModal = () => {
    setUpgradeModalState({ isOpen: false, result: null });
  };

  // Guard helper callers reading directly from usage tracking state when count is omitted
  const canAddCustomer = (currentCount?: number) => {
    const countToUse = currentCount !== undefined ? currentCount : (usage?.customers || 0);
    return SubscriptionGuard.canAddCustomer(subscription, countToUse);
  };

  const canCreateLoan = (tenureMonths: number) =>
    SubscriptionGuard.canCreateLoan(subscription, tenureMonths);

  const canCreateDeposit = (tenureMonths: number) =>
    SubscriptionGuard.canCreateDeposit(subscription, tenureMonths);

  const canAddCompany = (currentCount?: number) => {
    const countToUse = currentCount !== undefined ? currentCount : (usage?.companies || 0);
    return SubscriptionGuard.canAddCompany(subscription, countToUse);
  };

  const canAddStaff = () =>
    SubscriptionGuard.canAddStaff(subscription);

  const canExportExcel = () =>
    SubscriptionGuard.canExportExcel(subscription);

  const canUseAdvancedReports = () =>
    SubscriptionGuard.canUseAdvancedReports(subscription);

  const canUseCustomLogoAndStamp = () =>
    SubscriptionGuard.canUseCustomLogoAndStamp(subscription);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        usage,
        activePlan,
        loading,
        refreshSubscription,
        upgradeModalState,
        showUpgradeModal,
        hideUpgradeModal,
        canAddCustomer,
        canCreateLoan,
        canCreateDeposit,
        canAddCompany,
        canAddStaff,
        canExportExcel,
        canUseAdvancedReports,
        canUseCustomLogoAndStamp,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
