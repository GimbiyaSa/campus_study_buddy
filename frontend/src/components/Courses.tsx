// src/components/Courses.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, MessageCircle, Bell, Target } from 'lucide-react';
import { navigate } from '../router';
import { DataService, type Course } from '../services/dataService';

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        console.error('Failed to fetch courses:', err);
        setError('Showing demo courses (backend unreachable).');
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    fetchCourses();
    return () => abortRef.current?.abort();
  }, []);

  // clamp helper
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const avg = useMemo(() => {
    if (!courses.length) return 0;
    const total = courses.reduce((s, c) => s + clamp(c.progress ?? 0), 0);
    return Math.round((total / courses.length) * 10) / 10;
  }, [courses]);

  // donut sizes
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamp(avg) / 100);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">My Courses</h2>
        <button
          onClick={() => navigate('/courses')}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          See all
        </button>
      </div>

      {/* Live region for SR users */}
      <div aria-live="polite" className="sr-only">
        {loading ? 'Loading courses...' : `Loaded ${courses.length} courses.`}
      </div>

      {/* Info banner (soft) */}
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-emerald-50 text-emerald-900 px-4 py-2">
          <span className="text-sm">{error}</span>
          <button
            onClick={fetchCourses}
            className="text-sm font-medium underline underline-offset-2 hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Course list */}
      {loading ? (
        <ul className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100"
            >
              <div className="flex items-center gap-4 min-w-0 w-full">
                <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-gray-100 animate-pulse" />
                  <div className="h-2 w-28 rounded bg-gray-100 animate-pulse" />
                  <div className="mt-2 h-2 w-44 rounded-full bg-gray-100 animate-pulse" />
                </div>
                <div className="h-7 w-24 rounded-full bg-gray-100 animate-pulse shrink-0" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-4">
          {courses.slice(0, 3).map((course) => {
            const pct = clamp(course.progress ?? 0);
            const initials = (course.code || course.title || '?')
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 2);

            return (
              <li
                key={course.id}
                title={`${course.code ? course.code + ' · ' : ''}${course.title} • ${pct}% complete`}
                className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 grid place-items-center font-semibold shadow-soft shrink-0">
                    {initials || '—'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {course.code && <span className="text-gray-500 mr-1">{course.code}</span>}
                      {course.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {course.type === 'institution' ? course.term || 'Institution' : 'Casual topic'}
                    </p>
                    <div className="mt-2 w-44 h-2 rounded-full bg-gray-200 overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/courses')}
                  className="px-3 py-1.5 rounded-full text-sm bg-white border border-gray-200 hover:bg-gray-50 shadow-soft shrink-0"
                  aria-label={`View ${course.title}`}
                >
                  View Course
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Fill area: Summary + Quick Actions (chips) */}
      <div className="mt-6 flex-1">
        <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-white to-brand-50/40 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Donut progress */}
            <div className="flex items-center justify-center">
              <figure className="relative" aria-label={`Average progress ${avg}%`}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
                  {/* track */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="rgba(17,24,39,0.08)"
                    strokeWidth={stroke}
                    fill="none"
                  />
                  {/* value */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="currentColor"
                    className="text-brand-500"
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
                    <div className="text-2xl font-semibold text-gray-900">{avg}%</div>
                    <div className="text-xs text-gray-500">Avg progress • {courses.length} active</div>
                  </div>
                </figcaption>
              </figure>
            </div>

            {/* Chips */}
            <div className="flex flex-col justify-center">
              <p className="font-medium text-gray-900 mb-2">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate('/courses')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4" />
                  Add course
                </button>
                <button
                  onClick={() => navigate('/partners')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat with study partners
                </button>
                <button
                  onClick={() => navigate('/sessions')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Bell className="w-4 h-4" />
                  View sessions
                </button>
                <button
                  onClick={() => navigate('/progress')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Target className="w-4 h-4" />
                  View progress
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
