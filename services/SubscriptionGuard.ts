import { SUBSCRIPTION_PLANS, PlanId, SubscriptionPlan } from '../constants/subscriptionPlans';
import { UserSubscription, GuardCheckResult } from '../types';

export class SubscriptionGuard {
  /**
   * Resolve active plan from subscription object.
   * If null, expired, or invalid, returns default 'free' plan.
   */
  public static getActivePlan(subscription: UserSubscription | null | undefined): SubscriptionPlan {
    if (!subscription) {
      return SUBSCRIPTION_PLANS.free;
    }

    // Check if subscription has expired
    if (subscription.expiryDate && subscription.status !== 'free_tier') {
      const expiry = new Date(subscription.expiryDate).getTime();
      const now = new Date().getTime();
      if (now > expiry) {
        return SUBSCRIPTION_PLANS.free;
      }
    }

    const plan = SUBSCRIPTION_PLANS[subscription.planId as PlanId];
    return plan || SUBSCRIPTION_PLANS.free;
  }

  /**
   * Smart Plan Resolver: Finds the FIRST plan in tier hierarchy ('free' -> 'starter' -> 'pro' -> 'enterprise')
   * that actually increases or unlocks the required capability over the user's current plan limits.
   */
  public static getFirstUnlockingPlan(
    currentPlanId: PlanId,
    featureCheck: (plan: SubscriptionPlan) => boolean
  ): SubscriptionPlan {
    const planOrder: PlanId[] = ['free', 'starter', 'pro', 'enterprise'];
    const currentIndex = planOrder.indexOf(currentPlanId);

    for (let i = currentIndex + 1; i < planOrder.length; i++) {
      const candidate = SUBSCRIPTION_PLANS[planOrder[i]];
      if (featureCheck(candidate)) {
        return candidate;
      }
    }

    return SUBSCRIPTION_PLANS.enterprise;
  }

  /**
   * Check if user can add another customer
   */
  public static canAddCustomer(
    subscription: UserSubscription | null | undefined,
    currentCustomerCount: number
  ): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    const limit = plan.limits.maxCustomers;

    if (limit === -1 || currentCustomerCount < limit) {
      return { allowed: true, currentCount: currentCustomerCount, limit };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => {
      const candLimit = c.limits.maxCustomers === -1 ? 999999 : c.limits.maxCustomers;
      const curLimit = limit === -1 ? 999999 : limit;
      return candLimit > curLimit;
    });

    return {
      allowed: false,
      currentCount: currentCustomerCount,
      limit,
      reason: `Your current ${plan.name} allows up to ${limit} active customers. Upgrade to ${requiredPlan.name} to add more customers.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if user can create a loan with given tenure (in months)
   */
  public static canCreateLoan(
    subscription: UserSubscription | null | undefined,
    tenureMonths: number
  ): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    const maxMonths = plan.limits.maxLoanTenureMonths;

    if (maxMonths === -1 || tenureMonths <= maxMonths) {
      return { allowed: true, limit: maxMonths };
    }

    const maxYears = Math.floor(maxMonths / 12);
    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => {
      const candTenure = c.limits.maxLoanTenureMonths === -1 ? 999999 : c.limits.maxLoanTenureMonths;
      const curTenure = maxMonths === -1 ? 999999 : maxMonths;
      return candTenure > curTenure;
    });

    return {
      allowed: false,
      limit: maxMonths,
      reason: `Your current ${plan.name} supports loan tenure up to ${maxYears} years (${maxMonths} months). Upgrade to ${requiredPlan.name} for longer loan tenure.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if user can access Deposit module and create deposit with given tenure
   */
  public static canCreateDeposit(
    subscription: UserSubscription | null | undefined,
    tenureMonths: number
  ): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    if (!plan.limits.allowDepositModule) {
      const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => c.limits.allowDepositModule === true);
      return {
        allowed: false,
        reason: `Deposit (RD/FD) module is disabled on the ${plan.name}. Upgrade to ${requiredPlan.name} to unlock.`,
        requiredPlanId: requiredPlan.id,
      };
    }

