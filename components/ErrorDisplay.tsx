import React from 'react';

interface ErrorDisplayProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center">
    <span className="material-symbols-outlined text-5xl text-red-400 mb-4">error_outline</span>
    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs">
      {message || 'Something went wrong while loading data.'}
    </p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all"
      >
        Retry
      </button>
    )}
  </div>
);

export default ErrorDisplay;
