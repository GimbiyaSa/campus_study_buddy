import { useState, useEffect } from 'react';
import { Clock, MapPin, Users, Calendar, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { navigate } from '../router';
import { DataService, type StudySession } from '../services/dataService';

export default function UpcomingSessions() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUpcomingSessions() {
      setLoading(true);
      setError(null);
      try {
        const allSessions = await DataService.fetchSessions();
        
        // Filter for upcoming sessions (next 7 days)
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const upcomingSessions = allSessions.filter((session: StudySession) => {
          const sessionDate = new Date(session.date);
          return sessionDate >= now && sessionDate <= nextWeek && session.status === 'upcoming';
        });
        
        setSessions(upcomingSessions);
      } catch (err) {
        console.error('Failed to fetch upcoming sessions:', err);
        setError('Failed to load upcoming sessions');
      } finally {
        setLoading(false);
      }
    }
    fetchUpcomingSessions();
  }, []);

  const updateAttendance = async (sessionId: string, status: string) => {
    // optimistic update
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: status as any } : s));
    try {
      await fetch(`/api/v1/groups/sessions/${sessionId}/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_status: status }),
      });
    } catch (err) {
      // revert on error
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'upcoming' } : s));
      console.error('Error updating attendance:', err);
    }
  };

  const getTimeUntilSession = (sessionDate: string) => {
    const now = new Date();
    const sessionTime = new Date(sessionDate);
    const diffMs = sessionTime.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Starting soon';
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 24) {
      return `${Math.floor(diffHours / 24)} days`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m`;
    } else {
      return `${diffMins}m`;
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case 'exam_prep': return 'text-red-600 bg-red-100';
      case 'project': return 'text-blue-600 bg-blue-100';
      case 'review': return 'text-yellow-600 bg-yellow-100';
      case 'discussion': return 'text-purple-600 bg-purple-100';
      default: return 'text-green-600 bg-green-100';
    }
  };

  const getAttendanceStatusIcon = (status?: string) => {
    switch (status) {
      case 'upcoming': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'ongoing': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
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
        <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2 mb-4">Showing demo session data</div>
      )}

      {loading ? (
        <div className="text-center text-slate-600">Loading upcoming sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <Calendar className="w-12 h-12 mb-4" />
          <h3 className="text-lg font-medium mb-2">No upcoming sessions</h3>
          <p className="text-sm text-center mb-4">You don't have any study sessions scheduled for the next week.</p>
          <button className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition">
            Schedule a Session
          </button>
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {sessions.map(session => (
            <div key={session.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSessionTypeColor(session.type)}`}>
                      {session.type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>
                        {new Date(session.date).toLocaleDateString()} at{' '}
                        {session.startTime}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{session.participants} participants</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{session.location}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-brand-600 font-medium">
                        {getTimeUntilSession(session.date)}
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
                  {session.status === 'upcoming' && (
                    <>
                      <button
                        onClick={() => updateAttendance(session.id, 'ongoing')}
                        className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition"
                      >
                        Join Session
                      </button>
                      <button
                        onClick={() => updateAttendance(session.id, 'cancelled')}
                        className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  
                  <button onClick={() => navigate('/sessions')} className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
