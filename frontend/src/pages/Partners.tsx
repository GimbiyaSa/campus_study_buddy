// src/pages/Partners.tsx
import { useMemo, useState, useLayoutEffect, useRef, useEffect } from 'react';
import { Search, Filter, X, Mail, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { type StudyPartner, FALLBACK_PARTNERS } from '../services/dataService';

type Suggestion = {
  name: string;
  major: string; // e.g., "CS 201 · Data Structures"
  overlap: string; // e.g., "3 mutual courses"
  tags: string[]; // e.g., ["Morning", "On-campus"]
  initials: string; // e.g., "AK"
  bio?: string;
};

const PEOPLE: Suggestion[] = [
  { name: 'Aisha Khan', major: 'CS 201 · Data Structures', overlap: '3 mutual courses', tags: ['Morning', 'On-campus'], initials: 'AK' },
  { name: 'Martin Nel', major: 'MATH 204 · Linear Algebra', overlap: '2 mutual courses', tags: ['Evenings', 'Remote'], initials: 'MN' },
  { name: 'Zanele M.', major: 'PHY 101 · Mechanics', overlap: '1 mutual course', tags: ['Weekend', 'Library'], initials: 'ZM' },
  { name: 'Sam Lee', major: 'ENG 110 · Writing', overlap: '1 mutual course', tags: ['Afternoons'], initials: 'SL' },
  { name: 'Naledi S.', major: 'CS 301 · Algorithms', overlap: '2 mutual courses', tags: ['Morning', 'Library'], initials: 'NS' },
  { name: 'Pranav R.', major: 'STA 202 · Statistics', overlap: '1 mutual course', tags: ['Remote', 'Evenings'], initials: 'PR' },
  { name: 'Thando K.', major: 'CS 101 · Intro to CS', overlap: '1 mutual course', tags: ['On-campus', 'Afternoons'], initials: 'TK' },
  { name: 'Megan D.', major: 'HCI 210 · UX Basics', overlap: '0 mutual courses', tags: ['Weekend', 'Remote'], initials: 'MD' },
];

const TAGS = ['Morning', 'Afternoons', 'Evenings', 'Weekend', 'On-campus', 'Remote', 'Library'] as const;

export default function Partners() {
  const card = 'bg-white rounded-2xl shadow-card p-6';
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [minMutual, setMinMutual] = useState<number>(0);

  // Modal state (kept)
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [invited, setInvited] = useState(false);

  // Buddies (friend list) — match StudyPartner from data service
  const [buddies, setBuddies] = useState<StudyPartner[]>([]);
  const [buddiesLoading, setBuddiesLoading] = useState(true);
  const [buddiesError, setBuddiesError] = useState<string | null>(null);

  const suggestions = PEOPLE.slice(0, 4);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PEOPLE.filter((p) => {
      const textHay = `${p.name} ${p.major} ${p.overlap} ${p.tags.join(' ')}`.toLowerCase();
      const matchText = q === '' || textHay.includes(q);
      const matchTags = activeTags.length === 0 || activeTags.every((t) => p.tags.includes(t));
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

  // ---------- buddies fetch + live updates ----------
  useEffect(() => {
    let mounted = true;

    async function fetchBuddies() {
      setBuddiesLoading(true);
      setBuddiesError(null);
      try {
        const res = await fetch('/api/v1/partners', { headers: authHeadersJSON(), credentials: 'include' });
        if (!res.ok) {
          if (mounted) {
            setBuddies(FALLBACK_PARTNERS); // testing fallback
            setBuddiesError('Failed to load connections');
          }
        } else {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          if (mounted) {
            setBuddies(list.length > 0 ? list.map(toStudyPartner) : FALLBACK_PARTNERS);
          }
        }
      } catch (err) {
        console.error('Failed to fetch buddies:', err);
        if (mounted) {
          setBuddies(FALLBACK_PARTNERS); // testing fallback
          setBuddiesError('Failed to load connections');
        }
      } finally {
        if (mounted) setBuddiesLoading(false);
      }
    }

    fetchBuddies();

    const onAdded = (e: Event) => {
      const detail: any = (e as CustomEvent).detail;
      if (!detail) return;
      const b = toStudyPartner(detail);
      setBuddies((prev) => (prev.some((x) => String(x.id) === String(b.id)) ? prev : [b, ...prev]));
    };
    const onInvalidate = () => fetchBuddies();

    window.addEventListener('buddy:connected', onAdded as EventListener);
    window.addEventListener('buddies:invalidate', onInvalidate);
    return () => {
      mounted = false;
      window.removeEventListener('buddy:connected', onAdded as EventListener);
      window.removeEventListener('buddies:invalidate', onInvalidate);
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Find study partners</h1>

      {/* Layout: 2 left cards + right column spanning both */}
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:auto-rows-min gap-6">
        {/* Suggested for you (left, row 1) */}
        <section className={card + ' lg:col-span-2'} aria-labelledby="suggestions-title">
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

        {/* My study buddies (right column spans both rows) */}
        <aside className={card + ' lg:col-start-3 lg:row-span-2 lg:sticky lg:top-2'} aria-labelledby="buddies-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="buddies-title" className="font-semibold text-gray-900">
              My study buddies
            </h2>
            <span className="text-sm text-gray-500">{buddies.length}</span>
          </div>

          {buddiesError && (
            <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2 mb-3">
              Showing fallback connections
            </div>
          )}

          {buddiesLoading ? (
            <div className="text-sm text-slate-600">Loading connections…</div>
          ) : buddies.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              No connections yet. Send a few invites from <span className="font-medium">Suggested for you</span>.
            </div>
          ) : (
            <ul className="space-y-3">
              {buddies.map((b) => {
                const initials = initialsFrom(b.name || '—');
                return (
                  <li
                    key={String(b.id)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-semibold">
                        {initials}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{b.name}</p>
                        <p className="text-xs text-gray-500">
                          {b.major || b.year || (b.courses?.[0] ?? '') || b.lastActive || '—'}
                        </p>
                      </div>
                    </div>
                    {/* quick actions placeholder (chat/schedule) */}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Search & filter (left, row 2) */}
        <section className={card + ' lg:col-span-2'} aria-labelledby="search-title">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
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

          {/* Results count */}
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
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
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
      </div>

      {/* Modal */}
      <CompactProfileModal
        open={open}
        person={selected}
        invited={invited}
        onInvite={() => {
          setInvited(true);
          window.dispatchEvent(new Event('buddies:invalidate'));
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

/* ---------- Minimal modal for Partners page (unchanged visually) ---------- */
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
      <div role="dialog" aria-modal="true" aria-labelledby="p-title" className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div ref={dialogRef} className="w-full max-w-md rounded-2xl bg-white shadow-card border border-gray-100 p-6">
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
            <button ref={closeBtnRef} aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-gray-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{person.overlap}</span>
              {person.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              {person.bio ?? 'Studies similar modules and prefers overlapping study windows. Looks for a consistent weekly session.'}
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
                invited ? 'bg-gray-100 text-gray-500 cursor-default' : 'bg-brand-500 text-white hover:opacity-95 shadow-card'
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

/* ---------- helpers ---------- */
function authHeadersJSON(): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json');
  const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (raw) {
    let t: string = raw;
    try {
      const p = JSON.parse(raw);
      if (typeof p === 'string') t = p;
    } catch {}
    t = t.replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
    if (t) h.set('Authorization', `Bearer ${t}`);
  }
  return h;
}

function initialsFrom(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function toStudyPartner(anyObj: any): StudyPartner {
  return {
    id: String(anyObj?.id ?? anyObj?.user_id ?? anyObj?._id ?? cryptoRandomId()),
    name: String(
      anyObj?.name ??
      (
        [anyObj?.firstName, anyObj?.lastName].filter(Boolean).join(' ') ||
        anyObj?.email ||
        'Unknown'
      )
    ),
    avatar: anyObj?.avatar || undefined,
    year: anyObj?.year || anyObj?.profile?.year || '',
    major: anyObj?.major || anyObj?.profile?.major || '',
    courses: Array.isArray(anyObj?.courses) ? anyObj.courses : [],
    bio: anyObj?.bio || undefined,
    studyHours: Number(anyObj?.studyHours ?? 0),
    rating: Number(anyObj?.rating ?? 0),
    lastActive: anyObj?.lastActive || '',
  };
}

function cryptoRandomId() {
  try {
    // browser-friendly unique id
    // @ts-ignore
    return (crypto?.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}
