import { NotebookText} from "lucide-react";

type Note = {
  title: string;
  snippet: string;
  meta: string;    // timestamp or course
  tags?: string[];
};

export default function Notes() {
  const notes: Note[] = [
    {
      title: "Linear Algebra – Lecture 4 summary",
      snippet: "Eigenvalues vs eigenvectors; geometric intuition, diagonalization steps…",
      meta: "Today · MATH 204",
      tags: ["review", "exam"],
    },
    {
      title: "Data Structures – Lab prep",
      snippet: "Implement stack using 2 queues; analyze amortized complexity.",
      meta: "Yesterday · CS 201",
      tags: ["coding"],
    },
    {
      title: "Reading list",
      snippet: "CLRS §10.1–10.4; MIT OCW playlist; link to B-tree visualization.",
      meta: "2 days ago",
      tags: ["links"],
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Notes</h2>
        <a href="#/notes" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          See all
        </a>
      </div>

      <ul className="space-y-3">
        {notes.map((n) => (
          <li
            key={n.title}
            className="p-3 rounded-xl border border-gray-100 bg-white"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 grid place-items-center">
                <NotebookText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900 truncate">{n.title}</p>
                  <span className="text-xs text-gray-500 ml-3 shrink-0">{n.meta}</span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{n.snippet}</p>
                {n.tags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {n.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Optional quick actions row */}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="#/notes/new" className="px-3 py-1.5 rounded-full border text-sm hover:bg-gray-50">
          New note
        </a>
      </div>
    </div>
  );
}
