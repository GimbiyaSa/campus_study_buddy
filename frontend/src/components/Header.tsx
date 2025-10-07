// src/components/Header.tsx
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, LogOut } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
//import { buildApiUrl } from '../utils/url';
import NotificationHandler from './NotificationHandler';


export default function Header() {
  const { currentUser, loading, logout } = useUser();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
      // Try to disable Google's auto sign-in and revoke session where possible
      const win = window as any;
      if (win.google?.accounts?.id?.disableAutoSelect) {
        win.google.accounts.id.disableAutoSelect();
      }
      // revoke the last used credential if stored in localStorage (best-effort)
      const lastToken = localStorage.getItem('google_id_token');
      if (lastToken && win.google?.accounts?.id?.revoke) {
        win.google.accounts.id.revoke(lastToken, () => {});
      }
      // Clear stored token
      localStorage.removeItem('google_id_token');
    } catch (e) {
      // ignore
    }

    // Clear user data from context
    logout();

    // Redirect to login
    window.location.href = '/login';
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // If no user is logged in, show minimal header (unchanged)
  if (!currentUser && !loading) {
    return (
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center">
        <div className="flex items-center justify-between"></div>
      </header>
    );
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Search Bar */}
          <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 mr-2" />
            <input
              type="text"
              placeholder="Search courses, partners..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400 w-64"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Mobile Search Icon */}
          <button className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition">
            <Search className="w-5 h-5 text-gray-600" />
          </button>

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
    </>
  );
}

/* ---------- Logout Confirmation Modal ---------- */
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
