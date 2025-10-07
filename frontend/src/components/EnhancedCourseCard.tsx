import { BookOpen, Clock, Target, TrendingUp, Play } from 'lucide-react';
import { navigate } from '../router';
import type { Course } from '../services/dataService';

interface EnhancedCourseCardProps {
  course: Course;
  onQuickLog?: (courseId: string) => void;
  onViewProgress?: (courseId: string) => void;
}

export default function EnhancedCourseCard({
  course,
  onQuickLog,
  onViewProgress,
}: EnhancedCourseCardProps) {
  const progressPercentage = course.progress || 0;
  const hasProgress = progressPercentage > 0;

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'emerald';
    if (progress >= 50) return 'blue';
    if (progress >= 20) return 'amber';
    return 'slate';
  };

  const progressColor = getProgressColor(progressPercentage);

  return (
    <div className="group relative bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-emerald-200 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-4 w-4 text-emerald-600" />
            </div>
            {course.code && (
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                {course.code}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors mb-1">
            {course.title}
          </h3>
          <p className="text-sm text-slate-600 line-clamp-2">
            {course.description || 'No description available'}
          </p>
        </div>
      </div>

      {/* Progress Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Progress</span>
          <div className="flex items-center gap-2">
            {hasProgress ? (
              <span className={`font-bold text-${progressColor}-600`}>{progressPercentage}%</span>
            ) : (
              <span className="text-xs text-slate-500 bg-slate-50 rounded-full px-2 py-1">
                Not started
              </span>
            )}
            {course.totalTopics && (
              <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-1">
                {course.completedTopics || 0}/{course.totalTopics} topics
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full bg-${progressColor}-500 transition-all duration-300`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Study Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-slate-500" />
            <span className="text-xs font-medium text-slate-500">Study Hours</span>
          </div>
          <div className="text-lg font-bold text-slate-900">
            {course.totalHours?.toFixed(1) || '0.0'}h
          </div>
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="h-3 w-3 text-slate-500" />
            <span className="text-xs font-medium text-slate-500">Enrolled</span>
          </div>
          <div className="text-lg font-bold text-slate-900">
            {course.createdAt
              ? new Date(course.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/courses/${course.id}`)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          <BookOpen className="h-4 w-4" />
          View Topics
        </button>
        <button
          onClick={() => onQuickLog?.(course.id)}
          className="flex items-center justify-center px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          title="Quick log study time"
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          onClick={() => onViewProgress?.(course.id)}
          className="flex items-center justify-center px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          title="View detailed progress"
        >
          <TrendingUp className="h-4 w-4" />
        </button>
      </div>

      {/* Last Studied Indicator */}
      {course.lastStudiedAt && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Last studied: {new Date(course.lastStudiedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
