// frontend/src/pages/Sessions.tsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, MapPin, Plus, Users, X, Edit, Trash2 } from 'lucide-react';
import { DataService, type StudySession, type StudyGroup } from '../services/dataService';
import { navigate } from '../router';

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

    // Listen for session events from other components (Groups, Calendar, etc.)
    const handleSessionCreated = (event: CustomEvent) => {
      const newSession = event.detail;
      if (newSession && mounted) {
        setSessions(prev => {
          // Avoid duplicates
          const exists = prev.some(s => s.id === newSession.id);
          return exists ? prev : [newSession, ...prev];
        });
      }
    };

    const handleSessionsInvalidate = () => {
      if (mounted) {
        DataService.fetchSessions()
          .then(data => mounted && setSessions(data))
          .catch(console.error);
      }
    };

    window.addEventListener('session:created', handleSessionCreated as EventListener);
    window.addEventListener('sessions:invalidate', handleSessionsInvalidate);

    return () => {
      mounted = false;
      window.removeEventListener('session:created', handleSessionCreated as EventListener);
      window.removeEventListener('sessions:invalidate', handleSessionsInvalidate);
    };
  }, []);

  // notify other views (e.g., Calendar)
  function broadcastSessionCreated(session: StudySession) {
    try {
      console.log('📡 Broadcasting session:created event:', session);
      window.dispatchEvent(new CustomEvent('session:created', { detail: session }));
      window.dispatchEvent(new Event('sessions:invalidate'));
      console.log('📡 Events dispatched successfully');
    } catch (err) {
      console.error('📡 Error dispatching events:', err);
    }
  }

  const handleCreateSession = async (
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
  ) => {
    try {
      const created = await DataService.createSession(sessionData);
      if (created) {
        setSessions((prev) => [created, ...prev]);
        broadcastSessionCreated(created);
        
        // Also emit events using the eventBus pattern like Notes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('groups:session-created', { 
            detail: { session: created, groupId: created.groupId }
          }));
        }
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
    
    // Emit events for fallback case too
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('groups:session-created', { 
        detail: { session: newSession, groupId: newSession.groupId }
      }));
    }
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
        // let everyone else update inline
        try {
          window.dispatchEvent(
            new CustomEvent('session:updated', { detail: { ...updated, id: editingSession.id } })
          );
        } catch {}
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
        try {
          window.dispatchEvent(
            new CustomEvent('session:deleted', { detail: { id: String(sessionId) } })
          );
          window.dispatchEvent(new Event('sessions:invalidate'));
        } catch {}

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
    } finally {
      try {
        // notify other widgets (Calendar, Upcoming) to refetch counts/flags
        window.dispatchEvent(new Event('sessions:invalidate'));
      } catch {}
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
    } finally {
      try {
        // notify other widgets (Calendar, Upcoming) to refetch counts/flags
        window.dispatchEvent(new Event('sessions:invalidate'));
      } catch {}
    }
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
          <div className="mt-2">
            <button
              onClick={() => navigate('/groups')}
              className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <Users className="h-4 w-4" />
              Go to Groups
            </button>
          </div>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            <Plus className="h-4 w-4" />
            New session
          </button>
        )}
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    // Clear group error when user selects a group
    if (next && formErrors.groupId) {
      setFormErrors(prev => ({ ...prev, groupId: '' }));
    }
    if (next) {
      const g = groups.find((x) => x.id === next);
      if (g) {
        if (!course) setCourse(g.course || '');
        if (!courseCode) setCourseCode(g.courseCode || '');
      }
    }
  };

  // Clear field errors on change
  const clearFieldError = (field: string) => {
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validation functions
  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Required fields validation
    if (!title.trim()) {
      errors.title = 'Session title is required';
    }
    if (!date) {
      errors.date = 'Date is required';
    }
    if (!startTime) {
      errors.startTime = 'Start time is required';
    }
    if (!endTime) {
      errors.endTime = 'End time is required';
    }
    if (!location.trim()) {
      errors.location = 'Location is required';
    }

    // Study group validation - backend requires a group
    if (!groupId && groups.length === 0) {
      errors.groupId = 'You must create or join a study group first';
    } else if (!groupId && groups.length > 0) {
      errors.groupId = 'Please select a study group for this session';
    }

    // Time validation
    if (startTime && endTime && startTime >= endTime) {
      errors.endTime = 'End time must be after start time';
    }

    // Date validation (cannot be in the past)
    if (date && new Date(date) < new Date(new Date().toDateString())) {
      errors.date = 'Date cannot be in the past';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onSubmit({
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
    } catch (error) {
      console.error('Failed to create session:', error);
      setFormErrors({ submit: 'Failed to create session. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if form is valid
  const isFormValid = !isSubmitting && 
    title.trim() && 
    date && 
    startTime && 
    endTime && 
    location.trim() && 
    (groupId || groups.length === 0) &&
    (!startTime || !endTime || startTime < endTime) &&
    (!date || new Date(date) >= new Date(new Date().toDateString()));

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
                  Study group <span className="text-red-500">*</span>
                </label>
                <select
                  id={groupIdFieldId}
                  value={groupId || ''}
                  onChange={(e) => onChangeGroup(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                    formErrors.groupId 
                      ? 'border-red-300 bg-red-50 focus:ring-red-100' 
                      : 'border-slate-300 bg-slate-50 focus:ring-emerald-100'
                  }`}
                >
                  <option value="">
                    {groups.length === 0 ? 'No study groups available' : 'Select a study group'}
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {formErrors.groupId ? (
                  <div className="mt-1">
                    <p className="text-xs text-red-600">{formErrors.groupId}</p>
                    {groups.length === 0 && (
                      <button
                        onClick={() => navigate('/groups')}
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-1"
                      >
                        <Users className="h-3 w-3" />
                        Go to Study Groups
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-1">
                    <p className="text-xs text-slate-500">
                      {groups.length === 0 
                        ? 'Create or join a study group to schedule sessions' 
                        : 'Select which study group this session is for'
                      }
                    </p>
                    {groups.length === 0 && (
                      <button
                        onClick={() => navigate('/groups')}
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 mt-1"
                      >
                        <Users className="h-3 w-3" />
                        Go to Study Groups
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={titleId} className="block mb-1 text-sm font-medium text-slate-800">
                  Session title <span className="text-red-500">*</span>
                </label>
                <input
                  id={titleId}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearFieldError('title');
                  }}
                  placeholder="e.g., Algorithm Study Group"
                  required
                  className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                    formErrors.title 
                      ? 'border-red-300 bg-red-50 focus:ring-red-100' 
                      : 'border-slate-300 bg-slate-50 focus:ring-emerald-100'
                  }`}
                />
                {formErrors.title && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.title}</p>
                )}
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
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  id={dateId}
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    clearFieldError('date');
                  }}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                    formErrors.date 
                      ? 'border-red-300 bg-red-50 focus:ring-red-100' 
                      : 'border-slate-300 bg-slate-50 focus:ring-emerald-100'
                  }`}
                />
                {formErrors.date && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.date}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor={locationId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  id={locationId}
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    clearFieldError('location');
                  }}
                  placeholder="e.g., Library Room 204"
                  required
                  className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                    formErrors.location 
                      ? 'border-red-300 bg-red-50 focus:ring-red-100' 
                      : 'border-slate-300 bg-slate-50 focus:ring-emerald-100'
                  }`}
                />
                {formErrors.location && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.location}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor={startTimeId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Start time <span className="text-red-500">*</span>
                </label>
                <input
                  id={startTimeId}
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    clearFieldError('startTime');
                    clearFieldError('endTime'); // Clear end time error too since it depends on start time
                  }}
                  required
                  className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                    formErrors.startTime 
                      ? 'border-red-300 bg-red-50 focus:ring-red-100' 
                      : 'border-slate-300 bg-slate-50 focus:ring-emerald-100'
                  }`}
                />
                {formErrors.startTime && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.startTime}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor={endTimeId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  End time <span className="text-red-500">*</span>
                </label>
                <input
                  id={endTimeId}
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    clearFieldError('endTime');
                  }}
                  required
                  className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                    formErrors.endTime 
                      ? 'border-red-300 bg-red-50 focus:ring-red-100' 
                      : 'border-slate-300 bg-slate-50 focus:ring-emerald-100'
                  }`}
                />
                {formErrors.endTime && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.endTime}</p>
                )}
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

            {formErrors.submit && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-600">{formErrors.submit}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isFormValid}
                className={`rounded-xl px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isFormValid
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting 
                  ? (editingSession ? 'Updating...' : 'Creating...') 
                  : (editingSession ? 'Update session' : 'Create session')
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
