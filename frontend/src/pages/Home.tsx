import { useState, useRef, useEffect } from 'react';
import { LogIn } from 'lucide-react';
import { navigate } from '../router';
import { useUser } from '../contexts/UserContext';
import logo from '../assets/logo.jpg';
import { buildApiUrl } from '../utils/url';

export default function Login() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useUser();
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return; // Google sign-in disabled when not configured

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
        callback: async (response: { credential?: string }) => {
          const idToken = response?.credential;
          if (!idToken) return;

          setSubmitting(true);
          try {
            const res = await fetch(buildApiUrl('/api/v1/users/me'), {
              method: 'GET',
              headers: { Authorization: 'Bearer ' + idToken },
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Sign-in failed: ${res.status} ${errText}`);
            }

            const user = await res.json();
            login(user);
            navigate('/dashboard');
          } catch (err: any) {
            setError(err?.message || 'Google sign-in failed');
          } finally {
            setSubmitting(false);
          }
        },
      });

      if (googleBtnRef.current) {
        win.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
        });
      }
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Mock user matching the database test user created by seed script
      const mockUser = {
        user_id: 13, // This matches the user_id from the database
        email: 'test.user@example.com',
        first_name: 'Test',
        last_name: 'User',
        university: 'DevUniversity',
        course: 'Computer Science',
        year_of_study: 3,
        profile_image_url: undefined,
        is_active: true
      };
      
      // Use the login function from UserContext
      login(mockUser);
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
              {/* Google Sign-In button container (rendered by Google's JS) */}
              <div className="mt-3" ref={googleBtnRef}></div>

              {/* Temporary bypass button for testing - remove when Google auth is working */}
              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting || undefined}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                <LogIn className="h-4 w-4" />
                {submitting ? 'Logging in…' : 'Login'}
              </button>

              {error && (
                <div
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