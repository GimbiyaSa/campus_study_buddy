import { useState, useId } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { navigate } from '../router';
import logo from '../assets/logo.jpg';

export default function Login() {
  const [username, setUsername] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = useId();
  const pwdId = useId();
  const errId = useId();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // TODO: replace with real auth
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed');
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

            <form onSubmit={handleLogin} className="grid gap-4" noValidate>
              <label htmlFor={userId} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Username <span className="text-emerald-700">*</span>
                </span>
                <input
                  id={userId}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                  placeholder="e.g., gimbiyas"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  aria-invalid={!!error && !username ? true : undefined}
                  aria-describedby={error && !username ? errId : undefined}
                />
              </label>

              <label htmlFor={pwdId} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Password <span className="text-emerald-700">*</span>
                </span>
                <div className="relative">
                  <input
                    id={pwdId}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                    placeholder="••••••••"
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
              </label>

              <nav className="mt-1 space-y-1 text-sm">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 rounded"
                >
                  Forgot your password?
                </button>
                <br />
                <button
                  type="button"
                  onClick={() => navigate('/forgot-username')}
                  className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 rounded"
                >
                  Forgot your username?
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
                  className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                >
                  {error}
                </div>
              )}
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
