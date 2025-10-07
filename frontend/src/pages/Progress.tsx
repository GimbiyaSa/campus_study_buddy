import { useEffect, useState } from 'react';
import { Clock, BookOpen, Trophy, TrendingUp, AlertCircle, RefreshCw, Loader2, Plus, CheckCircle } from 'lucide-react';
import { ErrorHandler, type AppError } from '../utils/errorHandler';
import { createInitialLoadingState } from '../components/ui/LoadingStates';
import type { LoadingState } from '../components/ui/LoadingStates';
import StudyLogDialog, { type StudyLog } from '../components/StudyLogDialog';
import { DataService, type Course } from '../services/dataService';

// Simplified interface that leverages existing Course data
interface ProgressOverview {
  totalHours: number;
  totalTopics: number;
  completedTopics: number;
  averageProgress: number;
  activeCourses: number;
  completedCourses: number;
  totalCourses: number;
}

export default function Progress() {
  const [loadingState, setLoadingState] = useState<LoadingState>(createInitialLoadingState());
  const [courses, setCourses] = useState<Course[]>([]);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{id: number, name: string, module: string} | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [courseTopics, setCourseTopics] = useState<Record<string, any[]>>({});

  const loadCourseTopics = async (courseId: string) => {
    if (courseTopics[courseId]) {
      return; // Already loaded
    }

    try {
      const topics = await DataService.fetchModuleTopics(parseInt(courseId));
      setCourseTopics(prev => ({
        ...prev,
        [courseId]: topics
      }));
    } catch (error) {
      console.error('Failed to load course topics:', error);
    }
  };

  const toggleCourseExpansion = (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
      loadCourseTopics(courseId); // Load topics when expanding
    }
    setExpandedCourses(newExpanded);
  };

  const fetchProgressData = async () => {
    setLoadingState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Leverage the existing course data that already has progress calculations
      const coursesData = await DataService.fetchCourses();
      setCourses(coursesData);
      
      setLoadingState(prev => ({ 
        ...prev, 
        isLoading: false, 
        lastUpdated: new Date(),
        retryCount: 0,
      }));
    } catch (err) {
      console.error('Progress fetch error:', err);
      const appError = ErrorHandler.handleApiError(err, 'progress');
      setLoadingState((prev) => ({
        ...prev,
        isLoading: false,
        error: appError,
        retryCount: prev.retryCount + 1,
      }));
    }
  };

  useEffect(() => {
    fetchProgressData();
  }, []);

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
      alert('Failed to log study hours. Please check your connection and try again.');
    }
  };

  const openLogDialog = (topic: {id: number, name: string, module: string}) => {
    setSelectedTopic(topic);
    setShowLogDialog(true);
  };

  // Calculate overview stats from course data
  const calculateOverview = (): ProgressOverview => {
    const totalHours = courses.reduce((sum, course) => sum + (course.totalHours || 0), 0);
    const totalTopics = courses.reduce((sum, course) => sum + (course.totalTopics || 0), 0);
    const completedTopics = courses.reduce((sum, course) => sum + (course.completedTopics || 0), 0);
    const totalCourses = courses.length;
    const activeCourses = courses.filter(course => course.enrollmentStatus === 'active').length;
    const completedCourses = courses.filter(course => course.progress === 100).length;
    const averageProgress = totalCourses > 0 ? 
      Math.round(courses.reduce((sum, course) => sum + (course.progress || 0), 0) / totalCourses) : 0;

    return {
      totalHours,
      totalTopics,
      completedTopics,
      averageProgress,
      activeCourses,
      completedCourses,
      totalCourses
    };
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
          onDismiss={() => setLoadingState((prev) => ({ ...prev, error: null }))}
        />
      </div>
    );
  }

  const overview = calculateOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
        <p className="text-slate-600 text-sm">Monitor your study habits and achievements</p>
      </div>

      {/* Progress Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          icon={<Clock className="h-5 w-5" />}
          title="Total Hours"
          value={Math.round(overview.totalHours).toString()}
          subtitle="All time"
          trend={overview.totalHours > 0 ? `${Math.round(overview.totalHours)}h logged` : 'Start logging hours'}
          color="emerald"
        />
        <EnhancedStatCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="Average Progress"
          value={`${overview.averageProgress}%`}
          subtitle="Across all courses"
          trend={overview.averageProgress > 50 ? 'Excellent progress!' : overview.averageProgress > 0 ? 'Keep it up!' : 'Just getting started'}
          color="blue"
        />
        <EnhancedStatCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Topics Mastered"
          value={`${overview.completedTopics}`}
          subtitle={`of ${overview.totalTopics} total`}
          trend={overview.completedTopics > 0 ? `${overview.completedTopics} completed!` : 'Complete your first topic'}
          color="purple"
        />
        <EnhancedStatCard
          icon={<Trophy className="h-5 w-5" />}
          title="Active Courses"
          value={`${overview.activeCourses}`}
          subtitle={`${overview.completedCourses} completed`}
          trend={overview.activeCourses > 0 ? `${overview.activeCourses} active ${overview.activeCourses === 1 ? 'course' : 'courses'}` : 'Enroll in a course'}
          color="amber"
        />
      </div>

      {/* Course Progress Details */}
      {courses && courses.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Course Progress & Topic Management</h2>
            <p className="text-sm text-slate-600">Track completion status and log study hours for each topic</p>
          </div>
          
          <div className="space-y-4">
            {courses.map((course) => (
              <CourseProgressCard 
                key={course.id}
                course={course}
                isExpanded={expandedCourses.has(course.id)}
                topics={courseTopics[course.id] || []}
                onToggleExpansion={() => toggleCourseExpansion(course.id)}
                onOpenLogDialog={openLogDialog}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No courses enrolled</h3>
          <p className="text-slate-600 mb-4">Enroll in courses to start tracking your progress and logging study hours.</p>
          <button
            onClick={() => window.location.href = '/courses'}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Browse Courses
          </button>
        </div>
      )}

      {/* Dialogs */}
      {showLogDialog && selectedTopic && (
        <StudyLogDialog
          isOpen={showLogDialog}
          onClose={() => setShowLogDialog(false)}
          topic={{
            id: selectedTopic.id,
            name: selectedTopic.name,
            module: selectedTopic.module
          }}
          onSubmit={handleLogHours}
        />
      )}
    </div>
  );
}

