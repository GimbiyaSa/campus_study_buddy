// frontend/src/pages/Sessions.tsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, MapPin, Plus, Users, X, Edit, Trash2, MessageSquare } from 'lucide-react';
import { DataService, type StudySession, type StudyGroup } from '../services/dataService';

export default function Sessions() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | StudySession['status']>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await DataService.fetchSessions();
        if (mounted) setSessions(data);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // notify other views (e.g., Calendar)
  function broadcastSessionCreated(session: StudySession) {
    try {
      window.dispatchEvent(new CustomEvent('session:created', { detail: session }));
      window.dispatchEvent(new Event('sessions:invalidate'));
    } catch {}
  }

  const handleCreateSession = async (
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
  ) => {
    try {
      const created = await DataService.createSession(sessionData);
      if (created) {
        setSessions((prev) => [created, ...prev]);
        broadcastSessionCreated(created);
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
      isAttending: true,
    };
    setSessions((prev) => [newSession, ...prev]);
    broadcastSessionCreated(newSession);
  };

  const handleEditSession = async (
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
  ) => {
    if (!editingSession) return;

    try {
      const updated = await DataService.updateSession(editingSession.id, sessionData);
      if (updated) {
        setSessions((prev) =>
          prev.map((s) => (s.id === editingSession.id ? { ...s, ...updated } : s))
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
      const res = await DataService.deleteSession(sessionId);
      if (res?.ok) {
        const updated = res.data ?? {};
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  ...updated,
                  id: String(updated.id ?? sessionId),
                  status: updated.status ?? 'cancelled',
                }
              : s
          )
        );
        return;
      }
    } catch (error) {
      console.error('Error cancelling session:', error);
    }
    // Optimistic fallback – mark as cancelled locally
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' } : s))
    );
  };

  const handleJoinSession = async (sessionId: string) => {
    // Optimistic UI first
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              isAttending: true,
              participants: (s.participants || 0) + (s.isAttending ? 0 : 1),
            }
          : s
      )
    );

    try {
      const ok = await DataService.joinSession(sessionId);
      if (!ok) {
        // Roll back only for hard failures
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  isAttending: false,
                  participants: Math.max(0, (s.participants || 0) - 1),
                }
              : s
          )
        );
      }
    } catch (err) {
      console.warn('Join request error (keeping optimistic state):', err);
    }
  };

  const handleLeaveSession = async (sessionId: string) => {
    // Optimistic UI first
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              isAttending: false,
              participants: Math.max(0, (s.participants || 0) - 1),
            }
          : s
      )
    );

    try {
      const ok = await DataService.leaveSession(sessionId);
      if (!ok) {
        // Roll back on hard failures
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  isAttending: true,
                  participants: (s.participants || 0) + 1,
                }
              : s
          )
        );
      }
    } catch (err) {
      console.warn('Leave request error (keeping optimistic state):', err);
    }
  };

  const handleOpenChat = (session: StudySession) => {
    if (!session.groupId) return;
    window.location.href = `/groups/${session.groupId}/chat?session=${session.id}`;
  };

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
                !session.isAttending &&
                session.participants < (session.maxParticipants || 10) &&
                session.status !== 'completed' &&
                session.status !== 'cancelled'
                  ? () => handleJoinSession(session.id)
                  : undefined
              }
              onLeave={
                session.isAttending && !session.isCreator
                  ? () => handleLeaveSession(session.id)
                  : undefined
              }
              onChat={session.isAttending ? () => handleOpenChat(session) : undefined}
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
  onLeave,
  onChat,
}: {
  session: StudySession;
  onEdit?: () => void;
  onDelete?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
  onChat?: () => void;
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
            {session.isCreator ? (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
                Organizer
              </span>
            ) : session.isAttending ? (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">
                Attending
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onChat && (
            <button
              onClick={onChat}
              className="rounded-lg border border-slate-200 p-2 text-emerald-700 hover:bg-emerald-50"
              aria-label="Open chat"
              title="Open group chat"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          )}
          {onJoin && (
            <button
              onClick={onJoin}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
            >
              Attend
            </button>
          )}
          {onLeave && (
            <button
              onClick={onLeave}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Leave
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
      'id' | 'isCreator' | 'isAttending' | 'participants' | 'currentParticipants' | 'status'
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
  const [type, setType] = useState<StudySession['type']>('study');
  const [maxParticipants, setMaxParticipants] = useState<number | undefined>();

  // NEW: groups dropdown (your groups)
  const [groups, setGroups] = useState<
    Array<Pick<StudyGroup, 'id' | 'name' | 'course' | 'courseCode'>>
  >([]);
  const [groupId, setGroupId] = useState<string | undefined>(undefined);
  const groupIdFieldId = useId();

  const titleId = useId();
  const courseId = useId();
  const codeId = useId();
  const dateId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const locationId = useId();
  const typeId = useId();
  const maxParticipantsId = useId();

  // Load groups on open
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!open) return;
      try {
        const raw = await DataService.fetchMyGroups();
        const pruned = (raw || []).map((g: any) => ({
          id: String(g.id),
          name: String(g.name ?? g.group_name ?? 'Untitled group'),
          course: g.course,
          courseCode: g.courseCode,
        }));
        if (mounted) setGroups(pruned);
      } catch (e) {
        console.warn('Failed to load groups for session modal:', e);
        if (mounted) setGroups([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  // seed form state
  useEffect(() => {
    if (editingSession) {
      setTitle(editingSession.title);
      setCourse(editingSession.course || '');
      setCourseCode(editingSession.courseCode || '');
      setDate(editingSession.date);
      setStartTime(editingSession.startTime);
      setEndTime(editingSession.endTime);
      setLocation(editingSession.location);
      setType(editingSession.type || 'study');
      setMaxParticipants(editingSession.maxParticipants);
      setGroupId(editingSession.groupId != null ? String(editingSession.groupId) : undefined);
    } else {
      setTitle('');
      setCourse('');
      setCourseCode('');
      setDate('');
      setStartTime('');
      setEndTime('');
      setLocation('');
      setType('study');
      setMaxParticipants(undefined);
      setGroupId(undefined);
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

  const onChangeGroup = (val: string) => {
    const next = val || undefined;
    setGroupId(next);
    if (next) {
      const g = groups.find((x) => x.id === next);
      if (g) {
        if (!course) setCourse(g.course || '');
        if (!courseCode) setCourseCode(g.courseCode || '');
      }
    }
  };

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
      type,
      groupId,
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
              {/* Study group selector */}
              <div className="sm:col-span-2">
                <label
                  htmlFor={groupIdFieldId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Study group
                </label>
                <select
                  id={groupIdFieldId}
                  value={groupId || ''}
                  onChange={(e) => onChangeGroup(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">None</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Link this session to one of your study groups (optional).
                </p>
              </div>

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
                <label htmlFor={typeId} className="block mb-1 text-sm font-medium text-slate-800">
                  Session type
                </label>
                <select
                  id={typeId}
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
