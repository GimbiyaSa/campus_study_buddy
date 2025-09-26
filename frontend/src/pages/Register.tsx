import { useId, useMemo, useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, UserPlus, Building2 } from 'lucide-react';
import { navigate } from '../router';
import logo from '../assets/logo.jpg';

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="#4285F4"
        d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18Z"
      />
      <path
        fill="#34A853"
        d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75c-2.09 0-3.86-1.4-4.49-3.29H1.83v2.07A8 8 0 0 0 8.98 17Z"
      />
      <path
        fill="#FBBC05"
        d="M4.49 10.48A4.77 4.77 0 0 1 4.25 9c0-.51.08-1.01.24-1.48V5.45H1.83A8 8 0 0 0 .98 9c0 1.3.31 2.52.85 3.6l2.66-2.12Z"
      />
      <path
        fill="#EA4335"
        d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.15 4.45l2.66 2.07c.63-1.89 2.4-3.29 4.49-3.29Z"
      />
    </svg>
  );
}

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
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3002';
      const base = apiBase.replace(/\/$/, '');
      const exchange = await fetch(`${base}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });
      if (!exchange.ok) {
        const body = await exchange.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to establish session');
      }
      const res = await fetch(`${base}/api/v1/users/me`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to fetch profile');
      }
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
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002';
      
      if (tab === 'student') {
        const studentData = {
          first_name: sFullName.split(' ')[0],
          last_name: sFullName.split(' ').slice(1).join(' '),
          email: sEmail,
          password: sPwd,
          university: sUniversity,
          course: sCourse,
          year_of_study: parseInt(sYear),
          user_type: 'student'
        };

        const response = await fetch(`${apiBase}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(studentData)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Registration failed');
        }

        // Get the response data (student)
        const responseData = await response.json();
        console.log('Student registration successful:', responseData);
        
        // Show success message
        setError('✅ Registration successful! Welcome to Campus Study Buddy. You can now sign in.');
        
        // Clear form fields
        setSFullName('');
        setSEmail('');
        setSPwd('');
        setSUniversity('');
        setSCourse('');
        setSYear('');
        
        // Redirect to login after showing success
        setTimeout(() => navigate('/home'), 3000);
        return; // Don't continue to the next navigation
      } else {
        const orgData = {
          organization_name: oName,
          admin_name: oAdminName,
          admin_email: oAdminEmail,
          password: oPwd,
          email_domain: oDomain,
          location: oLocation,
          user_type: 'organization'
        };

        const response = await fetch(`${apiBase}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orgData)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Registration failed');
        }

        // Get the response data (organization)
        const responseData = await response.json();
        console.log('Organization registration successful:', responseData);
        
        // Show success message
        setError('✅ Organization registration successful! Welcome to Campus Study Buddy. You can now sign in.');
        
        // Clear form fields
        setOName('');
        setOAdminName('');
        setOAdminEmail('');
        setOPwd('');
        setODomain('');
        setOLocation('');
        
        // Redirect to login after showing success
        setTimeout(() => navigate('/home'), 3000);
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err.message || 'Registration failed. Please try again.');
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
                    placeholder="John Doe"
                    required
                    error={requiredErrors.sFullName}
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={sEmail}
                    onChange={setSEmail}
                    placeholder="johndoe@university.edu"
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
                    placeholder="University of Technology"
                    required
                    error={requiredErrors.sUniversity}
                  />
                  <Field
                    label="Course / Program"
                    value={sCourse}
                    onChange={setSCourse}
                    placeholder="Computer Science"
                    required
                    error={requiredErrors.sCourse}
                  />
                  <Field
                    label="Year"
                    value={sYear}
                    onChange={setSYear}
                    placeholder="3"
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
                    placeholder="University of Technology"
                    required
                    error={requiredErrors.oName}
                  />
                  <Field
                    label="Admin name"
                    value={oAdminName}
                    onChange={setOAdminName}
                    placeholder="John Doe"
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
                  onClick={() => navigate('/home')}
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

              {/* Divider */}
              <div className="relative my-4">
                <div className="h-px w-full bg-slate-200" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-xs text-slate-500">
                  or
                </span>
              </div>

              {/* Google Sign-In Button */}
              <div className="flex flex-col items-stretch gap-2">
                <div ref={googleBtnRef} className="flex justify-center" />
                {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                  <>
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 shadow-sm opacity-70"
                    >
                      <GoogleGlyph className="h-5 w-5" />
                      Continue with Google
                    </button>
                    <p className="text-center text-xs text-slate-500">
                      Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable Google Sign‑In.
                    </p>
                  </>
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
