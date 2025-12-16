import { collection, getDocs, addDoc, doc, getDoc, query, where, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Customer, Loan, Company, CompanyUser, Receipt, Partner } from '../types';

// Company Operations
export const createCompany = async (company: Omit<Company, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "companies"), company);
    return docRef.id;
  } catch (error) {
    console.error("Error creating company:", error);
    throw error;
  }
};

export const createCompanyUser = async (companyUser: Omit<CompanyUser, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "companyUsers"), companyUser);
    return docRef.id;
  } catch (error) {
    console.error("Error creating company user:", error);
    throw error;
  }
};

export const fetchCompanyById = async (companyId: string): Promise<Company | null> => {
  try {
    const docRef = doc(db, "companies", companyId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Company;
    }
    return null;
  } catch (error) {
    console.error("Error fetching company:", error);
    return null;
  }
};

// Customer Operations - Now with companyId
export const fetchCustomers = async (companyId: string): Promise<Customer[]> => {
  try {
    if (!companyId) return [];
    const customersQuery = query(
      collection(db, "customers"),
      where("companyId", "==", companyId)
    );
    const querySnapshot = await getDocs(customersQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
  } catch (error) {
    console.error("Error fetching customers from Firebase:", error);
    return [];
  }
};

export const fetchCustomerById = async (id: string): Promise<Customer | null> => {
  try {
    const docRef = doc(db, "customers", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Customer;
    } else {
      console.log("No such customer document!");
      return null;
    }
  } catch (error) {
    console.error("Error fetching customer details:", error);
    return null;
  }
};

export const createCustomer = async (customer: Omit<Customer, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "customers"), customer);
    return docRef.id;
  } catch (error) {
    console.error("Error adding customer:", error);
    throw error;
  }
};

export const updateCustomer = async (id: string, customer: Partial<Customer>) => {
  try {
    const docRef = doc(db, "customers", id);
    await updateDoc(docRef, customer);
  } catch (error) {
    console.error("Error updating customer:", error);
    throw error;
  }
};

export const deleteCustomer = async (id: string) => {
  try {
    const docRef = doc(db, "customers", id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting customer:", error);
    throw error;
  }
};

// Loan Operations - Now with companyId
export const fetchLoans = async (companyId: string): Promise<Loan[]> => {
  try {
    if (!companyId) return [];
    const loansQuery = query(
      collection(db, "loans"),
      where("companyId", "==", companyId),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(loansQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
  } catch (error) {
    console.error("Error fetching loans:", error);
    return [];
  }
};

export const fetchLoansByCustomerId = async (customerId: string, companyId: string): Promise<Loan[]> => {
  try {
    if (!companyId) return [];
    const loansQuery = query(
      collection(db, "loans"), 
      where("customerId", "==", customerId),
      where("companyId", "==", companyId),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(loansQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
  } catch (error) {
    console.error("Error fetching loans:", error);
    return [];
  }
};

export const fetchLoanById = async (id: string): Promise<Loan | null> => {
  try {
    const docRef = doc(db, "loans", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Loan;
    }
    return null;
  } catch (error) {
    console.error("Error fetching loan:", error);
    return null;
  }
};

export const createLoan = async (loan: Omit<Loan, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "loans"), loan);
    return docRef.id;
  } catch (error) {
    console.error("Error adding loan:", error);
    throw error;
  }
};

export const updateLoan = async (id: string, loan: Partial<Loan>) => {
  try {
    const docRef = doc(db, "loans", id);
    await updateDoc(docRef, loan);
  } catch (error) {
    console.error("Error updating loan:", error);
    throw error;
  }
};

// Receipt Operations
export const fetchReceipts = async (companyId: string): Promise<Receipt[]> => {
  try {
    if (!companyId) return [];
    const receiptsQuery = query(
      collection(db, "receipts"),
      where("companyId", "==", companyId)
    );
    const querySnapshot = await getDocs(receiptsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt));
  } catch (error) {
    console.error("Error fetching receipts:", error);
    return [];
  }
};

export const createReceipt = async (receipt: Omit<Receipt, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "receipts"), receipt);
    return docRef.id;
  } catch (error) {
    console.error("Error creating receipt:", error);
    throw error;
  }
};

// Partner Operations
export const fetchPartners = async (companyId: string): Promise<Partner[]> => {
  try {
    if (!companyId) return [];
    const partnersQuery = query(
      collection(db, "partners"),
      where("companyId", "==", companyId)
    );
    const querySnapshot = await getDocs(partnersQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Partner));
  } catch (error) {
    console.error("Error fetching partners:", error);
    return [];
  }
};

export const createPartner = async (partner: Omit<Partner, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "partners"), partner);
    return docRef.id;
  } catch (error) {
    console.error("Error creating partner:", error);
    throw error;
  }
};