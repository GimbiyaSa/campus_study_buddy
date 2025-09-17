import { useEffect, useState } from 'react';import { useEffect, useState } from 'react';

import { BarChart3, BookOpen, Calendar, Clock, TrendingUp, Trophy } from 'lucide-react';import { BarChart3, BookOpen, Calendar, Clock, TrendingUp, Trophy } from 'lucide-react';



type ProgressStats = {type ProgressStats = {

  totalStudyHours: number;  totalStudyHours: number;

  weeklyStudyHours: number;  weeklyStudyHours: number;

  coursesCompleted: number;  coursesCompleted: number;

  totalCourses: number;  totalCourses: number;

  weeklyGoal: number;  weeklyGoal: number;

  currentStreak: number;  currentStreak: number;

  longestStreak: number;  longestStreak: number;

};};



type CourseProgress = {type CourseProgress = {

  id: string;  id: string;

  title: string;  title: string;

  code?: string;  code?: string;

  progress: number;  progress: number;

  totalHours: number;  totalHours: number;

  weeklyHours: number;  weeklyHours: number;

  lastStudied: string;  lastStudied: string;

};};



type WeeklyData = {type WeeklyData = {

  day: string;  day: string;

  hours: number;  hours: number;

};};



export default function Progress() {export default function Progress() {

  const [stats, setStats] = useState<ProgressStats | null>(null);  const [stats, setStats] = useState<ProgressStats | null>(null);

  const [courses, setCourses] = useState<CourseProgress[]>([]);  const [courses, setCourses] = useState<CourseProgress[]>([]);

  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);

  const [loading, setLoading] = useState(true);  const [loading, setLoading] = useState(true);



  useEffect(() => {  useEffect(() => {

    async function fetchProgress() {    async function fetchProgress() {

      setLoading(true);      setLoading(true);

      try {      try {

        // Simulate API calls - replace with real endpoints        // Simulate API calls - replace with real endpoints

        await new Promise(resolve => setTimeout(resolve, 500));        await new Promise(resolve => setTimeout(resolve, 500));

                

        // Mock data - replace with real API calls        // Mock data - replace with real API calls

        setStats({        setStats({

          totalStudyHours: 127.5,          totalStudyHours: 127.5,

          weeklyStudyHours: 12.5,          weeklyStudyHours: 12.5,

          coursesCompleted: 3,          coursesCompleted: 3,

          totalCourses: 8,          totalCourses: 8,

          weeklyGoal: 15,          weeklyGoal: 15,

          currentStreak: 5,          currentStreak: 5,

          longestStreak: 12          longestStreak: 12

        });        });



        setCourses([        setCourses([

          { id: '1', title: 'Algorithms', code: 'CS301', progress: 75, totalHours: 45.5, weeklyHours: 5.5, lastStudied: '2025-01-01' },          { id: '1', title: 'Algorithms', code: 'CS301', progress: 75, totalHours: 45.5, weeklyHours: 5.5, lastStudied: '2025-01-01' },

          { id: '2', title: 'Database Systems', code: 'CS302', progress: 60, totalHours: 32.0, weeklyHours: 3.0, lastStudied: '2024-12-30' },          { id: '2', title: 'Database Systems', code: 'CS302', progress: 60, totalHours: 32.0, weeklyHours: 3.0, lastStudied: '2024-12-30' },

          { id: '3', title: 'Web Development', code: 'CS205', progress: 90, totalHours: 28.5, weeklyHours: 2.0, lastStudied: '2025-01-02' },          { id: '3', title: 'Web Development', code: 'CS205', progress: 90, totalHours: 28.5, weeklyHours: 2.0, lastStudied: '2025-01-02' },

          { id: '4', title: 'Machine Learning', code: 'CS401', progress: 40, totalHours: 21.5, weeklyHours: 2.0, lastStudied: '2024-12-28' },          { id: '4', title: 'Machine Learning', code: 'CS401', progress: 40, totalHours: 21.5, weeklyHours: 2.0, lastStudied: '2024-12-28' },

        ]);        ]);



        setWeeklyData([        setWeeklyData([

          { day: 'Mon', hours: 2.5 },          { day: 'Mon', hours: 2.5 },

          { day: 'Tue', hours: 1.5 },          { day: 'Tue', hours: 1.5 },

          { day: 'Wed', hours: 3.0 },          { day: 'Wed', hours: 3.0 },

          { day: 'Thu', hours: 2.0 },          { day: 'Thu', hours: 2.0 },

          { day: 'Fri', hours: 1.5 },          { day: 'Fri', hours: 1.5 },

          { day: 'Sat', hours: 0.5 },          { day: 'Sat', hours: 0.5 },

          { day: 'Sun', hours: 1.5 },          { day: 'Sun', hours: 1.5 },

        ]);        ]);

      } finally {      } finally {

        setLoading(false);        setLoading(false);

      }      }

    }    }

    fetchProgress();    fetchProgress();

  }, []);  }, []);



  if (loading) {  if (loading) {

    return (    return (

      <div className="space-y-6">      <div className="space-y-6">

        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse"></div>        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse"></div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">

          {[...Array(4)].map((_, i) => (          {[...Array(4)].map((_, i) => (

            <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse"></div>            <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse"></div>

          ))}          ))}

        </div>        </div>

      </div>      </div>

    );    );

  }  }



  if (!stats) return null;  if (!stats) return null;



  const goalProgress = (stats.weeklyStudyHours / stats.weeklyGoal) * 100;  const goalProgress = (stats.weeklyStudyHours / stats.weeklyGoal) * 100;

  const completionRate = (stats.coursesCompleted / stats.totalCourses) * 100;  const completionRate = (stats.coursesCompleted / stats.totalCourses) * 100;



  return (  return (

    <div className="space-y-6">    <div className="space-y-6">

      {/* Header */}      {/* Header */}

      <div>      <div>

        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>        <h1 className="text-2xl font-semibold text-slate-900">Track my progress</h1>

        <p className="text-slate-600 text-sm">Monitor your study habits and course advancement</p>        <p className="text-slate-600 text-sm">Monitor your study habits and course advancement</p>

      </div>      </div>



      {/* Stats Overview */}      {/* Stats Overview */}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">

        <StatCard        <StatCard

          icon={<Clock className="h-5 w-5" />}          icon={<Clock className="h-5 w-5" />}

          title="Total Hours"          title="Total Hours"

          value={stats.totalStudyHours}          value={stats.totalStudyHours}

          unit="hrs"          unit="hrs"

          trend="+2.5 this week"          trend="+2.5 this week"

          color="emerald"          color="emerald"

        />        />

        <StatCard        <StatCard

          icon={<TrendingUp className="h-5 w-5" />}          icon={<TrendingUp className="h-5 w-5" />}

          title="Weekly Goal"          title="Weekly Goal"

          value={goalProgress}          value={goalProgress}

          unit="%"          unit="%"

          subtitle={`${stats.weeklyStudyHours}/${stats.weeklyGoal} hrs`}          subtitle={`${stats.weeklyStudyHours}/${stats.weeklyGoal} hrs`}

          color={goalProgress >= 100 ? "emerald" : goalProgress >= 75 ? "amber" : "slate"}          color={goalProgress >= 100 ? "emerald" : goalProgress >= 75 ? "amber" : "slate"}

        />        />

        <StatCard        <StatCard

          icon={<BookOpen className="h-5 w-5" />}          icon={<BookOpen className="h-5 w-5" />}

          title="Courses"          title="Courses"

          value={completionRate}          value={completionRate}

          unit="%"          unit="%"

          subtitle={`${stats.coursesCompleted}/${stats.totalCourses} completed`}          subtitle={`${stats.coursesCompleted}/${stats.totalCourses} completed`}

          color="blue"          color="blue"

        />        />

        <StatCard        <StatCard

          icon={<Trophy className="h-5 w-5" />}          icon={<Trophy className="h-5 w-5" />}

          title="Study Streak"          title="Study Streak"

          value={stats.currentStreak}          value={stats.currentStreak}

          unit="days"          unit="days"

          subtitle={`Best: ${stats.longestStreak} days`}          subtitle={`Best: ${stats.longestStreak} days`}

          color="purple"          color="purple"

        />        />

      </div>      </div>



      {/* Weekly Activity Chart */}      {/* Weekly Activity Chart */}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">      <div className="bg-white rounded-2xl border border-slate-200 p-6">

        <div className="flex items-center gap-2 mb-6">        <div className="flex items-center gap-2 mb-6">

          <BarChart3 className="h-5 w-5 text-slate-600" />          <BarChart3 className="h-5 w-5 text-slate-600" />

          <h2 className="text-lg font-semibold text-slate-900">This Week</h2>          <h2 className="text-lg font-semibold text-slate-900">This Week</h2>

        </div>        </div>

        <div className="flex items-end justify-between gap-2 h-40">        <div className="flex items-end justify-between gap-2 h-40">

          {weeklyData.map((day) => {          {weeklyData.map((day) => {

            const maxHours = Math.max(...weeklyData.map(d => d.hours));            const maxHours = Math.max(...weeklyData.map(d => d.hours));

            const height = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;            const height = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;

            return (            return (

              <div key={day.day} className="flex-1 flex flex-col items-center gap-2">              <div key={day.day} className="flex-1 flex flex-col items-center gap-2">

                <div className="w-full bg-slate-100 rounded-t-lg relative overflow-hidden min-h-[24px]">                <div className="w-full bg-slate-100 rounded-t-lg relative overflow-hidden min-h-[24px]">

                  {day.hours > 0 && (                  {day.hours > 0 && (

                    <div                    <div

                      className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-lg transition-all"                      className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-lg transition-all"

                      style={{ height: `${height}%` }}                      style={{ height: `${height}%` }}

                    />                    />

                  )}                  )}

                </div>                </div>

                <div className="text-center">                <div className="text-center">

                  <div className="text-xs font-medium text-slate-600">{day.day}</div>                  <div className="text-xs font-medium text-slate-600">{day.day}</div>

                  <div className="text-xs text-slate-500">{day.hours}h</div>                  <div className="text-xs text-slate-500">{day.hours}h</div>

                </div>                </div>

              </div>              </div>

            );            );

          })}          })}

        </div>        </div>

      </div>      </div>



      {/* Course Progress */}      {/* Course Progress */}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">      <div className="bg-white rounded-2xl border border-slate-200 p-6">

        <h2 className="text-lg font-semibold text-slate-900 mb-6">Course Progress</h2>        <h2 className="text-lg font-semibold text-slate-900 mb-6">Course Progress</h2>

        <div className="space-y-4">        <div className="space-y-4">

          {courses.map((course) => (          {courses.map((course) => (

            <CourseProgressItem key={course.id} course={course} />            <CourseProgressItem key={course.id} course={course} />

          ))}          ))}

        </div>        </div>

      </div>      </div>

    </div>    </div>

  );  );

}}



