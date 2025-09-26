import { useState, useEffect } from 'react';
import { TrendingUp, Target, Clock, Award, BookOpen, BarChart3, PieChart, Download, Loader2, Trophy, Flame, Zap } from 'lucide-react';
import { azureService, type ProgressData, type StudySession, type Achievement } from '../services/azureIntegrationService';

interface ProgressStats {
  totalStudyHours: number;
  weeklyHours: number;
  monthlyHours: number;
  currentStreak: number;
  longestStreak: number;
  completedTopics: number;
  totalTopics: number;
  averageSessionLength: number;
  goalProgress: number;
  weeklyGoal: number;
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }[];
}

export default function ProgressTracking() {
  const [stats, setStats] = useState<ProgressStats>({
    totalStudyHours: 0,
    weeklyHours: 0,
    monthlyHours: 0,
    currentStreak: 0,
    longestStreak: 0,
    completedTopics: 0,
    totalTopics: 0,
    averageSessionLength: 0,
    goalProgress: 0,
    weeklyGoal: 20
  });

  // Progress data used transiently to compute stats and charts
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  
  const [selectedTimeframe, setSelectedTimeframe] = useState<'week' | 'month' | 'semester'>('week');
  const [selectedModule] = useState<string>('all');
  // chartType reserved for future chart switching UX
  // const [chartType] = useState<'hours' | 'sessions' | 'topics'>('hours');
  const [loading, setLoading] = useState(true);

  const [weeklyChartData, setWeeklyChartData] = useState<ChartData | null>(null);
  const [moduleChartData, setModuleChartData] = useState<ChartData | null>(null);
  const [timeDistributionData, setTimeDistributionData] = useState<ChartData | null>(null);

  useEffect(() => {
    loadProgressData();
    
    // Subscribe to real-time progress updates
    const unsubscribe = azureService.onConnectionEvent('progress_update', (update: any) => {
      if (update.type === 'session_completed' || update.type === 'goal_achieved') {
        loadProgressData();
      }
    });

    return () => unsubscribe();
  }, [selectedTimeframe, selectedModule]);

  const loadProgressData = async () => {
    try {
      setLoading(true);
      
      // Load all progress data
      const [
        progressResponse,
        sessionsResponse,
        achievementsResponse
      ] = await Promise.all([
        azureService.getProgressData({ 
          timeframe: selectedTimeframe,
          moduleCode: selectedModule !== 'all' ? selectedModule : undefined
        }),
        azureService.getStudySessions({ 
          startDate: getStartDate(selectedTimeframe).toISOString(),
          endDate: new Date().toISOString(),
          limit: 50
        }),
        azureService.getUserAchievements()
      ]);
      
      setRecentSessions(sessionsResponse);
      setAchievements(achievementsResponse);
      
      // Calculate stats
  calculateStats(progressResponse, sessionsResponse);
      
      // Generate chart data
  generateChartData(progressResponse, sessionsResponse);
      
    } catch (error) {
      console.error('Error loading progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = (timeframe: string) => {
    const now = new Date();
    switch (timeframe) {
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'semester':
        return new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  };

  const calculateStats = (progress: ProgressData[], sessions: StudySession[]) => {
    const totalHours = progress.reduce((sum, p) => sum + p.progress.totalStudyHours, 0);
    const weeklyHours = progress.reduce((sum, p) => sum + p.progress.weeklyProgress, 0);
    const monthlyHours = progress.reduce((sum, p) => sum + p.progress.monthlyProgress, 0);
    const completedTopics = progress.reduce((sum, p) => sum + p.progress.completedTopics, 0);
    const totalTopics = progress.reduce((sum, p) => sum + p.progress.totalTopics, 0);
    
    const currentStreak = Math.max(...progress.map(p => p.progress.currentStreak), 0);
    const longestStreak = Math.max(...progress.map(p => p.progress.longestStreak), 0);
    
    const avgSessionLength = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length
      : 0;

    const weeklyGoal = 20; // This could come from user settings
    const goalProgress = (weeklyHours / weeklyGoal) * 100;

    setStats({
      totalStudyHours: totalHours,
      weeklyHours,
      monthlyHours,
      currentStreak,
      longestStreak,
      completedTopics,
      totalTopics,
      averageSessionLength: avgSessionLength,
      goalProgress,
      weeklyGoal
    });
  };

  const generateChartData = (progress: ProgressData[], sessions: StudySession[]) => {
    // Weekly hours chart
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyHours = new Array(7).fill(0);
    
    sessions.forEach(session => {
      const dayOfWeek = new Date(session.scheduledAt).getDay();
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday = 0 to Sunday = 6
      weeklyHours[adjustedDay] += session.duration / 60; // Convert minutes to hours
    });
    
    setWeeklyChartData({
      labels: weekDays,
      datasets: [{
        label: 'Study Hours',
        data: weeklyHours,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2
      }]
    });

    // Module distribution chart
    const moduleHours = new Map<string, number>();
    progress.forEach(p => {
      const existing = moduleHours.get(p.moduleCode) || 0;
      moduleHours.set(p.moduleCode, existing + p.progress.totalStudyHours);
    });
    
    const moduleLabels = Array.from(moduleHours.keys());
    const moduleData = Array.from(moduleHours.values());
    const colors = [
      'rgba(239, 68, 68, 0.8)',
      'rgba(34, 197, 94, 0.8)',
      'rgba(59, 130, 246, 0.8)',
      'rgba(168, 85, 247, 0.8)',
      'rgba(245, 101, 101, 0.8)',
      'rgba(52, 211, 153, 0.8)'
    ];
    
    setModuleChartData({
      labels: moduleLabels,
      datasets: [{
        label: 'Hours per Module',
        data: moduleData,
        backgroundColor: colors.slice(0, moduleLabels.length)
      }]
    });

    // Time distribution (morning, afternoon, evening, night)
    const timeSlots = ['Morning (6-12)', 'Afternoon (12-18)', 'Evening (18-22)', 'Night (22-6)'];
    const timeDistribution = [0, 0, 0, 0];
    
    sessions.forEach(session => {
      const hour = new Date(session.scheduledAt).getHours();
      if (hour >= 6 && hour < 12) timeDistribution[0] += session.duration / 60;
      else if (hour >= 12 && hour < 18) timeDistribution[1] += session.duration / 60;
      else if (hour >= 18 && hour < 22) timeDistribution[2] += session.duration / 60;
      else timeDistribution[3] += session.duration / 60;
    });
    
    setTimeDistributionData({
      labels: timeSlots,
      datasets: [{
        label: 'Study Hours',
        data: timeDistribution,
        backgroundColor: [
          'rgba(251, 191, 36, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(99, 102, 241, 0.8)'
        ]
      }]
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const getStreakIcon = (streak: number) => {
    if (streak >= 30) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (streak >= 14) return <Award className="w-5 h-5 text-purple-500" />;
    if (streak >= 7) return <Flame className="w-5 h-5 text-orange-500" />;
    return <Zap className="w-5 h-5 text-blue-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your progress data...</p>
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
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Progress Tracking
          </h1>
          <p className="text-gray-600">Monitor your study progress and achievements</p>
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
          
          <button className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Study Time</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudyHours}h</p>
              <p className="text-xs text-green-600">+{stats.weeklyHours}h this week</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Target className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Weekly Goal</p>
              <p className="text-2xl font-bold text-gray-900">{Math.round(stats.goalProgress)}%</p>
              <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(stats.goalProgress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              {getStreakIcon(stats.currentStreak)}
            </div>
            <div>
              <p className="text-sm text-gray-600">Current Streak</p>
              <p className="text-2xl font-bold text-gray-900">{stats.currentStreak} days</p>
              <p className="text-xs text-gray-600">Best: {stats.longestStreak} days</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Topics Completed</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completedTopics}</p>
              <p className="text-xs text-gray-600">of {stats.totalTopics} total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Study Hours */}
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Weekly Study Hours</h3>
            <div className="flex items-center gap-2">
              <button className="text-gray-400 hover:text-gray-600">
                <BarChart3 className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {weeklyChartData ? (
            <div className="h-64">
              {/* Simple bar chart representation */}
              <div className="flex items-end justify-between h-48 gap-2">
                {weeklyChartData.datasets[0].data.map((hours, index) => (
                  <div key={index} className="flex flex-col items-center flex-1">
                    <div
                      className="bg-blue-500 rounded-t w-full min-h-[4px] transition-all duration-300"
                      style={{ 
                        height: `${Math.max((hours / Math.max(...weeklyChartData.datasets[0].data)) * 100, 2)}%` 
                      }}
                    />
                    <span className="text-xs text-gray-600 mt-2">{weeklyChartData.labels[index]}</span>
                    <span className="text-xs text-gray-500">{hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
        </div>

        {/* Module Distribution */}
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Study by Module</h3>
            <div className="flex items-center gap-2">
              <button className="text-gray-400 hover:text-gray-600">
                <PieChart className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {moduleChartData ? (
            <div className="space-y-3">
              {moduleChartData.labels.map((module, index) => {
                const hours = moduleChartData.datasets[0].data[index];
                const totalHours = moduleChartData.datasets[0].data.reduce((sum, h) => sum + h, 0);
                const percentage = totalHours > 0 ? (hours / totalHours) * 100 : 0;
                
                return (
                  <div key={module} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: moduleChartData.datasets[0].backgroundColor?.[index] }}
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-900">{module}</span>
                        <span className="text-sm text-gray-600">{hours.toFixed(1)}h</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: moduleChartData.datasets[0].backgroundColor?.[index]
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {/* Recent Sessions and Achievements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sessions */}
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Sessions</h3>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All
            </button>
          </div>
          
          <div className="space-y-3">
            {recentSessions.slice(0, 5).map((session) => (
              <div key={session.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                  {session.moduleCode.slice(0, 2)}
                </div>
                
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 text-sm">{session.title}</h4>
                  <p className="text-xs text-gray-600">{session.moduleCode}</p>
                </div>
                
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{formatDuration(session.duration)}</p>
                  <p className="text-xs text-gray-600">
                    {new Date(session.scheduledAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Achievements</h3>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All
            </button>
          </div>
          
          {achievements.length === 0 ? (
            <div className="text-center py-8">
              <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No achievements yet</p>
              <p className="text-sm text-gray-500">Keep studying to unlock your first achievement!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {achievements.slice(0, 4).map((achievement) => (
                <div key={achievement.id} className="flex items-center gap-3 p-3 bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg">
                  <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 text-sm">{achievement.title}</h4>
                    <p className="text-xs text-gray-600">{achievement.description}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-gray-600">
                      {achievement.earnedAt ? new Date(achievement.earnedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Time Distribution Chart */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Study Time Distribution</h3>
          <p className="text-sm text-gray-600">When you study most effectively</p>
        </div>
        
        {timeDistributionData ? (
          <div className="grid grid-cols-4 gap-4">
            {timeDistributionData.labels.map((label, index) => {
              const hours = timeDistributionData.datasets[0].data[index];
              const totalHours = timeDistributionData.datasets[0].data.reduce((sum, h) => sum + h, 0);
              const percentage = totalHours > 0 ? (hours / totalHours) * 100 : 0;
              
              return (
                <div key={label} className="text-center">
                  <div className="mb-3">
                    <div
                      className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: timeDistributionData.datasets[0].backgroundColor?.[index] }}
                    >
                      {hours.toFixed(1)}h
                    </div>
                  </div>
                  <h4 className="font-medium text-gray-900 text-sm">{label}</h4>
                  <p className="text-xs text-gray-600">{percentage.toFixed(1)}% of time</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}