// src/pages/Sessions.test.tsx
import { render } from '../test-utils';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Sessions from './Sessions';

// Keep portals inline
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// Stub buildApiUrl (used by /users/me in UserContext)
vi.mock('../utils/url', () => ({ buildApiUrl: (p: string) => `http://api.test${p}` }));

// Mock AzureIntegrationService (both default + named export to prevent unhandled rejections)
vi.mock('../services/azureIntegrationService', () => {
  const mock = {
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    initializeRealTimeConnection: vi.fn(),
    disconnect: vi.fn(),
    sendTyping: vi.fn(),
    sendMessage: vi.fn(),
    webPubSubClient: {
      joinGroup: vi.fn(),
      leaveGroup: vi.fn(),
    },
  };
  return {
    default: mock,
    AzureIntegrationService: mock,
  };
});

// BroadcastChannel shim (Sessions page may broadcast)
class BCMock {
  constructor(_name: string) {}
  postMessage() {}
  close() {}
}
(globalThis as any).BroadcastChannel = BCMock;

// --- DataService surface used by Sessions ---
const ds = {
  fetchSessions: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  joinSession: vi.fn(),
  leaveSession: vi.fn(),
  fetchMyGroups: vi.fn(),
};

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchSessions: (...a: unknown[]) => ds.fetchSessions(...a),
      createSession: (...a: unknown[]) => ds.createSession(...a),
      updateSession: (...a: unknown[]) => ds.updateSession(...a),
      deleteSession: (...a: unknown[]) => ds.deleteSession(...a),
      joinSession: (...a: unknown[]) => ds.joinSession(...a),
      leaveSession: (...a: unknown[]) => ds.leaveSession(...a),
      fetchMyGroups: (...a: unknown[]) => ds.fetchMyGroups(...a),
    },
  };
});

// Helpers
const mkSession = (over: Partial<any> = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: over.title ?? 'Algorithms',
  course: over.course ?? 'CS',
  courseCode: over.courseCode ?? 'CS101',
  date: over.date ?? '2025-10-02',
  startTime: over.startTime ?? '10:00',
  endTime: over.endTime ?? '11:00',
  location: over.location ?? 'Library',
  type: over.type ?? 'study',
  participants: over.participants ?? 1,
  maxParticipants: over.maxParticipants ?? 5,
  status: over.status ?? 'upcoming',
  isCreator: over.isCreator ?? true,
  isAttending: over.isAttending ?? true,
  groupId: over.groupId,
});

const findCard = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('.p-6') as HTMLElement;

const FIXED_NOW = new Date('2025-10-02T12:00:00');

