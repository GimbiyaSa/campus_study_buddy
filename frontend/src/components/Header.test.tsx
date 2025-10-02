// src/components/Header.test.tsx
import { render } from '../test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi, beforeEach, afterEach, describe } from 'vitest';
import Header from './Header';

// ---------------- Local, test-file-only stubs ----------------
let originalLocation: Location;

beforeEach(() => {
  // Keep real timers here
  vi.useRealTimers();

  // Stub fetch
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

  // Stub Google accounts helpers used by logout flow
  (window as any).google = {
    accounts: {
      id: {
        disableAutoSelect: vi.fn(),
        revoke: vi.fn((_token: string, cb: () => void) => cb && cb()),
      },
    },
  };

  // Token to exercise revoke path
  localStorage.setItem('last_google_id_token', 'tok_123');

  // Save and stub window.location (no @ts-expect-error)
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: {
      ...originalLocation,
      href: '',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Restore window.location
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: false,
    configurable: true,
  });

  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ----------------- Mocks -----------------
const mockLogout = vi.fn();

const mockState = {
  loading: true as boolean,
  currentUser: null as {
    user_id: number;
    email: string;
    first_name: string;
    last_name: string;
    university: string;
    course: string;
    year_of_study: number;
    profile_image_url?: string;
    is_active: boolean;
  } | null,
};

vi.mock('../contexts/UserContext', () => {
  return {
    useUser: () => ({
      currentUser: mockState.currentUser,
      loading: mockState.loading,
      logout: mockLogout,
    }),
  };
});

const fetchNotificationsMock = vi.fn();
const markNotificationReadMock = vi.fn();

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchNotifications: (...args: unknown[]) => fetchNotificationsMock(...args),
      markNotificationRead: (...args: unknown[]) => markNotificationReadMock(...args),
    },
  };
});

vi.mock('../utils/url', () => {
  return {
    buildApiUrl: (path: string) => `http://api.test${path}`,
  };
});

