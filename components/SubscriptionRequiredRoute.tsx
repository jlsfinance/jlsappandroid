import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '../context/SubscriptionContext';
import { SubscriptionGuard } from '../services/SubscriptionGuard';

interface SubscriptionRequiredRouteProps {
  children: React.ReactNode;
  feature: 'deposit' | 'advancedReports' | 'multiStaff';
}

const featureCheckMap = {
  deposit: (plan: ReturnType<typeof SubscriptionGuard.getActivePlan>) => plan.limits.allowDepositModule,
  advancedReports: (plan: ReturnType<typeof SubscriptionGuard.getActivePlan>) => plan.limits.allowAdvancedReports,
  multiStaff: (plan: ReturnType<typeof SubscriptionGuard.getActivePlan>) => plan.limits.allowMultiStaff,
};

const SubscriptionRequiredRoute: React.FC<SubscriptionRequiredRouteProps> = ({ children, feature }) => {
  const { subscription, loading } = useSubscription();

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  const plan = SubscriptionGuard.getActivePlan(subscription);
  const check = featureCheckMap[feature];
  if (!check(plan)) {
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
};

export default SubscriptionRequiredRoute;
