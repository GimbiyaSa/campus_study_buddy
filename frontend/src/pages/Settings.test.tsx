// src/pages/Settings.test.tsx
import { render } from '../test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep buildApiUrl deterministic
vi.mock('../utils/url', () => ({
  buildApiUrl: (p: string) => `http://api.test${p}`,
}));

// Basic localStorage stub for bearer token reads
const ls = {
  getItem: vi.fn(() => 'test-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', ls as unknown as Storage);

// Default API payloads
const apiProfile = {
  name: 'Alex Johnson',
  email: 'a@u.edu',
  bio: 'CS student',
  institution: 'Uni',
  year: '3rd Year',
  major: 'CS',
};
const apiNotifications = {
  sessionReminders: true,
  newMessages: true,
  partnerRequests: true,
  groupInvites: true,
  weeklyProgress: true,
  emailNotifications: false,
};
const apiPrivacy = {
  profileVisibility: 'public',
  showStudyHours: true,
  showProgress: true,
  allowMessages: true,
  allowPartnerRequests: true,
};
const apiPreferences = {
  theme: 'light',
  language: 'en',
  timezone: 'America/New_York',
  studyGoal: 25,
  startOfWeek: 'sunday',
};

type MockedResponse = { ok: boolean; json?: () => Promise<any> };

const mkJson = (data: any): MockedResponse => ({
  ok: true,
  json: async () => data,
});

let fetchSpy: ReturnType<typeof vi.fn>;

const installHappyFetch = () => {
  fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // GETs
    if (url.endsWith('/api/v1/user/profile') && (!init || init.method === undefined)) {
      return Promise.resolve(mkJson(apiProfile));
    }
    if (url.endsWith('/api/v1/user/notifications') && (!init || init.method === undefined)) {
      return Promise.resolve(mkJson(apiNotifications));
    }
    if (url.endsWith('/api/v1/user/privacy') && (!init || init.method === undefined)) {
      return Promise.resolve(mkJson(apiPrivacy));
    }
    if (url.endsWith('/api/v1/user/preferences') && (!init || init.method === undefined)) {
      return Promise.resolve(mkJson(apiPreferences));
    }

    // PUTs (saveSettings sections)
    if (url.includes('/api/v1/user/profile') && init?.method === 'PUT') {
      return Promise.resolve({ ok: true });
    }
    if (url.includes('/api/v1/user/notifications') && init?.method === 'PUT') {
      return Promise.resolve({ ok: true });
    }
    if (url.includes('/api/v1/user/privacy') && init?.method === 'PUT') {
      return Promise.resolve({ ok: true });
    }
    if (url.includes('/api/v1/user/preferences') && init?.method === 'PUT') {
      return Promise.resolve({ ok: true });
    }

    // Password change
    if (url.endsWith('/api/v1/user/password') && init?.method === 'PUT') {
      return Promise.resolve({ ok: true });
    }

    // fallback empty ok
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  (global.fetch as any) = fetchSpy;
};

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  ls.getItem.mockReturnValue('test-token');
  installHappyFetch();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Settings (render + loading)', () => {
  test('shows heading and loading state first', () => {
    render(<Settings />);
    expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument();
    // Initial loading state before hooks finish
    expect(screen.getByText(/Loading settings/i)).toBeInTheDocument();
  });

  test('renders tabs and profile content after fetch', async () => {
    render(<Settings />);

    // Wait for initial load to finish (any non-loading content)
    await screen.findByText(/Manage your account and application preferences/i);

    // Left nav present
    expect(screen.getByRole('button', { name: /^Profile$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Notifications$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Privacy$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Preferences$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Account$/i })).toBeInTheDocument();

    // Profile tab selected by default, shows profile header
    expect(screen.getByRole('heading', { name: /Profile Information/i })).toBeInTheDocument();

    // Fields filled from API
    const nameInput = screen.getByPlaceholderText(/Your full name/i) as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText(/your\.email@university\.edu/i) as HTMLInputElement;
    expect(nameInput.value ?? '').toBe(apiProfile.name);
    expect(emailInput.value ?? '').toBe(apiProfile.email);
  });
});

