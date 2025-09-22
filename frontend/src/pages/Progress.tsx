import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Calendar, Clock, TrendingUp, Trophy } from 'lucide-react';
import { buildApiUrl } from '../utils/url';

type ProgressStats = {
  totalStudyHours: number;
  weeklyStudyHours: number;
  coursesCompleted: number;
  totalCourses: number;
  weeklyGoal: number;
  currentStreak: number;
  longestStreak: number;
};

type CourseProgress = {
  id: string;
  title: string;
  code?: string;
  progress: number;
  totalHours: number;
  weeklyHours: number;
  lastStudied: string;
};

type WeeklyData = {
  day: string;
  hours: number;
};

export default function Progress() {
  const [stats, setStats] = useState<ProgressStats>({
    totalStudyHours: 0,
    weeklyStudyHours: 0,
    coursesCompleted: 0,
    totalCourses: 0,
    weeklyGoal: 25,
    currentStreak: 0,
    longestStreak: 0,
  });
  
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      setLoading(true);
      try {
        // Fetch user progress stats
        const statsRes = await fetch(buildApiUrl('/api/v1/user/progress'));
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        // Fetch course progress
        const coursesRes = await fetch(buildApiUrl('/api/v1/user/course-progress'));
        if (coursesRes.ok) {
          const coursesData = await coursesRes.json();
          setCourses(coursesData);
        }

        // Fetch weekly study data
        const weeklyRes = await fetch(buildApiUrl('/api/v1/user/weekly-study-hours'));
        if (weeklyRes.ok) {
          const weeklyDataRes = await weeklyRes.json();
          setWeeklyData(weeklyDataRes);
        }
      } catch (error) {
        console.error('Error fetching progress data:', error);
        // Use fallback data for demo
        setStats({
          totalStudyHours: 127,
          weeklyStudyHours: 18,
          coursesCompleted: 3,
          totalCourses: 8,
          weeklyGoal: 25,
          currentStreak: 5,
          longestStreak: 12,
        });
        setCourses([
          {
            id: '1',
            title: 'Algorithms & Data Structures',
            code: 'CS301',
            progress: 78,
            totalHours: 45,
            weeklyHours: 8,
            lastStudied: '2025-09-16',
          },
          {
            id: '2',
            title: 'Database Systems',
            code: 'CS305',
            progress: 65,
            totalHours: 32,
            weeklyHours: 6,
            lastStudied: '2025-09-15',
          },
          {
            id: '3',
            title: 'Software Engineering',
            code: 'CS403',
            progress: 45,
            totalHours: 28,
            weeklyHours: 4,
            lastStudied: '2025-09-14',
          },
          {
            id: '4',
            title: 'Machine Learning Basics',
            progress: 23,
            totalHours: 15,
            weeklyHours: 0,
            lastStudied: '2025-09-10',
          },
        ]);
        setWeeklyData([
          { day: 'Mon', hours: 3 },
          { day: 'Tue', hours: 2.5 },
          { day: 'Wed', hours: 4 },
          { day: 'Thu', hours: 3.5 },
          { day: 'Fri', hours: 2 },
          { day: 'Sat', hours: 1.5 },
          { day: 'Sun', hours: 1.5 },
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, []);

  const progressPercentage = stats.totalCourses > 0 
    ? Math.round((stats.coursesCompleted / stats.totalCourses) * 100) 
    : 0;
  
  const weeklyGoalPercentage = Math.round((stats.weeklyStudyHours / stats.weeklyGoal) * 100);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
        <div className="text-center text-slate-600">Loading progress data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>
        <p className="text-slate-600 text-sm">Monitor your study habits and academic achievements</p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          title="Total Study Hours"
          value={stats.totalStudyHours.toString()}
          subtitle="All time"
          color="emerald"
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          title="This Week"
          value={`${stats.weeklyStudyHours}h`}
          subtitle={`${weeklyGoalPercentage}% of ${stats.weeklyGoal}h goal`}
          color="blue"
        />
        <StatCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Courses Progress"
          value={`${stats.coursesCompleted}/${stats.totalCourses}`}
          subtitle={`${progressPercentage}% completed`}
          color="purple"
        />
        <StatCard
          icon={<Trophy className="h-5 w-5" />}
          title="Study Streak"
          value={`${stats.currentStreak} days`}
          subtitle={`Best: ${stats.longestStreak} days`}
          color="orange"
        />
      </div>

      {/* Weekly Study Hours Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Weekly Study Hours</h2>
        </div>
        <div className="flex items-end justify-between gap-2 h-48">
          {weeklyData.map((day) => {
            const maxHours = Math.max(...weeklyData.map(d => d.hours));
            const height = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;
            
            return (
              <div key={day.day} className="flex flex-col items-center gap-2 flex-1">
                <div 
                  className="w-full bg-emerald-500 rounded-t-md min-h-[4px] transition-all"
                  style={{ height: `${height}%` }}
                  title={`${day.hours} hours`}
                />
                <span className="text-xs text-slate-600 font-medium">{day.day}</span>
                <span className="text-xs text-slate-500">{day.hours}h</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Course Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Course Progress</h2>
        </div>
        <div className="space-y-4">
          {courses.map((course) => (
            <CourseProgressCard key={course.id} course={course} />
          ))}
        </div>
      </div>

      {/* Weekly Goal Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Weekly Goal</h2>
          <span className="text-sm text-slate-600">
            {stats.weeklyStudyHours}h / {stats.weeklyGoal}h
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-emerald-500 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(100, weeklyGoalPercentage)}%` }}
          />
        </div>
        <p className="text-sm text-slate-600 mt-2">
          {weeklyGoalPercentage >= 100 
            ? '🎉 Great job! You\'ve reached your weekly goal!' 
            : `${(stats.weeklyGoal - stats.weeklyStudyHours).toFixed(1)} hours left to reach your goal`
          }
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  color: 'emerald' | 'blue' | 'purple' | 'orange';
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-xl font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function CourseProgressCard({ course }: { course: CourseProgress }) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-slate-900">
            {course.code && (
              <span className="text-slate-500 mr-2">{course.code}</span>
            )}
            {course.title}
          </h3>
          <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
            <span>{course.totalHours}h total</span>
            <span>{course.weeklyHours}h this week</span>
            <span>Last studied: {formatDate(course.lastStudied)}</span>
          </div>
        </div>
        <span className="text-sm font-medium text-slate-900">
          {Math.round(course.progress)}%
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}
        />
      </div>
    </div>
  );
}