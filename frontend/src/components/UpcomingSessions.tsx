import { Clock } from "lucide-react";

export default function UpcomingSessions() {
  const sessions = [
    { name: "Discussion Algorithm", time: "08:00 AM – 03:00 PM" },
    { name: "Simple Home Page Design", time: "08:00 AM – 03:00 PM" },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Upcoming Sessions</h2>
        <a href="#/sessions" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          See all
        </a>
      </div>

      <ul className="space-y-3">
        {sessions.map((t) => (
          <li
            key={t.name}
            className="p-3 rounded-xl border border-gray-100 flex items-center justify-between bg-white"
          >
            <div>
              <p className="font-medium text-gray-900">{t.name}</p>
              <p className="text-xs text-gray-500">{t.time}</p>
            </div>
            <Clock className="w-5 h-5 text-gray-400" />
          </li>
        ))}
      </ul>
    </div>
  );
}
