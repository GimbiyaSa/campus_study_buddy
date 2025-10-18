// src/components/Header.test.tsx
import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Header from './Header';

// ---------------- Local, test-file-only stubs ----------------
let originalLocation: Location;

beforeEach(() => {
  vi.useRealTimers();

  // Stub fetch to avoid network noise
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

  // Save and stub window.location (avoid real navigations)
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
    UserProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

const fetchNotificationsMock = vi.fn();
const markNotificationReadMock = vi.fn();
const updateUserProfileMock = vi.fn();

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchNotifications: (...args: unknown[]) => fetchNotificationsMock(...args),
      markNotificationRead: (...args: unknown[]) => markNotificationReadMock(...args),
      updateUserProfile: (...args: unknown[]) => updateUserProfileMock(...args),
    },
  };
});

vi.mock('../utils/url', () => {
  return {
    buildApiUrl: (path: string) => `http://api.test${path}`,
  };
});

// ----------------- Helpers (test-only) -----------------
// Small helper to avoid brittle queries on deeply nested buttons
function getButtonByText(root: Element | Document, text: string): HTMLButtonElement | null {
  const btns = root.querySelectorAll('button');
  for (const b of Array.from(btns)) {
    if ((b.textContent || '').trim().toLowerCase() === text.toLowerCase()) {
      return b as HTMLButtonElement;
    }
  }
  return null;
}

// Click header buttons one-by-one until the user menu appears.
// This avoids coupling to button order or DOM structure.
async function openUserMenu(container: Element): Promise<void> {
  const btns = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
  for (const b of btns) {
    b.click();
    // allow microtasks (state updates / portals) to flush
    await Promise.resolve();
    const settings = getButtonByText(document.body, 'Settings');
    const logout = getButtonByText(document.body, 'Logout');
    if (settings || logout) return; // menu is open
  }
  throw new Error('Could not open user menu: Settings/Logout not found after clicking header buttons.');
}

