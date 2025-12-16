export interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  logo?: string;
  ownerId: string;
  createdAt: string;
}

export interface CompanyUser {
  id: string;
  companyId: string;
  userId: string;
  role: 'owner' | 'admin' | 'manager' | 'staff';
  permissions?: string[];
  joinedAt: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  activeCompanyId?: string;
}

export interface Customer {
  id: string;
  companyId: string;
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
  aadhaar?: string;
  pan?: string;
  voterId?: string;
  guarantor?: {
    name?: string;
    mobile?: string;
    address?: string;
    relation?: string;
  };
}

export interface Loan {
  id: string;
  companyId: string;
  customerId?: string;
  amount: number;
  emi: number;
  interestRate: number;
  tenure: number;
  status: 'Pending' | 'Approved' | 'Disbursed' | 'Rejected' | 'Completed' | 'Active' | 'Overdue';
  date: string;
  type?: string;
  progress?: number;
  paid?: number;
  total?: number;
}

export interface Transaction {
  id: string;
  companyId: string;
  title: string;
  subtitle: string;
  amount: number;
  type: 'credit' | 'debit';
  status: 'success' | 'pending' | 'failed';
  date: string;
  icon: string;
}

export interface Receipt {
  id: string;
  companyId: string;
  customerId: string;
  loanId: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  receiptNumber: string;
  status: 'paid' | 'pending';
}

export interface Partner {
  id: string;
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  commission?: number;
  status: 'Active' | 'Inactive';
  createdAt: string;
}