function StatCard({function StatCard({

  icon,  icon,

  title,  title,

  value,  value,

  unit,  unit,

  subtitle,  subtitle,

  trend,  trend,

  color  color

}: {}: {

  icon: React.ReactNode;  icon: React.ReactNode;

  title: string;  title: string;

  value: number;  value: number;

  unit: string;  unit: string;

  subtitle?: string;  subtitle?: string;

  trend?: string;  trend?: string;

  color: 'emerald' | 'amber' | 'slate' | 'blue' | 'purple';  color: 'emerald' | 'amber' | 'slate' | 'blue' | 'purple';

}) {}) {

  const colorClasses = {  const colorClasses = {

    emerald: 'bg-emerald-50 text-emerald-700',    emerald: 'bg-emerald-50 text-emerald-700',

    amber: 'bg-amber-50 text-amber-700',    amber: 'bg-amber-50 text-amber-700',

    slate: 'bg-slate-50 text-slate-700',    slate: 'bg-slate-50 text-slate-700',

    blue: 'bg-blue-50 text-blue-700',    blue: 'bg-blue-50 text-blue-700',

    purple: 'bg-purple-50 text-purple-700',    purple: 'bg-purple-50 text-purple-700',

  };  };



  return (  return (

    <div className="bg-white rounded-xl border border-slate-200 p-5">    <div className="bg-white rounded-xl border border-slate-200 p-5">

      <div className="flex items-center gap-3 mb-3">      <div className="flex items-center gap-3 mb-3">

        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>

          {icon}          {icon}

        </div>        </div>

        <h3 className="font-medium text-slate-900">{title}</h3>        <h3 className="font-medium text-slate-900">{title}</h3>

      </div>      </div>

      <div className="space-y-1">      <div className="space-y-1">

        <div className="text-2xl font-bold text-slate-900">        <div className="text-2xl font-bold text-slate-900">

          {Math.round(value)}<span className="text-lg font-medium text-slate-500">{unit}</span>          {Math.round(value)}<span className="text-lg font-medium text-slate-500">{unit}</span>

        </div>        </div>

        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}

        {trend && <p className="text-sm text-emerald-600">{trend}</p>}        {trend && <p className="text-sm text-emerald-600">{trend}</p>}

      </div>      </div>

    </div>    </div>

  );  );

}}



