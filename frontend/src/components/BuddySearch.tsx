import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Mail, X } from "lucide-react";

type Suggestion = {
  name: string;
  major: string;
  overlap: string;
  tags: string[];
  initials: string;
  bio?: string;
};

export default function BuddySearch() {
  const suggestions: Suggestion[] = [
    { name: "Aisha Khan",  major: "CS 201 · Data Structures", overlap: "3 mutual courses", tags: ["Morning", "On-campus"], initials: "AK" },
    { name: "Martin Nel",  major: "MATH 204 · Linear Algebra", overlap: "2 mutual courses", tags: ["Evenings", "Remote"], initials: "MN" },
    { name: "Zanele M.",   major: "PHY 101 · Mechanics",      overlap: "1 mutual course",  tags: ["Weekend", "Library"], initials: "ZM" },
    { name: "Sam Lee",     major: "ENG 110 · Writing",         overlap: "1 mutual course",  tags: ["Afternoons"], initials: "SL" }, // extra; won't show (max 3)
  ].slice(0, 3);

  // Modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [invited, setInvited] = useState(false);

  const openModal = (person: Suggestion) => {
    setSelected(person);
    setInvited(false);
    setOpen(true);
  };
  const closeModal = () => setOpen(false);
  const sendInvite = () => setInvited(true);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Study Buddy Suggestions (replaces Learning Time) */}
      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Study Buddy Suggestions</h2>
          <a href="#/partners" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            See all
          </a>
        </div>

        <ul className="space-y-3">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-sm font-semibold">
                  {s.initials}
                </div>
                <div>
                  <p className="font-medium text-gray-900 leading-tight">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.major}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s.overlap}</span>
                    {s.tags.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Connect opens modal */}
              <button
                onClick={() => openModal(s)}
                className="px-3 py-1.5 rounded-full text-sm bg-white border border-gray-200 hover:bg-gray-50 shadow-soft"
              >
                Connect
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* My Activity (unchanged placeholder) */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="font-semibold mb-4">My Activity</h2>
        <div className="h-32 flex items-center justify-center bg-gray-50 text-gray-400 rounded">
          [Graph Placeholder]
        </div>
      </div>

      {/* Modal (portal) */}
      <ProfileModal
        open={open}
        onClose={closeModal}
        person={selected}
        onInvite={sendInvite}
        invited={invited}
      />
    </div>
  );
}

/* ---------- Modal component (kept in same file for convenience) ---------- */

function ProfileModal({
  open,
  onClose,
  person,
  onInvite,
  invited,
}: {
  open: boolean;
  onClose: () => void;
  person: Suggestion | null;
  onInvite: () => void;
  invited: boolean;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Esc + scroll lock
  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      }
    };

    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open || !person) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="profile-title" className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div ref={dialogRef} className="w-full max-w-md rounded-2xl bg-white shadow-card border border-gray-100 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold">
                {person.initials}
              </div>
              <div>
                <h3 id="profile-title" className="text-lg font-semibold text-gray-900">{person.name}</h3>
                <p className="text-sm text-gray-500">{person.major}</p>
              </div>
            </div>
            <button
              ref={closeBtnRef}
              aria-label="Close"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-50"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{person.overlap}</span>
              {person.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{t}</span>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              {person.bio ?? "Studies similar modules and prefers overlapping study windows. Looks for a consistent weekly session."}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={onInvite}
              disabled={invited}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                invited ? "bg-gray-100 text-gray-500 cursor-default" : "bg-brand-500 text-white hover:opacity-95 shadow-card"
              }`}
            >
              {invited ? (<><Check className="w-4 h-4" /> Invite sent</>) : (<><Mail className="w-4 h-4" /> Send invite</>)}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
