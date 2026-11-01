import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// Theme context — dark/light toggle with localStorage persistence.
// Toggles the `dark` class on <html> (tailwind darkMode: "class").
// ─────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';

interface ThemeContextValue {
    theme: Theme;
    isDark: boolean;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
}

const STORAGE_KEY = 'jls-theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
    return ctx;
};

const getInitialTheme = (): Theme => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* localStorage unavailable */ }
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') root.classList.add('dark');
        else root.classList.remove('dark');
        try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    }, [theme]);

    const setTheme = useCallback((t: Theme) => setThemeState(t), []);
    const toggleTheme = useCallback(
        () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
        []
    );

    const value: ThemeContextValue = { theme, isDark: theme === 'dark', toggleTheme, setTheme };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