describe('Settings (navigation between tabs)', () => {
  test('switches tabs via left nav', async () => {
    render(<Settings />);
    await screen.findByText(/Manage your account and application preferences/i);

    await userEvent.click(screen.getByRole('button', { name: /^Notifications$/i }));
    await screen.findByRole('heading', { name: /Notification Preferences/i });

    await userEvent.click(screen.getByRole('button', { name: /^Privacy$/i }));
    await screen.findByRole('heading', { name: /Privacy Settings/i });

    await userEvent.click(screen.getByRole('button', { name: /^Preferences$/i }));
    await screen.findByRole('heading', { name: /App Preferences/i });

    await userEvent.click(screen.getByRole('button', { name: /^Account$/i }));
    await screen.findByRole('heading', { name: /Account Settings/i });

    await userEvent.click(screen.getByRole('button', { name: /^Profile$/i }));
    await screen.findByRole('heading', { name: /Profile Information/i });
  });
});

describe('Settings (saving flows use PUT + token)', () => {
  const expectLastPut = (path: string, matcher?: (init: RequestInit) => void) => {
    const calls = fetchSpy.mock.calls.filter((c) => typeof c[0] === 'string' && (c[0] as string).includes(path));
    // last call for that path
    const last = calls.at(-1);
    expect(last, `expected a PUT to ${path} but none found`).toBeTruthy();
    const [, init] = last!;
    expect(init?.method).toBe('PUT');
    if (matcher) matcher(init!);
  };

  test('profile: Save sends PUT with Authorization header', async () => {
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    const saveBtn = screen.getByRole('button', { name: /Save Profile/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expectLastPut('/api/v1/user/profile', (init) => {
        const hdrs = init.headers as Record<string, string>;
        expect(hdrs.Authorization).toBe('Bearer test-token');
      });
    });
  });

  test('notifications: toggle + save PUTs to /user/notifications', async () => {
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    await userEvent.click(screen.getByRole('button', { name: /^Notifications$/i }));
    await screen.findByRole('heading', { name: /Notification Preferences/i });

    // Toggle Email Notifications (off->on)
    const emailRow = screen.getByText(/Email Notifications/i).closest('div')!;
    const checkbox = within(emailRow.parentElement as HTMLElement).getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /Save Notifications/i }));

    await waitFor(() => {
      expectLastPut('/api/v1/user/notifications', (init) => {
        const hdrs = init.headers as Record<string, string>;
        expect(hdrs.Authorization).toBe('Bearer test-token');
        // payload should now have emailNotifications true
        const body = JSON.parse(init.body as string);
        expect(body.emailNotifications).toBe(true);
      });
    });
  });

  test('privacy: Save PUTs to /user/privacy', async () => {
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    await userEvent.click(screen.getByRole('button', { name: /^Privacy$/i }));
    await screen.findByRole('heading', { name: /Privacy Settings/i });

    // The label isn't associated; find the select near the label text.
    const pvLabel = screen.getByText(/Profile Visibility/i);
    const pvSelect = pvLabel.parentElement!.querySelector('select') as HTMLSelectElement;
    await userEvent.selectOptions(pvSelect, 'friends');

    await userEvent.click(screen.getByRole('button', { name: /Save Privacy/i }));

    await waitFor(() => {
      expectLastPut('/api/v1/user/privacy', (init) => {
        const hdrs = init.headers as Record<string, string>;
        expect(hdrs.Authorization).toBe('Bearer test-token');
        const body = JSON.parse(init.body as string);
        expect(body.profileVisibility).toBe('friends');
      });
    });
  });

  test('preferences: Save PUTs to /user/preferences', async () => {
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    await userEvent.click(screen.getByRole('button', { name: /^Preferences$/i }));
    await screen.findByRole('heading', { name: /App Preferences/i });

    // Labels are not programmatically associated → locate inputs via DOM proximity.
    const themeLabel = screen.getByText(/^Theme$/i);
    const themeSelect = themeLabel.parentElement!.querySelector('select') as HTMLSelectElement;
    await userEvent.selectOptions(themeSelect, 'dark');

    const goalLabel = screen.getByText(/Weekly Study Goal \(hours\)/i);
    const goalInput = goalLabel.parentElement!.querySelector('input') as HTMLInputElement;
    await userEvent.clear(goalInput);
    await userEvent.type(goalInput, '40');

    await userEvent.click(screen.getByRole('button', { name: /Save Preferences/i }));

    await waitFor(() => {
      expectLastPut('/api/v1/user/preferences', (init) => {
        const hdrs = init.headers as Record<string, string>;
        expect(hdrs.Authorization).toBe('Bearer test-token');
        const body = JSON.parse(init.body as string);
        expect(body.theme).toBe('dark');
        expect(body.studyGoal).toBe(40);
      });
    });
  });
});

