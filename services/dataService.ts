import { collection, getDocs, addDoc, doc, getDoc, query, where, orderBy, deleteDoc, updateDoc, runTransaction, getDocsFromCache, getDocsFromServer, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Customer, Loan, Deposit } from '../types';

// Cached-first query: serves instantly from local cache, falls back to network
export const getDocsSmart = async (q: any) => {
  try {
    return await getDocsFromCache(q);
  } catch {
    return await getDocsFromServer(q);
  }
};

// Cached-first single doc read
export const getDocSmart = async (ref: any) => {
  try {
    return await getDocFromCache(ref);
  } catch {
    return await getDocFromServer(ref);
  }
};

export const fetchCustomers = async (companyId?: string): Promise<Customer[]> => {
  try {
    let q;
    if (companyId) {
      q = query(collection(db, "customers"), where("companyId", "==", companyId));
    } else {
      q = collection(db, "customers");
    }
    const querySnapshot = await getDocsSmart(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
  } catch (error) {
    console.error("Error fetching customers from Firebase:", error);
    return [];
  }
};

export const fetchCustomerById = async (id: string): Promise<Customer | null> => {
  try {
    const docRef = doc(db, "customers", id);
    const docSnap = await getDocSmart(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Customer;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching customer details:", error);
    return null;
  }
};

export const fetchLoansByCustomerId = async (customerId: string): Promise<Loan[]> => {
  try {
    const loansQuery = query(
      collection(db, "loans"), 
      where("customerId", "==", customerId)
    );
    const querySnapshot = await getDocsSmart(loansQuery);
    const loans = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
    loans.sort((a: any, b: any) => {
      const dateA = a.date?.toDate?.() || new Date(a.date) || new Date(0);
      const dateB = b.date?.toDate?.() || new Date(b.date) || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
    return loans;
  } catch (error) {
    console.error("Error fetching loans:", error);
    return [];
  }
};

export const fetchLoans = async (companyId?: string): Promise<Loan[]> => {
  try {
    let q;
    if (companyId) {
      q = query(collection(db, "loans"), where("companyId", "==", companyId));
    } else {
      q = collection(db, "loans");
    }
    const querySnapshot = await getDocsSmart(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
  } catch (error) {
    console.error("Error fetching loans from Firebase:", error);
    return [];
  }
};

export const createCustomer = async (customer: Omit<Customer, 'id'> & { companyId: string }) => {
  try {
    const docRef = await addDoc(collection(db, "customers"), customer);
    return docRef.id;
  } catch (error) {
    console.error("Error adding customer:", error);
    throw error;
  }
};

export const deleteCustomer = async (customerId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "customers", customerId));
  } catch (error) {
    console.error("Error deleting customer:", error);
    throw error;
  }
};

// --- Deposits (RD / FD) ---

export const fetchDeposits = async (companyId?: string): Promise<Deposit[]> => {
  try {
    let q;
    if (companyId) {
      q = query(collection(db, "deposits"), where("companyId", "==", companyId));
    } else {
      q = collection(db, "deposits");
    }
    const querySnapshot = await getDocsSmart(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deposit));
  } catch (error) {
    console.error("Error fetching deposits:", error);
    return [];
  }
};

export const fetchDepositsByCustomerId = async (customerId: string): Promise<Deposit[]> => {
  try {
    const q = query(collection(db, "deposits"), where("customerId", "==", customerId));
    const querySnapshot = await getDocsSmart(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deposit));
  } catch (error) {
    console.error("Error fetching deposits:", error);
    return [];
  }
};

export const fetchDepositById = async (id: string): Promise<Deposit | null> => {
  try {
    const docSnap = await getDoc(doc(db, "deposits", id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Deposit;
    }
    return null;
  } catch (error) {
    console.error("Error fetching deposit:", error);
    return null;
  }
};

export const createDeposit = async (deposit: Omit<Deposit, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, "deposits"), deposit);
    return docRef.id;
  } catch (error) {
    console.error("Error adding deposit:", error);
    throw error;
  }
};

export const updateDeposit = async (id: string, data: Partial<Deposit>) => {
  try {
    await updateDoc(doc(db, "deposits", id), data);
  } catch (error) {
    console.error("Error updating deposit:", error);
    throw error;
  }
};