import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const BottomNav: React.FC = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ path, icon, label, isFab = false }: { path: string, icon: string, label?: string, isFab?: boolean }) => {
    const active = isActive(path);
    
    if (isFab) {
        return (
            <div className="w-full flex justify-center pb-6">
                <Link to={path} className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-container dark:bg-primary-dark text-on-primary-container dark:text-on-primary-dark shadow-m3-2 hover:shadow-m3-3 active:scale-95 transition-all ripple">
                    <span className="material-symbols-outlined text-[28px]">{icon}</span>
                </Link>
            </div>
        );
    }

    return (
        <Link to={path} className="flex flex-col items-center gap-1 w-full pb-2 group">
            <div className={`flex items-center justify-center w-16 h-8 rounded-full transition-colors duration-200 ${active ? 'bg-primary-container dark:bg-primary-container-dark text-on-primary-container dark:text-primary-dark' : 'text-on-surface-variant-light dark:text-on-surface-variant-dark group-hover:bg-surface-variant-light/50'}`}>
                <span className={`material-symbols-outlined text-2xl ${active ? 'material-symbols-filled' : ''}`}>{icon}</span>
            </div>
            <span className={`text-[12px] font-medium tracking-wide transition-colors ${active ? 'text-on-surface-light dark:text-on-surface-dark' : 'text-on-surface-variant-light dark:text-on-surface-variant-dark'}`}>
                {label}
            </span>
        </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border-t border-outline-light/10 dark:border-outline-dark/10 pb-safe pt-3">
      <div className="flex justify-around items-end h-16 max-w-md mx-auto px-2 pb-2">
        <NavItem path="/" icon="dashboard" label="Home" />
        <NavItem path="/customers" icon="group" label="Clients" />
        <NavItem path="/loans" icon="credit_score" isFab />
        <NavItem path="/finance" icon="account_balance_wallet" label="Finance" />
        <NavItem path="/tools" icon="grid_view" label="Tools" />
      </div>
    </nav>
  );
};

export default BottomNav;