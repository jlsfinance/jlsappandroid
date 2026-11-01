import React from 'react';

// ─────────────────────────────────────────────────────────────
// Skeleton loading components — replace bare spinners with
// content-shaped placeholders. Plain React + Tailwind.
// ─────────────────────────────────────────────────────────────

const shimmer =
    'relative overflow-hidden bg-slate-200 dark:bg-slate-700/60 rounded-md';

/** Base shimmering block. */
export const SkeletonBox: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`${shimmer} ${className}`}>
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
    </div>
);

/** Single card-shaped skeleton (avatar + two text lines + right block). */
export const SkeletonCard: React.FC = () => (
    <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-slate-100 dark:border-slate-700/50">
        <SkeletonBox className="h-12 w-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
            <SkeletonBox className="h-4 w-2/5" />
            <SkeletonBox className="h-3 w-1/4" />
        </div>
        <SkeletonBox className="h-8 w-16 rounded-lg shrink-0" />
    </div>
);

/** A stack of skeleton cards — drop-in replacement for a loading list. */
export const SkeletonList: React.FC<{ count?: number }> = ({ count = 6 }) => (
    <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} />
        ))}
    </div>
);

/** Grid of metric-tile skeletons. */
export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 4 }) => (
    <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: count }).map((_, i) => (
            <div
                key={i}
                className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 shadow-sm border border-slate-100 dark:border-slate-700/50"
            >
                <SkeletonBox className="h-9 w-9 rounded-xl" />
                <SkeletonBox className="h-5 w-3/4" />
                <SkeletonBox className="h-3 w-1/2" />
            </div>
        ))}
    </div>
);

/** Wide hero card skeleton. */
export const SkeletonHero: React.FC = () => (
    <div className="rounded-3xl p-4 bg-slate-200 dark:bg-slate-700/60 space-y-3">
        <SkeletonBox className="h-3 w-1/3 bg-slate-300/70 dark:bg-slate-600/70" />
        <SkeletonBox className="h-9 w-1/2 bg-slate-300/70 dark:bg-slate-600/70" />
        <SkeletonBox className="h-4 w-1/4 bg-slate-300/70 dark:bg-slate-600/70" />
    </div>
);

/** Chart-area skeleton. */
export const SkeletonChart: React.FC = () => (
    <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 space-y-4">
        <SkeletonBox className="h-4 w-1/3" />
        <div className="flex items-end gap-2 h-32">
            {[60, 80, 45, 95, 70, 55].map((h, i) => (
                <SkeletonBox key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
            ))}
        </div>
    </div>
);

/** Shared shimmer keyframes — include once per screen (idempotent). */
export const SkeletonStyles: React.FC = () => (
    <style>{`
        @keyframes shimmer {
            100% { transform: translateX(100%); }
        }
    `}</style>
);
