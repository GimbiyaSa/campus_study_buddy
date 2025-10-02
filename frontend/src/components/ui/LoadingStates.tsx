/**
 * Unified Loading States and UX Components
 * Consistent loading patterns across all features
 */

import { Loader2, AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import type { AppError } from '../../utils/errorHandler';

export interface LoadingState {
  isLoading: boolean;
  error: AppError | null;
  lastUpdated: Date | null;
  retryCount: number;
}

export const createInitialLoadingState = (): LoadingState => ({
  isLoading: false,
  error: null,
  lastUpdated: null,
  retryCount: 0,
});

// Unified Loading Component
interface LoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  context: 'courses' | 'progress' | 'partners' | 'dashboard';
}

export function LoadingIndicator({ size = 'md', message, context }: LoadingIndicatorProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const contextMessages = {
    courses: 'Loading your courses...',
    progress: 'Analysing your progress...',
    partners: 'Finding study partners...',
    dashboard: 'Preparing your dashboard...',
  };

  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className={`${sizeClasses[size]} animate-spin text-emerald-600`} />
        <p className="text-sm text-slate-600 font-medium">{message || contextMessages[context]}</p>
      </div>
    </div>
  );
}

// Unified Error Component
interface ErrorDisplayProps {
  error: AppError;
  onRetry?: () => void;
  onDismiss?: () => void;
  context: 'courses' | 'progress' | 'partners' | 'dashboard';
}

export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  const getContextIcon = () => {
    if (error.type === 'network') {
      return <WifiOff className="h-5 w-5" />;
    }
    return <AlertCircle className="h-5 w-5" />;
  };

  const getContextColor = () => {
    switch (error.type) {
      case 'network':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'auth':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'permission':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-slate-50 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${getContextColor()}`}>
      <div className="flex items-start gap-3">
        {getContextIcon()}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1">{error.title}</h3>
          <p className="text-sm opacity-90 mb-3">{error.message}</p>

          <div className="flex items-center gap-2">
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 hover:bg-white border border-current/20 rounded-lg text-xs font-medium transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                {error.action}
              </button>
            )}

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-xs font-medium opacity-70 hover:opacity-100 transition-opacity"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Unified Empty State Component
interface EmptyStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon: React.ReactNode;
  context: 'courses' | 'progress' | 'partners' | 'dashboard';
}

export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 mb-4 max-w-sm mx-auto">{message}</p>

      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Connection Status Indicator
export function ConnectionStatus() {
  const isOnline = navigator.onLine;

  if (isOnline) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-amber-100 text-amber-800 rounded-lg border border-amber-200 shadow-lg">
      <WifiOff className="h-4 w-4" />
      <span className="text-sm font-medium">No internet connection</span>
    </div>
  );
}
