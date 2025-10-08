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

  
});