// Course Progress Card Component
function CourseProgressCard({ 
  course, 
  isExpanded, 
  topics, 
  onToggleExpansion, 
  onOpenLogDialog 
}: {
  course: Course;
  isExpanded: boolean;
  topics: any[];
  onToggleExpansion: () => void;
  onOpenLogDialog: (topic: {id: number, name: string, module: string}) => void;
}) {
  // Calculate progress from course data (which already has accurate calculations)
  const progressPercentage = course.progress || 0;

  return (
    <div
      className="border-2 border-slate-200 rounded-xl p-5 mb-4"
    >
      {/* Course Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <a
              href={`/courses/${course.id}`}
              className="font-semibold text-slate-900 hover:underline focus:underline outline-none"
              tabIndex={0}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
            >
              {course.title}
            </a>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {course.code && <a
                href={`/courses/${course.id}`}
                className="hover:underline focus:underline outline-none"
                tabIndex={0}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >{course.code}</a>}
              {course.code && <span>•</span>}
              <span>{progressPercentage}% complete</span>
              <span>•</span>
              <span>{course.totalHours && course.totalHours > 0 ? `${course.totalHours}h logged` : '0h logged'}</span>
              {course.completedTopics !== undefined && course.totalTopics !== undefined && (
                <>
                  <span>•</span>
                  <span>{course.completedTopics}/{course.totalTopics} topics</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            course.enrollmentStatus === 'active' 
              ? 'bg-emerald-100 text-emerald-700'
              : course.enrollmentStatus === 'completed'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-700'
          }`}>
            {course.enrollmentStatus || 'active'}
          </div>
          <button
            onClick={onToggleExpansion}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              progressPercentage >= 100 
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' 
                : progressPercentage > 0 
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : 'bg-gradient-to-r from-blue-400 to-blue-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
          />
        </div>
      </div>
      
      {/* Topics */}
      {isExpanded && (
        <div>
          {topics.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-700 mb-3">
                Topics ({topics.filter(t => t.completionStatus === 'completed').length}/{topics.length} completed)
              </h4>
              {topics
                .sort((a, b) => a.orderSequence - b.orderSequence)
                .map((topic) => {
                  const isCompleted = topic.completionStatus === 'completed';
                  return (
                    <div key={topic.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-600'
                            : topic.completionStatus === 'in_progress'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <span className="text-xs font-medium">{topic.orderSequence}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{topic.name}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            {topic.hoursSpent > 0 && <span>{topic.hoursSpent}h logged</span>}
                            {/* Only show status if not completed, otherwise just show completed date */}
                            {!isCompleted && (
                              <span className="capitalize">{topic.completionStatus.replace('_', ' ')}</span>
                            )}
                            {isCompleted && topic.completedAt && (
                              <span>Completed {new Date(topic.completedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Only show Log Hours button if topic is not completed */}
                      {!isCompleted && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onOpenLogDialog({
                                id: topic.id,
                                name: topic.name,
                                module: course.title
                              });
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Log Hours
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No topics available for this course</p>
              <a
                href={`/courses/${course.id}`}
                className="inline-block mt-2 text-blue-600 hover:underline text-sm font-medium"
                onClick={e => e.stopPropagation()}
              >
                Go to course page to add or view topics
              </a>
            </div>
          )}
        </div>
      )}
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
  color = 'emerald',
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
    amber: 'bg-amber-50 text-amber-700',
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

// Enhanced Error Display Component
function EnhancedErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss 
}: { 
  error: AppError; 
  onRetry: () => void; 
  onDismiss: () => void; 
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-red-800">
            {error.title || 'Something went wrong'}
          </h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message || 'Please try again or contact support if the problem persists.'}
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <button
              onClick={onDismiss}
              className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
