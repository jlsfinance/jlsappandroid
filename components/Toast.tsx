import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// Toast notification system — replaces native alert() calls.
// Plain React + Tailwind (no new dependencies; app uses esm.sh import map).
// ─────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
    return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idRef = useRef(0);

    const remove = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(
        (message: string, type: ToastType = 'info') => {
            const id = ++idRef.current;
            setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
            setTimeout(() => remove(id), 3200);
        },
        [remove]
    );

    const value: ToastContextValue = {
        toast,
        success: (m: string) => toast(m, 'success'),
        error: (m: string) => toast(m, 'error'),
        info: (m: string) => toast(m, 'info'),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed bottom-24 max-w-sm mx-auto z-[9999] flex flex-col items-center gap-2 pointer-events-none w-full">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        role="status"
                        className={[
                            'pointer-events-auto w-full flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg backdrop-blur-sm',
                            'text-sm font-medium animate-[toast-in_0.25s_ease-out]',
                            t.type === 'success' &&
                                'bg-emerald-600/95 text-white',
                            t.type === 'error' &&
                                'bg-rose-600/95 text-white',
                            t.type === 'info' &&
                                'bg-slate-800/95 dark:bg-slate-700/95 text-white',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <span className="material-symbols-outlined text-xl shrink-0">
                            {t.type === 'success'
                                ? 'check_circle'
                                : t.type === 'error'
                                    ? 'error'
                                    : 'info'}
                        </span>
                        <span className="flex-1 break-words">{t.message}</span>
                        <button
                            onClick={() => remove(t.id)}
                            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                            aria-label="Dismiss"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes toast-in {
                    from { opacity: 0; transform: translateY(12px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </ToastContext.Provider>
    );
};
