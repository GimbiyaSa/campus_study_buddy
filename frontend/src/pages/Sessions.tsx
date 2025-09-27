import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, MapPin, Plus, Users, X, Edit, Trash2 } from 'lucide-react';
import { DataService, type StudySession } from '../services/dataService';


export default function Sessions() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | StudySession['status']>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      try {
        const data = await DataService.fetchSessions(); // client-side filtering only
        setSessions(data);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

  const handleCreateSession = async (
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator'>
  ) => {
    try {
      const scheduled_start = new Date(`${sessionData.date}T${sessionData.startTime}:00`);
      const scheduled_end = new Date(`${sessionData.date}T${sessionData.endTime}:00`);

      const payload = {
        // Optionally include a selected group_id if you track it elsewhere
        // group_id: selectedGroupId,
        session_title: sessionData.title,
        description: undefined,
        scheduled_start,
        scheduled_end,
        location: sessionData.location,
        session_type: sessionData.type || 'study',
      };

      const res = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setSessions((prev) => [{ ...created, isCreator: true }, ...prev]);
        return;
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }

    // Optimistic fallback
    const newSession: StudySession = {
      ...sessionData,
      id: Date.now().toString(),
      participants: 1,
      status: 'upcoming',
      isCreator: true,
    };
    setSessions((prev) => [newSession, ...prev]);
  };

  const handleEditSession = async (
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator'>
  ) => {
    if (!editingSession) return;

    try {
      const payload = {
        title: sessionData.title,
        date: sessionData.date,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        location: sessionData.location,
        type: sessionData.type,
        // description: optional
      };

      const res = await fetch(`/api/v1/sessions/${editingSession.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        setSessions((prev) =>
          prev.map((s) =>
            s.id === editingSession.id ? { ...updated, isCreator: s.isCreator ?? true } : s
          )
        );
        return;
      }
    } catch (error) {
      console.error('Error updating session:', error);
    }

    // Optimistic update
    setSessions((prev) =>
      prev.map((s) => (s.id === editingSession.id ? { ...s, ...sessionData } : s))
    );
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        return;
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
    // Optimistic fallback
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleJoinSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, participants: (s.participants || 0) + 1 } : s
          )
        );
        return;
      }
    } catch (error) {
      console.error('Error joining session:', error);
    }
  };

  // Purely client-side filtering
  const filteredSessions =
    filter === 'all' ? sessions : sessions.filter((s) => s.status === filter);

  const statusCounts = {
    all: sessions.length,
    upcoming: sessions.filter((s) => s.status === 'upcoming').length,
    ongoing: sessions.filter((s) => s.status === 'ongoing').length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    cancelled: sessions.filter((s) => s.status === 'cancelled').length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Plan study sessions</h1>
        <div className="text-center text-slate-600">Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Plan study sessions</h1>
          <p className="text-slate-600 text-sm">
            Schedule and manage your collaborative study sessions
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <Plus className="h-4 w-4" />
          New session
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setFilter(status as any)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {filteredSessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-800 font-medium">No sessions found</p>
          <p className="mt-1 text-sm text-slate-600">
            {filter === 'all'
              ? 'Create your first study session to get started.'
              : `No ${filter} sessions at the moment.`}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              New session
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onEdit={
                session.isCreator
                  ? () => {
                      setEditingSession(session);
                      setShowModal(true);
                    }
                  : undefined
              }
              onDelete={session.isCreator ? () => handleDeleteSession(session.id) : undefined}
              onJoin={
                session.participants < (session.maxParticipants || 10)
                  ? () => handleJoinSession(session.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Session Modal */}
      <SessionModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingSession(null);
        }}
        onSubmit={editingSession ? handleEditSession : handleCreateSession}
        editingSession={editingSession}
      />
    </div>
  );
}

function SessionCard({
  session,
  onEdit,
  onDelete,
  onJoin,
}: {
  session: StudySession;
  onEdit?: () => void;
  onDelete?: () => void;
  onJoin?: () => void;
}) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status?: StudySession['status']) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-50 text-blue-700';
      case 'ongoing':
        return 'bg-emerald-50 text-emerald-700';
      case 'completed':
        return 'bg-slate-50 text-slate-700';
      case 'cancelled':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">{session.title}</h3>
              {session.course && (
                <p className="text-sm text-slate-600">
                  {session.courseCode && (
                    <span className="text-slate-500 mr-1">{session.courseCode}</span>
                  )}
                  {session.course}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-600">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(session.date)}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatTime(session.startTime)} - {formatTime(session.endTime)}
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {session.location}
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {session.participants}
              {session.maxParticipants && ` / ${session.maxParticipants}`}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
                session.status
              )}`}
            >
              {(session.status || 'upcoming').charAt(0).toUpperCase() +
                (session.status || 'upcoming').slice(1)}
            </span>
            {session.participants > 0 && (
              <div className="text-sm text-slate-600">
                {session.participants} participant{session.participants !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onJoin && (
            <button
              onClick={onJoin}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
            >
              Join
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Edit session"
            >
              <Edit className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50"
              aria-label="Delete session"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionModal({
  open,
  onClose,
  onSubmit,
  editingSession,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    session: Omit<
      StudySession,
      'id' | 'isCreator' | 'participants' | 'currentParticipants' | 'status'
    >
  ) => void;
  editingSession?: StudySession | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<number | undefined>();

  const titleId = useId();
  const courseId = useId();
  const codeId = useId();
  const dateId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const locationId = useId();
  const maxParticipantsId = useId();

  useEffect(() => {
    if (editingSession) {
      setTitle(editingSession.title);
      setCourse(editingSession.course || '');
      setCourseCode(editingSession.courseCode || '');
      setDate(editingSession.date);
      setStartTime(editingSession.startTime);
      setEndTime(editingSession.endTime);
      setLocation(editingSession.location);
      setMaxParticipants(editingSession.maxParticipants);
    } else {
      setTitle('');
      setCourse('');
      setCourseCode('');
      setDate('');
      setStartTime('');
      setEndTime('');
      setLocation('');
      setMaxParticipants(undefined);
    }
  }, [editingSession, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime || !location.trim()) return;

    onSubmit({
      title: title.trim(),
      course: course.trim() || undefined,
      courseCode: courseCode.trim() || undefined,
      date,
      startTime,
      endTime,
      location: location.trim(),
      maxParticipants,
      type: 'study',
    });

    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-modal-title"
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 id="session-modal-title" className="text-lg font-semibold text-slate-900">
                {editingSession ? 'Edit session' : 'Create new session'}
              </h2>
              <p className="text-sm text-slate-600">
                Schedule a collaborative study session with your peers
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={titleId} className="block mb-1 text-sm font-medium text-slate-800">
                  Session title <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={titleId}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Algorithm Study Group"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={codeId} className="block mb-1 text-sm font-medium text-slate-800">
                  Course code
                </label>
                <input
                  id={codeId}
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="e.g., CS301"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={courseId} className="block mb-1 text-sm font-medium text-slate-800">
                  Course name
                </label>
                <input
                  id={courseId}
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="e.g., Data Structures"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={dateId} className="block mb-1 text-sm font-medium text-slate-800">
                  Date <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={dateId}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label
                  htmlFor={locationId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Location <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={locationId}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Library Room 204"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label
                  htmlFor={startTimeId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Start time <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={startTimeId}
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label
                  htmlFor={endTimeId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  End time <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={endTimeId}
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label
                  htmlFor={maxParticipantsId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Max participants
                </label>
                <input
                  id={maxParticipantsId}
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
                {editingSession ? 'Update session' : 'Create session'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ----------------- helpers ----------------- */

function getToken(): string | null {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed.replace(/^Bearer\s+/i, '').trim();
  } catch {}
  return raw.replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
}

function authHeaders(): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json');
  const t = getToken();
  if (t) h.set('Authorization', `Bearer ${t}`);
  return h;
}