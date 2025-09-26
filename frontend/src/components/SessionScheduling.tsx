import { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Users,
  MapPin,
  Video,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  
} from 'lucide-react';
import { azureService, type StudySession, type StudyGroup } from '../services/azureIntegrationService';

interface SessionSchedulingProps {
  selectedGroupId?: number;
  onSessionCreated?: (session: StudySession) => void;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  sessions: StudySession[];
}

interface CreateSessionForm {
  title: string;
  description: string;
  moduleCode: string;
  groupId: string;
  scheduledAt: string;
  duration: number;
  location: string;
  isOnline: boolean;
  meetingUrl: string;
  maxParticipants: number;
  isRecurring: boolean;
  recurrenceType: 'daily' | 'weekly' | 'monthly';
  recurrenceEnd: string;
  agenda: string;
  materials: string[];
}

export default function SessionScheduling({ selectedGroupId, onSessionCreated }: SessionSchedulingProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  // Track date selection for potential future use
  // Note: selectedDate reserved for future interactions
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState<CreateSessionForm>({
    title: '',
    description: '',
    moduleCode: '',
  groupId: selectedGroupId ? String(selectedGroupId) : '',
    scheduledAt: '',
    duration: 60,
    location: '',
    isOnline: false,
    meetingUrl: '',
    maxParticipants: 10,
    isRecurring: false,
    recurrenceType: 'weekly',
    recurrenceEnd: '',
    agenda: '',
    materials: []
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');

  useEffect(() => {
    loadData();
    generateCalendarDays();
    
    // Subscribe to real-time session updates
    const unsubscribe = azureService.onConnectionEvent('session_update', (update: any) => {
      handleSessionUpdate(update);
    });

    return () => unsubscribe();
  }, [currentDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const [sessionsData, groupsData] = await Promise.all([
        azureService.getStudySessions({
          startDate: startOfMonth.toISOString(),
          endDate: endOfMonth.toISOString(),
          limit: 100
        }),
        azureService.getMyGroups()
      ]);
      
      setSessions(sessionsData);
      setGroups(groupsData);
      
    } catch (error) {
      console.error('Error loading session data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
  // const lastDay = new Date(year, month + 1, 0);
    const startCalendar = new Date(firstDay);
    startCalendar.setDate(firstDay.getDate() - firstDay.getDay()); // Start from Sunday
    
    const days: CalendarDay[] = [];
    const today = new Date();
    
    for (let i = 0; i < 42; i++) { // 6 weeks x 7 days
      const date = new Date(startCalendar);
      date.setDate(startCalendar.getDate() + i);
      
      const isCurrentMonth = date.getMonth() === month;
      const isToday = date.toDateString() === today.toDateString();
      const daySessions = sessions.filter(session => {
        const sessionDate = new Date(session.scheduledAt);
        return sessionDate.toDateString() === date.toDateString();
      });
      
      days.push({
        date,
        isCurrentMonth,
        isToday,
        sessions: daySessions
      });
    }
    
    setCalendarDays(days);
  };

  const handleSessionUpdate = (update: any) => {
    switch (update.type) {
      case 'session_created':
      case 'session_updated':
      case 'session_cancelled':
        loadData();
        break;
      case 'participant_joined':
      case 'participant_left':
        if (selectedSession?.id === update.sessionId) {
          loadSessionDetails(update.sessionId);
        }
        break;
    }
  };

  const loadSessionDetails = async (sessionId: number) => {
    try {
      const session = await azureService.getSessionDetails(sessionId);
      setSelectedSession(session);
    } catch (error) {
      console.error('Error loading session details:', error);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
  // use 0 sentinel for create action
  setActionLoading(0);
      
      const locationObj = createForm.isOnline
        ? { type: 'online' as const, details: createForm.meetingUrl ? 'Online meeting' : 'Online', meetingUrl: createForm.meetingUrl || undefined }
        : { type: 'campus' as const, details: createForm.location };

      const newSession = await azureService.createSession({
        title: createForm.title,
        description: createForm.description,
        moduleCode: createForm.moduleCode,
        groupId: createForm.groupId ? Number.parseInt(createForm.groupId, 10) : undefined,
        scheduledAt: new Date(createForm.scheduledAt).toISOString(),
        duration: createForm.duration,
        location: locationObj,
        agenda: createForm.agenda
          ? createForm.agenda.split('\n').filter(Boolean).map(text => ({ topic: text, duration: 15, resources: [] }))
          : [],
        goals: [],
      });
      
      setSessions(prev => [...prev, newSession]);
      setShowCreateModal(false);
      resetCreateForm();
      onSessionCreated?.(newSession);
      
    } catch (error) {
      console.error('Error creating session:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJoinSession = async (sessionId: number) => {
    try {
      setActionLoading(sessionId);
      
      await azureService.joinSession(sessionId);
      // Re-fetch session details to maintain type integrity
      const updated = await azureService.getSessionDetails(sessionId);
      setSessions(prev => prev.map(s => (s.id === sessionId ? updated : s)));
      
    } catch (error) {
      console.error('Error joining session:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      title: '',
      description: '',
      moduleCode: '',
    groupId: selectedGroupId ? String(selectedGroupId) : '',
      scheduledAt: '',
      duration: 60,
      location: '',
      isOnline: false,
      meetingUrl: '',
      maxParticipants: 10,
      isRecurring: false,
      recurrenceType: 'weekly',
      recurrenceEnd: '',
      agenda: '',
      materials: []
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const getSessionColor = (session: StudySession) => {
    const now = new Date();
    const sessionTime = new Date(session.scheduledAt);
    const endTime = new Date(sessionTime.getTime() + session.duration * 60 * 1000);
    
    if (now > endTime) return 'bg-gray-100 text-gray-600 border-gray-200';
    if (now >= sessionTime && now <= endTime) return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = searchQuery === '' || 
      session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.moduleCode.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesModule = filterModule === 'all' || session.moduleCode === filterModule;
    
    return matchesSearch && matchesModule;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Session Scheduling
          </h1>
          <p className="text-gray-600">Schedule and manage your study sessions</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Schedule Session
        </button>
      </div>

      {/* View Mode and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                viewMode === mode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Modules</option>
            {Array.from(new Set(sessions.map(s => s.moduleCode))).map(module => (
              <option key={module} value={module}>{module}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
              >
                Today
              </button>
              
              <button
                onClick={() => navigateMonth('next')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-3 text-center text-sm font-medium text-gray-600">
                {day}
              </div>
            ))}
            
            {/* Calendar Days */}
              {calendarDays.map((day, index) => (
              <div
                key={index}
                className={`min-h-[120px] p-2 border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  !day.isCurrentMonth ? 'text-gray-300 bg-gray-50' : ''
                } ${day.isToday ? 'bg-blue-50 border-blue-200' : ''} ${selectedDate && day.date.toDateString() === selectedDate.toDateString() ? 'ring-2 ring-blue-400' : ''}`}
                onClick={() => setSelectedDate(day.date)}
              >
                <div className={`text-sm font-medium mb-1 ${day.isToday ? 'text-blue-600' : ''}`}>
                  {day.date.getDate()}
                </div>
                
                <div className="space-y-1">
                  {day.sessions.slice(0, 3).map((session) => (
                    <div
                      key={session.id}
                      className={`p-1 rounded text-xs border ${getSessionColor(session)} cursor-pointer hover:opacity-80`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSession(session);
                      }}
                    >
                      <div className="font-medium truncate">{session.title}</div>
                      <div className="text-xs opacity-75">{formatTime(session.scheduledAt)}</div>
                    </div>
                  ))}
                  
                  {day.sessions.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{day.sessions.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Sessions List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Sessions</h3>
        </div>
        
        <div className="p-6">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions found</h3>
              <p className="text-gray-600 mb-4">Schedule your first study session to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Schedule Session
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions
                .filter(session => new Date(session.scheduledAt) > new Date())
                .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                .slice(0, 10)
                .map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border hover:shadow-md transition-all cursor-pointer ${getSessionColor(session)}`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-semibold">
                          {session.moduleCode.slice(0, 2)}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900">{session.title}</h4>
                            {session.isOnline && (
                              <Video className="w-4 h-4 text-blue-600" />
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-2">{session.moduleCode}</p>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(session.scheduledAt).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {formatTime(session.scheduledAt)} ({formatDuration(session.duration)})
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {session.attendees.length} attending
                            </span>
                            {!session.isOnline && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {session.location.details}
                              </span>
                            )}
                          </div>
                          
                          {session.description && (
                            <p className="text-sm text-gray-700 mt-2 line-clamp-2">{session.description}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!session.attendees.some(a => a.id === azureService['currentUser']?.id) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJoinSession(session.id);
                            }}
                            disabled={actionLoading === session.id}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm flex items-center gap-1"
                          >
                            {actionLoading === session.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Users className="w-4 h-4" />
                            )}
                            Join
                          </button>
                        )}
                        
                        <button className="text-gray-400 hover:text-gray-600 transition-colors">
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Schedule Session</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleCreateSession} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Algorithm Study Session"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Module Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.moduleCode}
                    onChange={(e) => setCreateForm({ ...createForm, moduleCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., CS101"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Study Group (Optional)
                  </label>
                  <select
                    value={createForm.groupId}
                    onChange={(e) => setCreateForm({ ...createForm, groupId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No group (open session)</option>
                    {groups.map(group => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={createForm.scheduledAt}
                      onChange={(e) => setCreateForm({ ...createForm, scheduledAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duration (minutes)
                    </label>
                    <select
                      value={createForm.duration}
                      onChange={(e) => setCreateForm({ ...createForm, duration: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                      <option value={180}>3 hours</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.isOnline}
                      onChange={(e) => setCreateForm({ ...createForm, isOnline: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Online session</span>
                  </label>
                </div>
                
                {createForm.isOnline ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Meeting URL
                    </label>
                    <input
                      type="url"
                      value={createForm.meetingUrl}
                      onChange={(e) => setCreateForm({ ...createForm, meetingUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="https://zoom.us/j/..."
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      value={createForm.location}
                      onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Library, Room 123"
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="What will you be studying?"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === 0}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading === 0 ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Calendar className="w-4 h-4" />
                    )}
                    Schedule
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold text-gray-900">{selectedSession.title}</h2>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Session details content would go here */}
              <div className="space-y-4">
                <div>
                  <span className="text-sm font-medium text-gray-700">Module:</span>
                  <p className="text-gray-900">{selectedSession.moduleCode}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-700">Date & Time:</span>
                  <p className="text-gray-900">
                    {new Date(selectedSession.scheduledAt).toLocaleDateString()} at{' '}
                    {formatTime(selectedSession.scheduledAt)} ({formatDuration(selectedSession.duration)})
                  </p>
                </div>
                
                {selectedSession.description && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Description:</span>
                    <p className="text-gray-900">{selectedSession.description}</p>
                  </div>
                )}
                
                <div>
                  <span className="text-sm font-medium text-gray-700">Attendees:</span>
                  <p className="text-gray-900">{selectedSession.attendees.length} participants</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}