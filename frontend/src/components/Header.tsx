// src/components/Header.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronDown, User } from 'lucide-react';

type Me = { id: string; name?: string; given_name?: string; email?: string };

function firstNameFrom(me: Me | null) {
  if (!me) return 'there';
  const raw = me.name || me.given_name || (me.email ? me.email.split('@')[0] : '');
  if (!raw) return 'there';
  const first = raw.trim().split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function Header({ lessonCount = 0 }: { lessonCount?: number }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuWidth = 176;

  const updatePosition = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 8 + window.scrollY, left: r.right - menuWidth + window.scrollX });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return;
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
  const ac = new AbortController();
  (async () => {
    try {
      const token = localStorage.getItem('access_token'); // from your login / MSAL flow
      if (!token) throw new Error('no token');

      const res = await fetch('/users/me', {
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      });

      if (res.status === 401 || res.status === 403) {
        // token missing/invalid – send the user to login
        window.location.assign('/home');
        return;
      }

      if (!res.ok) throw new Error(String(res.status));
      const me = await res.json();
      setMe(me);
    } catch {
      setMe(null);
    } finally {
      setLoadingMe(false);
    }
  })();
  return () => ac.abort();
}, []);

  const displayName = loadingMe ? 'there' : firstNameFrom(me);

  return (
    <header className="m-6 md:m-8">
      <div className="relative rounded-2xl shadow-card text-gray-900">
        <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-brand-100 via-white to-brand-50 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Hi {displayName}!</h1>
              <p className="mt-1 text-sm text-gray-600">
                You have completed <span className="font-semibold text-brand-700">{lessonCount} lessons</span> in the last day. Start your learning today.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" aria-label="Notifications, 1 unread" className="relative p-2 rounded-full hover:bg-white/70 transition shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70">
                <Bell className="w-5 h-5 text-gray-700" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              <button type="button" ref={buttonRef} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="true" className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-white/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70">
                <div className="w-9 h-9 rounded-full bg-brand-500 text-white grid place-items-center"><User className="w-5 h-5" /></div>
                <ChevronDown className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {open &&
        createPortal(
          <>
            <button aria-label="Close menu" className="fixed inset-0 z-[9998] bg-transparent cursor-default" onClick={() => setOpen(false)} />
            <ul className="fixed z-[9999] w-44 bg-white text-gray-800 rounded-xl shadow-card py-2" style={{ top: `${pos.top}px`, left: `${pos.left}px` }}>
              <li><a href="/profile" className="block px-4 py-2 hover:bg-gray-50">Profile</a></li>
              <li><a href="/settings" className="block px-4 py-2 hover:bg-gray-50">Settings</a></li>
              <li><a href="/logout" className="block px-4 py-2 hover:bg-gray-50">Logout</a></li>
            </ul>
          </>,
          document.body
        )}
    </header>
  );
}
