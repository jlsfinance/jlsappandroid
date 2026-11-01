import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItemProps {
  path: string;
  icon: string;
  label?: string;
  isFab?: boolean;
  badge?: number;
  isActive?: boolean;
  index: number;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 500,
  damping: 35,
  mass: 0.8,
};

const tapAnimation = {
  whileTap: { scale: 0.85 },
  transition: { type: "spring", stiffness: 400, damping: 15 },
};

const NavItem: React.FC<NavItemProps> = ({ path, icon, label, isFab = false, badge, isActive = false, index }) => {
  if (isFab) {
    return (
      <div className="w-full flex justify-center pb-6 relative">
        <Link to={path} className="btn-kadak flex items-center justify-center w-16 h-16 rounded-2xl shadow-xl active:scale-90 transition-all ripple">
          <motion.div
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
            whileTap={{ scale: 0.85 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <span className="material-symbols-outlined text-[24px] text-white material-symbols-fill">{icon}</span>
          </motion.div>
        </Link>
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 right-1/2 translate-x-12 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
    );
  }

  return (
    <Link to={path} className="flex flex-col items-center gap-1 w-full pb-2 group relative">
      {/* Animated active indicator */}
      {isActive && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute -top-0.5 w-10 h-1 rounded-full"
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
          }}
          initial={{ opacity: 0, scaleX: 0.5 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0.5 }}
          transition={springConfig}
        />
      )}

      {/* Icon container with gradient active state */}
      <motion.div
        className={`relative flex items-center justify-center w-16 h-8 rounded-full transition-colors duration-200 ${
          isActive
            ? 'shadow-md'
            : 'text-on-surface-variant-light dark:text-on-surface-variant-dark group-hover:bg-surface-variant-light/50'
        }`}
        style={isActive ? {
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(168,85,247,0.08) 100%)',
        } : {}}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <span
          className={`material-symbols-outlined text-2xl transition-all duration-200 ${
            isActive
              ? 'material-symbols-fill'
              : ''
          }`}
          style={isActive ? {
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          } : {}}
        >
          {icon}
        </span>

        {/* Badge count */}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-[3px] shadow-lg border border-white dark:border-surface-dark">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </motion.div>

      {/* Label */}
      <motion.span
        className={`text-[11px] font-semibold tracking-wide transition-colors ${
          isActive
            ? ''
            : 'text-on-surface-variant-light dark:text-on-surface-variant-dark'
        }`}
        style={isActive ? {
          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        } : {}}
      >
        {label}
      </motion.span>
    </Link>
  );
};

interface BottomNavProps {
  badgeMap?: Record<string, number>;
}

const BottomNav: React.FC<BottomNavProps> = ({ badgeMap = {} }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', icon: 'dashboard', label: 'Home' },
    { path: '/customers', icon: 'group', label: 'Clients' },
    { path: '/loans', icon: 'credit_score', label: 'Loans', isFab: true },
    { path: '/finance', icon: 'account_balance_wallet', label: 'Finance' },
    { path: '/tools', icon: 'grid_view', label: 'Tools' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-lg border-t border-outline-light/10 dark:border-outline-dark/10 pb-safe pt-3">
      <div className="flex justify-around items-end h-16 max-w-md mx-auto px-2 pb-2">
        {navItems.map((item, index) => (
          <NavItem
            key={item.path}
            {...item}
            index={index}
            isActive={isActive(item.path)}
            badge={badgeMap[item.path]}
          />
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
