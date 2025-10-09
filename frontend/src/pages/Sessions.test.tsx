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
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // Just assert the modal header exists (your UI shows "New session")
    await screen.findByRole('heading', { name: /New session/i });
  });

  test('attend on a joinable session calls DataService.joinSession with id', async () => {
    render(<Sessions />);
    const joinableCard = await waitFor(() => findCard('Joinable'));

    // Button is typically named "Attend" in this UI
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
