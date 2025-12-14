import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const BottomNav: React.FC = () => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    return location.pathname === path ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300';
  };

  const iconStyle = (path: string) => {
    return location.pathname === path ? 'material-symbols-filled' : 'material-symbols-outlined';
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#1e293b] border-t border-slate-200 dark:border-slate-800 pb-safe pt-2">
      <div className="flex justify-around items-end h-16 max-w-md mx-auto px-2 pb-2">
        <Link to="/" className={`flex flex-col items-center gap-1 w-full pb-2 ${isActive('/')}`}>
          <span className={`material-symbols-outlined text-2xl`}>dashboard</span>
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        
        <Link to="/customers" className={`flex flex-col items-center gap-1 w-full pb-2 ${isActive('/customers')}`}>
          <span className={`material-symbols-outlined text-2xl`}>group</span>
          <span className="text-[10px] font-medium">Clients</span>
        </Link>
        
        <div className="w-full flex justify-center pb-6">
          <Link to="/loans" className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white shadow-lg shadow-primary/40 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[28px]">qr_code_scanner</span>
          </Link>
        </div>
        
        <Link to="/finance" className={`flex flex-col items-center gap-1 w-full pb-2 ${isActive('/finance')}`}>
          <span className={`material-symbols-outlined text-2xl`}>account_balance_wallet</span>
          <span className="text-[10px] font-medium">Finance</span>
        </Link>
        
        <Link to="/tools" className={`flex flex-col items-center gap-1 w-full pb-2 ${isActive('/tools')}`}>
          <span className={`material-symbols-outlined text-2xl`}>grid_view</span>
          <span className="text-[10px] font-medium">Tools</span>
        </Link>
      </div>
    </nav>
  );
};

export default BottomNav;