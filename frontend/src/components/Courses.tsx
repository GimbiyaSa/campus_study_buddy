// src/components/Courses.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, BookOpen, GraduationCap, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { navigate } from '../router';
import { DataService, type Course } from '../services/dataService';
import { ErrorHandler, type AppError } from '../utils/errorHandler';

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchCourses() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const data = await DataService.fetchCourses();
      if (!ctrl.signal.aborted) setCourses(data);
    } catch (err) {
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
    return () => abortRef.current?.abort();
  }, []);

  // Enhanced progress calculations
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const stats = useMemo(() => {
    if (!courses.length) return { avg: 0, completed: 0, inProgress: 0, totalHours: 0 };
    
    const completed = courses.filter(c => (c.progress ?? 0) >= 100).length;
    const inProgress = courses.filter(c => (c.progress ?? 0) > 0 && (c.progress ?? 0) < 100).length;
    const totalHours = courses.reduce((sum, c) => sum + (c.totalHours ?? 0), 0);
    const total = courses.reduce((s, c) => s + clamp(c.progress ?? 0), 0);
    const avg = Math.round((total / courses.length) * 10) / 10;
    
    return { avg, completed, inProgress, totalHours };
  }, [courses]);

  const handleRetry = () => {
    setError(null);
    fetchCourses();
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
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading courses</h3>
            <p className="text-slate-600">Getting your latest course data...</p>
          </div>
        </div>
      ) : courses.length === 0 ? (
        <EnhancedEmptyState />
      ) : (
        <ul className="space-y-4 mb-6">
          {courses.slice(0, 3).map((course) => (
            <EnhancedCourseCard key={course.id} course={course} />
          ))}
        </ul>
      )}

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
                      <div className="text-xs text-slate-500">Overall progress</div>
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
                    <div className="text-xs text-slate-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{stats.inProgress}</div>
                    <div className="text-xs text-slate-600">In Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-600">{stats.totalHours}h</div>
                    <div className="text-xs text-slate-600">Total Study</div>
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
    </div>
  );
}

/* ---------- Enhanced Components ---------- */

function EnhancedCourseCard({ course }: { course: Course }) {
  const isInstitution = course.type === 'institution';
  const pct = Math.max(0, Math.min(100, course.progress ?? 0));

  return (
    <li className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl grid place-items-center font-bold text-sm flex-shrink-0 transition-colors ${
          isInstitution 
            ? 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200' 
            : 'bg-blue-100 text-blue-700 group-hover:bg-blue-200'
        }`}>
          {isInstitution ? (
            <GraduationCap className="h-6 w-6" />
          ) : (
            <BookOpen className="h-6 w-6" />
          )}
        </div>
        
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">
            {course.code && (
              <span className="text-slate-500 text-sm font-medium mr-2">{course.code}</span>
            )}
            {course.title}
          </h3>
          <p className="text-xs text-slate-500 mb-2">
            {course.type === 'institution'
              ? course.term || 'Institution Course'
              : 'Personal Topic'}
          </p>
          
          {/* Enhanced Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Progress</span>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${pct > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {Math.round(pct)}%
                </span>
                {course.totalHours && course.totalHours > 0 && (
                  <span className="text-slate-500">{course.totalHours}h</span>
                )}
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ease-out ${
                  pct >= 100 
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' 
                    : pct > 0 
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                    : 'bg-slate-300'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/courses')}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all duration-200 flex-shrink-0"
          aria-label={`View ${course.title}`}
        >
          View
        </button>
      </div>
    </li>
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
        Add your institution modules or create personal study topics to start tracking your academic progress.
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
