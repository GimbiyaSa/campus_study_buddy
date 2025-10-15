import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Users, X } from 'lucide-react';
import { DataService, type StudySession } from '../services/dataService';

type ViewMode = 'day' | 'week' | 'month';

/* ----------------- local date helpers (avoid UTC drift) ----------------- */
function formatDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // YYYY-MM-DD in local time
}

function dateKey(d: Date) {
  return formatDateLocal(d);
}

/* ---------- view helpers (day/week/month) ---------- */
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // Sunday start
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

    const days: Date[] = [];
    const current = new Date(startDate);

    // Generate 42 days (6 weeks) for calendar grid
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  };

function getVisibleDates(view: ViewMode, anchor: Date): Date[] {
  if (view === 'day') return [new Date(anchor)];
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  // month
  return getDaysInMonth(anchor); // your existing generator (6x7)
}


//listen for broadcast events for session creation/invalidation
export default function Calendar() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const open = () => {
      setSelectedDate(new Date()); // or leave null
      setShowScheduleModal(true);
    };
    window.addEventListener('calendar:openSchedule', open);
    return () => window.removeEventListener('calendar:openSchedule', open);
  }, []);

  useEffect(() => {
    const onCreated = (e: Event) => {
      const newSession = (e as CustomEvent<StudySession>).detail;
      if (!newSession) return;

      setSessions((prev) =>
        prev.some((s) => s.id === newSession.id) ? prev : [...prev, newSession]
      );
    };

    const onInvalidate = () => {
      DataService.fetchSessions().then(setSessions).catch(console.error);
    };

    window.addEventListener('session:created', onCreated as EventListener);
    window.addEventListener('sessions:invalidate', onInvalidate);
    return () => {
      window.removeEventListener('session:created', onCreated as EventListener);
      window.removeEventListener('sessions:invalidate', onInvalidate);
    };
  }, []);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const updated = (e as CustomEvent<StudySession>).detail;
      if (!updated || !updated.id) return;
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    };

    const onDeleted = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail || {};
      if (!id) return;
      setSessions((prev) => prev.filter((s) => s.id !== id));
    };

    window.addEventListener('session:updated', onUpdated as EventListener);
    window.addEventListener('session:deleted', onDeleted as EventListener);

    return () => {
      window.removeEventListener('session:updated', onUpdated as EventListener);
      window.removeEventListener('session:deleted', onDeleted as EventListener);
    };
  }, []);

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      try {
        const data = await DataService.fetchSessions({ status: 'upcoming' });
        setSessions(data);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, []);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getSessionsForDate = (date: Date) => {
  const dateStr = dateKey(date); // local date
  return sessions.filter(
    (s) => s.date === dateStr && s.status !== 'cancelled' // optionally: && s.status !== 'completed'
  );
};


 function navigate(direction: 'prev' | 'next') {    
   const step = view === 'day' ? 1 : view === 'week' ? 7 : 30; // month ≈ 30d is fine for stepping
   const factor = direction === 'next' ? 1 : -1;
   setCurrentDate((d) => addDays(d, step * factor));
 }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setShowScheduleModal(true);
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const today = new Date();
  const isToday = (date: Date) => date.toDateString() === today.toDateString();
  const isCurrentMonth = (date: Date) => date.getMonth() === currentDate.getMonth();

  const calendarDays = getVisibleDates(view, currentDate);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Calendar</h2>
          <div className="h-8 w-32 bg-slate-200 rounded animate-pulse"></div>
        </div>
        <div className="h-96 bg-slate-100 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Calendar</h2>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex rounded-lg border border-slate-200 p-1">
            {(['day', 'week', 'month'] as ViewMode[]).map((viewMode) => (
              <button
                key={viewMode}
                onClick={() => setView(viewMode)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  view === viewMode
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowScheduleModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New session
          </button>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('prev')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-slate-600" />
        </button>

        <h3 className="text-xl font-semibold text-slate-900">
        {view === 'month' && `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
        {view === 'week' && (() => {
          const days = getVisibleDates('week', currentDate);
          const a = days[0], b = days[6];
          return `${monthNames[a.getMonth()]} ${a.getDate()} – ${monthNames[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
        })()}
        {view === 'day' && `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`}
        </h3>


        <button
          onClick={() => navigate('next')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronRight className="h-5 w-5 text-slate-600" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className={`grid ${view === 'day' ? 'grid-cols-1' : 'grid-cols-7'} gap-1 bg-slate-50 p-4 rounded-xl`}>

        {/* Day Headers */}
        {(view === 'day' ? [dayNames[currentDate.getDay()]] : dayNames).map((day) => (
        <div key={day} className="text-center text-sm font-medium text-slate-600 p-2">
          {day}
        </div>
        ))}


        {/* Calendar Days */}
        {calendarDays.map((date, index) => {
          const dateStr = dateKey(date); // local
          const dateSessions = getSessionsForDate(date);
          const isCurrentMonthDay = isCurrentMonth(date);
          const isTodayDate = isToday(date);

          return (
            <div
              key={index}
              className={`relative min-h-[80px] p-2 rounded-lg cursor-pointer transition-all border ${
                isTodayDate
                  ? 'bg-emerald-50 border-emerald-200'
                  : hoveredDate === dateStr
                  ? 'bg-blue-50 border-blue-200'
                  : isCurrentMonthDay
                  ? 'bg-white border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-50 border-transparent text-slate-400'
              }`}
              onClick={() => handleDateClick(date)}
              onMouseEnter={() => setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              {/* Date Number */}
              <div
                className={`text-sm font-medium ${
                  isTodayDate
                    ? 'text-emerald-700'
                    : isCurrentMonthDay
                    ? 'text-slate-900'
                    : 'text-slate-400'
                }`}
              >
                {date.getDate()}
              </div>

              {/* Session Indicators */}
              <div className="mt-1 space-y-1">
                {dateSessions.slice(0, 2).map((session) => (
                  <div
                    key={session.id}
                    className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md truncate"
                    title={`${session.title} - ${formatTime(session.startTime)}`}
                  >
                    {formatTime(session.startTime)} {session.title}
                  </div>
                ))}
                {dateSessions.length > 2 && (
                  <div className="text-xs text-slate-500 px-2">+{dateSessions.length - 2} more</div>
                )}
              </div>

              {/* Hover Tooltip */}
              {hoveredDate === dateStr && dateSessions.length > 0 && (
                <div className="absolute top-full left-0 z-10 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                  <div className="space-y-2">
                    {dateSessions.map((session) => (
                      <div key={session.id} className="text-sm">
                        <div className="font-medium text-slate-900">{session.title}</div>
                        <div className="text-slate-600 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {formatTime(session.startTime)} - {formatTime(session.endTime)}
                        </div>
                        <div className="text-slate-600 flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {session.location}
                        </div>
                        <div className="text-slate-600 flex items-center gap-2">
                          <Users className="h-3 w-3" />
                          {session.participants}
                          {session.maxParticipants && `/${session.maxParticipants}`} participants
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Schedule Session Modal */}
      <ScheduleSessionModal
        open={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false);
          setSelectedDate(null);
        }}
        selectedDate={selectedDate}
        onSessionCreated={(newSession) => {
          setSessions((prev) => [...prev, newSession]);
          setShowScheduleModal(false);
          setSelectedDate(null);
          window.dispatchEvent(new CustomEvent('session:created', { detail: newSession }));
        }}
      />
    </div>
  );
}

function ScheduleSessionModal({
  open,
  onClose,
  selectedDate,
  onSessionCreated,
}: {
  open: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  onSessionCreated: (session: StudySession) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<StudySession['type']>('study');
  const [maxParticipants, setMaxParticipants] = useState<number | undefined>();

  useLayoutEffect(() => {
    if (!open) return;

    if (selectedDate) {
      // Use local date, not UTC ISO
      setDate(formatDateLocal(selectedDate));
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, selectedDate, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime || !location.trim()) return;

    // Prepare payload that matches the shape used by Sessions.tsx -> DataService.createSession
    const payload: Omit<
      StudySession,
      'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'
    > = {
      title: title.trim(),
      course: course.trim() || undefined,
      courseCode: courseCode.trim() || undefined,
      date, // local YYYY-MM-DD (your DataService composes server payload)
      startTime, // "HH:MM"
      endTime, // "HH:MM"
      location: location.trim(),
      type,
      maxParticipants,
      // NOTE: no groupId field here since the calendar modal doesn’t pick a group.
    };

    try {
      const created = await DataService.createSession(payload);
      if (created) {
        onSessionCreated(created); // update local list
        // notify all other widgets
        window.dispatchEvent(new CustomEvent('session:created', { detail: created }));
        window.dispatchEvent(new Event('sessions:invalidate'));
      } else {
        // Fallback (optimistic) if service returned falsy
        const optimistic: StudySession = {
          ...payload,
          id: Date.now().toString(),
          participants: 1,
          status: 'upcoming',
          isCreator: true,
          isAttending: true,
        };
        onSessionCreated(optimistic);
        window.dispatchEvent(new CustomEvent('session:created', { detail: optimistic }));
        window.dispatchEvent(new Event('sessions:invalidate'));
      }
    } catch (err) {
      console.error('Error creating session (calendar):', err);
      // Keep your previous optimistic UX
      const optimistic: StudySession = {
        ...payload,
        id: Date.now().toString(),
        participants: 1,
        status: 'upcoming',
        isCreator: true,
        isAttending: true,
      };
      onSessionCreated(optimistic);
      window.dispatchEvent(new CustomEvent('session:created', { detail: optimistic }));
      window.dispatchEvent(new Event('sessions:invalidate'));
    }

    // Reset form
    setTitle('');
    setCourse('');
    setCourseCode('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setType('study');
    setMaxParticipants(undefined);
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div
          ref={dialogRef}
          className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Schedule Study Session</h2>
              <p className="text-sm text-slate-600">Create a new collaborative study session</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-slate-50 transition-colors"
            >
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-slate-800">
                Session Title <span className="text-red-500">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Algorithm Study Group"
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-800">Course Code</label>
                <input
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="e.g., CS301"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-800">Course Name</label>
                <input
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="e.g., Data Structures"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-800">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-800">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-800">
                  End Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-800">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Library Room 204"
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-800">
                  Session Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as StudySession['type'])}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="study">Study Group</option>
                  <option value="review">Review Session</option>
                  <option value="project">Project Work</option>
                  <option value="exam_prep">Exam Preparation</option>
                  <option value="discussion">Discussion</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-800">
                  Max Participants
                </label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={maxParticipants || ''}
                  onChange={(e) =>
                    setMaxParticipants(e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  placeholder="Optional"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
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
                Create Session
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
