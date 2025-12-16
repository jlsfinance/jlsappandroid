import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../contexts/CompanyContext';

const CompanySelector: React.FC = () => {
  const { companies, activeCompany, switchCompany } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  if (companies.length === 0) {
    return null;
  }

  const handleCompanySwitch = async (companyId: string) => {
    await switchCompany(companyId);
    setIsOpen(false);
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-primary font-bold text-sm">
            {activeCompany?.name?.charAt(0)?.toUpperCase() || 'C'}
          </span>
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-xs text-slate-500 dark:text-slate-400">Company</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">
            {activeCompany?.name || 'Select Company'}
          </p>
        </div>
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-surface-dark rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Your Companies
              </p>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleCompanySwitch(company.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                    activeCompany?.id === company.id ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">
                      {company.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {company.name}
                    </p>
                    {company.city && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {company.city}
                      </p>
                    )}
                  </div>
                  {activeCompany?.id === company.id && (
                    <svg className="w-5 h-5 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/company/new');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-medium rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add New Company
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CompanySelector;