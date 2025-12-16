import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../contexts/CompanyContext';

const CompanySelection: React.FC = () => {
  const navigate = useNavigate();
  const { companies, switchCompany, loading } = useCompany();

  const handleSelectCompany = async (companyId: string) => {
    await switchCompany(companyId);
    navigate('/');
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-light dark:bg-background-dark p-6 text-slate-900 dark:text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Select Company</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Choose a company to continue
          </p>
        </div>

        <div className="space-y-3">
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => handleSelectCompany(company.id)}
              className="w-full flex items-center gap-4 p-4 bg-white dark:bg-surface-dark rounded-2xl shadow-sm hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-xl">
                  {company.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-slate-900 dark:text-white text-lg">
                  {company.name}
                </p>
                {company.city && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {company.city}{company.state ? `, ${company.state}` : ''}
                  </p>
                )}
              </div>
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/company/new')}
          className="w-full mt-6 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="font-bold text-primary">Add New Company</span>
        </button>
      </div>
    </div>
  );
};

export default CompanySelection;