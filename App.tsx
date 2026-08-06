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
import Deposits from './pages/Deposits';
import DepositDetails from './pages/DepositDetails';
import NewDeposit from './pages/NewDeposit';
import EditDeposit from './pages/EditDeposit';
import Tools from './pages/Tools';
import EMICalculator from './pages/EMICalculator';
import Settings from './pages/Settings';
import FinanceOverview from './pages/FinanceOverview';
import Receipts from './pages/Receipts';
import Approvals from './pages/Approvals';
import Disbursal from './pages/Disbursal';
import DueList from './pages/DueList';
import DepositDueList from './pages/DepositDueList';
import Partners from './pages/Partners';
import UserManagement from './pages/UserManagement';
import LegalNotice from './pages/LegalNotice';
import NotificationCenter from './pages/NotificationCenter';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import CompanySelector from './pages/CompanySelector';
import BottomNav from './components/BottomNav';
import { SidebarProvider } from './context/SidebarContext';
import Sidebar from './components/Sidebar';
import Downloads from './pages/Downloads';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import { SubscriptionProvider } from './context/SubscriptionContext';
import PricingPage from './pages/PricingPage';
import SubscriptionDetails from './pages/SubscriptionDetails';

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

import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import AnimatedSplash from './components/AnimatedSplash';
import IntroNotice from './components/IntroNotice';
import BackButtonHandler from './components/BackButtonHandler';
import ErrorBoundary from './components/ErrorBoundary';
import SubscriptionRequiredRoute from './components/SubscriptionRequiredRoute';
import { WhatsappService } from './services/whatsappService';
import PermissionRequestor from './components/PermissionRequestor';
import NotificationListener from './components/NotificationListener';

// ponytail: keep WhatsApp sender scoped to the active company (only JLS may send)
const WhatsappCompanySync: React.FC = () => {
  const { currentCompany } = useCompany();
  useEffect(() => { WhatsappService.setActiveCompany(currentCompany?.id); }, [currentCompany]);
  return null;
};

// ponytail: restore returning customers from cold start — only from root, never hijack admins/deep links
const CustomerSessionRedirect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/') return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      user.getIdTokenResult().then((tokenResult) => {
        if (tokenResult.claims.role === 'customer') {
          navigate('/login', { replace: true });
        }
      });
      unsubscribe();
    });
    return () => unsubscribe();
  }, [navigate, location.pathname]);

  return null;
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(Capacitor.getPlatform() !== 'web');
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
      GoogleAuth.initialize({
        clientId: '550122742532-cifihtlsbmr31ra1tcgbctr6dq1156o0.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      }).catch(err => console.error('GoogleAuth init error:', err));
    }).catch(err => console.error('GoogleAuth import error:', err));
  }, []);

  // Handle Splash Finish
  const handleSplashFinish = () => {
    setShowSplash(false);
    const hasSeenNotice = localStorage.getItem('hasSeenIntroNotice');
    if (!hasSeenNotice && Capacitor.getPlatform() !== 'web') {
      setShowNotice(true);
    }
  };

  const handleAcceptNotice = () => {
    localStorage.setItem('hasSeenIntroNotice', 'true');
    setShowNotice(false);
  };

  if (showSplash && Capacitor.getPlatform() !== 'web') {
    return <AnimatedSplash onFinish={handleSplashFinish} />;
  }

  if (showNotice) {
    return <IntroNotice onAccept={handleAcceptNotice} />;
  }

  return (
    <Router>
      <BackButtonHandler />
      <CustomerSessionRedirect />
      <PermissionRequestor />
      <NotificationListener />
      <SubscriptionProvider>
        <CompanyProvider>
          <WhatsappCompanySync />
          <SidebarProvider>
          <div className="flex h-screen bg-background-light dark:bg-background-dark">
            <Sidebar />
            <div className="flex-1 flex flex-col h-full overflow-y-auto relative pt-safe pb-nav">
              <ErrorBoundary>
                <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />

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

                <Route path="/deposits" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <SubscriptionRequiredRoute feature="deposit">
                        <Deposits />
                        <BottomNav />
                      </SubscriptionRequiredRoute>
                    </CompanyRequiredRoute>
                  </ProtectedRoute>
                } />

                <Route path="/deposits/new" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <SubscriptionRequiredRoute feature="deposit">
                        <NewDeposit />
                      </SubscriptionRequiredRoute>
                    </CompanyRequiredRoute>
                  </ProtectedRoute>
                } />

                <Route path="/deposits/:id" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <SubscriptionRequiredRoute feature="deposit">
                        <DepositDetails />
                      </SubscriptionRequiredRoute>
                    </CompanyRequiredRoute>
                  </ProtectedRoute>
                } />

                <Route path="/deposits/edit/:id" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <SubscriptionRequiredRoute feature="deposit">
                        <EditDeposit />
                      </SubscriptionRequiredRoute>
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

                <Route path="/notifications" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <NotificationCenter />
                    </CompanyRequiredRoute>
                  </ProtectedRoute>
                } />

                <Route path="/reports" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <SubscriptionRequiredRoute feature="advancedReports">
                        <Reports />
                      </SubscriptionRequiredRoute>
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

                <Route path="/deposit-due-list" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <SubscriptionRequiredRoute feature="deposit">
                        <DepositDueList />
                      </SubscriptionRequiredRoute>
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
                      <SubscriptionRequiredRoute feature="multiStaff">
                        <UserManagement />
                      </SubscriptionRequiredRoute>
                    </CompanyRequiredRoute>
                  </ProtectedRoute>
                } />

                <Route path="/downloads" element={
                  <ProtectedRoute>
                    <CompanyRequiredRoute>
                      <Downloads />
                    </CompanyRequiredRoute>
                  </ProtectedRoute>
                } />

                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/subscription" element={
                  <ProtectedRoute>
                    <SubscriptionDetails />
                  </ProtectedRoute>
                } />
              </Routes>
              </ErrorBoundary>
            </div>
          </div>
        </SidebarProvider>
      </CompanyProvider>
    </SubscriptionProvider>
    </Router>
  );
};

export default App;