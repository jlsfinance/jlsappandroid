import { collection, getDocs, addDoc, doc, getDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Customer, Loan } from '../types';

export const fetchCustomers = async (companyId?: string): Promise<Customer[]> => {
  try {
    let q;
    if (companyId) {
      q = query(collection(db, "customers"), where("companyId", "==", companyId));
    } else {
      q = collection(db, "customers");
    }
    const querySnapshot = await getDocs(q);
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

export const fetchLoansByCustomerId = async (customerId: string): Promise<Loan[]> => {
  try {
    const loansQuery = query(
      collection(db, "loans"), 
      where("customerId", "==", customerId)
    );
    const querySnapshot = await getDocs(loansQuery);
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
    const querySnapshot = await getDocs(q);
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