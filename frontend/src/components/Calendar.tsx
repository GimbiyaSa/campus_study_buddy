import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Calendar() {
  const [cursor, setCursor] = useState(new Date());

  const { monthLabel, year, days } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const daysInMonth = last.getDate();
    const toMonIdx = (d: number) => (d + 6) % 7;
    const padStart = toMonIdx(first.getDay());
    const padEnd = 6 - toMonIdx(last.getDay());

    return {
      monthLabel: cursor.toLocaleString(undefined, { month: "long" }),
      year: y,
      days: [
        ...Array.from({ length: padStart }, () => null),
        ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
        ...Array.from({ length: padEnd }, () => null),
      ],
    };
  }, [cursor]);

  const today = new Date();
  const isToday = (d: Date | null) =>
    !!d &&
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{monthLabel} {year}</h3>
          <p className="text-xs text-gray-500">Mon — Sun</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-50 border border-gray-200"
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>
          <button
            aria-label="Next month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-50 border border-gray-200"
          >
            <ChevronRight className="w-4 h-4 text-gray-700" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 text-[11px] font-medium text-gray-500">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
          <div key={d} className="py-1 text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-sm">
        {days.map((d, i) => (
          <div key={i} className="h-10">
            {d ? (
              <div className="h-10 flex items-center justify-center">
                <div
                  className={`w-8 h-8 grid place-items-center rounded-full ${
                    isToday(d) ? "bg-brand-500 text-white" : "text-gray-700 hover:bg-brand-50"
                  }`}
                  aria-current={isToday(d) ? "date" : undefined}
                >
                  {d.getDate()}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