// ----------------- Tests -----------------
describe('Header', () => {
  test('shows loading skeleton initially', () => {
    mockState.loading = true;
    mockState.currentUser = null;

    render(<Header />);

    // Matches your existing test behavior
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  test('renders minimal header when not logged in (loading=false)', () => {
    mockState.loading = false;
    mockState.currentUser = null;

    render(<Header />);

    expect(screen.getByRole('heading', { name: /campus study buddy/i })).toBeInTheDocument();
    expect(screen.getByText(/please log in/i)).toBeInTheDocument();
  });

  test('when logged in: shows search, user initials, unread badge from fetched notifications; mark as read updates badge', async () => {
    mockState.loading = false;
    mockState.currentUser = {
      user_id: 7,
      email: 'a@b.com',
      first_name: 'Gimbiya',
      last_name: 'Sa',
      university: 'Uni',
      course: 'CS',
      year_of_study: 3,
      is_active: true,
    };

    // Two unread + one read -> unread badge "2"
    fetchNotificationsMock.mockResolvedValueOnce([
      {
        id: 101,
        user_id: 7,
        title: 'Partner found',
        message: 'We matched you!',
        notification_type: 'partner_match', // maps to success -> ✅
        is_read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: 102,
        user_id: 7,
        title: 'Reminder',
        message: 'Session soon',
        type: 'warning', // maps to ⚠️
        is_read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: 103,
        user_id: 7,
        title: 'FYI',
        message: 'General info',
        notification_type: 'system', // info -> 📢
        is_read: true,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<Header />);

    // Search input and initials (no profile image)
    expect(screen.getByPlaceholderText(/search courses, groups, or buddies/i)).toBeInTheDocument();
    expect(screen.getByText('GS')).toBeInTheDocument();

    // Open notifications
    const bellBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('svg')) as HTMLButtonElement;
    await userEvent.click(bellBtn);

    // Badge '2'
    const badge = within(bellBtn.parentElement as HTMLElement).getByText('2');
    expect(badge).toBeInTheDocument();

    // List visible
    expect(await screen.findByRole('heading', { name: /notifications/i })).toBeInTheDocument();

    // Mark first as read
    markNotificationReadMock.mockResolvedValueOnce(true);
    await userEvent.click(screen.getByText('Partner found'));

    await waitFor(() => {
      expect(markNotificationReadMock).toHaveBeenCalledWith(101);
    });

    // Badge decrements to '1'
    await waitFor(() => {
      expect(within(bellBtn.parentElement as HTMLElement).getByText('1')).toBeInTheDocument();
    });

    // Emoji spot-checks
    expect(screen.getByText('✅')).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
    expect(screen.getByText('📢')).toBeInTheDocument();
  });

  test('falls back to built-in notifications when fetch fails', async () => {
    mockState.loading = false;
    mockState.currentUser = {
      user_id: 1,
      email: 'x@y.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      university: 'Uni',
      course: 'Math',
      year_of_study: 1,
      is_active: true,
    };

    fetchNotificationsMock.mockRejectedValueOnce(new Error('boom'));

    render(<Header />);

    // Open notifications
    const bellBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('svg')) as HTMLButtonElement;
    await userEvent.click(bellBtn);

    expect(await screen.findByText(/new study group invitation/i)).toBeInTheDocument();
    expect(screen.getByText(/session reminder/i)).toBeInTheDocument();
  });

  test('clicking outside closes notifications and user menu', async () => {
    mockState.loading = false;
    mockState.currentUser = {
      user_id: 1,
      email: 'x@y.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      university: 'Uni',
      course: 'Math',
      year_of_study: 1,
      is_active: true,
    };

    fetchNotificationsMock.mockResolvedValueOnce([]);

    render(<Header />);

    // Open notifications
    const bell = screen.getAllByRole('button').find((b) => b.querySelector('svg'))!;
    await userEvent.click(bell);
    expect(await screen.findByRole('heading', { name: /notifications/i })).toBeInTheDocument();

    // Open user menu (click on initials button)
    const initialsBtn = screen.getByText('AL').closest('button')!;
    await userEvent.click(initialsBtn);
    expect(screen.getByText(/settings/i)).toBeInTheDocument();

    // Click outside (document body)
    await userEvent.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /notifications/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/settings/i)).not.toBeInTheDocument();
    });
  });

  test('opens Settings modal from user menu and toggles one control', async () => {
    mockState.loading = false;
    mockState.currentUser = {
      user_id: 2,
      email: 'a@b.com',
      first_name: 'Grace',
      last_name: 'Hopper',
      university: 'Uni',
      course: 'CS',
      year_of_study: 4,
      is_active: true,
    };

    fetchNotificationsMock.mockResolvedValueOnce([]);

    render(<Header />);

    // Open user menu -> Settings
    const initialsBtn = screen.getByText('GH').closest('button')!;
    await userEvent.click(initialsBtn);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));

    // Modal appears
    expect(await screen.findByRole('heading', { name: /settings/i })).toBeInTheDocument();

    // Toggle a control (e.g., Email Updates) if present
    const row = screen.getByText(/email updates/i).closest('div');
    if (row) {
      const toggle = row.querySelector('button');
      if (toggle) await userEvent.click(toggle);
    }

    // Close modal
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /settings/i })).not.toBeInTheDocument();
    });
  });

  test('logout confirm flow posts to API, disables Google auto sign-in, revokes token, clears user and redirects', async () => {
    mockState.loading = false;
    mockState.currentUser = {
      user_id: 9,
      email: 'z@z.com',
      first_name: 'Alan',
      last_name: 'Turing',
      university: 'Uni',
      course: 'CS',
      year_of_study: 5,
      is_active: true,
    };

    fetchNotificationsMock.mockResolvedValueOnce([]);

    render(<Header />);

    // Open user menu -> Logout (open confirm modal)
    const initialsBtn = screen.getByText('AT').closest('button')!;
    await userEvent.click(initialsBtn);
    await userEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(await screen.findByRole('heading', { name: /confirm logout/i })).toBeInTheDocument();

    // Confirm logout
    await userEvent.click(screen.getByRole('button', { name: /^logout$/i }));

    // Posted to logout endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.test/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST' })
    );

    // Google helpers invoked
    expect((window as any).google.accounts.id.disableAutoSelect).toHaveBeenCalled();
    expect((window as any).google.accounts.id.revoke).toHaveBeenCalledWith(
      'tok_123',
      expect.any(Function)
    );

    // Context logout called
    expect(mockLogout).toHaveBeenCalled();

    // Redirect set
    expect(window.location.href).toBe('/login');

    // Token cleared
    expect(localStorage.getItem('last_google_id_token')).toBeNull();
  });
});
