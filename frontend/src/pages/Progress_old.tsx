import { useEffect, useState } from 'react';
import { Clock, BookOpen, Trophy, TrendingUp, AlertCircle, RefreshCw, Loader2, Plus, CheckCircle, Target } from 'lucide-react';
import { ErrorHandler, type AppError } from '../utils/errorHandler';
import { createInitialLoadingState } from '../components/ui/LoadingStates';
import type { LoadingState } from '../components/ui/LoadingStates';
import StudyGoalDialog, { type StudyGoal } from '../components/StudyGoalDialog';
import StudyLogDialog, { type StudyLog } from '../components/StudyLogDialog';
import { DataService } from '../services/dataService';

// Interface for the progress data structure
interface ProgressData {
  goals: {
    overall: {
      totalHours: number;
      completedTopics: number;
      totalSessions: number;
    };
  };
  modules: Array<{
    id: number;
    name: string;
    code: string;
    enrollmentStatus: 'active' | 'completed' | 'dropped';
    progress: number;
    totalHours: number;
    topics: any[];
  }>;
}

export default function Progress() {
  const [loadingState, setLoadingState] = useState<LoadingState>(createInitialLoadingState());
  const [data, setData] = useState<ProgressData | null>(null);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{id: number, name: string, module: string} | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [moduleTopics, setModuleTopics] = useState<Record<number, any[]>>({});

  const loadModuleTopics = async (moduleId: number) => {
    if (moduleTopics[moduleId]) {
      return; // Already loaded
    }

    try {
      const topics = await DataService.fetchModuleTopics(moduleId);
      setModuleTopics(prev => ({
        ...prev,
        [moduleId]: topics
      }));
    } catch (error) {
      console.error('Failed to load module topics:', error);
    }
  };

  const toggleModuleExpansion = (moduleId: number) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
      loadModuleTopics(moduleId); // Load topics when expanding
    }
    setExpandedModules(newExpanded);
  };

  const fetchProgressData = async () => {
    setLoadingState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Use the unified DataService to get courses with progress integration
      const courses = await DataService.fetchCourses();
      
      // Transform the unified course data to match our Progress interface
      const transformedData: ProgressData = {
        goals: {
          overall: {
            totalHours: courses.reduce((sum, course) => sum + (course.totalHours || 0), 0),
            completedTopics: courses.reduce((sum, course) => sum + (course.completedTopics || 0), 0),
            totalSessions: 0 // This could be calculated if needed
          }
        },
        modules: courses.map(course => ({
          id: parseInt(course.id),
          name: course.title,
          code: course.code || '',
          enrollmentStatus: (course.status || course.enrollmentStatus || 'active') as 'active' | 'completed' | 'dropped',
          progress: course.progress || 0,
          totalHours: course.totalHours || 0,
          topics: [] // Topics will be loaded on demand when needed
        }))
      };

      setData(transformedData);
      setLoadingState(prev => ({ 
        ...prev, 
        isLoading: false, 
        lastUpdated: new Date(),
        retryCount: 0 
      }));
    } catch (err) {
      console.error('Progress fetch error:', err);
      const appError = ErrorHandler.handleApiError(err, 'progress');
      setLoadingState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: appError,
        retryCount: prev.retryCount + 1
      }));
    }
  };

  useEffect(() => {
    fetchProgressData();
  }, []);

  const handleSetGoal = async (goal: StudyGoal) => {
    try {
      await DataService.setTopicGoal(goal.topicId, {
        hoursGoal: goal.hoursGoal,
        targetCompletionDate: goal.targetCompletionDate,
        personalNotes: goal.personalNotes
      });
      console.log('✅ Study goal set successfully');
      fetchProgressData(); // Refresh data
    } catch (error) {
      console.error('❌ Failed to set goal:', error);
      // Show user-friendly error
      alert('Failed to set study goal. Please check your connection and try again.');
    }
  };

  const handleLogHours = async (log: StudyLog) => {
    try {
      await DataService.logStudyHours(log.topicId, {
        hours: log.hours,
        description: log.description,
      });
      console.log('✅ Study hours logged successfully');
      fetchProgressData(); // Refresh data
    } catch (error) {
      console.error('❌ Failed to log hours:', error);
      // Show user-friendly error
      alert('Failed to log study hours. Please check your connection and try again.');
    }
  };

  const openGoalDialog = (topic: {id: number, name: string, module: string}) => {
    setSelectedTopic(topic);
    setShowGoalDialog(true);
  };

  const openLogDialog = (topic: {id: number, name: string, module: string}) => {
    setSelectedTopic(topic);
    setShowLogDialog(true);
  };

  if (loadingState.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
          <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading your progress</h3>
            <p className="text-slate-600">Analysing your study data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadingState.error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
          <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
        </div>
        <EnhancedErrorDisplay 
          error={loadingState.error} 
          onRetry={fetchProgressData}
          onDismiss={() => setLoadingState(prev => ({ ...prev, error: null }))}
        />
      </div>
    );
  }

  const { goals, modules } = data || {};
  
  // Calculate derived stats from real data
  const avgProgress = modules?.length ? 
    Math.round(modules.reduce((sum: number, module) => sum + (module.progress || 0), 0) / modules.length) : 0;
  const activeModules = modules?.filter((module) => module.enrollmentStatus === 'active').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
        <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
      </div>

      {/* Enhanced Stats Cards with real data */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          icon={<Clock className="h-5 w-5" />}
          title="Total Hours"
          value={goals?.overall?.totalHours?.toFixed(1) || '0.0'}
          subtitle="All time"
          trend={(goals?.overall?.totalHours || 0) > 0 ? `${(goals?.overall?.totalHours || 0).toFixed(1)}h logged` : 'Start logging hours'}
          color="emerald"
        />
        <EnhancedStatCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="Average Progress"
          value={`${avgProgress}%`}
          subtitle="Across all courses"
          trend={avgProgress > 50 ? 'Excellent progress!' : avgProgress > 0 ? 'Keep it up!' : 'Just getting started'}
          color="blue"
        />
        <EnhancedStatCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Topics Mastered"
          value={`${goals?.overall?.completedTopics || 0}`}
          subtitle="Completed"
          trend={(goals?.overall?.completedTopics || 0) > 0 ? `${goals?.overall?.completedTopics || 0} completed!` : 'Complete your first topic'}
          color="purple"
        />
        <EnhancedStatCard
          icon={<Trophy className="h-5 w-5" />}
          title="Active Courses"
          value={`${activeModules}`}
          subtitle="Currently enrolled"
          trend={activeModules > 0 ? `${activeModules} active ${activeModules === 1 ? 'course' : 'courses'}` : 'Enroll in a course'}
          color="amber"
        />
      </div>


      {/* Course Progress & Topic Management */}
      {modules && modules.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Course Progress & Topic Management</h2>
              <p className="text-sm text-slate-600">Track completion status and log study hours for each topic</p>
            </div>
            <div className="text-sm text-slate-500">
              {modules.length} active {modules.length === 1 ? 'course' : 'courses'}
            </div>
          </div>
          
          <div className="space-y-6">
            {modules.map((module) => (
              <div key={module.id} className="border border-slate-100 rounded-lg p-5">
                {/* Module Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{module.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>{module.code}</span>
                        <span>•</span>
                        <span>{module.progress}% complete</span>
                        {module.totalHours > 0 && (
                          <>
                            <span>•</span>
                            <span>{module.totalHours}h logged</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      module.enrollmentStatus === 'active' 
                        ? 'bg-emerald-100 text-emerald-700'
                        : module.enrollmentStatus === 'completed'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {module.enrollmentStatus}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, module.progress))}%` }}
                    />
                  </div>
                </div>
                
                {/* Topics */}
                {expandedModules.has(module.id) && (
                  <div>
                    {moduleTopics[module.id]?.length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-700 mb-3">
                          Topics ({moduleTopics[module.id].filter((t: any) => t.completionStatus === 'completed').length}/{moduleTopics[module.id].length} completed)
                        </h4>
                        {moduleTopics[module.id]
                          .sort((a: any, b: any) => a.orderSequence - b.orderSequence)
                          .map((topic: any) => (
                          <div key={topic.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                topic.completionStatus === 'completed' 
                                  ? 'bg-emerald-100 text-emerald-600' 
                                  : topic.completionStatus === 'in_progress'
                                  ? 'bg-blue-100 text-blue-600'
                                  : 'bg-slate-200 text-slate-500'
                              }`}>
                                {topic.completionStatus === 'completed' ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : (
                                  <span className="text-xs font-medium">{topic.orderSequence}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 truncate">{topic.name}</p>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                  {topic.totalHours > 0 && <span>{topic.totalHours}h logged</span>}
                                  <span className="capitalize">{topic.completionStatus.replace('_', ' ')}</span>
                                  {topic.completedAt && (
                                    <span>Completed {new Date(topic.completedAt).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => openGoalDialog({
                                  id: topic.id,
                                  name: topic.name,
                                  module: module.name
                                })}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                title="Set study goal"
                              >
                                <Target className="h-3 w-3" />
                                Goal
                              </button>
                              <button
                                onClick={() => openLogDialog({
                                  id: topic.id,
                                  name: topic.name,
                                  module: module.name
                                })}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Log study hours"
                              >
                                <Plus className="h-3 w-3" />
                                Log Hours
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-500">
                        <BookOpen className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                        <p className="text-sm mb-2">This course doesn't have topics configured yet.</p>
                        <p className="text-xs text-slate-400">
                          {module.code?.startsWith('CASUAL_') ? 
                            'Personal topics can be added through course management.' :
                            'Institution topics will be loaded when available.'
                          }
                        </p>
                        <button
                          onClick={() => {
                            // Use SPA navigation
                            import('../router').then(r => r.navigate(`/courses/${module.id}`));
                          }}
                          className="mt-3 text-xs font-medium text-emerald-600 hover:text-emerald-700 underline"
                        >
                          View Course Details
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Toggle Button */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => toggleModuleExpansion(module.id)}
                    className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    {expandedModules.has(module.id) ? 'Hide Topics' : 'Show Topics'}
                    <svg className={`h-4 w-4 transition-transform ${expandedModules.has(module.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No courses enrolled</h3>
          <p className="text-slate-600 mb-4">Enroll in courses to start tracking your progress and logging study hours.</p>
          <button
            onClick={() => {
              import('../router').then(r => r.navigate('/courses'));
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Browse Courses
          </button>
        </div>
      )}

      {/* Dialogs */}
      <StudyGoalDialog
        isOpen={showGoalDialog}
        onClose={() => setShowGoalDialog(false)}
        onSubmit={handleSetGoal}
        topic={selectedTopic || undefined}
      />
      
      <StudyLogDialog
        isOpen={showLogDialog}
        onClose={() => setShowLogDialog(false)}
        onSubmit={handleLogHours}
        topic={selectedTopic || undefined}
      />
    </div>
  );
}

// Enhanced Stat Card Component with better design
function EnhancedStatCard({ 
  icon, 
  title, 
  value, 
  subtitle, 
  trend, 
  color = 'emerald' 
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  trend: string;
  color?: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    amber: 'bg-amber-50 text-amber-700'
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-500">{subtitle}</p>
        <p className="text-xs font-medium text-slate-700">{trend}</p>
      </div>
    </div>
  );
}

// Enhanced Error Display Component to match Dashboard styling
function EnhancedErrorDisplay({ 
  error, 
  onRetry,
  onDismiss
}: {
  error: AppError;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 mb-6 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-red-900 mb-1">{error.title}</h4>
          <p className="text-sm text-red-700 mb-3">{error.message}</p>
          
          <div className="flex items-center gap-3">
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
              >
                <RefreshCw className="h-3 w-3" />
                {error.action || 'Try again'}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}