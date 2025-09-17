import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

type StudySession = {
  id: string;
  title: string;
  course?: string;
  courseCode?: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  type: 'study' | 'review' | 'project' | 'exam_prep' | 'discussion';
  participants: number;
  maxParticipants?: number;
};

type ViewMode = 'day' | 'week' | 'month';

export default function Calendar() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Consistent fallback data across the app
  const fallbackSessions: StudySession[] = [
    {
      id: '1',
      title: 'Algorithms Study Group',
      course: 'Data Structures & Algorithms',
      courseCode: 'CS301',
      date: '2025-09-18',
      startTime: '14:00',
      endTime: '16:00',
      location: 'Library Room 204',
      type: 'study',
      participants: 4,
      maxParticipants: 6,
    },
    {
      id: '2',
      title: 'Database Design Workshop', 
      course: 'Database Systems',
      courseCode: 'CS305',
      date: '2025-09-19',
      startTime: '10:00',
      endTime: '12:00',
      location: 'Computer Lab B',
      type: 'project',
      participants: 6,
      maxParticipants: 8,
    },
    {
      id: '3',
      title: 'Linear Algebra Review',
      course: 'Linear Algebra',
      courseCode: 'MATH204',
      date: '2025-09-20',
      startTime: '15:00',
      endTime: '17:00',
      location: 'Study Hall A',
      type: 'review',
      participants: 3,
      maxParticipants: 5,
    },
  ];
      description: 'Exam preparation session',
      scheduled_start: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      scheduled_end: new Date(Date.now() + 172800000 + 5400000).toISOString(), // 1.5 hours later
      location: 'Math Building 301',
      session_type: 'exam_prep',
      status: 'scheduled',
      group_name: 'Math Warriors',
      organizer_name: 'Jane Smith',
    },
  ];

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/groups/sessions');
        if (!res.ok) throw new Error('Failed to fetch sessions');
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        // setError('Failed to load study sessions');
        setSessions(fallbackSessions);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

  const joinSession = async (sessionId: number) => {
    try {
      const res = await fetch(`/api/v1/groups/sessions/${sessionId}/attend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to join session');
      // Refresh sessions
      const updatedRes = await fetch('/api/v1/groups/sessions');
      const updatedData = await updatedRes.json();
      setSessions(updatedData);
    } catch (err) {
      console.error('Error joining session:', err);
    }
  };

  const getSessionsForDate = (date: string) => {
    return sessions.filter(session => 
      new Date(session.scheduled_start).toDateString() === new Date(date).toDateString()
    );
  };

  const getUpcomingWeek = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const getMonthDays = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    
    // Start from the beginning of the week containing the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const currentDate = new Date(startDate);
    
    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
      days.push({
        date: new Date(currentDate),
        isCurrentMonth: currentDate.getMonth() === month,
        isToday: currentDate.toDateString() === now.toDateString(),
        sessions: getSessionsForDate(currentDate.toISOString().split('T')[0])
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Study Calendar</h2>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(['day','week','month'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`px-3 py-1.5 text-sm rounded-md ${view===m ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {m[0].toUpperCase()+m.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setShowScheduleModal(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition">
            <Plus className="w-4 h-4" />
            Schedule Session
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2 mb-4">Showing demo calendar data</div>
      )}

      {loading ? (
        <div className="text-center text-slate-600">Loading calendar...</div>
      ) : view === 'week' ? (
        <div className="flex-1 grid grid-cols-7 gap-3">
          {getUpcomingWeek().map((date) => {
            const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
            const dayNumber = new Date(date).getDate();
            const isToday = date === new Date().toISOString().split('T')[0];
            const daySessions = getSessionsForDate(date);

            return (
              <div key={date} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className={`text-center mb-3 ${isToday ? 'text-brand-600 font-semibold' : 'text-gray-600'}`}>
                  <div className="text-xs">{dayName}</div>
                  <div className={`text-lg ${isToday ? 'bg-brand-100 rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}`}>
                    {dayNumber}
                  </div>
                </div>
                
                <div className="space-y-2">
                  {daySessions.map(session => (
                    <button onClick={() => navigate('/sessions')} key={session.session_id} className={`w-full text-left p-2 rounded text-xs border-l-2 ${
                      session.session_type === 'exam_prep' ? 'border-red-400 bg-red-50' :
                      session.session_type === 'project' ? 'border-blue-400 bg-blue-50' :
                      'border-green-400 bg-green-50'
                    }`}>
                      <div className="font-medium text-gray-900 truncate">{session.session_title}</div>
                      <div className="text-gray-600 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {new Date(session.scheduled_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      {session.location && (
                        <div className="text-gray-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{session.location}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === 'day' ? (
        <div className="flex-1 space-y-3">
          {getSessionsForDate(selectedDate).length === 0 ? (
            <div className="text-gray-500 text-sm">No sessions for selected day</div>
          ) : (
            getSessionsForDate(selectedDate).map(session => (
              <div key={session.session_id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  {new Date(session.scheduled_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  -
                  {new Date(session.scheduled_end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
                <div className="mt-1 font-medium text-gray-900">{session.session_title}</div>
                {session.location && (
                  <div className="text-sm text-gray-600 flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {session.location}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1">
          {/* Month header */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">{day}</div>
            ))}
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-7 gap-2">
            {getMonthDays().map((day, i) => (
              <div key={i} className={`rounded-md border p-2 h-24 ${
                day.isCurrentMonth ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
              } ${day.isToday ? 'ring-2 ring-brand-200' : ''}`}>
                <div className={`text-sm ${day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'} ${day.isToday ? 'font-semibold' : ''}`}>
                  {day.date.getDate()}
                </div>
                {day.sessions.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {day.sessions.slice(0, 2).map(session => (
                      <button
                        key={session.session_id}
                        onClick={() => navigate('/sessions')}
                        className="w-full text-left text-xs p-1 rounded bg-brand-100 text-brand-700 truncate"
                      >
                        {session.session_title}
                      </button>
                    ))}
                    {day.sessions.length > 2 && (
                      <div className="text-xs text-gray-500">+{day.sessions.length - 2} more</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Sessions - show in Week and Day views, not Month */}
      {(view === 'week' || view === 'day') && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Today's Sessions</h3>
          {getSessionsForDate(new Date().toISOString().split('T')[0]).length === 0 ? (
            <p className="text-gray-500 text-sm">No sessions scheduled for today</p>
          ) : (
            <div className="space-y-3">
              {getSessionsForDate(new Date().toISOString().split('T')[0]).map(session => (
                <div key={session.session_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">{session.session_title}</h4>
                    <p className="text-sm text-gray-600">
                      {new Date(session.scheduled_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                      {new Date(session.scheduled_end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                    {session.location && <p className="text-sm text-gray-500">{session.location}</p>}
                  </div>
                  <button 
                    onClick={() => joinSession(session.session_id)}
                    className="px-3 py-1 bg-brand-500 text-white text-sm rounded hover:bg-brand-600 transition"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ScheduleSessionModal 
        open={showScheduleModal} 
        onClose={() => setShowScheduleModal(false)}
        onSchedule={(sessionData) => {
          // Add the new session optimistically
          setSessions(prev => [...prev, {
            session_id: Date.now(), // temporary ID
            group_id: 1,
            organizer_id: 1,
            session_title: sessionData.title,
            description: sessionData.description,
            scheduled_start: sessionData.startTime,
            scheduled_end: sessionData.endTime,
            location: sessionData.location,
            session_type: sessionData.type,
            status: 'scheduled',
            group_name: 'Your Group',
            organizer_name: 'You'
          }]);
          setShowScheduleModal(false);
        }}
      />
    </div>
  );
}

function ScheduleSessionModal({ 
  open, 
  onClose, 
  onSchedule 
}: { 
  open: boolean; 
  onClose: () => void; 
  onSchedule: (data: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    location: string;
    type: 'study' | 'review' | 'project' | 'exam_prep' | 'discussion';
  }) => void;
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    location: '',
    type: 'study' as const
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSchedule(formData);
    setFormData({
      title: '',
      description: '',
      startTime: '',
      endTime: '',
      location: '',
      type: 'study'
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Schedule Study Session</h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., Data Structures Review"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                rows={2}
                placeholder="Optional description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="datetime-local"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., Library Room 204"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="study">Study</option>
                <option value="review">Review</option>
                <option value="project">Project</option>
                <option value="exam_prep">Exam Prep</option>
                <option value="discussion">Discussion</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600"
              >
                Schedule
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