beforeEach(() => {
  vi.useRealTimers();
  vi.setSystemTime(FIXED_NOW);

  Object.values(ds).forEach((f) => (f as any).mockReset());

  // /users/me → I am user '1'
  (global.fetch as any) = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/v1/users/me')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: '1', name: 'Me' }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  // Default dataset: creator, joinable, attending, cancelled
  ds.fetchSessions.mockResolvedValue([
    mkSession({
      id: 'c1',
      title: 'Creator',
      isCreator: true,
      isAttending: true,
      status: 'upcoming',
      participants: 2,
      maxParticipants: 5,
    }),
    mkSession({
      id: 'j1',
      title: 'Joinable',
      isCreator: false,
      isAttending: false,
      participants: 1,
      maxParticipants: 2,
      status: 'upcoming',
    }),
    mkSession({
      id: 'a1',
      title: 'Attending',
      isCreator: false,
      isAttending: true,
      status: 'upcoming',
    }),
    mkSession({
      id: 'x1',
      title: 'Cancelled',
      status: 'cancelled',
      isCreator: false,
      isAttending: false,
    }),
  ]);

  // Minimal action defaults (we don't drive the whole modal flow here)
  ds.createSession.mockResolvedValue(null);
  ds.updateSession.mockResolvedValue(null);
  ds.deleteSession.mockResolvedValue({ ok: true, data: { status: 'cancelled' } });
  ds.joinSession.mockResolvedValue(true);
  ds.leaveSession.mockResolvedValue(true);
  ds.fetchMyGroups.mockResolvedValue([
    { id: 'g1', name: 'Group A', course: 'Data Structures', courseCode: 'CS201' },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Sessions page (simple smoke tests)', () => {
  test('renders header and session cards', async () => {
    render(<Sessions />);

    // Shows loading first
    expect(screen.getByText(/Loading sessions/i)).toBeInTheDocument();

    // Header + cards
    await screen.findByRole('heading', { name: /Plan study sessions/i });
    expect(screen.getByRole('heading', { name: 'Creator' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Joinable' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cancelled' })).toBeInTheDocument();
  });

  test('clicking "New session" opens the create modal (no heavy typing)', async () => {
    render(<Sessions />);
    await screen.findByRole('button', { name: /New session/i });
    await userEvent.click(screen.getAllByRole('button', { name: /New session/i })[0]);

    // Just assert the modal header exists (your UI shows "New session")
    await screen.findByRole('heading', { name: /New session/i });
  });

  test('attend on a joinable session calls DataService.joinSession with id', async () => {
    render(<Sessions />);
    const joinableCard = await waitFor(() => findCard('Joinable'));

    await userEvent.click(within(joinableCard).getByRole('button', { name: /Attend/i }));
    expect(ds.joinSession).toHaveBeenCalledWith('j1');
  });

  test('leave on an attending session calls DataService.leaveSession with id', async () => {
    render(<Sessions />);
    const attendingCard = await waitFor(() => findCard('Attending'));

    await userEvent.click(within(attendingCard).getByRole('button', { name: /Leave/i }));
    expect(ds.leaveSession).toHaveBeenCalledWith('a1');
  });

  test('creator card shows delete and clicking it calls DataService.deleteSession', async () => {
    render(<Sessions />);
    const creatorCard = await waitFor(() => findCard('Creator'));

    await userEvent.click(within(creatorCard).getByRole('button', { name: /Delete session/i }));
    expect(ds.deleteSession).toHaveBeenCalledWith('c1');
  });
});

// --- Coverage boosters for Sessions ---

describe('Sessions page (behaviors + follow-up UI)', () => {
  test('joining triggers the action (no strict refetch assertion)', async () => {
    render(<Sessions />);

    await screen.findByRole('heading', { name: /Plan study sessions/i });

    const joinableCard = await waitFor(() => findCard('Joinable'));
    await userEvent.click(within(joinableCard).getByRole('button', { name: /Attend/i }));

    await waitFor(() => {
      expect(ds.joinSession).toHaveBeenCalledWith('j1');
    });
  });

  test('leaving triggers the action (no strict refetch assertion)', async () => {
    render(<Sessions />);

    await screen.findByRole('heading', { name: /Plan study sessions/i });

    const attendingCard = await waitFor(() => findCard('Attending'));
    await userEvent.click(within(attendingCard).getByRole('button', { name: /Leave/i }));

    await waitFor(() => {
      expect(ds.leaveSession).toHaveBeenCalledWith('a1');
    });
  });

  test('deleting updates status/counts (card may remain)', async () => {
    render(<Sessions />);

    await screen.findByRole('heading', { name: /Plan study sessions/i });
    // Initial counts: Upcoming (3) and Cancelled (1)
    expect(screen.getByRole('button', { name: /Upcoming\s*\(\s*3\s*\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelled\s*\(\s*1\s*\)/i })).toBeInTheDocument();

    const creatorCard = await waitFor(() => findCard('Creator'));
    await userEvent.click(within(creatorCard).getByRole('button', { name: /Delete session/i }));

    await waitFor(() => {
      expect(ds.deleteSession).toHaveBeenCalledWith('c1');
    });

    // After delete, UI shows counts: Upcoming (2), Cancelled (2)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Upcoming\s*\(\s*2\s*\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancelled\s*\(\s*2\s*\)/i })).toBeInTheDocument();
    });
  });
});

describe('Sessions page (create/edit modal light checks)', () => {
  test('opening "New session" triggers group fetch for the selector', async () => {
    render(<Sessions />);

    const [headerCTA] = await screen.findAllByRole('button', { name: /New session/i });
    await userEvent.click(headerCTA);

    // Modal heading exists
    await screen.findByRole('heading', { name: /New session/i });

    // Opening the modal should have asked for groups to populate the select
    expect(ds.fetchMyGroups).toHaveBeenCalledTimes(1);

    // We don’t do heavy typing here, just close via Escape to exercise unmount path
    await userEvent.keyboard('{Escape}');
  });
});

describe('Sessions page (guard rails / cancelled)', () => {
  test('cancelled session shows no Attend/Leave actions', async () => {
    render(<Sessions />);

    await screen.findByRole('heading', { name: /Plan study sessions/i });

    const cancelledCard = await waitFor(() => findCard('Cancelled'));

    // Ensure primary join/leave actions aren't present for cancelled
    expect(within(cancelledCard).queryByRole('button', { name: /Attend/i })).toBeNull();
    expect(within(cancelledCard).queryByRole('button', { name: /Leave/i })).toBeNull();
  });
});

describe('Sessions page (empty/error paths)', () => {
  test('empty dataset → shows CTA with no session cards', async () => {
    // Return empty list once
    ds.fetchSessions.mockResolvedValueOnce([]);

    render(<Sessions />);

    await screen.findByRole('heading', { name: /Plan study sessions/i });

    // No known titles present
    expect(screen.queryByRole('heading', { name: 'Creator' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Joinable' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Attending' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cancelled' })).toBeNull();

    // There are two "New session" CTAs (header + empty state) — just assert at least one exists
    const newSessionButtons = screen.getAllByRole('button', { name: /New session/i });
    expect(newSessionButtons.length).toBeGreaterThanOrEqual(1);
  });

  test('fetch error → still renders page chrome and New session CTA(s)', async () => {
    ds.fetchSessions.mockRejectedValueOnce(new Error('boom'));

    render(<Sessions />);

    await screen.findByRole('heading', { name: /Plan study sessions/i });
    // Avoid asserting specific error copy; just assert no cards and at least one CTA present
    expect(screen.queryByRole('heading', { name: 'Creator' })).toBeNull();

    const newSessionButtons = screen.getAllByRole('button', { name: /New session/i });
    expect(newSessionButtons.length).toBeGreaterThanOrEqual(1);
  });
});
