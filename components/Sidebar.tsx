import React, { useState, useEffect } from 'react';
import { APP_NAME, APP_VERSION } from '../constants';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { auth } from '../firebaseConfig';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import AboutModal from './AboutModal';

interface MenuItem {
    title: string;
    icon: string;
    path?: string;
    submenu?: { title: string; path: string; icon?: string }[];
    action?: () => void;
}

/* ── Quick Actions ── */
const quickActions = [
    { label: 'New Loan', icon: 'add_circle', path: '/loans/new' },
    { label: 'New Customer', icon: 'person_add', path: '/customers/new' },
    { label: 'EMI Calc', icon: 'calculate', path: '/tools/emi' },
    { label: 'Reports', icon: 'bar_chart', path: '/reports' },
];

/* ── Avatar initials fallback ── */
const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

/* ── Sub-menu animation variants ── */
const submenuVariants = {
    collapsed: { height: 0, opacity: 0 },
    expanded: { height: 'auto', opacity: 1 },
};

const Sidebar: React.FC = () => {
    const { isOpen, closeSidebar } = useSidebar();
    const { currentCompany } = useCompany();
    const { isDark, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const [expandedMenus, setExpandedMenus] = useState<string[]>(['Loans', 'Finance']);
    const [showAbout, setShowAbout] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [pendingEmiCount, setPendingEmiCount] = useState(0);

    /* ── Listen to auth state ── */
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    /* ── Live pending EMI badge count ── */
    useEffect(() => {
        if (!currentCompany) {
            setPendingEmiCount(0);
            return;
        }
        let cancelled = false;
        const loadCount = async () => {
            try {
                const loansQuery = query(
                    collection(db, "loans"),
                    where("status", "in", ["Disbursed", "Active", "Overdue"]),
                    where("companyId", "==", currentCompany.id)
                );
                const snapshot = await getDocs(loansQuery);
                let count = 0;
                snapshot.docs.forEach((d) => {
                    const loan = d.data();
                    (loan.repaymentSchedule || []).forEach((emi: any) => {
                        if (emi.status === 'Pending' && new Date(emi.dueDate) < new Date()) count++;
                    });
                });
                if (!cancelled) setPendingEmiCount(count);
            } catch {
                if (!cancelled) setPendingEmiCount(0);
            }
        };
        loadCount();
        return () => { cancelled = true; };
    }, [currentCompany]);

    /* ── User data ── */
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
    const email = user?.email || '';
    const photoURL = user?.photoURL || '';
    const isAdmin = true; // placeholder: could check custom claims

    const handleLogout = async () => {
        if (window.confirm('Are you sure you want to logout?')) {
            try {
                await signOut(auth);
                localStorage.removeItem('customerPortalId');
                localStorage.removeItem('customerPortalCompanyId');
                closeSidebar();
                navigate('/login');
            } catch (error) {
                console.error('Logout error', error);
            }
        }
    };

    const toggleSubmenu = (title: string) => {
        setExpandedMenus((prev) =>
            prev.includes(title)
                ? prev.filter((t) => t !== title)
                : [...prev, title],
        );
    };

    const isActivePath = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const handleLinkClick = () => {
        if (window.innerWidth < 1024) closeSidebar();
    };

    /* ── Menu items ── */
    const menuItems: MenuItem[] = [
        { title: 'Dashboard', path: '/', icon: 'dashboard' },
        {
            title: 'Loans',
            icon: 'account_balance',
            submenu: [
                { title: 'All Loans', path: '/loans', icon: 'list_alt' },
                { title: 'New Loan', path: '/loans/new', icon: 'add_circle' },
                { title: 'EMI Calculator', path: '/tools/emi', icon: 'calculate' },
            ],
        },
        {
            title: 'Finance',
            icon: 'payments',
            submenu: [
                { title: 'Overview', path: '/finance', icon: 'finance' },
                { title: 'Receipts', path: '/receipts', icon: 'receipt_long' },
                { title: 'Approvals', path: '/approvals', icon: 'verified' },
                { title: 'Disbursal', path: '/disbursal', icon: 'monetization_on' },
                { title: 'Due List', path: '/due-list', icon: 'pending_actions' },
            ],
        },
        { title: 'Customers', path: '/customers', icon: 'group' },
        { title: 'Partners', path: '/partners', icon: 'handshake' },
        { title: 'Tools', path: '/tools', icon: 'construction' },
        { title: 'Downloads', path: '/downloads', icon: 'folder_open' },
        { title: 'Settings', path: '/settings', icon: 'settings' },
    ];

    return (
        <>
            {/* ── Mobile backdrop ── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
                        onClick={closeSidebar}
                    />
                )}
            </AnimatePresence>

            {/* ── Sidebar container ── */}
            <motion.aside
                initial={false}
                animate={{
                    x: isOpen ? 0 : -288,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed inset-y-0 left-0 z-[55] w-72 h-screen glass-sidebar flex flex-col lg:translate-x-0 lg:static lg:shadow-none"
                style={{
                    paddingTop: 'env(safe-area-inset-top)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                {/* ══════ USER PROFILE CARD ══════ */}
                <div className="relative px-5 pt-safe pb-4 overflow-hidden">
                    {/* Decorative gradient blob */}
                    <div className="absolute -top-10 -right-10 w-36 h-36 bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-gradient-to-tr from-indigo-500/15 to-violet-500/5 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative z-10">
                        {/* Avatar + info row */}
                        <div className="flex items-center gap-3.5 mb-3">
                            <div className="relative shrink-0">
                                {photoURL ? (
                                    <img
                                        src={photoURL}
                                        alt={displayName}
                                        className="w-11 h-11 rounded-2xl object-cover ring-2 ring-white/40 dark:ring-white/10 shadow-lg"
                                    />
                                ) : (
                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-500/20 ring-2 ring-white/30 dark:ring-white/10">
                                        {getInitials(displayName)}
                                    </div>
                                )}
                                {/* Online dot */}
                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-sm" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {displayName}
                                </p>
                                {email && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                        {email}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-[9px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                                        {isAdmin ? 'Admin' : 'Staff'}
                                    </span>
                                    {currentCompany && (
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium truncate">
                                            {currentCompany.name}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Theme toggle */}
                            <button
                                onClick={toggleTheme}
                                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                                className="p-1.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors shrink-0"
                            >
                                <span className="material-symbols-outlined text-lg">
                                    {isDark ? 'light_mode' : 'dark_mode'}
                                </span>
                            </button>

                            {/* Close btn (mobile) */}
                            <button
                                onClick={closeSidebar}
                                className="lg:hidden p-1.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 transition-colors shrink-0"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ══════ SCROLLABLE MENU ══════ */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 custom-scrollbar">
                    {menuItems.map((item) => {
                        const hasActiveChild =
                            item.submenu?.some((s) => location.pathname.startsWith(s.path)) ?? false;
                        const isExpanded = expandedMenus.includes(item.title);

                        return (
                            <div key={item.title}>
                                {item.submenu ? (
                                    /* ── Nested menu group ── */
                                    <div>
                                        <button
                                            onClick={() => toggleSubmenu(item.title)}
                                            className={`group w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 border ${
                                                isExpanded || hasActiveChild
                                                    ? 'bg-violet-50/80 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-500/15 shadow-sm'
                                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 hover:text-slate-900 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className={`material-symbols-outlined text-[20px] transition-colors ${
                                                        isExpanded || hasActiveChild
                                                            ? 'text-violet-600 dark:text-violet-400'
                                                            : 'text-slate-400 group-hover:text-violet-500 dark:text-slate-500 dark:group-hover:text-violet-400'
                                                    }`}
                                                >
                                                    {item.icon}
                                                </span>
                                                <span className="font-semibold text-[13px] tracking-tight">
                                                    {item.title}
                                                </span>
                                            </div>
                                            <motion.span
                                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                                className="material-symbols-outlined text-lg text-slate-400 shrink-0"
                                            >
                                                expand_more
                                            </motion.span>
                                        </button>

                                        {/* ── Submenu with framer-motion height animation ── */}
                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <motion.div
                                                    key={`sub-${item.title}`}
                                                    initial="collapsed"
                                                    animate="expanded"
                                                    exit="collapsed"
                                                    variants={submenuVariants}
                                                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="ml-4 pl-4 border-l-2 border-violet-200/60 dark:border-violet-500/20 space-y-0.5 mt-1 mb-1">
                                                        {item.submenu.map((sub, idx) => (
                                                            <motion.div
                                                                key={sub.path}
                                                                initial={{ opacity: 0, x: -8 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.04, duration: 0.2 }}
                                                            >
                                                                <NavLink
                                                                    to={sub.path}
                                                                    onClick={handleLinkClick}
                                                                    className={({ isActive }) =>
                                                                        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-all duration-200 group ${
                                                                            isActive
                                                                                ? 'bg-violet-600 text-white shadow-md shadow-violet-500/25 font-semibold'
                                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-violet-50/60 dark:hover:bg-violet-950/20'
                                                                        }`
                                                                    }
                                                                >
                                                                    {sub.icon && (
                                                                        <span className="material-symbols-outlined text-[16px] opacity-60 group-[:not(.active)]:opacity-60">
                                                                            {sub.icon}
                                                                        </span>
                                                                    )}
                                                                    <span>{sub.title}</span>
                                                                </NavLink>
                                                            </motion.div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ) : (
                                    /* ── Single menu item ── */
                                    <NavLink
                                        to={item.path!}
                                        end={item.path === '/'}
                                        onClick={handleLinkClick}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 border group ${
                                                isActive
                                                    ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/25 font-semibold'
                                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 hover:text-slate-900 dark:hover:text-slate-200'
                                            }`
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                <span
                                                    className={`material-symbols-outlined text-[20px] transition-colors ${
                                                        isActive
                                                            ? 'text-white'
                                                            : 'text-slate-400 group-hover:text-violet-500 dark:text-slate-500 dark:group-hover:text-violet-400'
                                                    }`}
                                                >
                                                    {item.icon}
                                                </span>
                                                <span className="font-semibold text-[13px] tracking-tight">
                                                    {item.title}
                                                </span>
                                                {isActive && (
                                                    <motion.span
                                                        layoutId="activePill"
                                                        className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80"
                                                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                )}
                            </div>
                        );
                    })}

                    {/* ── Notification Center (standalone) ── */}
                    <div className="pt-1">
                        <NavLink
                            to="/notifications"
                            onClick={handleLinkClick}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 border group ${
                                    isActive
                                        ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/25 font-semibold'
                                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 hover:text-slate-900 dark:hover:text-slate-200'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <span
                                        className={`material-symbols-outlined text-[20px] transition-colors ${
                                            isActive
                                                ? 'text-white'
                                                : 'text-slate-400 group-hover:text-violet-500 dark:text-slate-500 dark:group-hover:text-violet-400'
                                        }`}
                                    >
                                        campaign
                                    </span>
                                    <span className="font-semibold text-[13px] tracking-tight">Notification Center</span>
                                    {pendingEmiCount > 0 && (
                                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-rose-500/90 text-white text-[9px] font-bold leading-none">
                                            {pendingEmiCount > 99 ? '99+' : pendingEmiCount}
                                        </span>
                                    )}
                                </>
                            )}
                        </NavLink>
                    </div>
                </div>

                {/* ══════ QUICK ACTIONS BAR ══════ */}
                <div className="px-3 py-3 border-t border-slate-200/50 dark:border-slate-700/30">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2.5 px-1">
                        Quick Actions
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                        {quickActions.map((action) => (
                            <button
                                key={action.path}
                                onClick={() => {
                                    navigate(action.path);
                                    handleLinkClick();
                                }}
                                className="group flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 hover:bg-violet-50/70 dark:hover:bg-violet-900/15 active:scale-95"
                            >
                                <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center transition-all duration-200 group-hover:bg-violet-600 dark:group-hover:bg-violet-600 group-hover:shadow-md group-hover:shadow-violet-500/20">
                                    <span className="material-symbols-outlined text-[18px] text-violet-600 dark:text-violet-400 group-hover:text-white transition-colors">
                                        {action.icon}
                                    </span>
                                </div>
                                <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors text-center leading-tight">
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ══════ FOOTER ══════ */}
                <div className="px-4 py-3 border-t border-slate-200/50 dark:border-slate-700/30 bg-slate-50/40 dark:bg-slate-900/40 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => {
                                        setShowAbout(true);
                                        closeSidebar();
                                    }}
                                    className="text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                                >
                                    About
                                </button>
                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                <button
                                    onClick={handleLogout}
                                    className="text-[10px] font-medium text-rose-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                >
                                    Logout
                                </button>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                                    &copy; 2025 {APP_NAME}
                                </span>
                                <span className="px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-[8px] font-black tracking-widest text-violet-600 dark:text-violet-400">
                                    {APP_VERSION}
                                </span>
                            </div>
                        </div>
                        <div className="h-7 w-7 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 dark:border-slate-700">
                            <span className="material-symbols-outlined text-xs">code</span>
                        </div>
                    </div>
                </div>
            </motion.aside>

            <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
        </>
    );
};

export default Sidebar;
