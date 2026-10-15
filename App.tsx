import React, { useCallback, useEffect, useState, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import BottomNav from './components/BottomNav';
import { SidebarProvider } from './context/SidebarContext';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';
import { Capacitor } from '@capacitor/core';
import AnimatedSplash from './components/AnimatedSplash';
import IntroNotice from './components/IntroNotice';
import BackButtonHandler from './components/BackButtonHandler';
import PermissionRequestor from './components/PermissionRequestor';
import NotificationListener from './components/NotificationListener';

// Lazy-loaded route pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerProfile = lazy(() => import('./pages/CustomerProfile'));
const NewCustomer = lazy(() => import('./pages/NewCustomer'));
const EditCustomer = lazy(() => import('./pages/EditCustomer'));
const Loans = lazy(() => import('./pages/Loans'));
const LoanDetails = lazy(() => import('./pages/LoanDetails'));
const NewLoan = lazy(() => import('./pages/NewLoan'));
const EditLoan = lazy(() => import('./pages/EditLoan'));
const Tools = lazy(() => import('./pages/Tools'));
const EMICalculator = lazy(() => import('./pages/EMICalculator'));
const Settings = lazy(() => import('./pages/Settings'));
const FinanceOverview = lazy(() => import('./pages/FinanceOverview'));
const Receipts = lazy(() => import('./pages/Receipts'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Disbursal = lazy(() => import('./pages/Disbursal'));
const DueList = lazy(() => import('./pages/DueList'));
const Partners = lazy(() => import('./pages/Partners'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const LegalNotice = lazy(() => import('./pages/LegalNotice'));
const NotificationCenter = lazy(() => import('./pages/NotificationCenter'));
const Reports = lazy(() => import('./pages/Reports'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const CompanySelector = lazy(() => import('./pages/CompanySelector'));
const CustomerLogin = lazy(() => import('./pages/CustomerLogin'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));

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
    const customerId = localStorage.getItem('customerPortalId');
    if (customerId) {
      return <Navigate to="/customer-portal" replace />;
    }
    return <Navigate to="/customer-login" replace />;
  }

  if (localStorage.getItem('customerPortalId')) {
    return <Navigate to="/customer-portal" replace />;
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
  const [showSplash, setShowSplash] = useState(Capacitor.getPlatform() !== 'web');
  const [showNotice, setShowNotice] = useState(false);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
    const hasSeenNotice = localStorage.getItem('hasSeenIntroNotice');
    if (!hasSeenNotice && Capacitor.getPlatform() !== 'web') {
      setShowNotice(true);
    }
  }, []);

  const handleAcceptNotice = useCallback(() => {
    localStorage.setItem('hasSeenIntroNotice', 'true');
    setShowNotice(false);
  }, []);

  if (showSplash && Capacitor.getPlatform() !== 'web') {
    return <AnimatedSplash onFinish={handleSplashFinish} />;
  }

  if (showNotice) {
    return <IntroNotice onAccept={handleAcceptNotice} />;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
          <BackButtonHandler />
          <PermissionRequestor />
          <NotificationListener />
          <CompanyProvider>
            <SidebarProvider>
          <div className="flex h-screen bg-background-light dark:bg-background-dark">
            <Sidebar />
            <div className="flex-1 flex flex-col h-full overflow-y-auto relative">
              <Suspense fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                </div>
              }>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/customer-login" element={<CustomerLogin />} />
                  <Route path="/customer-portal" element={<CustomerPortal />} />

                  <Route path="/company-selector" element={
                    <ProtectedRoute><CompanySelector /></ProtectedRoute>
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
                      <CompanyRequiredRoute><NewCustomer /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/customers/edit/:id" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><EditCustomer /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/customers/:id" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><CustomerProfile /></CompanyRequiredRoute>
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
                      <CompanyRequiredRoute><NewLoan /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/loans/:id" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><LoanDetails /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/loans/edit/:id" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><EditLoan /></CompanyRequiredRoute>
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
                      <CompanyRequiredRoute><Partners /></CompanyRequiredRoute>
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
                      <CompanyRequiredRoute><LegalNotice /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/notifications" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><NotificationCenter /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/reports" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><Reports /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/receipts" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><Receipts /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/approvals" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><Approvals /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/disbursal" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><Disbursal /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/due-list" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><DueList /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/tools/emi" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><EMICalculator /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/settings" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><Settings /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/user-management" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><UserManagement /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/downloads" element={
                    <ProtectedRoute>
                      <CompanyRequiredRoute><Downloads /></CompanyRequiredRoute>
                    </ProtectedRoute>
                  } />

                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </SidebarProvider>
      </CompanyProvider>
    </Router>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
