import { useEffect, useState } from 'react';
import { Bell, User, Shield, Palette, Globe, Save, Eye, EyeOff } from 'lucide-react';
import { buildApiUrl } from '../utils/url';

type UserProfile = {
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  institution?: string;
  year?: string;
  major?: string;
};

type NotificationSettings = {
  sessionReminders: boolean;
  newMessages: boolean;
  partnerRequests: boolean;
  groupInvites: boolean;
  weeklyProgress: boolean;
  emailNotifications: boolean;
};

type PrivacySettings = {
  profileVisibility: 'public' | 'friends' | 'private';
  showStudyHours: boolean;
  showProgress: boolean;
  allowMessages: boolean;
  allowPartnerRequests: boolean;
};

type AppPreferences = {
  theme: 'light' | 'dark' | 'auto';
  language: 'en' | 'es' | 'fr' | 'de';
  timezone: string;
  studyGoal: number;
  startOfWeek: 'sunday' | 'monday';
};

export default function Settings() {
  const [activeTab, setActiveTab] = useState<
    'profile' | 'notifications' | 'privacy' | 'preferences' | 'account'
  >('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    bio: '',
    institution: '',
    year: '',
    major: '',
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    sessionReminders: true,
    newMessages: true,
    partnerRequests: true,
    groupInvites: true,
    weeklyProgress: true,
    emailNotifications: false,
  });

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profileVisibility: 'public',
    showStudyHours: true,
    showProgress: true,
    allowMessages: true,
    allowPartnerRequests: true,
  });

  const [preferences, setPreferences] = useState<AppPreferences>({
    theme: 'light',
    language: 'en',
    timezone: 'America/New_York',
    studyGoal: 25,
    startOfWeek: 'sunday',
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        // Fetch user settings from API
        const [profileRes, notificationsRes, privacyRes, preferencesRes] = await Promise.all([
          fetch(buildApiUrl('/api/v1/user/profile')),
          fetch(buildApiUrl('/api/v1/user/notifications')),
          fetch(buildApiUrl('/api/v1/user/privacy')),
          fetch(buildApiUrl('/api/v1/user/preferences')),
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData);
        }
        if (notificationsRes.ok) {
          const notificationsData = await notificationsRes.json();
          setNotifications(notificationsData);
        }
        if (privacyRes.ok) {
          const privacyData = await privacyRes.json();
          setPrivacy(privacyData);
        }
        if (preferencesRes.ok) {
          const preferencesData = await preferencesRes.json();
          setPreferences(preferencesData);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        // Use fallback data for demo
        setProfile({
          name: 'Alex Johnson',
          email: 'alex.johnson@university.edu',
          bio: 'Computer Science student passionate about algorithms and machine learning.',
          institution: 'University of Technology',
          year: '3rd Year',
          major: 'Computer Science',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const saveSettings = async (section: string, data: any) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('google_id_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const res = await fetch(buildApiUrl(`/api/v1/user/${section}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        // Settings saved successfully
        console.log(`${section} settings saved`);
      }
    } catch (error) {
      console.error(`Error saving ${section} settings:`, error);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters long');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl('/api/v1/user/password'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        alert('Password updated successfully');
      } else {
        alert('Failed to update password');
      }
    } catch (error) {
      console.error('Error updating password:', error);
      alert('Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield className="h-4 w-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Palette className="h-4 w-4" /> },
    { id: 'account', label: 'Account', icon: <Globe className="h-4 w-4" /> },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <div className="text-center text-slate-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-slate-600 text-sm">Manage your account and application preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Settings Navigation */}
        <div className="lg:w-64">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            {activeTab === 'profile' && (
              <ProfileSettings
                profile={profile}
                onChange={setProfile}
                onSave={(data) => saveSettings('profile', data)}
                saving={saving}
              />
            )}
            {activeTab === 'notifications' && (
              <NotificationSettings
                settings={notifications}
                onChange={setNotifications}
                onSave={(data) => saveSettings('notifications', data)}
                saving={saving}
              />
            )}
            {activeTab === 'privacy' && (
              <PrivacySettings
                settings={privacy}
                onChange={setPrivacy}
                onSave={(data) => saveSettings('privacy', data)}
                saving={saving}
              />
            )}
            {activeTab === 'preferences' && (
              <PreferencesSettings
                settings={preferences}
                onChange={setPreferences}
                onSave={(data) => saveSettings('preferences', data)}
                saving={saving}
              />
            )}
            {activeTab === 'account' && (
              <AccountSettings
                profile={profile}
                currentPassword={currentPassword}
                newPassword={newPassword}
                confirmPassword={confirmPassword}
                showPassword={showPassword}
                onCurrentPasswordChange={setCurrentPassword}
                onNewPasswordChange={setNewPassword}
                onConfirmPasswordChange={setConfirmPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
                onPasswordSubmit={handlePasswordChange}
                saving={saving}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSettings({
  profile,
  onChange,
  onSave,
  saving,
}: {
  profile: UserProfile;
  onChange: (profile: UserProfile) => void;
  onSave: (profile: UserProfile) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Profile Information</h2>
        <p className="text-sm text-slate-600">
          Update your personal details and academic information
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block mb-1 text-sm font-medium text-slate-800">
            Full Name <span className="text-emerald-700">*</span>
          </label>
          <input
            value={profile.name}
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
            placeholder="Your full name"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium text-slate-800">
            Email Address <span className="text-emerald-700">*</span>
          </label>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => onChange({ ...profile, email: e.target.value })}
            placeholder="your.email@university.edu"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium text-slate-800">Institution</label>
          <input
            value={profile.institution || ''}
            onChange={(e) => onChange({ ...profile, institution: e.target.value })}
            placeholder="University name"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium text-slate-800">Academic Year</label>
          <select
            value={profile.year || ''}
            onChange={(e) => onChange({ ...profile, year: e.target.value })}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Select year</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
            <option value="Graduate">Graduate</option>
            <option value="PhD">PhD</option>
          </select>
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium text-slate-800">Major/Field</label>
          <input
            value={profile.major || ''}
            onChange={(e) => onChange({ ...profile, major: e.target.value })}
            placeholder="e.g., Computer Science"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-slate-800">Bio</label>
        <textarea
          value={profile.bio || ''}
          onChange={(e) => onChange({ ...profile, bio: e.target.value })}
          placeholder="Tell others about yourself, your interests, and study goals..."
          rows={4}
          className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <button
        onClick={() => onSave(profile)}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  );
}

function NotificationSettings({
  settings,
  onChange,
  onSave,
  saving,
}: {
  settings: NotificationSettings;
  onChange: (settings: NotificationSettings) => void;
  onSave: (settings: NotificationSettings) => void;
  saving: boolean;
}) {
  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
        <p className="text-sm text-slate-600">Choose what notifications you want to receive</p>
      </div>

      <div className="space-y-4">
        <ToggleOption
          label="Session Reminders"
          description="Get notified 30 minutes before your study sessions"
          checked={settings.sessionReminders}
          onChange={(checked) => updateSetting('sessionReminders', checked)}
        />
        <ToggleOption
          label="New Messages"
          description="Notifications for new chat messages"
          checked={settings.newMessages}
          onChange={(checked) => updateSetting('newMessages', checked)}
        />
        <ToggleOption
          label="Partner Requests"
          description="When someone wants to be your study partner"
          checked={settings.partnerRequests}
          onChange={(checked) => updateSetting('partnerRequests', checked)}
        />
        <ToggleOption
          label="Group Invites"
          description="Invitations to join study groups"
          checked={settings.groupInvites}
          onChange={(checked) => updateSetting('groupInvites', checked)}
        />
        <ToggleOption
          label="Weekly Progress"
          description="Weekly summary of your study progress"
          checked={settings.weeklyProgress}
          onChange={(checked) => updateSetting('weeklyProgress', checked)}
        />
        <ToggleOption
          label="Email Notifications"
          description="Receive notifications via email"
          checked={settings.emailNotifications}
          onChange={(checked) => updateSetting('emailNotifications', checked)}
        />
      </div>

      <button
        onClick={() => onSave(settings)}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Notifications'}
      </button>
    </div>
  );
}

function PrivacySettings({
  settings,
  onChange,
  onSave,
  saving,
}: {
  settings: PrivacySettings;
  onChange: (settings: PrivacySettings) => void;
  onSave: (settings: PrivacySettings) => void;
  saving: boolean;
}) {
  const updateSetting = (key: keyof PrivacySettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Privacy Settings</h2>
        <p className="text-sm text-slate-600">
          Control who can see your information and interact with you
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block mb-2 text-sm font-medium text-slate-800">
            Profile Visibility
          </label>
          <select
            value={settings.profileVisibility}
            onChange={(e) => updateSetting('profileVisibility', e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="public">Public - Anyone can see your profile</option>
            <option value="friends">Friends - Only your study partners can see your profile</option>
            <option value="private">Private - Only you can see your profile</option>
          </select>
        </div>

        <ToggleOption
          label="Show Study Hours"
          description="Display your total study hours on your profile"
          checked={settings.showStudyHours}
          onChange={(checked) => updateSetting('showStudyHours', checked)}
        />
        <ToggleOption
          label="Show Progress"
          description="Display your course progress on your profile"
          checked={settings.showProgress}
          onChange={(checked) => updateSetting('showProgress', checked)}
        />
        <ToggleOption
          label="Allow Messages"
          description="Let other users send you direct messages"
          checked={settings.allowMessages}
          onChange={(checked) => updateSetting('allowMessages', checked)}
        />
        <ToggleOption
          label="Allow Partner Requests"
          description="Let other users send you study partner requests"
          checked={settings.allowPartnerRequests}
          onChange={(checked) => updateSetting('allowPartnerRequests', checked)}
        />
      </div>

      <button
        onClick={() => onSave(settings)}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Privacy'}
      </button>
    </div>
  );
}

function PreferencesSettings({
  settings,
  onChange,
  onSave,
  saving,
}: {
  settings: AppPreferences;
  onChange: (settings: AppPreferences) => void;
  onSave: (settings: AppPreferences) => void;
  saving: boolean;
}) {
  const updateSetting = (key: keyof AppPreferences, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">App Preferences</h2>
        <p className="text-sm text-slate-600">Customize your app experience</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block mb-2 text-sm font-medium text-slate-800">Theme</label>
          <select
            value={settings.theme}
            onChange={(e) => updateSetting('theme', e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto (System)</option>
          </select>
        </div>

        <div>
          <label className="block mb-2 text-sm font-medium text-slate-800">Language</label>
          <select
            value={settings.language}
            onChange={(e) => updateSetting('language', e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>

        <div>
          <label className="block mb-2 text-sm font-medium text-slate-800">Timezone</label>
          <select
            value={settings.timezone}
            onChange={(e) => updateSetting('timezone', e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Chicago">Central Time</option>
            <option value="America/Denver">Mountain Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
            <option value="Europe/London">GMT</option>
            <option value="Europe/Paris">Central European Time</option>
          </select>
        </div>

        <div>
          <label className="block mb-2 text-sm font-medium text-slate-800">Start of Week</label>
          <select
            value={settings.startOfWeek}
            onChange={(e) => updateSetting('startOfWeek', e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block mb-2 text-sm font-medium text-slate-800">
            Weekly Study Goal (hours)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={settings.studyGoal}
            onChange={(e) => updateSetting('studyGoal', parseInt(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      <button
        onClick={() => onSave(settings)}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}

function AccountSettings({
  profile,
  currentPassword,
  newPassword,
  confirmPassword,
  showPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
  onPasswordSubmit,
  saving,
}: {
  profile: UserProfile;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  showPassword: boolean;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Account Settings</h2>
        <p className="text-sm text-slate-600">Manage your account security and data</p>
      </div>

      {/* Account Information */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
        <h3 className="font-medium text-slate-900 mb-2">Account Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Email:</span>
            <span className="text-slate-900">{profile.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Member since:</span>
            <span className="text-slate-900">January 2025</span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div>
        <h3 className="font-medium text-slate-900 mb-4">Change Password</h3>
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-800">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => onCurrentPasswordChange(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={onTogglePassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-slate-800">New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              placeholder="Enter new password"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-slate-800">
              Confirm New Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-200 rounded-xl p-4 bg-red-50">
        <h3 className="font-medium text-red-900 mb-2">Danger Zone</h3>
        <p className="text-sm text-red-700 mb-4">
          These actions are permanent and cannot be undone.
        </p>
        <div className="space-y-2">
          <button className="text-sm text-red-700 hover:text-red-900 underline">
            Export my data
          </button>
          <br />
          <button className="text-sm text-red-700 hover:text-red-900 underline">
            Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleOption({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h4 className="font-medium text-slate-900">{label}</h4>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`h-6 w-11 rounded-full transition-colors ${
            checked ? 'bg-emerald-600' : 'bg-slate-300'
          }`}
        >
          <div
            className={`h-5 w-5 rounded-full bg-white transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            } mt-0.5`}
          />
        </div>
      </label>
    </div>
  );
}
