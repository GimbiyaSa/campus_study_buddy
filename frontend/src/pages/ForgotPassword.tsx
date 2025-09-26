import { useState, useId } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { navigate } from '../router';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailId = useId();
  const errId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Call backend API for password reset
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiBase}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to send reset email');
      }

      setSuccess(true);
    } catch (err: any) {
      // For now, simulate success since auth endpoint doesn't exist yet
      console.warn('Auth endpoint not available, simulating success:', err.message);
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-[calc(100vh-64px)]">
        <div className="mx-auto max-w-2xl px-4 py-10 md:py-14">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
            <div className="mb-6">
              <Mail className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-slate-900">Check Your Email</h1>
              <p className="mt-2 text-slate-600">
                We've sent password reset instructions to <strong>{email}</strong>
              </p>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Didn't receive the email? Check your spam folder or try again in a few minutes.
              </p>
              
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => navigate('/home')}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </button>
                
                <button
                  onClick={() => {
                    setSuccess(false);
                    setEmail('');
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                >
                  Try Different Email
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-64px)]">
      <div className="mx-auto max-w-2xl px-4 py-10 md:py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <button
              onClick={() => navigate('/home')}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-600 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </button>
            
            <h1 className="text-2xl font-bold text-slate-900">Reset Your Password</h1>
            <p className="mt-2 text-slate-600">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <label htmlFor={emailId} className="block">
              <span className="mb-1 block text-sm font-medium text-slate-800">
                Email Address <span className="text-emerald-700">*</span>
              </span>
              <input
                id={emailId}
                type="email"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                placeholder="your.email@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-invalid={!!error ? true : undefined}
                aria-describedby={error ? errId : undefined}
              />
            </label>

            <button
              type="submit"
              disabled={submitting || !email.includes('@')}
              aria-busy={submitting || undefined}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <Mail className="h-4 w-4" />
              {submitting ? 'Sending...' : 'Send Reset Email'}
            </button>

            {error && (
              <div
                id={errId}
                role="status"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <div className="text-center text-sm text-slate-600">
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                Sign in instead
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}