describe('Settings (Account password flow + visibility toggle)', () => {
  test('password success path: PUTs to /user/password and alerts success', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    await userEvent.click(screen.getByRole('button', { name: /^Account$/i }));
    await screen.findByRole('heading', { name: /Account Settings/i });

    // Use placeholders (labels are not programmatically associated)
    const current = screen.getByPlaceholderText('Enter current password') as HTMLInputElement;
    const newPw = screen.getByPlaceholderText('Enter new password') as HTMLInputElement;
    const confirm = screen.getByPlaceholderText('Confirm new password') as HTMLInputElement;

    await userEvent.type(current, 'oldpass123');
    await userEvent.type(newPw, 'newpass123');
    await userEvent.type(confirm, 'newpass123');

    const submit = screen.getByRole('button', { name: /Update Password/i });
    expect(submit).not.toBeDisabled();
    await userEvent.click(submit);

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('/api/v1/user/password')
      );
      expect(calls.length).toBeGreaterThan(0);
      const [, init] = calls.at(-1)!;
      expect(init?.method).toBe('PUT');
      const body = JSON.parse(init!.body as string);
      expect(body).toEqual({ currentPassword: 'oldpass123', newPassword: 'newpass123' });
      expect(alertSpy).toHaveBeenCalledWith('Password updated successfully');
    });
  });

  test('password validation: mismatched new/confirm shows alert and no PUT', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    await userEvent.click(screen.getByRole('button', { name: /^Account$/i }));
    await screen.findByRole('heading', { name: /Account Settings/i });

    const current = screen.getByPlaceholderText('Enter current password');
    const newPw = screen.getByPlaceholderText('Enter new password');
    const confirm = screen.getByPlaceholderText('Confirm new password');

    await userEvent.type(current, 'oldpass123');
    await userEvent.type(newPw, 'newpass123');
    await userEvent.type(confirm, 'mismatch');

    const submit = screen.getByRole('button', { name: /Update Password/i });
    await userEvent.click(submit);

    expect(alertSpy).toHaveBeenCalledWith('New passwords do not match');

    const pwCalls = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/api/v1/user/password')
    );
    expect(pwCalls.length).toBe(0);
  });

  test('toggle password visibility changes input type', async () => {
    render(<Settings />);
    await screen.findByText(/Manage your account/i);

    await userEvent.click(screen.getByRole('button', { name: /^Account$/i }));
    await screen.findByRole('heading', { name: /Account Settings/i });

    const current = screen.getByPlaceholderText('Enter current password') as HTMLInputElement;
    const currentWrap = current.closest('.relative')!;
    const toggleBtn = currentWrap.querySelector('button') as HTMLButtonElement;

    // starts as password
    expect(current.type).toBe('password');

    // click once → show (text)
    await userEvent.click(toggleBtn);
    expect(current.type).toBe('text');

    // click again → hide (password)
    await userEvent.click(toggleBtn);
    expect(current.type).toBe('password');
  });
});

describe('Settings (error fallback path)', () => {
  test('if initial fetch throws, uses demo fallback profile name', async () => {
    // Make the very first GET blow up (profile fetch)
    (global.fetch as any) = vi.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation((url: string) => {
      // After first rejection, return defaults for the rest so the page can render
      if (url.includes('/notifications')) return Promise.resolve(mkJson(apiNotifications));
      if (url.includes('/privacy')) return Promise.resolve(mkJson(apiPrivacy));
      if (url.includes('/preferences')) return Promise.resolve(mkJson(apiPreferences));
      // harmless ok for anything else
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<Settings />);

    // Should eventually render Profile tab with fallback profile visible somewhere after load.
    await screen.findByText(/Manage your account and application preferences/i);
    await screen.findByRole('heading', { name: /Profile Information/i });

    // Click the left-nav "Profile" specifically (there is also a "Save Profile" button)
    const nav = screen.getByRole('navigation');
    await userEvent.click(within(nav).getByRole('button', { name: /^Profile$/i }));

    const nameField = screen.getByPlaceholderText(/Your full name/i) as HTMLInputElement;
    expect(nameField.value).toBe('Alex Johnson'); // from fallback
  });
});