function CourseProgressItem({ course }: { course: CourseProgress }) {function CourseProgressItem({ course }: { course: CourseProgress }) {

  const lastStudiedDate = new Date(course.lastStudied);  const lastStudiedDate = new Date(course.lastStudied);

  const daysAgo = Math.floor((Date.now() - lastStudiedDate.getTime()) / (1000 * 60 * 60 * 24));  const daysAgo = Math.floor((Date.now() - lastStudiedDate.getTime()) / (1000 * 60 * 60 * 24));

    

  return (  return (

    <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">    <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">

      <div className="flex-1">      <div className="flex-1">

        <div className="flex items-center gap-2 mb-2">        <div className="flex items-center gap-2 mb-2">

          <h4 className="font-medium text-slate-900">          <h4 className="font-medium text-slate-900">

            {course.code && <span className="text-slate-500 mr-2">{course.code}</span>}            {course.code && <span className="text-slate-500 mr-2">{course.code}</span>}

            {course.title}            {course.title}

          </h4>          </h4>

          <span className="text-sm font-medium text-slate-900">{course.progress}%</span>          <span className="text-sm font-medium text-slate-900">{course.progress}%</span>

        </div>        </div>

        <div className="w-full bg-slate-100 rounded-full h-2 mb-2">        <div className="w-full bg-slate-100 rounded-full h-2 mb-2">

          <div          <div

            className="bg-emerald-500 h-2 rounded-full transition-all"            className="bg-emerald-500 h-2 rounded-full transition-all"

            style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}            style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}

          />          />

        </div>        </div>

        <div className="flex items-center gap-4 text-sm text-slate-600">        <div className="flex items-center gap-4 text-sm text-slate-600">

          <span className="flex items-center gap-1">          <span className="flex items-center gap-1">

            <Clock className="h-3 w-3" />            <Clock className="h-3 w-3" />

            {course.totalHours}h total            {course.totalHours}h total

          </span>          </span>

          <span className="flex items-center gap-1">          <span className="flex items-center gap-1">

            <Calendar className="h-3 w-3" />            <Calendar className="h-3 w-3" />

            {daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`}            {daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`}

          </span>          </span>

          <span className="text-emerald-600">+{course.weeklyHours}h this week</span>          <span className="text-emerald-600">+{course.weeklyHours}h this week</span>

        </div>        </div>

      </div>      </div>

    </div>    </div>

  );  );

}}lt function Progress() {
  const card = 'bg-white rounded-2xl shadow-card p-6';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Track my progress</h1>
      <section className={card}>
        <p className="text-gray-600">Placeholder for progress charts and stats.</p>
      </section>
    </div>
  );
}
