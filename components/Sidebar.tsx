import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { useCompany } from '../context/CompanyContext';
import AboutModal from './AboutModal';

interface MenuItem {
    title: string;
    icon: string;
    path?: string;
    submenu?: { title: string; path: string; icon?: string }[];
    action?: () => void;
}

const Sidebar: React.FC = () => {
    const { isOpen, closeSidebar } = useSidebar();
    const { currentCompany } = useCompany();
    const location = useLocation();
    const [expandedMenus, setExpandedMenus] = useState<string[]>(['Loans', 'Finance']); // Default expanded
    const [showAbout, setShowAbout] = useState(false);

    const toggleSubmenu = (title: string) => {
        setExpandedMenus(prev =>
            prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
        );
    };

    const menuItems: MenuItem[] = [
        { title: 'Dashboard', path: '/', icon: 'dashboard' },
        {
            title: 'Loans',
            icon: 'account_balance',
            submenu: [
                { title: 'All Loans', path: '/loans', icon: 'list_alt' },
                { title: 'New Loan', path: '/loans/new', icon: 'add_circle' },
                { title: 'EMI Calculator', path: '/tools/emi', icon: 'calculate' },
            ]
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
            ]
        },
        { title: 'Customers', path: '/customers', icon: 'group' },
        { title: 'Partners', path: '/partners', icon: 'handshake' },
        { title: 'Tools', path: '/tools', icon: 'construction' },
        { title: 'Settings', path: '/settings', icon: 'settings' },
    ];

    const handleLinkClick = () => {
        // Close sidebar on mobile when a link is clicked
        if (window.innerWidth < 1024) {
            closeSidebar();
        }
    };

    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden"
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={`fixed inset-y-0 left-0 z-[55] w-72 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 shadow-2xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:shadow-none ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="h-20 flex items-center px-6 border-b border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-sm">
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
                                J
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white leading-none text-lg">JLS Finance</span>
                                {currentCompany && <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">{currentCompany.name}</span>}
                            </div>
                        </div>
                        <button onClick={closeSidebar} className="ml-auto lg:hidden p-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-500 transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Menu Items */}
                    <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
                        {menuItems.map((item) => (
                            <div key={item.title}>
                                {item.submenu ? (
                                    <div className="mb-1.5">
                                        <button
                                            onClick={() => toggleSubmenu(item.title)}
                                            className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all duration-200 group border border-transparent ${expandedMenus.includes(item.title)
                                                ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-500/10 shadow-sm'
                                                : 'text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <span className={`material-symbols-outlined text-[22px] transition-colors ${expandedMenus.includes(item.title) ? 'fill-current' : 'text-slate-500 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400'}`}>{item.icon}</span>
                                                <span className="font-semibold text-sm">{item.title}</span>
                                            </div>
                                            <span className={`material-symbols-outlined text-lg transition-transform duration-300 ${expandedMenus.includes(item.title) ? 'rotate-180' : 'text-slate-400'}`}>expand_more</span>
                                        </button>

                                        {/* Submenu */}
                                        <div className={`overflow-hidden transition-all duration-300 ${expandedMenus.includes(item.title) ? 'max-h-96 opacity-100 mt-1.5' : 'max-h-0 opacity-0'}`}>
                                            <div className="ml-5 pl-5 border-l-2 border-slate-200 dark:border-slate-800 space-y-1.5">
                                                {item.submenu.map((sub) => (
                                                    <NavLink
                                                        key={sub.path}
                                                        to={sub.path}
                                                        onClick={handleLinkClick}
                                                        className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${isActive
                                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 font-medium active'
                                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                                                            }`}
                                                    >
                                                        {sub.icon && <span className="material-symbols-outlined text-[18px] opacity-70 group-[.active]:opacity-100">{sub.icon}</span>}
                                                        <span>{sub.title}</span>
                                                    </NavLink>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <NavLink
                                        to={item.path!}
                                        end={item.path === '/'}
                                        onClick={handleLinkClick}
                                        className={({ isActive }) => `flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-200 mb-1.5 group border block ${isActive
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30'
                                            : 'border-transparent text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        <span className={`material-symbols-outlined text-[22px] transition-colors ${!location.pathname.includes(item.path!) && 'text-slate-500 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400'}`}>{item.icon}</span>
                                        <span className="font-semibold text-sm">{item.title}</span>
                                    </NavLink>
                                )}
                            </div>
                        ))}

                        <div className="mb-1.5">
                            <NavLink
                                to="/notifications"
                                onClick={handleLinkClick}
                                className={({ isActive }) => `flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-200 group border block ${isActive
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30'
                                    : 'border-transparent text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                    }`}
                            >
                                <span className={`material-symbols-outlined text-[22px] transition-colors ${!location.pathname.includes('/notifications') && 'text-slate-500 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400'}`}>campaign</span>
                                <span className="font-semibold text-sm">Notification Center</span>
                            </NavLink>
                        </div>

                        {/* About Section */}
                        <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
                            <button
                                onClick={() => { setShowAbout(true); closeSidebar(); }}
                                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group"
                            >
                                <span className="material-symbols-outlined text-[22px] group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">info</span>
                                <span className="font-semibold text-sm">About JLS</span>
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-slate-200/50 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-900/30 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Created by <span className="text-indigo-600 dark:text-indigo-400 font-bold">Luvi</span></span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">© 2025 JLS Finance</span>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 dark:border-slate-700">
                                <span className="material-symbols-outlined text-sm">code</span>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
        </>
    );
};

export default Sidebar;
