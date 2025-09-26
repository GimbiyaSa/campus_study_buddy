import { useState, useId, useEffect, useRef } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { navigate } from '../router';
import { useUser } from '../contexts/UserContext';
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

export default function Login() {
  const [username, setUsername] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = useId();
  const pwdId = useId();
  const errId = useId();
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const { login } = useUser();

  // Handles standard login. Replace with real backend auth when available.
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!username.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!pwd.trim()) {
      setError('Please enter your password');
      return;
    }
    if (pwd.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002';
      const base = apiBase.replace(/\/$/, '');

      // 1) Perform credential login
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: username, password: pwd })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Invalid credentials');
      }

      // 2) Get the current user profile using session cookie
      const me = await fetch(`${base}/api/v1/users/me`, {
        method: 'GET',
        credentials: 'include'
      });
      if (!me.ok) {
        const body = await me.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to fetch user');
      }
      const user = await me.json();
      login({
        user_id: user.id || user.user_id,
        email: user.email,
        first_name: user.firstName || user.first_name,
        last_name: user.lastName || user.last_name,
        university: user.university || '',
        course: user.course || '',
        year_of_study: user.yearOfStudy || user.year_of_study || 0,
        profile_image_url: user.profileImageUrl || user.profile_image_url,
        is_active: user.isActive !== undefined ? user.isActive : (user.is_active ?? true),
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Placeholder for Google Auth integration - commented out until implemented
  // async function handleGoogleLogin() {
  //   setError(null);
  //   setSubmitting(true);
  //   try {
  //     // TODO: Integrate Google Auth here
  //     // Example: await loginWithGoogle();
  //     throw new Error('Google login not yet implemented.');
  //   } catch (err: any) {
  //     setError(err?.message || 'Google login failed.');
  //   } finally {
  //     setSubmitting(false);
  //   }
  // }

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google Sign-In will be disabled.');
      return;
    }

    const win = window as any;
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
      // Exchange Google ID token for app session cookie
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
      // Then fetch the current user using the cookie
      const res = await fetch(`${base}/api/v1/users/me`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to fetch profile');
      }
      const user = await res.json();
      login(user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)]">
      <div aria-live="polite" className="sr-only">
        {submitting ? 'Logging in' : error ? `Error: ${error}` : ''}
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 md:p-6">
          <section aria-labelledby="login-title" className="px-2 py-2 md:px-4 md:py-4">
            <div className="mb-6">
              <p className="mt-2 text-3xl font-extrabold">
                <span className="text-emerald-600">Campus </span>
                <span className="text-slate-900">Study </span>
                <span className="text-slate-900">Buddy</span>
              </p>
            </div>

            {/* ...form appears first now; social login moved to bottom ... */}

            <form onSubmit={handleLogin} className="grid gap-4" noValidate>
              <label htmlFor={userId} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Email <span className="text-emerald-700">*</span>
                </span>
                <input
                  id={userId}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                  placeholder="Enter your email address"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={!!error && !username ? true : undefined}
                  aria-describedby={error && !username ? errId : undefined}
                />
                <div className="mt-1 text-xs text-slate-500">
                  Enter your email address
                </div>
              </label>

              <label htmlFor={pwdId} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Password <span className="text-emerald-700">*</span>
                </span>
                <div className="relative">
                  <input
                    id={pwdId}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                    placeholder="Enter your password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    type={showPwd ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    aria-invalid={!!error && !pwd ? true : undefined}
                    aria-describedby={error && !pwd ? errId : undefined}
                  />
                  <button
                    type="button"
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                  >
                    {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Minimum 8 characters required
                </div>
              </label>

              <nav className="mt-1 space-y-1 text-sm">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 rounded"
                >
                  Forgot your password?
                </button>
              </nav>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting || undefined}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                <LogIn className="h-4 w-4" />
                {submitting ? 'Logging in…' : 'Login'}
              </button>

              <p className="mt-2 text-sm text-slate-700">
                Don’t have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 rounded"
                >
                  Get started
                </button>
              </p>

              {error && (
                <div
                  id={errId}
                  role="status"
                  className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  aria-live="assertive"
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

              {/* Social login: Google at the bottom */}
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
          </aside>
        </div>
      </div>
    </main>
  );
}
