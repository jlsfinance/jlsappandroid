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