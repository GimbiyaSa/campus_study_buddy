import { useId, useMemo, useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, UserPlus, Building2 } from 'lucide-react';
import { navigate } from '../router';
import logo from '../assets/logo.jpg';

type Tab = 'student' | 'organization';

export default function Register() {
  const [tab, setTab] = useState<Tab>('student');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Student
  const [sFullName, setSFullName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPwd, setSPwd] = useState('');
  const [sShowPwd, setSShowPwd] = useState(false);
  const [sUniversity, setSUniversity] = useState('');
  const [sCourse, setSCourse] = useState('');
  const [sYear, setSYear] = useState('');

  // --- Organization
  const [oName, setOName] = useState('');
  const [oAdminName, setOAdminName] = useState('');
  const [oAdminEmail, setOAdminEmail] = useState('');
  const [oPwd, setOPwd] = useState('');
  const [oShowPwd, setOShowPwd] = useState(false);
  const [oDomain, setODomain] = useState('');
  const [oLocation, setOLocation] = useState('');

  const lrId = useId();
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google Sign-In will be disabled.');
      return;
    }

    const win = window as any;
    // load the Google Identity script if not already loaded
    const existing = document.getElementById('google-identity-script');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.id = 'google-identity-script';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      script.onload = () => initializeGoogle();
    } else {
      initializeGoogle();
    }

    function initializeGoogle() {
      if (!win.google?.accounts?.id) {
        // Some delay could be necessary if script hasn't fully initialized
        setTimeout(() => initializeGoogle(), 200);
        return;
      }

      win.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      if (googleBtnRef.current) {
        win.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
        });
      }
    }
  }, []);

  async function handleCredentialResponse(response: { credential?: string }) {
    const idToken = response?.credential;
    if (!idToken) {
      setError('Google sign-in failed (no token).');
      return;
    }

    setSubmitting(true);
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
      const url = apiBase.replace(/\/$/, '') + '/api/v1/users/me';
      console.debug('Calling backend URL:', url);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + idToken },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to sign in with Google');
      }

      // success: backend returns user object
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  const requiredErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (tab === 'student') {
      if (!sFullName.trim()) errs.sFullName = 'Full name is required.';
      if (!/^\S+@\S+\.\S+$/.test(sEmail)) errs.sEmail = 'Enter a valid email.';
      if (!sPwd || sPwd.length < 8) errs.sPwd = 'Password must be at least 8 characters.';
      if (!sUniversity.trim()) errs.sUniversity = 'University is required.';
      if (!sCourse.trim()) errs.sCourse = 'Course / Program is required.';
      if (!sYear.trim()) errs.sYear = 'Year is required.';
    } else {
      if (!oName.trim()) errs.oName = 'Organization name is required.';
      if (!oAdminName.trim()) errs.oAdminName = 'Admin name is required.';
      if (!/^\S+@\S+\.\S+$/.test(oAdminEmail)) errs.oAdminEmail = 'Enter a valid email.';
      if (!oPwd || oPwd.length < 8) errs.oPwd = 'Password must be at least 8 characters.';
      if (!oDomain.trim()) errs.oDomain = 'Email domain is required.';
      if (!oLocation.trim()) errs.oLocation = 'Location is required.';
    }
    return errs;
  }, [
    tab,
    sFullName,
    sEmail,
    sPwd,
    sUniversity,
    sCourse,
    sYear,
    oName,
    oAdminName,
    oAdminEmail,
    oPwd,
    oDomain,
    oLocation,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (Object.keys(requiredErrors).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      // TODO: call your real endpoints:
      // if (tab === "student") await fetch("/api/auth/register/student", { ... })
      // else await fetch("/api/auth/register/org", { ... })
      navigate('/login');
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)]">
      <div id={lrId} aria-live="polite" className="sr-only">
        {submitting ? 'Submitting registration' : error ? `Error: ${error}` : ''}
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 md:p-6">
          {/* Left: form */}
          <section aria-labelledby="reg-title" className="px-2 py-2 md:px-4 md:py-4">
            <header className="mb-6">
              <h1 id="reg-title" className="text-2xl font-semibold tracking-tight">
                Create your account
              </h1>
              <p className="mt-1 text-slate-600 text-sm">
                Choose your account type and fill in the details.
              </p>
            </header>

            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Account type"
              className="mb-4 inline-flex rounded-xl border border-slate-200 p-1"
            >
              <button
                role="tab"
                aria-selected={tab === 'student'}
                onClick={() => setTab('student')}
                className={[
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                  tab === 'student'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                <UserPlus className="h-4 w-4" />
                Student
              </button>
              <button
                role="tab"
                aria-selected={tab === 'organization'}
                onClick={() => setTab('organization')}
                className={[
                  'ml-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                  tab === 'organization'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                <Building2 className="h-4 w-4" />
                Organization
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              {tab === 'student' ? (
                <>
                  <Field
                    label="Full name"
                    value={sFullName}
                    onChange={setSFullName}
                    placeholder="e.g., Aisha Mthembu"
                    required
                    error={requiredErrors.sFullName}
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={sEmail}
                    onChange={setSEmail}
                    placeholder="you@university.edu"
                    required
                    error={requiredErrors.sEmail}
                    autoComplete="email"
                  />
                  <PasswordField
                    label="Password"
                    value={sPwd}
                    onChange={setSPwd}
                    show={sShowPwd}
                    setShow={setSShowPwd}
                    required
                    error={requiredErrors.sPwd}
                  />
                  <Field
                    label="University"
                    value={sUniversity}
                    onChange={setSUniversity}
                    placeholder="e.g., UniXYZ"
                    required
                    error={requiredErrors.sUniversity}
                  />
                  <Field
                    label="Course / Program"
                    value={sCourse}
                    onChange={setSCourse}
                    placeholder="e.g., BSc Computer Science"
                    required
                    error={requiredErrors.sCourse}
                  />
                  <Field
                    label="Year"
                    value={sYear}
                    onChange={setSYear}
                    placeholder="e.g., 3"
                    required
                    error={requiredErrors.sYear}
                    inputMode="numeric"
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Organization name"
                    value={oName}
                    onChange={setOName}
                    placeholder="e.g., Greenfields University"
                    required
                    error={requiredErrors.oName}
                  />
                  <Field
                    label="Admin name"
                    value={oAdminName}
                    onChange={setOAdminName}
                    placeholder="e.g., Thandi Dlamini"
                    required
                    error={requiredErrors.oAdminName}
                  />
                  <Field
                    label="Admin email"
                    type="email"
                    value={oAdminEmail}
                    onChange={setOAdminEmail}
                    placeholder="admin@university.edu"
                    required
                    error={requiredErrors.oAdminEmail}
                    autoComplete="email"
                  />
                  <PasswordField
                    label="Password"
                    value={oPwd}
                    onChange={setOPwd}
                    show={oShowPwd}
                    setShow={setOShowPwd}
                    required
                    error={requiredErrors.oPwd}
                  />
                  <Field
                    label="Email domain"
                    value={oDomain}
                    onChange={setODomain}
                    placeholder="university.edu"
                    required
                    error={requiredErrors.oDomain}
                  />
                  <Field
                    label="Location"
                    value={oLocation}
                    onChange={setOLocation}
                    placeholder="City, Country"
                    required
                    error={requiredErrors.oLocation}
                  />
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting || undefined}
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>

              <p className="text-sm text-slate-700">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 rounded"
                >
                  Sign in
                </button>
              </p>

              {error && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                >
                  {error}
                </div>
              )}

              {/* Divider + Google Sign-In */}
              <div className="mt-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-100" />
                <div className="text-sm text-slate-400">or</div>
                <div className="h-px flex-1 bg-slate-100" />
              </div>

              <div className="mt-3">
                <div ref={googleBtnRef} />
                {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                  <div className="mt-2 text-xs text-slate-500">Google Sign-In disabled (no client id)</div>
                )}
              </div>
            </form>
          </section>

          {/* Right: visual + info */}
          <aside className="overflow-hidden">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl">
              <img
                src={logo}
                alt="Campus Study Buddy"
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
              />
            </div>
            <div className="mt-4 grid gap-3">
              <InfoCard title="Why join as a student?">
                Get matched with classmates, form groups, share notes, and plan study sessions.
              </InfoCard>
              <InfoCard title="Why register an organization?">
                Publish official courses/modules, support cohorts, and enable campus-wide groups.
              </InfoCard>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/* ---------- Reusable fields ---------- */

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'email';
  error?: string;
  autoComplete?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = useId();
  const {
    label,
    value,
    onChange,
    placeholder,
    required,
    type = 'text',
    error,
    autoComplete,
    inputMode,
  } = props;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-emerald-700">*</span>}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={[
          'w-full rounded-xl border bg-slate-50 px-3 py-2 outline-none',
          error
            ? 'border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600'
            : 'border-slate-300 focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600',
        ].join(' ')}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-emerald-700">
          {error}
        </p>
      )}
    </label>
  );
}

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  const { label, value, onChange, show, setShow, required, error } = props;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-emerald-700">*</span>}
      </span>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          autoComplete="new-password"
          className={[
            'w-full rounded-xl border bg-slate-50 px-3 py-2 pr-12 outline-none',
            error
              ? 'border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600'
              : 'border-slate-300 focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600',
          ].join(' ')}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-emerald-700">
          {error}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-600">Use at least 8 characters.</p>
    </label>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="font-medium">{title}</div>
      <p className="text-sm text-slate-600">{children}</p>
    </div>
  );
}
