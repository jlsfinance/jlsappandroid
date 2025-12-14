import { collection, getDocs, addDoc, doc, getDoc, query, where, orderBy, Firestore } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Customer, Loan } from '../types';

export const fetchCustomers = async (): Promise<Customer[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "customers"));
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
      where("customerId", "==", customerId),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(loansQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
  } catch (error) {
    console.error("Error fetching loans:", error);
    return [];
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