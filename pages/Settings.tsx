import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto shadow-2xl bg-background-light dark:bg-background-dark text-slate-900 dark:text-white pb-10">
      <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="flex items-center gap-2 text-primary cursor-pointer">
          <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
          <span className="text-base font-medium">Back</span>
        </Link>
        <h1 className="text-lg font-bold flex-1 text-center pr-12">Settings</h1>
      </div>

      <div className="px-4 mt-6 mb-2">
        <div className="bg-white dark:bg-[#1a2235] rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="bg-center bg-no-repeat bg-cover rounded-full h-16 w-16 shrink-0 border-2 border-primary/20" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBV3ZDZSiIJvfK2XP467t1tmbwCMH552-tyTgxP4pDwTi8RnraLiQhA76fOY76WrEJhYE86Rdbiuj-nAMG-tCUDwxgbcDRyEHSPgEbN8qm7SEM5uj7BNfFbXzeb8-BlGD5043tbr8mjmJWVmqQeXQ5P80E7O9y9E06JN65Q3ndDsGbuylsF1sldx9HE46ZQZK9N7nN5iSJWz3w4CwOOCNihuQAL3lBc7Ee2RyjctdCUY1-WHubRyZY931nJ4o9JPw5T5eC1Qwuo_20")'}}></div>
          <div className="flex flex-col justify-center flex-1 min-w-0">
            <p className="text-lg font-bold leading-tight truncate">{auth.currentUser?.email || 'User'}</p>
            <p className="text-slate-500 dark:text-gray-400 text-sm font-medium leading-normal truncate">Loan Officer</p>
            <p className="text-slate-400 dark:text-gray-500 text-xs font-normal mt-0.5">ID: {auth.currentUser?.uid.slice(0, 6).toUpperCase()}</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-slate-500 dark:text-gray-400 text-sm font-bold uppercase tracking-wider px-6 pb-2 pt-2">Company</h3>
        <div className="mx-4 bg-white dark:bg-[#1a2235] rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          <Link to="/company-selector" className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">business</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium leading-normal truncate">{currentCompany?.name || 'Select Company'}</p>
              <p className="text-xs text-slate-400">Tap to switch or add company</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-slate-500 dark:text-gray-400 text-sm font-bold uppercase tracking-wider px-6 pb-2 pt-2">Account</h3>
        <div className="mx-4 bg-white dark:bg-[#1a2235] rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          <div className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">mail</span>
            </div>
            <p className="text-base font-medium leading-normal flex-1 truncate">Email Address</p>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </div>
          
          <Link to="/user-management" className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
            </div>
            <div className="flex-1">
                <p className="text-base font-medium leading-normal">User Management</p>
                <p className="text-xs text-slate-400">Roles & Permissions</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 mx-4 mb-4">
        <button onClick={handleLogout} className="w-full bg-white dark:bg-[#1a2235] hover:bg-red-50 dark:hover:bg-red-900/10 text-red-500 font-bold py-3.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-lg">logout</span>
          Log Out
        </button>
      </div>

      <div className="mt-4 mb-4 text-center">
        <p className="text-xs text-slate-400 uppercase tracking-widest">JLS FINANCE SUITE v1.0</p>
        <p className="text-[10px] text-slate-300 mt-1 font-bold">App Created by LUVI</p>
      </div>
    </div>
  );
};

export default Settings;