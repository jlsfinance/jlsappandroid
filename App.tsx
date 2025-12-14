import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerProfile from './pages/CustomerProfile';
import NewCustomer from './pages/NewCustomer';
import EditCustomer from './pages/EditCustomer';
import Loans from './pages/Loans';
import LoanDetails from './pages/LoanDetails';
import NewLoan from './pages/NewLoan';
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
import Login from './pages/Login';
import BottomNav from './components/BottomNav';

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
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

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
            <BottomNav />
          </ProtectedRoute>
        } />
        
        <Route path="/customers" element={
          <ProtectedRoute>
            <Customers />
            <BottomNav />
          </ProtectedRoute>
        } />
        
        <Route path="/customers/new" element={
          <ProtectedRoute>
            <NewCustomer />
          </ProtectedRoute>
        } />

        <Route path="/customers/edit/:id" element={
          <ProtectedRoute>
            <EditCustomer />
          </ProtectedRoute>
        } />
        
        <Route path="/customers/:id" element={
          <ProtectedRoute>
            <CustomerProfile />
          </ProtectedRoute>
        } />
        
        <Route path="/loans" element={
          <ProtectedRoute>
            <Loans />
            <BottomNav />
          </ProtectedRoute>
        } />

        <Route path="/loans/new" element={
          <ProtectedRoute>
            <NewLoan />
          </ProtectedRoute>
        } />

        <Route path="/loans/:id" element={
          <ProtectedRoute>
            <LoanDetails />
          </ProtectedRoute>
        } />
        
        <Route path="/finance" element={
          <ProtectedRoute>
            <FinanceOverview />
            <BottomNav />
          </ProtectedRoute>
        } />
        
        <Route path="/partners" element={
          <ProtectedRoute>
            <Partners />
          </ProtectedRoute>
        } />
        
        <Route path="/tools" element={
          <ProtectedRoute>
            <Tools />
            <BottomNav />
          </ProtectedRoute>
        } />

        <Route path="/receipts" element={
          <ProtectedRoute>
            <Receipts />
          </ProtectedRoute>
        } />
        
        <Route path="/approvals" element={
          <ProtectedRoute>
            <Approvals />
          </ProtectedRoute>
        } />

        <Route path="/disbursal" element={
          <ProtectedRoute>
            <Disbursal />
          </ProtectedRoute>
        } />
        
        <Route path="/due-list" element={
          <ProtectedRoute>
            <DueList />
          </ProtectedRoute>
        } />
        
        <Route path="/tools/emi" element={
          <ProtectedRoute>
            <EMICalculator />
          </ProtectedRoute>
        } />
        
        <Route path="/settings" element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } />

        <Route path="/user-management" element={
          <ProtectedRoute>
            <UserManagement />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
};

export default App;