    const maxMonths = plan.limits.maxDepositTenureMonths;
    if (maxMonths === -1 || tenureMonths <= maxMonths) {
      return { allowed: true, limit: maxMonths };
    }

    const maxYears = Math.floor(maxMonths / 12);
    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => {
      const candTenure = c.limits.maxDepositTenureMonths === -1 ? 999999 : c.limits.maxDepositTenureMonths;
      const curTenure = maxMonths === -1 ? 999999 : maxMonths;
      return candTenure > curTenure;
    });

    return {
      allowed: false,
      limit: maxMonths,
      reason: `Your current ${plan.name} supports deposit tenure up to ${maxYears} years (${maxMonths} months). Upgrade to ${requiredPlan.name} for longer deposit tenure.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if user can create another company
   */
  public static canAddCompany(
    subscription: UserSubscription | null | undefined,
    currentCompanyCount: number
  ): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    const limit = plan.limits.maxCompanies;

    if (limit === -1 || currentCompanyCount < limit) {
      return { allowed: true, currentCount: currentCompanyCount, limit };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => {
      const candLimit = c.limits.maxCompanies === -1 ? 999999 : c.limits.maxCompanies;
      const curLimit = limit === -1 ? 999999 : limit;
      return candLimit > curLimit;
    });

    return {
      allowed: false,
      currentCount: currentCompanyCount,
      limit,
      reason: `Your current ${plan.name} allows up to ${limit === -1 ? 'unlimited' : limit} company profile. Upgrade to ${requiredPlan.name} to create more companies.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if user can add staff/agents
   */
  public static canAddStaff(
    subscription: UserSubscription | null | undefined
  ): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    if (plan.limits.allowMultiStaff) {
      return { allowed: true };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => c.limits.allowMultiStaff === true);
    return {
      allowed: false,
      reason: `Multi-staff & Agent collection permissions are available on ${requiredPlan.name}.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if Excel export is allowed
   */
  public static canExportExcel(subscription: UserSubscription | null | undefined): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    if (plan.limits.allowExcelExport) {
      return { allowed: true };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => c.limits.allowExcelExport === true);
    return {
      allowed: false,
      reason: `Excel Data Export is available on ${requiredPlan.name}.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if Advanced Reports (Cash Flow & Overdue) are allowed
   */
  public static canUseAdvancedReports(subscription: UserSubscription | null | undefined): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    if (plan.limits.allowAdvancedReports) {
      return { allowed: true };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => c.limits.allowAdvancedReports === true);
    return {
      allowed: false,
      reason: `Advanced Financial & Cash Flow reports are available on ${requiredPlan.name}.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if Custom Logo & Digital Stamp on PDF is allowed
   */
  public static canUseCustomLogoAndStamp(subscription: UserSubscription | null | undefined): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    if (plan.limits.allowCustomLogoAndStamp) {
      return { allowed: true };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => c.limits.allowCustomLogoAndStamp === true);
    return {
      allowed: false,
      reason: `Custom Company Logo & Digital Stamp branding are available on ${requiredPlan.name}.`,
      requiredPlanId: requiredPlan.id,
    };
  }

  /**
   * Check if WhatsApp Reminder Templates are allowed
   */
  public static canUseWhatsAppTemplates(subscription: UserSubscription | null | undefined): GuardCheckResult {
    const plan = this.getActivePlan(subscription);
    if (plan.limits.allowWhatsAppTemplates) {
      return { allowed: true };
    }

    const requiredPlan = this.getFirstUnlockingPlan(plan.id, (c) => c.limits.allowWhatsAppTemplates === true);
    return {
      allowed: false,
      reason: `Automated WhatsApp Reminder Templates are available on ${requiredPlan.name}.`,
      requiredPlanId: requiredPlan.id,
    };
  }
}
