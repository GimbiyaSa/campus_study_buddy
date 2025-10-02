import { useEffect, useState } from 'react';
import { Clock, BookOpen, Trophy, TrendingUp, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { buildApiUrl } from '../utils/url';
import { ErrorHandler, type AppError } from '../utils/errorHandler';
import { EmptyState, createInitialLoadingState } from '../components/ui/LoadingStates';
import type { LoadingState } from '../components/ui/LoadingStates';

interface ProgressData {
  analytics: {
    recentSessions: Array<{
      module?: string;
      topic?: string;
      description: string;
      date: string;
      hours: number;
    }>;
  };
  goals: {
    overall: {
      totalHours: number;
      completedTopics: number;
      totalSessions: number;
    };
    weekly: {
      currentHours: number;
      hoursGoal: number;
      hoursProgress: number;
    };
  };
}

export default function Progress() {
  const [loadingState, setLoadingState] = useState<LoadingState>(createInitialLoadingState());
  const [data, setData] = useState<ProgressData | null>(null);

  const fetchProgressData = async () => {
    setLoadingState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = localStorage.getItem('google_id_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const [analyticsRes, goalsRes] = await Promise.all([
        fetch(buildApiUrl('/api/v1/progress/analytics'), { headers, credentials: 'include' }),
        fetch(buildApiUrl('/api/v1/progress/goals'), { headers, credentials: 'include' }),
      ]);

      if (!analyticsRes.ok || !goalsRes.ok) {
        throw new Error(`HTTP ${analyticsRes.status}: Failed to fetch progress data`);
      }

      const analytics = await analyticsRes.json();
      const goals = await goalsRes.json();

      setData({ analytics, goals });
      setLoadingState((prev) => ({
        ...prev,
        isLoading: false,
        lastUpdated: new Date(),
        retryCount: 0,
      }));
    } catch (err) {
      console.error('Progress fetch error:', err);
      const appError = ErrorHandler.handleApiError(err, 'progress');
      setLoadingState((prev) => ({
        ...prev,
        isLoading: false,
        error: appError,
        retryCount: prev.retryCount + 1,
      }));
    }
  };

  useEffect(() => {
    fetchProgressData();
  }, []);

  if (loadingState.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
          <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading your progress</h3>
            <p className="text-slate-600">Analysing your study data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadingState.error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
          <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
        </div>
        <EnhancedErrorDisplay
          error={loadingState.error}
          onRetry={fetchProgressData}
          onDismiss={() => setLoadingState((prev) => ({ ...prev, error: null }))}
        />
      </div>
    );
  }

  const { analytics, goals } = data || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
        <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
      </div>

      {/* Enhanced Stats Cards with rich context */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          icon={<Clock className="h-5 w-5" />}
          title="Total Hours"
          value={goals?.overall?.totalHours?.toFixed(1) || '0'}
          subtitle="All time"
          trend={(goals?.overall?.totalHours || 0) > 0 ? '+12% this month' : 'Start logging hours'}
          color="emerald"
        />
        <EnhancedStatCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="This Week"
          value={`${goals?.weekly?.currentHours || 0}h`}
          subtitle={`${Math.round(goals?.weekly?.hoursProgress || 0)}% of goal`}
          trend={
            (goals?.weekly?.hoursProgress || 0) >= 100
              ? '🎉 Goal achieved!'
              : `${((goals?.weekly?.hoursGoal || 10) - (goals?.weekly?.currentHours || 0)).toFixed(
                  1
                )}h to go`
          }
          color="blue"
        />
        <EnhancedStatCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Topics Mastered"
          value={`${goals?.overall?.completedTopics || 0}`}
          subtitle="Completed"
          trend={
            (goals?.overall?.completedTopics || 0) > 0
              ? 'Great progress!'
              : 'Complete your first topic'
          }
          color="purple"
        />
        <EnhancedStatCard
          icon={<Trophy className="h-5 w-5" />}
          title="Study Sessions"
          value={`${goals?.overall?.totalSessions || 0}`}
          subtitle="Total logged"
          trend={
            (goals?.overall?.totalSessions || 0) > 0 ? 'Keep it up!' : 'Log your first session'
          }
          color="amber"
        />
      </div>

      {/* Enhanced Weekly Goal with better visualization */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Weekly Study Goal</h2>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">Study Hours</span>
          <span className="text-sm font-medium text-slate-900">
            {goals?.weekly?.currentHours || 0}h / {goals?.weekly?.hoursGoal || 10}h
          </span>
        </div>

        <div className="w-full bg-slate-100 rounded-full h-3 mb-3">
          <div
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-3 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, goals?.weekly?.hoursProgress || 0)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            {(goals?.weekly?.hoursProgress || 0) >= 100
              ? '🎉 Weekly goal achieved!'
              : `${((goals?.weekly?.hoursGoal || 10) - (goals?.weekly?.currentHours || 0)).toFixed(
                  1
                )}h remaining`}
          </span>
          <span className="font-medium text-emerald-600">
            {Math.round(goals?.weekly?.hoursProgress || 0)}%
          </span>
        </div>
      </div>

      {/* Enhanced Recent Sessions or Empty State */}
      {(analytics?.recentSessions?.length || 0) > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Study Sessions</h2>
          <div className="space-y-3">
            {(analytics?.recentSessions || []).slice(0, 5).map((session: any, index: number) => (
              <div
                key={index}
                className="border border-slate-100 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {session.module && (
                        <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                          {session.module}
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-900">
                        {session.topic || 'Study Session'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{session.description}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(session.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold text-emerald-600">
                      {session.hours?.toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No study sessions yet"
          message="Start logging your study sessions to track your progress and see detailed analytics about your learning journey."
          action={{
            label: 'Log your first session',
            onClick: () => {
              // TODO: Navigate to session logging
              console.log('Navigate to session logging');
            },
          }}
          icon={<Clock className="h-6 w-6" />}
        />
      )}
    </div>
  );
}

// Enhanced Stat Card Component with better design
function EnhancedStatCard({
  icon,
  title,
  value,
  subtitle,
  trend,
  color = 'emerald',
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  trend: string;
  color?: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-500">{subtitle}</p>
        <p className="text-xs font-medium text-slate-700">{trend}</p>
      </div>
    </div>
  );
}

// Enhanced Error Display Component to match Dashboard styling
function EnhancedErrorDisplay({
  error,
  onRetry,
  onDismiss,
}: {
  error: AppError;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 mb-6 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-red-900 mb-1">{error.title}</h4>
          <p className="text-sm text-red-700 mb-3">{error.message}</p>

          <div className="flex items-center gap-3">
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
              >
                <RefreshCw className="h-3 w-3" />
                {error.action || 'Try again'}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
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
