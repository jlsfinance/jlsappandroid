import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { Company, CompanyUser, UserProfile } from '../types';

interface CompanyContextType {
  user: User | null;
  userProfile: UserProfile | null;
  companies: Company[];
  activeCompany: Company | null;
  loading: boolean;
  switchCompany: (companyId: string) => Promise<void>;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserCompanies = async (userId: string): Promise<Company[]> => {
    try {
      const companyUsersQuery = query(
        collection(db, 'companyUsers'),
        where('userId', '==', userId)
      );
      const companyUsersSnap = await getDocs(companyUsersQuery);
      
      const companyIds = companyUsersSnap.docs.map(doc => doc.data().companyId);
      
      if (companyIds.length === 0) return [];
      
      const companiesPromises = companyIds.map(async (companyId) => {
        const companyDoc = await getDoc(doc(db, 'companies', companyId));
        if (companyDoc.exists()) {
          return { id: companyDoc.id, ...companyDoc.data() } as Company;
        }
        return null;
      });
      
      const companiesData = await Promise.all(companiesPromises);
      return companiesData.filter((c): c is Company => c !== null);
    } catch (error) {
      console.error('Error fetching user companies:', error);
      return [];
    }
  };

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  const refreshCompanies = async () => {
    if (!user) return;
    const companiesList = await fetchUserCompanies(user.uid);
    setCompanies(companiesList);
  };

  const switchCompany = async (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (company && user) {
      setActiveCompany(company);
      localStorage.setItem('activeCompanyId', companyId);
      
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          activeCompanyId: companyId
        });
      } catch (error) {
        console.error('Error updating active company:', error);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const profile = await fetchUserProfile(currentUser.uid);
        setUserProfile(profile);
        
        const companiesList = await fetchUserCompanies(currentUser.uid);
        setCompanies(companiesList);
        
        const savedCompanyId = localStorage.getItem('activeCompanyId') || profile?.activeCompanyId;
        
        if (savedCompanyId) {
          const savedCompany = companiesList.find(c => c.id === savedCompanyId);
          if (savedCompany) {
            setActiveCompany(savedCompany);
          } else if (companiesList.length > 0) {
            setActiveCompany(companiesList[0]);
          }
        } else if (companiesList.length > 0) {
          setActiveCompany(companiesList[0]);
        }
      } else {
        setUserProfile(null);
        setCompanies([]);
        setActiveCompany(null);
        localStorage.removeItem('activeCompanyId');
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <CompanyContext.Provider
      value={{
        user,
        userProfile,
        companies,
        activeCompany,
        loading,
        switchCompany,
        refreshCompanies
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};