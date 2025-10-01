import { useState, useEffect } from 'react';
import {
  Clock,
  MapPin,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { navigate } from '../router';
import { DataService, type StudySession } from '../services/dataService';
import { buildApiUrl } from '../utils/url';

type SessionWithOwner = StudySession & { isGroupOwner?: boolean };

export default function UpcomingSessions() {
  const [sessions, setSessions] = useState<SessionWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helpers
  const toDateTime = (s: StudySession) => {
    const t = s.startTime ? s.startTime : '00:00';
    return new Date(`${s.date}T${t}:00`);
  };

  const filterUpcomingNext7Days = (list: SessionWithOwner[]) => {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return list
      .filter(
        (s) =>
          (s.status ?? 'upcoming') === 'upcoming' &&
          toDateTime(s) >= now &&
          toDateTime(s) <= nextWeek
      )
      .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime());
  };

  useEffect(() => {
    let mounted = true;

    async function fetchUpcomingSessions() {
      setLoading(true);
      setError(null);
      try {
        const allSessions = await DataService.fetchSessions();
        const upcoming = filterUpcomingNext7Days(allSessions as SessionWithOwner[]);
        if (!mounted) return;
        setSessions(upcoming);
      } catch (err) {
        console.error('Failed to fetch upcoming sessions:', err);
        if (mounted) setError('Failed to load upcoming sessions');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchUpcomingSessions();

    // When any session is created elsewhere, include it here if it matches our window
    const onCreated = (e: Event) => {
      const detail = (e as CustomEvent<SessionWithOwner>).detail;
      if (!detail) return;

      const maybe = filterUpcomingNext7Days([detail]);
      if (maybe.length === 0) return;

      setSessions((prev) => {
        if (prev.some((s) => s.id === detail.id)) return prev;
        return [...prev, ...maybe].sort(
          (a, b) => toDateTime(a).getTime() - toDateTime(b).getTime()
        );
      });
    };

    // Optional invalidation hook if you broadcast it anywhere
    const onInvalidate = async () => {
      try {
        const all = await DataService.fetchSessions();
        setSessions(filterUpcomingNext7Days(all as SessionWithOwner[]));
      } catch {
        // keep current list
      }
    };

    window.addEventListener('session:created', onCreated as EventListener);
    window.addEventListener('sessions:invalidate', onInvalidate);

    return () => {
      mounted = false;
      window.removeEventListener('session:created', onCreated as EventListener);
      window.removeEventListener('sessions:invalidate', onInvalidate);
    };
  }, []);

  // --- Attend / Leave (optimistic, mirrors Sessions.tsx) ---
  const handleAttend = async (sessionId: string) => {
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
        if ([409, 403, 404].includes(res.status)) {
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
          console.warn('Attend failed (keeping optimistic state for local testing):', res.status);
        }
      }
    } catch (err) {
      console.warn('Attend request error (keeping optimistic state):', err);
    }
  };

  const handleLeave = async (sessionId: string) => {
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
        if ([400, 403, 404].includes(res.status)) {
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
        } else {
          console.warn('Leave failed (keeping optimistic state for local testing):', res.status);
        }
      }
    } catch (err) {
      console.warn('Leave request error (keeping optimistic state):', err);
    }
  };

  // --- Cancel (organizer only) ---
  const handleCancel = async (sessionId: string) => {
    // Optimistic removal from upcoming list
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    try {
      const res = await fetch(buildApiUrl(`/api/v1/sessions/${sessionId}`), {
        method: 'DELETE', // backend treats as soft cancel -> status='cancelled'
        headers: authHeadersJSON(),
      });
      if (!res.ok) {
        console.warn('Cancel failed:', res.status);
      }
    } catch (err) {
      console.warn('Cancel request error:', err);
    } finally {
      // Re-sync other widgets (Calendar, etc.)
      window.dispatchEvent(new Event('sessions:invalidate'));
    }
  };

  const getTimeUntilSession = (session: StudySession) => {
    const now = new Date();
    const when = toDateTime(session);
    const diffMs = when.getTime() - now.getTime();

    if (diffMs <= 0) return 'Starting soon';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours >= 24) return `${Math.floor(diffHours / 24)} days`;
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    return `${diffMins}m`;
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case 'exam_prep':
        return 'text-red-600 bg-red-100';
      case 'project':
        return 'text-blue-600 bg-blue-100';
      case 'review':
        return 'text-yellow-600 bg-yellow-100';
      case 'discussion':
        return 'text-purple-600 bg-purple-100';
      default:
        return 'text-green-600 bg-green-100';
    }
  };

  const getAttendanceStatusIcon = (status?: string) => {
    switch (status) {
      case 'upcoming':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'ongoing':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const openCalendarScheduleModal = () => {
    window.dispatchEvent(new CustomEvent('calendar:openSchedule'));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Upcoming Sessions</h2>
        <span className="text-sm text-gray-500">{sessions.length} sessions this week</span>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2 mb-4">
          Showing demo session data
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-600">Loading upcoming sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <Calendar className="w-12 h-12 mb-4" />
          <h3 className="text-lg font-medium mb-2">No upcoming sessions</h3>
          <p className="text-sm text-center mb-4">
            You don't have any study sessions scheduled for the next week.
          </p>
          <button
            onClick={openCalendarScheduleModal}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
          >
            Schedule a Session
          </button>
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {sessions.map((session) => {
            const canAttend =
              !session.isCreator &&
              !session.isAttending &&
              (session.status ?? 'upcoming') === 'upcoming' &&
              (session.participants || 0) < (session.maxParticipants || 10);

            const canLeave =
              !session.isCreator &&
              !!session.isAttending &&
              (session.status ?? 'upcoming') === 'upcoming' &&
              !session.isCreator; // organizer cannot leave (backend will 400)

            return (
              <div
                key={session.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getSessionTypeColor(
                          session.type
                        )}`}
                      >
                        {session.type.replace('_', ' ').toUpperCase()}
                      </span>
                      {session.isCreator ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                          Organizer
                        </span>
                      ) : session.isAttending ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                          Attending
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>
                          {new Date(session.date).toLocaleDateString()} at {session.startTime}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>
                          {session.participants}
                          {session.maxParticipants ? ` / ${session.maxParticipants}` : ''}{' '}
                          participants
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{session.location}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-brand-600 font-medium">
                          {getTimeUntilSession(session)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getAttendanceStatusIcon(session.status)}
                    <span className="text-sm text-gray-600 capitalize">
                      {session.status || 'upcoming'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="text-sm text-gray-500">
                    {session.course && `Course: ${session.course}`}
                  </div>

                  <div className="flex gap-2">
                    {(session.status ?? 'upcoming') === 'upcoming' && (
                      <>
                        {session.isCreator ? (
                          <button
                            onClick={() => handleCancel(session.id)}
                            className="p-2 rounded border border-red-200 text-red-600 hover:bg-red-50 transition"
                            title="Cancel session"
                            aria-label="Cancel session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            {canAttend && (
                              <button
                                onClick={() => handleAttend(session.id)}
                                className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition"
                              >
                                Attend
                              </button>
                            )}
                            {canLeave && (
                              <button
                                onClick={() => handleLeave(session.id)}
                                className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition"
                              >
                                Leave
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => navigate('/sessions')}
                      className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------- helpers ----------------- */

function authHeadersJSON(): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json');
  const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (raw) {
    let t: string = raw;
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
