import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, getDocs, query, where, addDoc, doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { Company } from '../types';
import { onAuthStateChanged } from 'firebase/auth';

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company | null;
  setCurrentCompany: (company: Company) => void;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
  addCompany: (name: string, address?: string, phone?: string, gstin?: string, upiId?: string) => Promise<string>;
  deleteCompany: (companyId: string) => Promise<void>;
  updateCompany: (companyId: string, data: { name?: string; address?: string; phone?: string; gstin?: string; upiId?: string }) => Promise<void>;
  userRole: 'admin' | 'agent' | 'customer' | null;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'admin' | 'agent' | 'customer' | null>(null);

  const fetchCompanies = async () => {
    const user = auth.currentUser;
    if (!user) {
      setCompanies([]);
      setCurrentCompanyState(null);
      setUserRole(null);
      setLoading(false);
      return;
    }

    try {
      const ownedCompaniesQuery = query(
        collection(db, "companies"),
        where("ownerEmail", "==", user.email)
      );
      const ownedSnapshot = await getDocs(ownedCompaniesQuery);
      const ownedCompanies = ownedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));

      const usersQuery = query(
        collection(db, "users"),
        where("email", "==", user.email)
      );
      const usersSnapshot = await getDocs(usersQuery);

      let assignedCompanies: Company[] = [];
      let role: 'admin' | 'agent' | 'customer' | null = null;

      if (!usersSnapshot.empty) {
        const userData = usersSnapshot.docs[0].data();
        role = userData.role || 'customer';
        setUserRole(role);

        if (userData.companyId && (role === 'admin' || role === 'agent')) {
          const companyRef = doc(db, "companies", userData.companyId);
          const companySnap = await getDoc(companyRef);
          if (companySnap.exists()) {
            const assignedCompany = { id: companySnap.id, ...companySnap.data() } as Company;
            if (!ownedCompanies.find(c => c.id === assignedCompany.id)) {
              assignedCompanies.push(assignedCompany);
            }
          }
        }
      }

      const allCompanies = [...ownedCompanies, ...assignedCompanies];
      setCompanies(allCompanies);

      const savedCompanyId = localStorage.getItem(`selectedCompany_${user.uid}`);
      if (savedCompanyId) {
        const savedCompany = allCompanies.find(c => c.id === savedCompanyId);
        if (savedCompany) {
          setCurrentCompanyState(savedCompany);
        } else if (allCompanies.length > 0) {
          setCurrentCompanyState(allCompanies[0]);
          localStorage.setItem(`selectedCompany_${user.uid}`, allCompanies[0].id);
        }
      } else if (allCompanies.length > 0) {
        setCurrentCompanyState(allCompanies[0]);
        localStorage.setItem(`selectedCompany_${user.uid}`, allCompanies[0].id);
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setLoading(false);
    }
  };

  const setCurrentCompany = (company: Company) => {
    setCurrentCompanyState(company);
    const user = auth.currentUser;
    if (user) {
      localStorage.setItem(`selectedCompany_${user.uid}`, company.id);
    }
  };

  const addCompany = async (name: string, address?: string, phone?: string, gstin?: string, upiId?: string): Promise<string> => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error("User not authenticated");
    }

    const newCompany = {
      name,
      ownerEmail: user.email,
      createdAt: new Date().toISOString(),
      address: address || '',
      phone: phone || '',
      gstin: gstin || '',
      upiId: upiId || '9413821007@superyes'
    };

    const docRef = await addDoc(collection(db, "companies"), newCompany);
    await fetchCompanies();
    return docRef.id;
  };

  const refreshCompanies = async () => {
    await fetchCompanies();
  };

  const deleteCompany = async (companyId: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated");
    }

    await deleteDoc(doc(db, "companies", companyId));

    if (currentCompany?.id === companyId) {
      setCurrentCompanyState(null);
      localStorage.removeItem(`selectedCompany_${user.uid}`);
    }

    await fetchCompanies();
  };

  const updateCompany = async (companyId: string, data: { name?: string; address?: string; phone?: string; gstin?: string; upiId?: string }): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated");
    }

    await updateDoc(doc(db, "companies", companyId), data);
    await fetchCompanies();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchCompanies();
      } else {
        setCompanies([]);
        setCurrentCompanyState(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <CompanyContext.Provider value={{
      companies,
      currentCompany,
      setCurrentCompany,
      loading,
      refreshCompanies,
      addCompany,
      deleteCompany,
      updateCompany,
      userRole
    }}>
      {children}
    </CompanyContext.Provider>
  );
};