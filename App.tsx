import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerProfile from './pages/CustomerProfile';
import NewCustomer from './pages/NewCustomer';
import EditCustomer from './pages/EditCustomer';
import Loans from './pages/Loans';
import LoanDetails from './pages/LoanDetails';
import NewLoan from './pages/NewLoan';
import EditLoan from './pages/EditLoan';
import Tools from './pages/Tools';
import EMICalculator from './pages/EMICalculator';
import Settings from './pages/Settings';
import FinanceOverview from './pages/FinanceOverview';
import Receipts from './pages/Receipts';
import Approvals from './pages/Approvals';
import Disbursal from './pages/Disbursal';
import DueList from './pages/DueList';
import Partners from './pages/Partners';
import UserManagement from './pages/UserManagement';
import LegalNotice from './pages/LegalNotice';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import CompanySelector from './pages/CompanySelector';
import CustomerLogin from './pages/CustomerLogin';
import CustomerPortal from './pages/CustomerPortal';
import BottomNav from './components/BottomNav';

const ProtectedRoute = ({ children, requireCompany = true }: { children?: React.ReactNode; requireCompany?: boolean }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const CompanyRequiredRoute = ({ children }: { children?: React.ReactNode }) => {
  const { currentCompany, loading, companies } = useCompany();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!currentCompany && companies.length === 0) {
    return <Navigate to="/company-selector" replace />;
  }

  if (!currentCompany && companies.length > 0) {
    return <Navigate to="/company-selector" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <CompanyProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/customer-login" element={<CustomerLogin />} />
          <Route path="/customer-portal" element={<CustomerPortal />} />
          
          <Route path="/company-selector" element={
            <ProtectedRoute>
              <CompanySelector />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={
            <ProtectedRoute>
              <CompanyRequiredRoute>
                <Dashboard />
                <BottomNav />
              </CompanyRequiredRoute>
            </ProtectedRoute>
          } />
        
        <Route path="/customers" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Customers />
              <BottomNav />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/customers/new" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <NewCustomer />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/customers/edit/:id" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <EditCustomer />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/customers/:id" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <CustomerProfile />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/loans" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Loans />
              <BottomNav />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/loans/new" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <NewLoan />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/loans/:id" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <LoanDetails />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/loans/edit/:id" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <EditLoan />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/finance" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <FinanceOverview />
              <BottomNav />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/partners" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Partners />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/tools" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Tools />
              <BottomNav />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/tools/legal-notice" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <LegalNotice />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Reports />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/receipts" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Receipts />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/approvals" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Approvals />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/disbursal" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Disbursal />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/due-list" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <DueList />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/tools/emi" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <EMICalculator />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        
        <Route path="/settings" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <Settings />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />

        <Route path="/user-management" element={
          <ProtectedRoute>
            <CompanyRequiredRoute>
              <UserManagement />
            </CompanyRequiredRoute>
          </ProtectedRoute>
        } />
        </Routes>
      </CompanyProvider>
    </Router>
  );
};

export default App;