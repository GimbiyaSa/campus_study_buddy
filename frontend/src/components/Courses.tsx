import { Plus, MessageCircle, Bell, Target } from "lucide-react";

export default function Courses() {
  const courses = [
    { title: "History of graphic design", teacher: "William Joe", progress: 25 },
    { title: "App Design Course",        teacher: "William Joe", progress: 25 },
    { title: "Digital painting",         teacher: "William Joe", progress: 25 },
  ];

  const avg =
    Math.round(
      (courses.reduce((s, c) => s + c.progress, 0) / Math.max(courses.length, 1)) * 10
    ) / 10;

  // donut sizes
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - avg / 100);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">My Courses</h2>
        <a href="#/courses" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          See all
        </a>
      </div>

      {/* Course list */}
      <ul className="space-y-4">
        {courses.map((c, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 grid place-items-center font-semibold shadow-soft shrink-0">
                {String(c.title.match(/[A-Z]/g)?.slice(0, 2).join("") ?? "C")}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{c.title}</p>
                <p className="text-xs text-gray-500">By {c.teacher}</p>
                <div className="mt-2 w-44 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${c.progress}%` }}
                  />
                </div>
              </div>
            </div>

            <button className="px-3 py-1.5 rounded-full text-sm bg-white border border-gray-200 hover:bg-gray-50 shadow-soft shrink-0">
              View Course
            </button>
          </li>
        ))}
      </ul>

      {/* Fill area: Summary + Quick Actions (chips) */}
      <div className="mt-6 flex-1">
        <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-white to-brand-50/40 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Donut progress */}
            <div className="flex items-center justify-center">
              <figure className="relative" aria-label={`Average progress ${avg}%`}>
                <svg
                  width={size}
                  height={size}
                  viewBox={`0 0 ${size} ${size}`}
                  role="img"
                  aria-hidden="true"
                >
                  {/* track */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="rgba(17,24,39,0.08)"
                    strokeWidth={stroke}
                    fill="none"
                  />
                  {/* value */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="currentColor"
                    className="text-brand-500"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                </svg>
                <figcaption className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-2xl font-semibold text-gray-900">{avg}%</div>
                    <div className="text-xs text-gray-500">
                      Avg progress • {courses.length} active
                    </div>
                  </div>
                </figcaption>
              </figure>
            </div>

            {/* Chips */}
            <div className="flex flex-col justify-center">
              <p className="font-medium text-gray-900 mb-2">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#/courses/new"
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4" />
                  Add course
                </a>
                <a
                  href="#/partners"
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat with study partners
                </a>
                <a
                  href="#/reminders"
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Bell className="w-4 h-4" />
                  View reminders
                </a>
                <a
                  href="#/goals"
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Target className="w-4 h-4" />
                  Set study goals
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
