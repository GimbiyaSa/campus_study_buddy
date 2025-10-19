// src/components/Header.tsx
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { buildApiUrl } from '../utils/url';
import NotificationHandler from './NotificationHandler';
import { DataService } from '../services/dataService';

export default function Header() {
  const { currentUser, loading, logout } = useUser();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Modal states
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoutClick = () => {
    setShowUserMenu(false);
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      // Call logout API endpoint
      await fetch(buildApiUrl('/api/v1/auth/logout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add auth headers if needed
        },
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }

    try {
      // Try to disable Google's auto sign-in and revoke session where possible
      const win = window as any;
      if (win.google?.accounts?.id?.disableAutoSelect) {
        win.google.accounts.id.disableAutoSelect();
      }
      // revoke the last used credential if stored in localStorage (best-effort)
      const lastToken = localStorage.getItem('last_google_id_token');
      if (lastToken && win.google?.accounts?.id?.revoke) {
        win.google.accounts.id.revoke(lastToken, () => {
          /* no-op */
        });
      }
      // Clear stored token
      localStorage.removeItem('google_id_token');
      localStorage.removeItem('last_google_id_token');
      localStorage.removeItem('token');
    } catch (e) {
      // ignore
    }

    // Clear user data from context (this will sync with sidebar)
    logout();

    // Redirect to login
    window.location.href = '/login';
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // If no user is logged in, show minimal header
  if (!currentUser && !loading) {
    return (
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center">
        <div className="flex items-center justify-between"></div>
      </header>
    );
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <NotificationHandler />

          {/* User Menu */}
          {currentUser && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                  {currentUser.profile_image_url ? (
                    <img
                      src={currentUser.profile_image_url}
                      alt={`${currentUser.first_name} ${currentUser.last_name}`}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-brand-700 text-sm font-semibold">
                      {getInitials(currentUser.first_name, currentUser.last_name)}
                    </span>
                  )}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {currentUser.first_name} {currentUser.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{currentUser.course}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-2">
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>
                    <button
                      onClick={handleLogoutClick}
                      className="w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogoutConfirm}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentUser={currentUser}
      />
    </>
  );
}

/* ---------- Settings Modal ---------- */
function SettingsModal({
  open,
  onClose,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: any;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialPush = !!(
    currentUser?.study_preferences?.push_enabled ??
    currentUser?.notifyReminders ??
    false
  );
  const initialEmail = !!(
    currentUser?.study_preferences?.email_updates ??
    currentUser?.notifyReminders ??
    false
  );

  const [pushEnabled, setPushEnabled] = useState(initialPush);
  const [emailEnabled, setEmailEnabled] = useState(initialEmail);

  useEffect(() => {
    setPushEnabled(initialPush);
    setEmailEnabled(initialEmail);
  }, [initialPush, initialEmail, open]);

  if (!open) return null;

  async function persist(next: { push?: boolean; email?: boolean }) {
    setError(null);
    setSaving(true);
    try {
      const sp = {
        ...(currentUser?.study_preferences || {}),
        push_enabled: next.push ?? pushEnabled,
        email_updates: next.email ?? emailEnabled,
      };
      await DataService.updateUserProfile({ study_preferences: sp });
    } catch (e) {
      setError('Could not save your preference. Please try again.');
      console.error(e);
      // revert UI on failure
      if (next.push != null) setPushEnabled((p) => !p);
      if (next.email != null) setEmailEnabled((e) => !e);
    } finally {
      setSaving(false);
    }
  }

  async function togglePush() {
    // If enabling push, ask browser permission
    if (!pushEnabled) {
      if (!('Notification' in window)) {
        setError('This browser does not support push notifications.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Please allow notifications in your browser.');
        return;
      }
      // Optional: register service worker here if you have one
      // await navigator.serviceWorker?.register('/sw.js');
    }
    setPushEnabled((v) => !v);
    persist({ push: !pushEnabled });
  }

  async function toggleEmail() {
    setEmailEnabled((v) => !v);
    persist({ email: !emailEnabled });
  }

  const switchCls = (on: boolean) =>
    [
      'relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
      on ? 'bg-brand-600' : 'bg-gray-300',
      saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90',
    ].join(' ');
  const knobCls = (on: boolean) =>
    [
      'inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform',
      on ? 'translate-x-7' : 'translate-x-1',
    ].join(' ');

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              ×
            </button>
          </div>

          <div className="space-y-4">
            {/* Email Updates */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Email Updates</span>
              <button
                type="button"
                role="switch"
                aria-checked={emailEnabled}
                onClick={saving ? undefined : toggleEmail}
                className={switchCls(emailEnabled)}
              >
                <span className={knobCls(emailEnabled)} />
              </button>
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Push Notifications</span>
              <button
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                onClick={saving ? undefined : togglePush}
                className={switchCls(pushEnabled)}
              >
                <span className={knobCls(pushEnabled)} />
              </button>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {!('Notification' in window) && (
              <p className="text-xs text-gray-500">
                Your browser doesn’t support push notifications.
              </p>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function LogoutConfirmModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Confirm Logout</h2>
          <p className="text-gray-600 mb-6">Are you sure you want to log out of your account?</p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
