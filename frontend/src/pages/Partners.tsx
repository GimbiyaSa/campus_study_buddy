// src/pages/Partners.tsx
import { useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Search, Filter, X, Mail, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

type Suggestion = {
  name: string;
  major: string; // e.g., "CS 201 · Data Structures"
  overlap: string; // e.g., "3 mutual courses"
  tags: string[]; // e.g., ["Morning", "On-campus"]
  initials: string; // e.g., "AK"
  bio?: string;
};

const PEOPLE: Suggestion[] = [
  {
    name: 'Aisha Khan',
    major: 'CS 201 · Data Structures',
    overlap: '3 mutual courses',
    tags: ['Morning', 'On-campus'],
    initials: 'AK',
  },
  {
    name: 'Martin Nel',
    major: 'MATH 204 · Linear Algebra',
    overlap: '2 mutual courses',
    tags: ['Evenings', 'Remote'],
    initials: 'MN',
  },
  {
    name: 'Zanele M.',
    major: 'PHY 101 · Mechanics',
    overlap: '1 mutual course',
    tags: ['Weekend', 'Library'],
    initials: 'ZM',
  },
  {
    name: 'Sam Lee',
    major: 'ENG 110 · Writing',
    overlap: '1 mutual course',
    tags: ['Afternoons'],
    initials: 'SL',
  },
  {
    name: 'Naledi S.',
    major: 'CS 301 · Algorithms',
    overlap: '2 mutual courses',
    tags: ['Morning', 'Library'],
    initials: 'NS',
  },
  {
    name: 'Pranav R.',
    major: 'STA 202 · Statistics',
    overlap: '1 mutual course',
    tags: ['Remote', 'Evenings'],
    initials: 'PR',
  },
  {
    name: 'Thando K.',
    major: 'CS 101 · Intro to CS',
    overlap: '1 mutual course',
    tags: ['On-campus', 'Afternoons'],
    initials: 'TK',
  },
  {
    name: 'Megan D.',
    major: 'HCI 210 · UX Basics',
    overlap: '0 mutual courses',
    tags: ['Weekend', 'Remote'],
    initials: 'MD',
  },
];

const TAGS = [
  'Morning',
  'Afternoons',
  'Evenings',
  'Weekend',
  'On-campus',
  'Remote',
  'Library',
] as const;

export default function Partners() {
  const card = 'bg-white rounded-2xl shadow-card p-6';
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [minMutual, setMinMutual] = useState<number>(0);

  // Modal state (reuses compact modal here for self-containment)
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [invited, setInvited] = useState(false);

  const suggestions = PEOPLE.slice(0, 4); // top suggestions section

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PEOPLE.filter((p) => {
      // text match: name, major, overlap, tags
      const textHay = `${p.name} ${p.major} ${p.overlap} ${p.tags.join(' ')}`.toLowerCase();
      const matchText = q === '' || textHay.includes(q);

      // tag filter: all selected tags must be present
      const matchTags = activeTags.length === 0 || activeTags.every((t) => p.tags.includes(t));

      // mutual courses: extract number from "3 mutual courses" / "1 mutual course"
      const n = parseInt(p.overlap.match(/\d+/)?.[0] ?? '0', 10);
      const matchMutual = n >= minMutual;

      return matchText && matchTags && matchMutual;
    });
  }, [query, activeTags, minMutual]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function clearFilters() {
    setQuery('');
    setActiveTags([]);
    setMinMutual(0);
  }

  function openModal(p: Suggestion) {
    setSelected(p);
    setInvited(false);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Find study partners</h1>

      {/* Suggestions */}
      <section className={card} aria-labelledby="suggestions-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="suggestions-title" className="font-semibold text-gray-900">
            Suggested for you
          </h2>
          <span className="text-sm text-gray-500">{suggestions.length} matches</span>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {s.overlap}
                    </span>
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => openModal(s)}
                className="px-3 py-1.5 rounded-full text-sm bg-white border border-gray-200 hover:bg-gray-50 shadow-soft"
              >
                Connect
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Search */}
      <section className={card} aria-labelledby="search-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="search-title" className="font-semibold text-gray-900">
            Search & filter
          </h2>
          <button
            onClick={clearFilters}
            className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
          >
            Clear all
          </button>
        </div>

        {/* Search bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label htmlFor="q" className="sr-only">
            Search by name, course, tag
          </label>
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, course, or tag…"
              className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {/* Mutual courses filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" aria-hidden="true" />
            <label htmlFor="mutual" className="text-sm text-gray-700">
              Min mutual courses:
            </label>
            <input
              id="mutual"
              type="number"
              min={0}
              max={5}
              value={minMutual}
              onChange={(e) => setMinMutual(Number(e.target.value))}
              className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-100"
              inputMode="numeric"
            />
          </div>
        </div>

        {/* Tag chips */}
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-gray-800">Filters</legend>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => {
              const active = activeTags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(t)}
                  className={[
                    'px-3 py-1 rounded-full text-sm border transition',
                    active
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Results count (SR + visual) */}
        <div className="mt-4 text-sm text-gray-600" aria-live="polite">
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </div>

        {/* Results list */}
        <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((p, i) => (
            <li
              key={`r-${i}`}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-sm font-semibold">
                  {p.initials}
                </div>
                <div>
                  <p className="font-medium text-gray-900 leading-tight">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.major}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {p.overlap}
                    </span>
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => openModal(p)}
                className="px-3 py-1.5 rounded-full text-sm bg-white border border-gray-200 hover:bg-gray-50 shadow-soft"
              >
                Connect
              </button>
            </li>
          ))}
        </ul>

        {results.length === 0 && (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            No matches. Try removing some filters.
          </div>
        )}
      </section>

      {/* Lightweight modal (local to this page) */}
      <CompactProfileModal
        open={open}
        person={selected}
        invited={invited}
        onInvite={() => setInvited(true)}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

/* ---------- Minimal modal for Partners page ---------- */
function CompactProfileModal({
  open,
  person,
  invited,
  onInvite,
  onClose,
}: {
  open: boolean;
  person: Suggestion | null;
  invited: boolean;
  onInvite: () => void;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open || !person) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-title"
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-md rounded-2xl bg-white shadow-card border border-gray-100 p-6"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold">
                {person.initials}
              </div>
              <div>
                <h3 id="p-title" className="text-lg font-semibold text-gray-900">
                  {person.name}
                </h3>
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
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {person.overlap}
              </span>
              {person.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              {person.bio ??
                'Studies similar modules and prefers overlapping study windows. Looks for a consistent weekly session.'}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onInvite}
              disabled={invited}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                invited
                  ? 'bg-gray-100 text-gray-500 cursor-default'
                  : 'bg-brand-500 text-white hover:opacity-95 shadow-card'
              }`}
            >
              {invited ? (
                <>
                  <Check className="w-4 h-4" /> Invite sent
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" /> Send invite
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
