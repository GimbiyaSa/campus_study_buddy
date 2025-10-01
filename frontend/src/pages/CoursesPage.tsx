import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, GraduationCap, Plus, X, Trash2, Calendar, Clock, Search, Filter, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { DataService, type Course } from '../services/dataService';
import { ErrorHandler, type AppError } from '../utils/errorHandler';

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'enrolled_at' | 'module_name' | 'progress'>('enrolled_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  useEffect(() => {
    async function fetchCourses() {
      setLoading(true);
      setError(null);
      try {
        const data = await DataService.fetchCourses({
          search: searchTerm,
          sortBy,
          sortOrder,
          limit: 50
        });
        // Ensure data is an array, even if API returns null/undefined
        setCourses(Array.isArray(data) ? data : []);
        console.log('✅ Courses fetched successfully:', data);
      } catch (err) {
        console.error('❌ Courses fetch error:', err);
        // Only set error for real API failures, not empty results
        const appError = ErrorHandler.handleApiError(err, 'courses');
        setError(appError);
      } finally {
        setLoading(false);
      }
    }
    fetchCourses();
  }, [searchTerm, sortBy, sortOrder]);

  const addCourse = async (c: Omit<Course, 'id' | 'progress'>) => {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    
    try {
      // Check for local duplicates first (faster UX)
      const isDuplicate = courses.some(existing => 
        existing.title.toLowerCase().trim() === c.title.toLowerCase().trim() ||
        (c.code && existing.code && existing.code.replace(/_[a-zA-Z0-9]{3,}$/, '').toLowerCase() === c.code.toLowerCase())
      );
      
      if (isDuplicate) {
        throw new Error(`You already have a ${c.type === 'institution' ? 'course' : 'topic'} named "${c.title}"${c.code ? ` (${c.code})` : ''}. Please choose a different name.`);
      }

      const newCourse = await DataService.addCourse(c);
      setCourses((prev) => [newCourse, ...prev]);
      setSuccess(`Successfully added ${c.type === 'institution' ? 'course' : 'topic'}: ${c.title}`);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Add course error:', err);
      
      // Handle duplicate errors specifically
      if (err instanceof Error && err.message.includes('already')) {
        setError({
          code: 'DUPLICATE_COURSE',
          title: 'Duplicate Course',
          message: err.message,
          type: 'validation',
          retryable: false
        });
      } else {
        const appError = ErrorHandler.handleApiError(err, 'courses');
        setError(appError);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeCourse = async (id: string, title: string) => {
    setError(null);
    setSuccess(null);
    setDeletingId(id);
    
    try {
      await DataService.removeCourse(id);
      setCourses((prev) => prev.filter((c) => c.id !== id));
      setSuccess(`Successfully removed: ${title}`);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const appError = ErrorHandler.handleApiError(err, 'courses');
      setError(appError);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetry = () => {
    setError(null);
    // Trigger re-fetch by updating a dependency
    setSortOrder(prev => prev);
  };

  const clearError = () => setError(null);

  return (
    <div className="space-y-6">
      {/* Enhanced Success Message */}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 flex items-center gap-3 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {/* Enhanced Error Display: show validation errors even with existing courses */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 shadow-sm">
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
                  onClick={clearError}
                  className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Your courses</h1>
            <p className="text-slate-600">Institution modules and your casual topics</p>
          </div>
          {courses.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-200"
              >
                <Plus className="h-4 w-4" />
                Add Course
              </button>
            </div>
          )}
        </div>
        
        {/* Enhanced Search and Sort Controls */}
        {courses.length > 0 && (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 py-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 shadow-sm transition-all duration-200"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortBy(field as 'enrolled_at' | 'module_name' | 'progress');
                  setSortOrder(order as 'ASC' | 'DESC');
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 shadow-sm transition-all duration-200"
              >
                <option value="enrolled_at-DESC">Recently enrolled</option>
                <option value="enrolled_at-ASC">Oldest first</option>
                <option value="module_name-ASC">Name A-Z</option>
                <option value="module_name-DESC">Name Z-A</option>
                <option value="progress-DESC">Most progress</option>
                <option value="progress-ASC">Least progress</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Content Area */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading courses</h3>
            <p className="text-slate-600">Getting your latest course data...</p>
          </div>
        </div>
      ) : courses.length === 0 ? (
        <EnhancedEmptyState onAdd={() => setOpen(true)} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <EnhancedCourseCard 
              key={course.id} 
              course={course} 
              onRemove={() => removeCourse(course.id, course.title)}
              isDeleting={deletingId === course.id}
            />
          ))}
        </div>
      )}

      {/* Enhanced Add Course Modal */}
      <EnhancedAddCourseModal
        open={open}
        onClose={() => setOpen(false)}
        onAdd={async (payload: Omit<Course, 'id' | 'progress'>) => {
          await addCourse(payload);
          setOpen(false);
        }}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

/* ----------------------------- Enhanced Course Card ------------------------------ */

function EnhancedCourseCard({ course, onRemove, isDeleting }: { 
  course: Course; 
  onRemove: () => void;
  isDeleting?: boolean;
}) {
  const isInstitution = course.type === 'institution';
  const progressPercentage = Math.round(course.progress ?? 0);
  const hasProgress = progressPercentage > 0;

  return (
    <article className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300">
      {/* Course Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`grid h-14 w-14 place-items-center rounded-2xl flex-shrink-0 transition-colors ${
            isInstitution 
              ? 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100' 
              : 'bg-blue-50 text-blue-700 group-hover:bg-blue-100'
          }`}>
            {isInstitution ? (
              <GraduationCap className="h-7 w-7" />
            ) : (
              <BookOpen className="h-7 w-7" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors text-lg">
              {isInstitution && course.code && (
                <span className="block text-sm font-medium text-slate-500 mb-1">
                  {/* Clean up course code by removing ugly suffixes */}
                  {course.code.replace(/_[a-zA-Z0-9]{3,}$/, '')}
                </span>
              )}
              {course.title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={isInstitution ? 'emerald' : 'slate'}>
                {isInstitution ? 'Institution' : 'Personal Topic'}
              </Badge>
              {isInstitution && course.term && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {course.term}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          disabled={isDeleting}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
          aria-label={`Remove ${course.title}`}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          {isDeleting ? 'Removing...' : 'Remove'}
        </button>
      </div>
      
      {/* Course Description (for personal topics) */}
      {course.type === 'casual' && course.description && (
        <p className="text-sm text-slate-700 mb-4 line-clamp-2">{course.description}</p>
      )}
      
      {/* Course Metadata */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        {course.createdAt && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Enrolled {new Date(course.createdAt).toLocaleDateString()}
          </span>
        )}
        {course.totalHours && course.totalHours > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {course.totalHours}h studied
          </span>
        )}
      </div>
      
      {/* Enhanced Progress Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Progress</span>
          <div className="flex items-center gap-2">
            <span className={`font-bold ${hasProgress ? 'text-emerald-600' : 'text-slate-400'}`}>
              {progressPercentage}%
            </span>
            {course.totalTopics && course.totalTopics > 0 && course.completedTopics !== undefined && (
              <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-1">
                {course.completedTopics}/{course.totalTopics} topics
              </span>
            )}
          </div>
        </div>
        
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-3 rounded-full transition-all duration-500 ease-out ${
              progressPercentage >= 100 
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' 
                : progressPercentage > 0 
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : 'bg-slate-300'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
          />
          {progressPercentage >= 100 && (
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 rounded-full animate-pulse" />
          )}
        </div>
        
        <p className="text-xs text-slate-600">
          {progressPercentage >= 100 ? (
            <span className="text-emerald-600 font-medium">🎉 Completed!</span>
          ) : progressPercentage > 0 ? (
            'In progress - keep it up!'
          ) : (
            'Ready to begin'
          )}
        </p>
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
    variant === 'emerald' 
      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
      : 'bg-slate-100 text-slate-700 border border-slate-200';
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

/* ------------------------------ Enhanced Empty State ----------------------------- */

function EnhancedEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-white to-slate-50 p-16 text-center">
      <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mb-6 shadow-lg">
        <GraduationCap className="h-12 w-12 text-emerald-600" />
      </div>
      <h3 className="text-2xl font-bold text-slate-900 mb-3">Start your learning journey</h3>
      <p className="text-slate-600 mb-8 max-w-md mx-auto leading-relaxed">
        Add your institution modules or create personal study topics to track your progress and connect with study partners.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-8 py-4 font-bold text-white shadow-xl hover:shadow-2xl hover:from-emerald-700 hover:to-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-300 transform hover:scale-105"
      >
        <Plus className="h-5 w-5" />
        Add your first course
      </button>
    </div>
  );
}

/* ---------------------------- Enhanced Add Course Modal -------------------------- */

function EnhancedAddCourseModal({
  open,
  onClose,
  onAdd,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (c: Omit<Course, 'id' | 'progress'>) => void;
  isSubmitting?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<'institution' | 'casual'>('institution');

  // Institution form state
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('');

  // Casual form state
  const [cTitle, setCTitle] = useState('');
  const [cDesc, setCDesc] = useState('');

  // Reset form fields when modal opens
  useEffect(() => {
    if (open) {
      setTab('institution');
      setCode('');
      setTitle('');
      setTerm('');
      setCTitle('');
      setCDesc('');
    }
  }, [open]);

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
    if (!cTitle.trim() || !cDesc.trim()) return;
    onAdd({ type: 'casual', title: cTitle.trim(), description: cDesc.trim() });
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 id="add-course-title" className="text-2xl font-bold text-slate-900 mb-2">
                Add a course
              </h2>
              <p className="text-slate-600">
                Choose from your institution modules or create a personal study topic.
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl p-3 hover:bg-slate-100 transition-colors"
            >
              <X className="h-6 w-6 text-slate-600" />
            </button>
          </div>

          {/* Enhanced Tabs */}
          <div
            role="tablist"
            aria-label="Course type"
            className="inline-flex rounded-2xl border border-slate-200 p-1 mb-6 bg-slate-50"
          >
            <button
              role="tab"
              aria-selected={tab === 'institution'}
              onClick={() => setTab('institution')}
              className={[
                'flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-medium transition-all duration-200',
                tab === 'institution'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'text-slate-700 hover:bg-white hover:shadow-sm',
              ].join(' ')}
            >
              <GraduationCap className="h-5 w-5" />
              Institution Module
            </button>
            <button
              role="tab"
              aria-selected={tab === 'casual'}
              onClick={() => setTab('casual')}
              className={[
                'ml-2 flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-medium transition-all duration-200',
                tab === 'casual' 
                  ? 'bg-emerald-600 text-white shadow-lg' 
                  : 'text-slate-700 hover:bg-white hover:shadow-sm',
              ].join(' ')}
            >
              <BookOpen className="h-5 w-5" />
              Personal Topic
            </button>
          </div>

          {/* Enhanced Forms */}
          <div className="space-y-6">
            {tab === 'institution' ? (
              <form onSubmit={submitInstitution} className="space-y-5">
                <EnhancedField
                  id={instCodeId}
                  label="Course code"
                  value={code}
                  onChange={setCode}
                  placeholder="e.g., CS201, MATH104"
                  description="Optional module or course code"
                />
                <EnhancedField
                  id={instTitleId}
                  label="Course title"
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g., Data Structures and Algorithms"
                  required
                  description="The full name of your course or module"
                />
                <EnhancedField
                  id={instTermId}
                  label="Term/Semester"
                  value={term}
                  onChange={setTerm}
                  placeholder="e.g., 2025 Semester 1, Fall 2024"
                  description="When you're taking this course"
                />
                <div className="pt-4 flex items-center justify-end gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Plus className="h-5 w-5" />
                    )}
                    {isSubmitting ? 'Adding...' : 'Add Course'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitCasual} className="space-y-5">
                <EnhancedField
                  id={casualTitleId}
                  label="Topic title"
                  value={cTitle}
                  onChange={setCTitle}
                  placeholder="e.g., Evening Study Sessions, Exam Prep"
                  required
                  description="A name for your personal study topic"
                />
                <EnhancedTextArea
                  id={casualDescId}
                  label="Description"
                  value={cDesc}
                  onChange={setCDesc}
                  placeholder="e.g., Weekly group sessions for reviewing course material and preparing for exams"
                  rows={4}
                  required
                  description="What this study topic covers and your goals"
                />
                <div className="pt-4 flex items-center justify-end gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !cTitle.trim() || !cDesc.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Plus className="h-5 w-5" />
                    )}
                    {isSubmitting ? 'Adding...' : 'Add Topic'}
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

/* ------------------------------- Enhanced Form Inputs --------------------------------- */

function EnhancedField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  description,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block">
        <span className="block text-sm font-bold text-slate-800 mb-1">
          {label} {required && <span className="text-emerald-600">*</span>}
        </span>
        {description && (
          <span className="block text-xs text-slate-500 mb-2">{description}</span>
        )}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 placeholder:text-slate-400 transition-all duration-200"
        />
      </label>
    </div>
  );
}

function EnhancedTextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
  description,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block">
        <span className="block text-sm font-bold text-slate-800 mb-1">
          {label} {required && <span className="text-emerald-600">*</span>}
        </span>
        {description && (
          <span className="block text-xs text-slate-500 mb-2">{description}</span>
        )}
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          required={required}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 placeholder:text-slate-400 transition-all duration-200 resize-none"
        />
      </label>
    </div>
  );
}
