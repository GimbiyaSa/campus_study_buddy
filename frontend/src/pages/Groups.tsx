// frontend/src/pages/Sessions.tsx
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, MapPin, Plus, Users, X, Edit, Trash2, MessageSquare } from 'lucide-react';
import { DataService, type StudySession } from '../services/dataService';
import { buildApiUrl } from '../utils/url';

type GroupOption = {
  id: string;
  name: string;
  course?: string;
  courseCode?: string;
};

export default function Sessions() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | StudySession['status']>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);

  // groups for the modal (lazy loaded when modal opens)
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await DataService.fetchSessions(); // uses service + fallbacks
        if (alive) setSessions(list);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // --- broadcast helpers so other components (Calendar) can react in real-time ---
  function broadcastSessionCreated(session: StudySession) {
    try {
      window.dispatchEvent(new CustomEvent('session:created', { detail: session }));
      window.dispatchEvent(new Event('sessions:invalidate'));
    } catch {}
  }

  // Lazy load “my groups” right before showing the modal
  const openModal = async (editing?: StudySession | null) => {
    setEditingSession(editing ?? null);
    // only refresh when needed
    setGroupsLoading(true);
    try {
      const raw = await DataService.fetchMyGroups(); // may fall back to all groups if /my-groups not available
      const opts: GroupOption[] = (Array.isArray(raw) ? raw : []).map((g) => ({
        id: String(g.id),
        name: g.name ?? 'Untitled group',
        course: g.course ?? undefined,
        courseCode: g.courseCode ?? undefined,
      }));
      setGroups(opts);
    } catch (e) {
      console.warn('Failed to load groups:', e);
      setGroups([]);
    } finally {
      setGroupsLoading(false);
      setShowModal(true);
    }
  };

  const handleCreateSession = async (
    sessionData: Omit<
      StudySession,
      'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'
    > & { groupId?: string }
  ) => {
    // If a group is selected, use the group session API
    if (sessionData.groupId) {
      const startISO = new Date(`${sessionData.date}T${sessionData.startTime}:00`).toISOString();
      const endISO = new Date(`${sessionData.date}T${sessionData.endTime}:00`).toISOString();
      const created = await DataService.createGroupSession(sessionData.groupId, {
        title: sessionData.title,
        description: '',
        startTime: startISO,
        endTime: endISO,
        location: sessionData.location,
        topics: [],
      });

      if (created) {
        const createdNorm: StudySession = {
          id: String(created.id ?? Date.now()),
          title: created.title ?? sessionData.title,
          date: created.date ?? sessionData.date,
          startTime: created.startTime
            ? new Date(created.startTime).toISOString().slice(11, 16)
            : sessionData.startTime,
          endTime: created.endTime
            ? new Date(created.endTime).toISOString().slice(11, 16)
            : sessionData.endTime,
          location: created.location ?? sessionData.location,
          type: created.type ?? (sessionData.type || 'study'),
          participants: created.participants ?? 1,
          status: created.status ?? 'upcoming',
          isCreator: true,
          isAttending: true,
          course: created.course ?? sessionData.course,
          courseCode: created.courseCode ?? sessionData.courseCode,
          maxParticipants: created.maxParticipants ?? sessionData.maxParticipants,
          groupId: created.groupId ?? sessionData.groupId,
        };
        setSessions((prev) => [createdNorm, ...prev]);
        broadcastSessionCreated(createdNorm);
        return;
      }
      // If API didn’t return a row, fall through to optimistic local add
    }

    // Standalone session (no group) – use your existing REST endpoint
    try {
      const scheduled_start = new Date(`${sessionData.date}T${sessionData.startTime}:00`);
      const scheduled_end = new Date(`${sessionData.date}T${sessionData.endTime}:00`);

      const payload = {
        session_title: sessionData.title,
        description: undefined,
        scheduled_start,
        scheduled_end,
        location: sessionData.location,
        session_type: sessionData.type || 'study',
        // optionally attach course metadata if your backend supports it
        course: sessionData.course,
        courseCode: sessionData.courseCode,
        maxParticipants: sessionData.maxParticipants,
      };

      const res = await fetch(buildApiUrl('/api/v1/sessions'), {
        method: 'POST',
        headers: authHeadersJSON(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        const createdNorm: StudySession = {
          ...created,
          id: String(created.id),
          title: created.title ?? sessionData.title,
          date: created.date ?? sessionData.date,
          startTime: created.startTime ?? sessionData.startTime,
          endTime: created.endTime ?? sessionData.endTime,
          location: created.location ?? sessionData.location,
          type: created.type ?? (sessionData.type || 'study'),
          participants: created.participants ?? 1,
          status: created.status ?? 'upcoming',
          isCreator: created.isCreator ?? true,
          isAttending: created.isAttending ?? true,
          course: created.course ?? sessionData.course,
          courseCode: created.courseCode ?? sessionData.courseCode,
          maxParticipants: created.maxParticipants ?? sessionData.maxParticipants,
          groupId: created.groupId ?? sessionData.groupId,
        };
        setSessions((prev) => [createdNorm, ...prev]);
        broadcastSessionCreated(createdNorm);
        return;
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }

    // Optimistic fallback if server call didn’t work
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
      const payload = {
        title: sessionData.title,
        date: sessionData.date,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        location: sessionData.location,
        type: sessionData.type,
        maxParticipants: sessionData.maxParticipants,
        course: sessionData.course,
        courseCode: sessionData.courseCode,
      };

      const res = await fetch(buildApiUrl(`/api/v1/sessions/${editingSession.id}`), {
        method: 'PUT',
        headers: authHeadersJSON(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        setSessions((prev) =>
          prev.map((s) =>
            s.id === editingSession.id ? { ...s, ...updated, id: String(updated.id) } : s
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
      const res = await fetch(buildApiUrl(`/api/v1/sessions/${sessionId}`), {
        method: 'DELETE',
        headers: authHeadersJSON(),
      });
      if (res.ok) {
        const updated = await res.json(); // backend returns the cancelled row
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, ...updated, id: String(updated.id), status: 'cancelled' }
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
    // Optimistic UI first (works with or without server)
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
      const res = await fetch(buildApiUrl(`/api/v1/sessions/${sessionId}/join`), {
        method: 'POST',
        headers: authHeadersJSON(),
      });

      if (!res.ok) {
        // Roll back only for hard failures; keep optimistic for network hiccups
        if ([409, 403, 404, 401].includes(res.status)) {
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
        } else {
          console.warn('Join failed (kept optimistic state):', res.status);
        }
      }
    } catch (err) {
      console.warn('Join request error (kept optimistic state):', err);
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
      const res = await fetch(buildApiUrl(`/api/v1/sessions/${sessionId}/leave`), {
        method: 'DELETE',
        headers: authHeadersJSON(),
      });

      if (!res.ok) {
        // Roll back on hard failures
        if ([400, 403, 404, 401].includes(res.status)) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? { ...s, isAttending: true, participants: (s.participants || 0) + 1 }
                : s
            )
          );
        } else {
          console.warn('Leave failed (kept optimistic state):', res.status);
        }
      }
    } catch (err) {
      console.warn('Leave request error (kept optimistic state):', err);
    }
  };

  const handleOpenChat = (session: StudySession) => {
    if (!session.groupId) return;
    window.location.href = `/groups/${session.groupId}/chat?session=${session.id}`;
  };

  // Purely client-side filtering
  const filteredSessions = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.status === filter)),
    [sessions, filter]
  );

  const statusCounts = useMemo(
    () => ({
      all: sessions.length,
      upcoming: sessions.filter((s) => s.status === 'upcoming').length,
      ongoing: sessions.filter((s) => s.status === 'ongoing').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      cancelled: sessions.filter((s) => s.status === 'cancelled').length,
    }),
    [sessions]
  );

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
          onClick={() => openModal(null)}
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
              onClick={() => openModal(null)}
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
              onEdit={session.isCreator ? () => openModal(session) : undefined}
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
        groups={groups}
        groupsLoading={groupsLoading}
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
  groups,
  groupsLoading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    session: Omit<
      StudySession,
      'id' | 'isCreator' | 'isAttending' | 'participants' | 'currentParticipants' | 'status'
    > & { groupId?: string }
  ) => void;
  editingSession?: StudySession | null;
  groups: GroupOption[];
  groupsLoading: boolean;
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
  const [groupId, setGroupId] = useState<string>(''); // NEW: group selection

  const titleId = useId();
  const courseId = useId();
  const codeId = useId();
  const dateId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const locationId = useId();
  const typeId = useId();
  const maxParticipantsId = useId();
  const groupIdDom = useId(); // id for the <select>

  // When opening, initialize fields
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
      setGroupId(String(editingSession.groupId ?? ''));
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
      setGroupId('');
    }
  }, [editingSession, open]);

  // If a group is chosen, auto-fill course fields (still editable)
  useEffect(() => {
    if (!groupId) return;
    const match = groups.find((g) => String(g.id) === String(groupId));
    if (match) {
      if (!editingSession) {
        if (match.course) setCourse(match.course);
        if (match.courseCode) setCourseCode(match.courseCode);
      }
    }
  }, [groupId, groups, editingSession]);

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
      type,
      groupId: groupId || undefined, // pass only if chosen
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
              {/* NEW: Group select (only shown when creating; optional on edit) */}
              <div className="sm:col-span-2">
                <label
                  htmlFor={groupIdDom}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Group (optional)
                </label>
                <select
                  id={groupIdDom}
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  disabled={groupsLoading}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">{groupsLoading ? 'Loading your groups…' : '— None —'}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.courseCode ? ` · ${g.courseCode}` : ''}
                      {g.course ? ` — ${g.course}` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  If you pick a group, this session will be created inside that group and visible to
                  its members.
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

              {/* Session Type */}
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

/* ----------------- helpers ----------------- */

function authHeadersJSON(): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json');
  const raw =
    typeof window !== 'undefined'
      ? localStorage.getItem('google_id_token') || localStorage.getItem('google_id_token')
      : null;
  if (raw) {
    let t = raw;
    try {
      const p = JSON.parse(raw);
      if (typeof p === 'string') t = p;
    } catch {}
    t = t
      .replace(/^["']|["']$/g, '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    if (t) h.set('Authorization', `Bearer ${t}`);
  }
  return h;
}