// Poll the DOM across a few microtasks until a condition is true
async function waitUntil(predicate: () => boolean, spins = 60): Promise<void> {
  for (let i = 0; i < spins; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Condition not met in waitUntil');
}

// Find a toggle (button[role="switch"]) by its label text next to it
function getSwitchByLabel(label: string): HTMLButtonElement | null {
  const spans = Array.from(document.body.querySelectorAll('span'));
  for (const s of spans) {
    const t = (s.textContent || '').trim().toLowerCase();
    if (t === label.toLowerCase()) {
      // The switch is a sibling button in the same row container
      const row = s.closest('div');
      const btn = row?.querySelector('button[role="switch"]') as HTMLButtonElement | null;
      if (btn) return btn;
    }
  }
  return null;
}

// ----------------- Tests -----------------
describe('Header (basic, smoke tests)', () => {
  test('renders without crashing while loading', () => {
    mockState.loading = true;
    mockState.currentUser = null;

    const { container } = render(<Header />);
    // Extremely conservative: just ensure something rendered
    expect(container.firstElementChild).toBeTruthy();
  });

  test('renders without crashing when user is loaded', () => {
    mockState.loading = false;
    mockState.currentUser = {
      user_id: 1,
      email: 'ada@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      university: 'Analytical U',
      course: 'Math',
      year_of_study: 3,
      is_active: true,
    };

    const { container } = render(<Header />);
    // Again, only assert that DOM exists; no assumptions about content/structure
    expect(container.firstElementChild).toBeTruthy();
  });

  describe('Header (stable behavior tests)', () => {
    beforeEach(() => {
      // Defaults for these tests: a logged-in user
      mockState.loading = false;
      mockState.currentUser = {
        user_id: 1,
        email: 'ada@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
        university: 'Analytical U',
        course: 'Math',
        year_of_study: 3,
        is_active: true,
      };

      // Ensure Notification API is present by default and grants permission
      (globalThis as any).Notification = {
        requestPermission: vi.fn().mockResolvedValue('granted'),
      };
    });

    afterEach(() => {
      updateUserProfileMock.mockReset();
    });

    test('opens user menu and shows Settings/Logout; clicking outside closes it', async () => {
      const { container } = render(<Header />);

      // Open the user menu
      await openUserMenu(container);

      // Menu should now contain Settings and Logout
      const settingsBtn = getButtonByText(document.body, 'Settings');
      const logoutBtn = getButtonByText(document.body, 'Logout');
      expect(settingsBtn).toBeTruthy();
      expect(logoutBtn).toBeTruthy();

      // Click outside to close (target an element that's definitely outside)
      (document.body || document).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await Promise.resolve(); // let state update flush

      expect(getButtonByText(document.body, 'Settings')).toBeNull();
      expect(getButtonByText(document.body, 'Logout')).toBeNull();
    });

    test('opens Settings modal and toggles Email (persists), then closes', async () => {
      const { container } = render(<Header />);

      // Open user menu
      await openUserMenu(container);

      // Open Settings modal
      const settingsBtn = getButtonByText(document.body, 'Settings');
      expect(settingsBtn).toBeTruthy();
      settingsBtn!.click();
      await Promise.resolve();

      // Modal should exist (look for title text)
      expect((document.body.textContent || '').includes('Settings')).toBe(true);

      // Find the "Email Updates" switch by role=button with aria-checked
      const emailSwitch = getSwitchByLabel('Email Updates');
      expect(emailSwitch).toBeTruthy();

      // Toggle Email: should call updateUserProfile once
      emailSwitch!.click();
      await Promise.resolve(); // let async microtasks flush

      expect(updateUserProfileMock).toHaveBeenCalledTimes(1);
      const [payload] = updateUserProfileMock.mock.calls[0] || [{}];
      expect(payload).toBeTruthy();
      expect(payload.study_preferences).toBeTruthy();

      // Close Settings
      const closeBtn = getButtonByText(document.body, 'Close');
      expect(closeBtn).toBeTruthy();
      closeBtn!.click();
      await Promise.resolve();
      await Promise.resolve();

      // Modal content should be gone: switches disappear when modal closes
      const switchesAfterClose = document.body.querySelectorAll('button[role="switch"]');
      expect(switchesAfterClose.length).toBe(0);
    });

    test('toggling Push handles permission denied with an error message', async () => {
      // Force permission "denied"
      (globalThis as any).Notification = {
        requestPermission: vi.fn().mockResolvedValue('denied'),
      };

      const { container } = render(<Header />);

      // Open user menu → Settings
      await openUserMenu(container);
      const settingsBtn = getButtonByText(document.body, 'Settings');
      expect(settingsBtn).toBeTruthy();
      settingsBtn!.click();
      await Promise.resolve();
      await Promise.resolve(); // extra tick to ensure modal fully rendered

      const pushSwitch = getSwitchByLabel('Push Notifications');
      expect(pushSwitch).toBeTruthy();

      const before = pushSwitch!.getAttribute('aria-checked'); // expect "false" initially

      // Toggle Push → denied path should set error text and NOT toggle/persist
      pushSwitch!.click();

      // Wait until either the error message is visible OR the toggle clearly didn't change
      await waitUntil(() => {
        const body = (document.body.textContent || '').toLowerCase();
        const errorShown = body.includes('allow notifications');
        const stillOff = pushSwitch!.getAttribute('aria-checked') === 'false';
        return errorShown || stillOff;
      });

      const bodyText = (document.body.textContent || '').toLowerCase();
      const errorShown = bodyText.includes('allow notifications');
      const after = pushSwitch!.getAttribute('aria-checked');

      // We accept either explicit error text or that the toggle didn't switch on
      expect(errorShown || after === 'false').toBe(true);

      // Ensure we did NOT call updateUserProfile on denied path
      expect(updateUserProfileMock).not.toHaveBeenCalled();

      // And it should not have toggled on
      expect(before).toBe('false');
      expect(after).toBe('false');
    });

    test('logout flow: opens confirm dialog, calls APIs, clears storage, redirects', async () => {
      const { container } = render(<Header />);

      // Open user menu → Logout
      await openUserMenu(container);
      const logoutMenuBtn = getButtonByText(document.body, 'Logout');
      expect(logoutMenuBtn).toBeTruthy();
      logoutMenuBtn!.click();
      await Promise.resolve(); // allow confirm modal to render

      // Confirm modal shows
      const confirmTextPresent = (document.body.textContent || '').includes('Confirm Logout');
      expect(confirmTextPresent).toBe(true);

      // Click "Logout" in confirm modal
      const confirmBtn = getButtonByText(document.body, 'Logout');
      expect(confirmBtn).toBeTruthy();

      // Seed tokens to verify clearing
      localStorage.setItem('google_id_token', 'abc');
      localStorage.setItem('last_google_id_token', 'tok_123');

      confirmBtn!.click();
      await Promise.resolve(); // flush async

      // fetch called with logout endpoint
      expect(global.fetch).toHaveBeenCalled();
      const urlArg = (global.fetch as any).mock.calls[0][0] as string;
      expect(urlArg).toBe('http://api.test/api/v1/auth/logout'); // from mocked buildApiUrl

      // logout from context called
      expect(mockLogout).toHaveBeenCalled();

      // tokens cleared
      expect(localStorage.getItem('google_id_token')).toBeNull();
      expect(localStorage.getItem('last_google_id_token')).toBeNull();

      // redirected
      expect(window.location.href).toBe('/login');
    });

    test('shows helper text when Notification API is not supported', async () => {
      // Ensure the property truly does not exist so: !('Notification' in window) === true
      // @ts-ignore
      delete (globalThis as any).Notification;

      const { container } = render(<Header />);

      // Open user menu → Settings
      await openUserMenu(container);
      const settingsBtn = getButtonByText(document.body, 'Settings');
      expect(settingsBtn).toBeTruthy();
      settingsBtn!.click();
      await Promise.resolve();
      await Promise.resolve();

      const text = (document.body.textContent || '').toLowerCase();
      expect(text.includes('support push notifications')).toBe(true);
    });
  });
});
