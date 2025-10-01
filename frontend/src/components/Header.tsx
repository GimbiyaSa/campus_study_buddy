// src/components/Header.tsx
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Bell, ChevronDown, User, Settings, LogOut } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { buildApiUrl } from '../utils/url';

type User = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  university: string;
  course: string;
  year_of_study: number;
  profile_image_url?: string;
  is_active: boolean;
};

type Notification = {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_read: boolean;
  created_at: string;
};

export default function Header() {
  const { currentUser, loading, logout } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Fallback notifications
  const fallbackNotifications: Notification[] = [
    {
      id: 1,
      user_id: 1,
      title: 'New Study Group Invitation',
      message: 'You have been invited to join the Data Structures study group',
      type: 'info',
      is_read: false,
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      user_id: 1,
      title: 'Session Reminder',
      message: 'Your Linear Algebra session starts in 30 minutes',
      type: 'warning',
      is_read: false,
      created_at: new Date().toISOString(),
    },
  ];

  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    const controller = new AbortController();

    const fetchNotifications = async () => {
      try {
        const token = localStorage.getItem('google_id_token');
        if (!token) {
          throw new Error('No authentication token found');
        }
        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };
        const notifRes = await fetch(buildApiUrl(`/api/v1/notifications`), {
          signal: controller.signal,
          headers,
        });
        if (!isMounted) return;
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          setNotifications(notifData);
        } else {
          setNotifications(fallbackNotifications);
        }
      } catch (err: unknown) {
        // AbortController throws a DOMException with name 'AbortError'
        const anyErr = err as { name?: string } | undefined;
        if (anyErr?.name === 'AbortError') return;
        setNotifications(fallbackNotifications);
      }
    };

    // Initial fetch immediately
    fetchNotifications();

    // Then poll every 60 seconds
    const interval = setInterval(fetchNotifications, 60 * 1000);

    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [currentUser]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markNotificationAsRead = async (notificationId: number) => {
    try {
      const token = localStorage.getItem('google_id_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      await fetch(buildApiUrl(`/api/v1/notifications/${notificationId}/read`), {
        method: 'PUT',
        headers,
      });

      setNotifications((prev) =>
        prev.map((notif) => (notif.id === notificationId ? { ...notif, is_read: true } : notif))
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleSettingsClick = () => {
    setShowUserMenu(false);
    setShowSettingsModal(true);
  };

  const handleLogoutClick = () => {
    setShowUserMenu(false);
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await fetch(buildApiUrl('/api/v1/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Error logging out:', err);
    }

    // Try to disable Google's auto sign-in and revoke session where possible
    try {
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
      localStorage.removeItem('last_google_id_token');
    } catch (e) {
      // ignore
    }

    // Clear user data from context (this will sync with sidebar)
    logout();
    setNotifications([]);

    // Redirect to login
    window.location.href = '/login';
  };

  const handleUpdateProfile = async (updatedData: Partial<User>) => {
    if (!currentUser) return;

    try {
      const res = await fetch(buildApiUrl(`/api/v1/users/${currentUser.user_id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (res.ok) {
        const updatedUser = await res.json();
        updateUser(updatedUser);
        setShowProfileModal(false);
      }
    } catch (err) {
      console.error('Error updating profile:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return '📢';
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // If no user is logged in, show minimal header
  if (!currentUser && !loading) {
    return (
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand-600">Campus Study Buddy</h1>
          <div className="text-sm text-gray-500">Please log in</div>
        </div>
      </header>
    );
  }

  if (loading) {
    return (
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center">
        <div className="flex items-center justify-between">
          <div className="animate-pulse h-8 bg-gray-200 rounded w-48"></div>
          <div className="animate-pulse h-8 bg-gray-200 rounded w-32"></div>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200 h-16 px-6 flex items-center">
        <div className="w-full flex items-center justify-between">
          {/* Left side - Search */}
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search courses, groups, or buddies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Right side - Notifications and User Menu */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">No notifications</div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                            !notification.is_read ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => markNotificationAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg">
                              {getNotificationIcon(notification.type)}
                            </span>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{notification.title}</h4>
                              <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notification.created_at).toLocaleString()}
                              </p>
                            </div>
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

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
                        onClick={handleSettingsClick}
                        className="w-full flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>
                      <hr className="my-2" />
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
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        user={currentUser}
      />

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogoutConfirm}
      />
    </>
  );
}

function ProfileModal({
  open,
  onClose,
  user: userParam,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onUpdate: (data: Partial<User>) => void;
}) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    course: '',
    year_of_study: 1,
    university: '',
  });

  useLayoutEffect(() => {
    if (userParam && open) {
      setFormData({
        first_name: userParam.first_name,
        last_name: userParam.last_name,
        email: userParam.email,
        course: userParam.course,
        year_of_study: userParam.year_of_study,
        university: userParam.university,
      });
    }
  }, [userParam, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
  };

  if (!open || !userParam) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Edit Profile</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
              <input
                type="text"
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year of Study</label>
              <select
                value={formData.year_of_study}
                onChange={(e) =>
                  setFormData({ ...formData, year_of_study: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              >
                {[1, 2, 3, 4, 5].map((year) => (
                  <option key={year} value={year}>
                    Year {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">University</label>
              <input
                type="text"
                value={formData.university}
                onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ---------- Settings Modal ---------- */
function SettingsModal({
  open,
  onClose,
  user: _user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const [settings, setSettings] = useState({
    notifications: true,
    emailUpdates: true,
    darkMode: false,
    studyReminders: true,
  });

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Push Notifications</span>
              <button
                onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.notifications ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.notifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Email Updates</span>
              <button
                onClick={() => setSettings({ ...settings, emailUpdates: !settings.emailUpdates })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.emailUpdates ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.emailUpdates ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Study Reminders</span>
              <button
                onClick={() =>
                  setSettings({ ...settings, studyReminders: !settings.studyReminders })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.studyReminders ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.studyReminders ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Dark Mode</span>
              <button
                onClick={() => setSettings({ ...settings, darkMode: !settings.darkMode })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.darkMode ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
            <button className="flex-1 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
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
