// src/components/Courses.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, BookOpen, GraduationCap, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { navigate } from '../router';
import { DataService, type Course } from '../services/dataService';
import { ErrorHandler, type AppError } from '../utils/errorHandler';
import EnhancedCourseCard from './EnhancedCourseCard';

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [showQuickLogDialog, setShowQuickLogDialog] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Add logging whenever courses state changes
  useEffect(() => {
    console.log('🎓 Courses state updated:', courses);
    console.log('🎓 Courses count:', courses.length);
    console.log('🎓 Loading state:', loading);
    console.log('🎓 Error state:', error);
  }, [courses, loading, error]);

  async function fetchCourses() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      console.log('🎓 Fetching courses...');
      const data = await DataService.fetchCourses();
      console.log('🎓 Courses fetched successfully:', data);
      console.log('🎓 Courses array length:', data?.length);
      console.log('🎓 First course:', data?.[0]);
      if (!ctrl.signal.aborted) {
        console.log('🎓 Setting courses state with:', data);
        setCourses(data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch courses:', err);
      if (!ctrl.signal.aborted) {
        const appError = ErrorHandler.handleApiError(err, 'courses');
        setError(appError);
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    fetchCourses();
    
    // Listen for course invalidation events (when progress is updated)
    const handleCourseInvalidate = (event: CustomEvent) => {
      console.log('🔄 Course invalidation event received:', event.detail);
      fetchCourses();
    };

    window.addEventListener('courses:invalidate', handleCourseInvalidate as EventListener);
    
    return () => {
      abortRef.current?.abort();
      window.removeEventListener('courses:invalidate', handleCourseInvalidate as EventListener);
    };
  }, []);

  // Enhanced progress calculations
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const stats = useMemo(() => {
    console.log('📊 Calculating stats for courses:', courses);
    if (!courses.length) return { avg: 0, completed: 0, inProgress: 0, totalHours: 0 };

    const completed = courses.filter((c) => (c.progress ?? 0) >= 100).length;
    // Count as "In Progress" if either: progress > 0 OR hours logged (even with 0 progress)
    const inProgress = courses.filter(
      (c) => {
        const progress = c.progress ?? 0;
        const hours = c.totalHours ?? 0;
        return progress < 100 && (progress > 0 || hours > 0);
      }
    ).length;
    const totalHours = courses.reduce((sum, c) => sum + (c.totalHours ?? 0), 0);
    const total = courses.reduce((s, c) => s + clamp(c.progress ?? 0), 0);
    const avg = Math.round((total / courses.length) * 10) / 10;

    const result = { avg, completed, inProgress, totalHours };
    console.log('📊 Stats calculated:', result);
    return result;
  }, [courses]);

  const handleRetry = () => {
    setError(null);
    fetchCourses();
  };

  const handleQuickLog = (courseId: string) => {
    setSelectedCourseId(courseId);
    setShowQuickLogDialog(true);
  };

  const handleViewProgress = (courseId: string) => {
    navigate(`/courses/${courseId}`);
  };

  // Enhanced donut chart calculations
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamp(stats.avg) / 100);

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">My Courses</h2>
          <p className="text-slate-600">Track your academic progress</p>
        </div>
        <button
          onClick={() => navigate('/courses')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          Manage all
        </button>
      </div>

      {/* Enhanced Error Display */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 mb-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-red-900 mb-1">{error.title}</h4>
              <p className="text-sm text-red-700 mb-3">{error.message}</p>
              <div className="flex flex-wrap gap-2">
                {error.retryable && (
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
                  >
                    {error.action || 'Try again'}
                  </button>
                )}
                <button
                  onClick={() => setError(null)}
                  className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Course List */}
      {(() => {
        console.log('🎨 Rendering decision - Loading:', loading, 'Courses length:', courses.length);
        if (loading) {
          console.log('🎨 Rendering loading state');
          return (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading courses</h3>
                <p className="text-slate-600">Getting your latest course data...</p>
              </div>
            </div>
          );
        } else if (courses.length === 0) {
          console.log('🎨 Rendering empty state');
          return <EnhancedEmptyState />;
        } else {
          console.log('🎨 Rendering courses list with', courses.length, 'courses');
          console.log('🎨 First 3 courses to render:', courses.slice(0, 3));
          return (
            <div className="space-y-4 mb-6">
              {courses.slice(0, 3).map((course) => {
                console.log('🎨 Rendering course card for:', course.id, course.title);
                return (
                  <EnhancedCourseCard
                    key={course.id}
                    course={course}
                    onQuickLog={handleQuickLog}
                    onViewProgress={handleViewProgress}
                  />
                );
              })}
            </div>
          );
        }
      })()}

      {/* Enhanced Summary + Quick Actions */}
      {!loading && courses.length > 0 && (
        <div className="mt-auto">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50/30 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Enhanced Progress Visualization */}
              <div className="flex items-center justify-center">
                <figure className="relative" aria-label={`Average progress ${stats.avg}%`}>
                  <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    role="img"
                    aria-hidden="true"
                  >
                    {/* Track */}
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      stroke="rgba(17,24,39,0.08)"
                      strokeWidth={stroke}
                      fill="none"
                    />
                    {/* Progress */}
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      stroke="currentColor"
                      className="text-emerald-500"
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={c}
                      strokeDashoffset={offset}
                      transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                  </svg>
                  <figcaption className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{stats.avg}%</div>
                      <div className="text-xs text-slate-500">Average</div>
                      <div className="text-xs text-slate-500 font-medium">across courses</div>
                    </div>
                  </figcaption>
                </figure>
              </div>

              {/* Enhanced Stats & Actions */}
              <div className="flex flex-col justify-center space-y-4">
                {/* Course Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-emerald-600">{stats.completed}</div>
                    <div className="text-xs text-slate-600">Courses Done</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{stats.inProgress}</div>
                    <div className="text-xs text-slate-600">In Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-600">{stats.totalHours}h</div>
                    <div className="text-xs text-slate-600">Study Time</div>
                  </div>
                </div>

                {/* Enhanced Quick Actions */}
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900 text-sm">Quick actions</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => navigate('/courses')}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add course
                    </button>
                    <button
                      onClick={() => navigate('/progress')}
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <TrendingUp className="w-4 h-4" />
                      View progress
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Log Dialog */}
      {showQuickLogDialog && selectedCourseId && (
        <QuickLogDialog
          courseId={selectedCourseId}
          onClose={() => setShowQuickLogDialog(false)}
          onSuccess={() => {
            setShowQuickLogDialog(false);
            fetchCourses(); // Refresh courses
          }}
        />
      )}
    </div>
  );
}

/* ---------- Enhanced Components ---------- */

function QuickLogDialog({
  courseId,
  onClose,
  onSuccess,
}: {
  courseId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [hours, setHours] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hoursNum = parseFloat(hours);
    if (hoursNum > 0) {
      setLoading(true);
      setError(null);
      try {
        await DataService.logCourseStudyHours(courseId, {
          hours: hoursNum,
          description: description || undefined,
          studyDate: new Date().toISOString().split('T')[0],
        });
        onSuccess();
      } catch (error) {
        console.error('Failed to log hours:', error);
        setError('Failed to log study hours. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Log Study Hours</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Hours Studied</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="e.g., 2.5"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              rows={3}
              placeholder="What did you study?"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Logging...' : 'Log Hours'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EnhancedEmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mx-auto mb-6">
        <GraduationCap className="h-10 w-10 text-emerald-600" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">No courses yet</h3>
      <p className="text-slate-600 mb-6 max-w-md mx-auto">
        Add your institution modules or create personal study topics to start tracking your academic
        progress.
      </p>
      <button
        onClick={() => navigate('/courses')}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-200"
      >
        <Plus className="h-5 w-5" />
        Add your first course
      </button>
    </div>
  );
}
