import React, { useEffect, useMemo, useState, useId, cloneElement, isValidElement } from 'react';
import { User, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { DataService } from '../services/dataService';

type StudentProfile = {
  fullName: string;
  email: string;
  studentId: string;
  bio: string;
  availableForStudyPartners: boolean;
  notifyReminders: boolean;
  avatarUrl?: string;
};

const STORAGE_KEY = 'csb.profile';

const DEFAULT_PROFILE: StudentProfile = {
  fullName: 'Aisha Mthembu',
  email: 'aisha.mthembu@example.edu',
  studentId: 'STU-2025-001',
  bio: 'Curious about algorithms, enjoys study groups, and builds small React apps.',
  availableForStudyPartners: true,
  notifyReminders: true,
  avatarUrl: '',
};

function loadProfile(): StudentProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export default function ProfilePage() {
  const [form, setForm] = useState<StudentProfile>(loadProfile());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});

  useEffect(() => {
    const e: typeof errors = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Please enter a valid email.';
    setErrors(e);
  }, [form.fullName, form.email]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await DataService.getUserProfile();
      if (!alive) return;
      if (u) {
        // map backend → StudentProfile
        const mapped = DataService.mapUserToStudentProfile(u);
        setForm((prev) => ({ ...prev, ...mapped }));
        // optional: cache to localStorage as a fallback
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const initials = useMemo(() => {
    const parts = form.fullName.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }, [form.fullName]);

  const isValid = Object.keys(errors).length === 0;

  function handleChange<K extends keyof StudentProfile>(key: K, val: StudentProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    try {
      // map form → backend patch shape
      const patch = DataService.mapFormToUserUpdate(form);
      const updated = await DataService.updateUserProfile(patch);

      // reflect what server returns (or keep the form if null)
      if (updated) {
        const mapped = DataService.mapUserToStudentProfile(updated);
        setForm(mapped);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)); // keep cache warm
      } else {
        // backend down? keep local fallback up-to-date
        localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      }

      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full min-h-[calc(100vh-64px)] bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
            <p className="text-sm text-slate-700">Manage your personal details and preferences.</p>
          </div>
          {savedAt && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Saved</span>
            </div>
          )}
        </header>

        {/* Live region for screen readers */}
        <div aria-live="polite" className="sr-only">
          {savedAt ? 'Profile saved' : ''}
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-[280px,1fr]">
          {/* Avatar / summary card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center">
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt={form.fullName ? `${form.fullName}'s avatar` : 'User avatar'}
                  className="h-28 w-28 rounded-full object-cover ring-2 ring-slate-200"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700 ring-2 ring-slate-200">
                  {initials || <User className="h-10 w-10" aria-hidden="true" />}
                </div>
              )}

              <div className="mt-4 w-full text-center">
                <div className="text-base font-semibold break-words">{form.fullName}</div>
                <div className="text-sm text-slate-700 break-words">{form.email}</div>
              </div>

              <div className="mt-4 grid w-full grid-cols-1 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-600">Student ID</div>
                  <div className="font-medium break-words">{form.studentId || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Editable form */}
          <form
            onSubmit={handleSave}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            noValidate
          >
            <div className="grid gap-5">
              <Field
                label="Full name"
                error={errors.fullName}
                icon={<User className="h-4 w-4" aria-hidden="true" />}
                required
              >
                <input
                  className={inputCls(!!errors.fullName)}
                  value={form.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  placeholder="Your full name"
                />
              </Field>

              <Field
                label="Email"
                error={errors.email}
                icon={<Mail className="h-4 w-4" aria-hidden="true" />}
                required
              >
                <input
                  className={inputCls(!!errors.email)}
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  type="email"
                  inputMode="email"
                  placeholder="you@university.edu"
                />
              </Field>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Student ID">
                  <input
                    className={inputCls(false)}
                    value={form.studentId}
                    onChange={(e) => handleChange('studentId', e.target.value)}
                    placeholder="e.g., STU-2025-001"
                  />
                </Field>
              </div>
              <Field label="Bio">
                <textarea
                  className={inputCls(false)}
                  rows={4}
                  value={form.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  placeholder="A short intro that study partners will see."
                />
              </Field>

              <div className="grid gap-5 md:grid-cols-2">
                <ToggleRow
                  label="Available for study partners"
                  checked={form.availableForStudyPartners}
                  onChange={(v) => handleChange('availableForStudyPartners', v)}
                />
                <ToggleRow
                  label="Enable notifications & reminders"
                  checked={form.notifyReminders}
                  onChange={(v) => handleChange('notifyReminders', v)}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!isValid || saving}
                  className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {!isValid && (
                  <div className="inline-flex items-center gap-1 text-sm text-rose-700">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <span>Fix the fields marked in red.</span>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reusable Field (labels + ids + aria wiring) ---------- */
function Field({
  label,
  children,
  icon,
  error,
  required = false,
  id,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  error?: string;
  required?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? `fld-${autoId}`;
  const errId = `${fieldId}-err`;

  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<any>, {
        id: fieldId,
        'aria-invalid': !!error || undefined,
        'aria-describedby': error ? errId : undefined,
        required: required || undefined,
      })
    : children;

  return (
    <div className="block">
      <label
        htmlFor={fieldId}
        className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-800"
      >
        {icon}
        <span>
          {label}
          {required && <span className="ml-1 text-rose-600">*</span>}
        </span>
      </label>
      <div>{child}</div>
      {error && (
        <p id={errId} className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return [
    'w-full rounded-xl border bg-white px-3 py-2 outline-none transition',
    hasError
      ? 'border-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500'
      : 'border-slate-300 focus:ring-2 focus:ring-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
  ].join(' ');
}

/* ---------- Accessible Switch / Toggle ---------- */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const autoId = useId();
  const labelId = `tgl-${autoId}-label`;

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span id={labelId} className="text-sm font-medium text-slate-800">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={[
          'relative inline-flex items-center rounded-full transition',
          'h-8 w-14',
          checked ? 'bg-brand-600' : 'bg-slate-300',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-6 w-6 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-7' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  );
}
