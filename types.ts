export interface Customer {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
  photo_url?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  status: 'Active' | 'Overdue' | 'Pending' | 'Paid Off';
  nextPayment?: string;
  arrears?: string;
  createdAt?: any;
  // KYC Details
  aadhaar?: string;
  pan?: string;
  voterId?: string;
  // Guarantor Details
  guarantor?: {
    name?: string;
    mobile?: string;
    address?: string;
    relation?: string;
  };
}

export interface Loan {
  id: string;
  customerId?: string;
  amount: number;
  emi: number;
  interestRate: number;
  tenure: number; // in months
  status: 'Pending' | 'Approved' | 'Disbursed' | 'Rejected' | 'Completed' | 'Active' | 'Overdue';
  date: string; // ISO date string
  type?: string;
  progress?: number;
  paid?: number;
  total?: number;
  customerName?: string;
  repaymentSchedule?: {
    date: string;
    amount: number;
    status: 'Pending' | 'Paid';
    paymentDate?: string;
  }[];
}

export interface Transaction {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  type: 'credit' | 'debit';
  status: 'success' | 'pending' | 'failed';
  date: string;
  icon: string;
}

// Deposit / RD model
export type DepositType = 'rd_maturity' | 'rd_payout' | 'fd_lumpsum';

export interface Deposit {
  id: string;
  customerId: string;
  customerName: string;
  companyId: string;
  type: DepositType; // RD maturity, RD monthly payout, FD lumpsum
  principal: number; // total deposited (RD) or lump sum (FD)
  monthlyAmount?: number; // for RD: per-installment amount
  interestRate: number; // % p.a.
  tenure: number; // months
  status: 'Pending' | 'Active' | 'Matured' | 'Closed' | 'Foreclosed';
  startDate: string; // ISO date
  maturityDate?: string;
  maturityAmount?: number; // principal + total interest
  notes?: string;
  createdBy?: string;
  createdAt?: string;
  nominee?: { name?: string; relation?: string; phone?: string };
  depositSchedule?: DepositInstallment[];
}

export interface DepositInstallment {
  installmentNumber: number;
  dueDate: string;
  amount: number; // deposit amount (RD) or interest (FD)
  interest?: number; // interest component for this installment
  status: 'Pending' | 'Paid' | 'Defaulted';
  paymentDate?: string;
  paymentMethod?: string;
  amountPaid?: number;
  remark?: string;
}

export interface Company {
  id: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
  address?: string;
  phone?: string;
  gstin?: string;
  upiId?: string;
}

export interface AppUser {
  id: string;
  uid?: string;
  name?: string;
  email: string;
  role: 'admin' | 'agent' | 'customer';
  companyId?: string;
  permissions?: {
    canViewLoans?: boolean;
    canCollectEMI?: boolean;
    canViewCustomers?: boolean;
  };
  createdAt?: string;
}