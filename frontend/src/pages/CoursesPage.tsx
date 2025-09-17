import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, GraduationCap, Plus, X } from 'lucide-react';
import { DataService, type Course } from '../services/dataService';

export default function CoursesPage() {
  console.log('CoursesPage rendered');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCourses() {
      setLoading(true);
      setError(null);
      try {
        const data = await DataService.fetchCourses();
        setCourses(data);
      } catch (err) {
        console.error('Error fetching courses:', err);
        setError('Failed to fetch courses. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    fetchCourses();
  }, []);

  const addCourse = async (c: Omit<Course, 'id' | 'progress'>) => {
    setError(null); // Clear previous error
    try {
      const res = await fetch('/api/v1/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      if (!res.ok) throw new Error('Failed to add course');
      const newCourse: Course = await res.json();
      setCourses((prev) => [newCourse, ...prev]);
    } catch (err) {
      console.error('Error adding course:', err);
      setError('Failed to add course. Please try again.'); // Show error to user
    }
  };

  const removeCourse = async (id: string) => {
    setError(null); // Clear previous error
    try {
      const res = await fetch(`/api/v1/courses/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove course');
      setCourses((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Error removing course:', err);
      setError('Failed to remove course. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Error message */}
      {error && <div className="rounded-lg bg-red-100 text-red-800 px-4 py-2">{error}</div>}
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your courses</h1>
          <p className="text-slate-600 text-sm">Institution modules and your casual topics</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            <Plus className="h-4 w-4" />
            New course
          </button>
        </div>
      </div>

      {/* Grid of course cards / empty state */}
      {loading ? (
        <div className="text-center text-slate-600">Loading courses...</div>
      ) : courses.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} onRemove={() => removeCourse(course.id)} />
          ))}
        </div>
      )}

      {/* Add Course Modal */}
      <AddCourseModal
        open={open}
        onClose={() => setOpen(false)}
        onAdd={async (payload) => {
          await addCourse(payload);
          setOpen(false);
        }}
      />
    </div>
  );
}

/* ----------------------------- Course Card ------------------------------ */

function CourseCard({ course, onRemove }: { course: Course; onRemove: () => void }) {
  const isInstitution = course.type === 'institution';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            {isInstitution ? (
              <GraduationCap className="h-5 w-5" />
            ) : (
              <BookOpen className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              {isInstitution && course.code ? (
                <span className="mr-2 text-slate-500">{course.code}</span>
              ) : null}
              {course.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={isInstitution ? 'emerald' : 'slate'}>
                {isInstitution ? 'Institution' : 'Casual topic'}
              </Badge>
              {isInstitution && course.term ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {course.term}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <button
          onClick={onRemove}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          aria-label={`Remove ${course.title}`}
        >
          Remove
        </button>
      </div>

      {/* Description (casual) */}
      {course.type === 'casual' && course.description ? (
        <p className="mt-3 text-sm text-slate-700">{course.description}</p>
      ) : null}

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Progress</span>
          <span className="font-medium text-slate-900">{Math.round(course.progress ?? 0)}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, course.progress ?? 0))}%` }}
          />
        </div>
      </div>
    </article>
  );
}

function Badge({
  children,
  variant = 'slate',
}: {
  children: React.ReactNode;
  variant?: 'emerald' | 'slate';
}) {
  const cls =
    variant === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>;
}

/* ------------------------------ Empty State ----------------------------- */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-slate-800 font-medium">No courses yet</p>
      <p className="mt-1 text-sm text-slate-600">
        Add an institution module or a casual topic to get started.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
      >
        <Plus className="h-4 w-4" />
        New course
      </button>
    </div>
  );
}

/* ---------------------------- Add Course Modal -------------------------- */

function AddCourseModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (c: Omit<Course, 'id' | 'progress'>) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<'institution' | 'casual'>('institution');

  // Institution form state
  const [code, setCode] = useState('CS301');
  const [title, setTitle] = useState('Algorithms');
  const [term, setTerm] = useState('2025 · Semester 2');

  // Casual form state
  const [cTitle, setCTitle] = useState('Evening Revision');
  const [cDesc, setCDesc] = useState('Lightweight sessions to recap lecture material.');

  // a11y ids
  const instCodeId = useId();
  const instTitleId = useId();
  const instTermId = useId();
  const casualTitleId = useId();
  const casualDescId = useId();

  // Focus management + ESC + basic trap
  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const submitInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ type: 'institution', code: code.trim(), title: title.trim(), term: term.trim() });
  };

  const submitCasual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cTitle.trim()) return;
    onAdd({ type: 'casual', title: cTitle.trim(), description: cDesc.trim() });
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 id="add-course-title" className="text-lg font-semibold text-slate-900">
                Add a course
              </h2>
              <p className="text-sm text-slate-600">
                Choose from your institution or add a casual topic.
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 hover:bg-slate-50"
            >
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Course type"
            className="mt-4 inline-flex rounded-xl border border-slate-200 p-1"
          >
            <button
              role="tab"
              aria-selected={tab === 'institution'}
              onClick={() => setTab('institution')}
              className={[
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                tab === 'institution'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              <GraduationCap className="h-4 w-4" />
              Institution
            </button>
            <button
              role="tab"
              aria-selected={tab === 'casual'}
              onClick={() => setTab('casual')}
              className={[
                'ml-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                tab === 'casual' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              <BookOpen className="h-4 w-4" />
              Casual topic
            </button>
          </div>

          {/* Forms */}
          <div className="mt-5">
            {tab === 'institution' ? (
              <form onSubmit={submitInstitution} className="grid gap-4">
                <Field
                  id={instCodeId}
                  label="Course code"
                  value={code}
                  onChange={setCode}
                  placeholder="e.g., CS201"
                />
                <Field
                  id={instTitleId}
                  label="Course title"
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g., Data Structures"
                  required
                />
                <Field
                  id={instTermId}
                  label="Term"
                  value={term}
                  onChange={setTerm}
                  placeholder="e.g., 2025 · Semester 2"
                />
                <div className="mt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                  >
                    Add course
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitCasual} className="grid gap-4">
                <Field
                  id={casualTitleId}
                  label="Topic title"
                  value={cTitle}
                  onChange={setCTitle}
                  placeholder="e.g., Evening Revision"
                  required
                />
                <TextArea
                  id={casualDescId}
                  label="Description"
                  value={cDesc}
                  onChange={setCDesc}
                  placeholder="What’s this group about?"
                  rows={3}
                />
                <div className="mt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                  >
                    Add topic
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ------------------------------- Inputs --------------------------------- */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-emerald-700">*</span>}
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
      />
    </label>
  );
}

function TextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">{label}</span>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
      />
    </label>
  );
}
