import { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  Clock, 
  Target, 
  Award,
  Bell,
  Plus
} from 'lucide-react';
import { azureService, type StudyPartner, type StudyGroup, type StudySession, type ProgressData, type NotificationData } from '../services/azureIntegrationService';

interface DashboardStats {
  totalStudyHours: number;
  activeGroups: number;
  upcomingSessions: number;
  completedTopics: number;
  currentStreak: number;
  weeklyGoal: number;
  weeklyProgress: number;
  partnerMatches: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalStudyHours: 0,
    activeGroups: 0,
    upcomingSessions: 0,
    completedTopics: 0,
    currentStreak: 0,
    weeklyGoal: 20,
    weeklyProgress: 0,
    partnerMatches: 0,
  });
  
  const [upcomingSessions, setUpcomingSessions] = useState<StudySession[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [recommendedPartners, setRecommendedPartners] = useState<StudyPartner[]>([]);
  const [myGroups, setMyGroups] = useState<StudyGroup[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'week' | 'month' | 'semester'>('week');

  useEffect(() => {
    loadDashboardData();
    
    // Setup real-time updates
    const unsubscribeNotifications = azureService.onConnectionEvent('notification', (notification: any) => {
      setNotifications(prev => [notification.data, ...prev].slice(0, 10));
      updateStatsFromNotification(notification);
    });

    const unsubscribeGroupUpdates = azureService.onConnectionEvent('group_update', (update: any) => {
      if (update.type === 'member_joined' || update.type === 'session_created') {
        loadGroupsAndSessions();
      }
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeGroupUpdates();
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load all data in parallel
      const [
        progress,
        sessions,
        groups,
        partners,
        notifications,
        matches
      ] = await Promise.allSettled([
        azureService.getProgressData({ timeframe: selectedTimeframe }),
        azureService.getStudySessions({ 
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }),
        azureService.getMyGroups(),
        azureService.getPartnerRecommendations(5),
        azureService.getNotifications({ limit: 10, isRead: false }),
        azureService.getPartnerMatches('pending')
      ]);

      // Process results
      if (progress.status === 'fulfilled') {
        updateStatsFromProgress(progress.value);
      }

      if (sessions.status === 'fulfilled') {
        setUpcomingSessions(sessions.value);
        setStats(prev => ({ ...prev, upcomingSessions: sessions.value.length }));
      }

      if (groups.status === 'fulfilled') {
        setMyGroups(groups.value);
        setStats(prev => ({ ...prev, activeGroups: groups.value.length }));
      }

      if (partners.status === 'fulfilled') {
        setRecommendedPartners(partners.value);
      }

      if (notifications.status === 'fulfilled') {
        setNotifications(notifications.value);
      }

      if (matches.status === 'fulfilled') {
        setStats(prev => ({ ...prev, partnerMatches: matches.value.length }));
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupsAndSessions = async () => {
    try {
      const [groups, sessions] = await Promise.all([
        azureService.getMyGroups(),
        azureService.getStudySessions({ 
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
      ]);
      
      setMyGroups(groups);
      setUpcomingSessions(sessions);
      setStats(prev => ({ 
        ...prev, 
        activeGroups: groups.length,
        upcomingSessions: sessions.length 
      }));
    } catch (error) {
      console.error('Error loading groups and sessions:', error);
    }
  };

  const updateStatsFromProgress = (progressData: ProgressData[]) => {
    const totalHours = progressData.reduce((sum, p) => sum + p.progress.totalStudyHours, 0);
    const totalCompleted = progressData.reduce((sum, p) => sum + p.progress.completedTopics, 0);
    const currentStreak = Math.max(...progressData.map(p => p.progress.currentStreak), 0);
    const weeklyProgress = progressData.reduce((sum, p) => sum + p.progress.weeklyProgress, 0);

    setStats(prev => ({
      ...prev,
      totalStudyHours: totalHours,
      completedTopics: totalCompleted,
      currentStreak,
      weeklyProgress,
    }));
  };

  const updateStatsFromNotification = (notification: any) => {
    if (notification.type === 'partner_request') {
      setStats(prev => ({ ...prev, partnerMatches: prev.partnerMatches + 1 }));
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your study progress overview.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="semester">This Semester</option>
          </select>
          
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4 mr-2" />
            Quick Actions
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Study Hours</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudyHours}h</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Target className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Weekly Progress</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.weeklyProgress}/{stats.weeklyGoal}h
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((stats.weeklyProgress / stats.weeklyGoal) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Groups</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeGroups}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Award className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Study Streak</p>
              <p className="text-2xl font-bold text-gray-900">{stats.currentStreak} days</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Sessions & Groups */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Sessions */}
          <div className="bg-white rounded-xl shadow-card border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Upcoming Sessions</h3>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View All
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {upcomingSessions.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">No upcoming sessions</p>
                  <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    Schedule a session
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingSessions.slice(0, 3).map((session) => (
                    <div key={session.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-semibold">
                        {session.moduleCode.slice(0, 2)}
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{session.title}</h4>
                        <p className="text-sm text-gray-600">{session.moduleCode} • {formatDuration(session.duration)}</p>
                        <p className="text-sm text-blue-600">
                          {new Date(session.scheduledAt).toLocaleDateString()} at {new Date(session.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-sm text-gray-600">{session.attendees.length} attendees</p>
                        <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                          Join
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* My Groups */}
          <div className="bg-white rounded-xl shadow-card border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">My Study Groups</h3>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  Browse Groups
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {myGroups.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">No active groups</p>
                  <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    Join a group
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myGroups.slice(0, 4).map((group) => (
                    <div key={group.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                          {group.moduleCode.slice(0, 2)}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{group.name}</h4>
                          <p className="text-sm text-gray-600">{group.moduleCode}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{group.memberCount} members</span>
                        <span className="text-green-600 font-medium">Active</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Notifications & Recommendations */}
        <div className="space-y-6">
          {/* Notifications */}
          <div className="bg-white rounded-xl shadow-card border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </h3>
                {notifications.length > 0 && (
                  <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">
                    {notifications.length}
                  </span>
                )}
              </div>
            </div>
            
            <div className="p-6">
              {notifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">No new notifications</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.slice(0, 5).map((notification) => (
                    <div key={notification.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(notification.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recommended Partners */}
          <div className="bg-white rounded-xl shadow-card border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Recommended Partners</h3>
            </div>
            
            <div className="p-6">
              {recommendedPartners.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">No recommendations yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendedPartners.slice(0, 3).map((partner) => (
                    <div key={partner.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {partner.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{partner.name}</h4>
                        <p className="text-sm text-gray-600">{partner.major} • {partner.year}</p>
                        <p className="text-sm text-green-600">{Math.round(partner.compatibilityScore * 100)}% match</p>
                      </div>
                      
                      <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
