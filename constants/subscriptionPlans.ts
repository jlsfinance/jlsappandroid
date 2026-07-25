export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'past_due' | 'free_tier';

export interface PlanLimits {
  maxCompanies: number; // -1 means unlimited
  maxCustomers: number; // -1 means unlimited
  maxLoanTenureMonths: number; // in months, e.g. 24, 36, 60, -1
  maxDepositTenureMonths: number; // 0 = disabled, -1 = unlimited
  allowDepositModule: boolean;
  allowExcelExport: boolean;
  allowAdvancedReports: boolean;
  allowCustomLogoAndStamp: boolean;
  allowWhatsAppTemplates: boolean;
  allowMultiStaff: boolean;
  allowBranchManagement: boolean;
  allowApiIntegration: boolean;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  badge?: string;
  monthlyPrice: number; // in INR
  yearlyPrice: number; // in INR
  description: string;
  limits: PlanLimits;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free Plan',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Essential ledger for micro-lenders starting out.',
    limits: {
      maxCompanies: 1,
      maxCustomers: 10,
      maxLoanTenureMonths: 24, // 2 Years
      maxDepositTenureMonths: 0, // Disabled
      allowDepositModule: false,
      allowExcelExport: false,
      allowAdvancedReports: false,
      allowCustomLogoAndStamp: false,
      allowWhatsAppTemplates: false,
      allowMultiStaff: false,
      allowBranchManagement: false,
      allowApiIntegration: false,
    },
    features: [
      '1 Company Profile',
      'Up to 10 Active Customers',
      'Loan Module Only',
      'Loan Tenure up to 2 Years',
      'Basic PDF Receipt',
      'Manual WhatsApp Share',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    monthlyPrice: 59,
    yearlyPrice: 599,
    description: 'Ideal for growing individual lenders & deposit collectors.',
    limits: {
      maxCompanies: 1,
      maxCustomers: 50,
      maxLoanTenureMonths: 36, // 3 Years
      maxDepositTenureMonths: 36, // 3 Years
      allowDepositModule: true,
      allowExcelExport: false,
      allowAdvancedReports: false,
      allowCustomLogoAndStamp: false,
      allowWhatsAppTemplates: false,
      allowMultiStaff: false,
      allowBranchManagement: false,
      allowApiIntegration: false,
    },
    features: [
      '1 Company Profile',
      'Up to 50 Active Customers',
      'Loan & Deposit (RD/FD) Modules',
      'Tenure up to 3 Years',
      'Cloud Backup & Sync',
      'Basic Reports & PDF Receipts',
      'WhatsApp Share',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    badge: 'Most Popular',
    monthlyPrice: 199,
    yearlyPrice: 1999,
    description: 'Full-featured suite for professional finance businesses.',
    limits: {
      maxCompanies: 1,
      maxCustomers: 100,
      maxLoanTenureMonths: 60, // 5 Years
      maxDepositTenureMonths: 60, // 5 Years
      allowDepositModule: true,
      allowExcelExport: true,
      allowAdvancedReports: true,
      allowCustomLogoAndStamp: true,
      allowWhatsAppTemplates: true,
      allowMultiStaff: false,
      allowBranchManagement: false,
      allowApiIntegration: false,
    },
    features: [
      '1 Company Profile',
      'Up to 100 Active Customers',
      'Loan & Deposit Modules',
      'Tenure up to 5 Years',
      'Custom Logo & Digital Stamp',
      'Professional PDF Receipts',
      'WhatsApp Reminder Templates',
      'Excel Export',
      'Cash Flow & Overdue Reports',
      'Advanced Dashboard & Priority Support',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Plan',
    monthlyPrice: 3999,
    yearlyPrice: 39999,
    description: 'Unlimited capacity for multi-branch companies & teams.',
    limits: {
      maxCompanies: -1, // Unlimited
      maxCustomers: -1, // Unlimited
      maxLoanTenureMonths: -1, // Unlimited
      maxDepositTenureMonths: -1, // Unlimited
      allowDepositModule: true,
      allowExcelExport: true,
      allowAdvancedReports: true,
      allowCustomLogoAndStamp: true,
      allowWhatsAppTemplates: true,
      allowMultiStaff: true,
      allowBranchManagement: true,
      allowApiIntegration: true,
    },
    features: [
      'Unlimited Companies',
      'Unlimited Customers',
      'Unlimited Loans & Deposits',
      'Unlimited Tenure',
      'Unlimited Staff & Collection Agents',
      'Branch & Permission Management',
      'API Integration',
      'Unlimited Reports, PDF & Excel Exports',
      'Dedicated Premium Support',
    ],
  },
};
