import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, getDocs, query, where, addDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { Company } from '../types';
import { onAuthStateChanged } from 'firebase/auth';

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company | null;
  setCurrentCompany: (company: Company) => void;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
  addCompany: (name: string, address?: string, phone?: string, gstin?: string) => Promise<string>;
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

  const fetchCompanies = async () => {
    const user = auth.currentUser;
    if (!user) {
      setCompanies([]);
      setCurrentCompanyState(null);
      setLoading(false);
      return;
    }

    try {
      const companiesQuery = query(
        collection(db, "companies"),
        where("ownerEmail", "==", user.email)
      );
      const snapshot = await getDocs(companiesQuery);
      const companyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
      setCompanies(companyList);

      const savedCompanyId = localStorage.getItem(`selectedCompany_${user.uid}`);
      if (savedCompanyId) {
        const savedCompany = companyList.find(c => c.id === savedCompanyId);
        if (savedCompany) {
          setCurrentCompanyState(savedCompany);
        } else if (companyList.length > 0) {
          setCurrentCompanyState(companyList[0]);
          localStorage.setItem(`selectedCompany_${user.uid}`, companyList[0].id);
        }
      } else if (companyList.length > 0) {
        setCurrentCompanyState(companyList[0]);
        localStorage.setItem(`selectedCompany_${user.uid}`, companyList[0].id);
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

  const addCompany = async (name: string, address?: string, phone?: string, gstin?: string): Promise<string> => {
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
      gstin: gstin || ''
    };

    const docRef = await addDoc(collection(db, "companies"), newCompany);
    await fetchCompanies();
    return docRef.id;
  };

  const refreshCompanies = async () => {
    await fetchCompanies();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchCompanies();
      } else {
        setCompanies([]);
        setCurrentCompanyState(null);
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
      addCompany
    }}>
      {children}
    </CompanyContext.Provider>
  );
};