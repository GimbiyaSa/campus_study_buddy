// src/components/UpcomingSessions.test.tsx
import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpcomingSessions from './UpcomingSessions';

/* ---------- Minimal mocks (keep imports intact) ---------- */
const fetchSessionsMock = vi.fn();
vi.mock('../services/dataService', () => ({
  DataService: {
    fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args),
  },
}));

const navigateMock = vi.fn();
vi.mock('../router', () => ({ navigate: (...args: unknown[]) => navigateMock(...args) }));

vi.mock('../utils/url', () => ({ buildApiUrl: (p: string) => `http://api.test${p}` }));

/* ---------- Helpers ---------- */
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const mk = (over: Partial<any> = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: over.title ?? 'Future Session',
  type: over.type ?? 'study',
  date: over.date ?? daysFromNow(1), // within next 7 days
  startTime: over.startTime ?? '23:59',
  participants: over.participants ?? 1,
  maxParticipants: over.maxParticipants ?? 5,
  location: over.location ?? 'Library',
  status: over.status ?? 'upcoming',
  isCreator: over.isCreator ?? false,
  isAttending: over.isAttending ?? false,
  course: over.course ?? 'CS',
});

/* A tiny helper to get a card scoped by its title */
const getCardByTitle = async (title: string) => {
  const heading = await screen.findByRole('heading', { name: title });
  const card =
    heading.closest('.bg-white') ?? heading.parentElement?.parentElement;
  if (!card || !(card instanceof HTMLElement)) throw new Error('Card root not found for ' + title);
  return card;
};

beforeEach(() => {
  fetchSessionsMock.mockReset();
  navigateMock.mockReset();
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UpcomingSessions (basic)', () => {
  test('renders header and count label once data loads', async () => {
    fetchSessionsMock.mockResolvedValueOnce([mk(), mk({ title: 'Another' })]);

    render(<UpcomingSessions />);

    await screen.findByRole('heading', { name: /upcoming sessions/i, level: 2 });

    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Future Session' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Another' })).toBeInTheDocument();
  });

  test('empty state: shows CTA that dispatches calendar:openSchedule', async () => {
    fetchSessionsMock.mockResolvedValueOnce([]);

    const spy = vi.fn();
    window.addEventListener('calendar:openSchedule', spy);

    render(<UpcomingSessions />);

    await screen.findByText(/no upcoming sessions/i);
    await userEvent.click(screen.getByRole('button', { name: /schedule a session/i }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('error path: demo banner shows but header still renders', async () => {
    fetchSessionsMock.mockRejectedValueOnce(new Error('boom'));

    render(<UpcomingSessions />);

    await screen.findByText(/showing demo session data/i);
    expect(
      await screen.findByRole('heading', { name: /upcoming sessions/i, level: 2 })
    ).toBeInTheDocument();
  });

  test('View Details navigates to /sessions', async () => {
    fetchSessionsMock.mockResolvedValueOnce([mk({ title: 'Details' })]);

    render(<UpcomingSessions />);

    await screen.findByRole('heading', { name: 'Details' });
    await userEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions');
  });
});

describe('UpcomingSessions (behavior)', () => {
  test('filters to the next 7 days (older/far-future excluded)', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ title: 'In 1 day', date: daysFromNow(1) }),
      mk({ title: 'In 6 days', date: daysFromNow(6) }),
      mk({ title: 'In 8 days', date: daysFromNow(8) }), // excluded
      mk({ title: 'Yesterday', date: daysFromNow(-1) }), // excluded
    ]);

    render(<UpcomingSessions />);

    await screen.findByRole('heading', { name: /upcoming sessions/i, level: 2 });

    expect(screen.getByRole('heading', { name: 'In 1 day' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In 6 days' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'In 8 days' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Yesterday' })).toBeNull();

    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();
  });

  test('Attend flow: optimistic join, counter updates, invalidate triggers refetch', async () => {
    const s = mk({ title: 'Joinable', isAttending: false, participants: 2, maxParticipants: 5 });

    // Initial fetch returns original
    fetchSessionsMock.mockResolvedValueOnce([s]);

    // After sessions:invalidate, return the *updated* server state (joined)
    const sJoined = { ...s, isAttending: true, participants: 3 };
    fetchSessionsMock.mockResolvedValueOnce([sJoined]);

    render(<UpcomingSessions />);

    const card = await getCardByTitle('Joinable');

    // Click Attend
    const attendBtn = within(card).getByRole('button', { name: /attend/i });
    await userEvent.click(attendBtn);

    // Optimistic UI updates, and stays updated after refetch
    await waitFor(() => {
      expect(within(card).queryByRole('button', { name: /attend/i })).toBeNull();
      expect(within(card).getByText(/participants/i).textContent).toMatch(/3\s*\/\s*5/);
      expect(within(card).getByText(/attending/i)).toBeInTheDocument();
    });

    await waitFor(() => expect(fetchSessionsMock).toHaveBeenCalledTimes(2));
  });

  test('Leave flow: optimistic leave, counter updates back, invalidate triggers refetch', async () => {
    const s = mk({
      title: 'Leaveable',
      isAttending: true,
      participants: 3,
      maxParticipants: 5,
    });

    // Initial fetch: attending = true
    fetchSessionsMock.mockResolvedValueOnce([s]);

    // After invalidate, server reflects left state
    const sLeft = { ...s, isAttending: false, participants: 2 };
    fetchSessionsMock.mockResolvedValueOnce([sLeft]);

    render(<UpcomingSessions />);

    const card = await getCardByTitle('Leaveable');

    const leaveBtn = within(card).getByRole('button', { name: /leave/i });
    await userEvent.click(leaveBtn);

    await waitFor(() => {
      expect(within(card).getByText(/participants/i).textContent).toMatch(/2\s*\/\s*5/);
      expect(within(card).getByRole('button', { name: /attend/i })).toBeInTheDocument();
    });

    await waitFor(() => expect(fetchSessionsMock).toHaveBeenCalledTimes(2));
  });

  test('Cancel (organizer): removes card and emits session:deleted + sessions:invalidate', async () => {
    const s = mk({ title: 'Cancelable', isCreator: true });

    fetchSessionsMock.mockResolvedValueOnce([s]);
    fetchSessionsMock.mockResolvedValueOnce([]); // post-invalidate

    const deletedSpy = vi.fn();
    const invalidateSpy = vi.fn();
    window.addEventListener('session:deleted', deletedSpy as EventListener);
    window.addEventListener('sessions:invalidate', invalidateSpy as EventListener);

    render(<UpcomingSessions />);

    const card = await getCardByTitle('Cancelable');
    const cancelBtn = within(card).getByRole('button', { name: /cancel session/i });

    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Cancelable' })).toBeNull();
    });

    await waitFor(() => {
      expect(deletedSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalled();
    });

    await waitFor(() => expect(fetchSessionsMock).toHaveBeenCalledTimes(2));
  });

  test('Event bus: created/updated propagate into the list', async () => {
    fetchSessionsMock.mockResolvedValueOnce([]);

    render(<UpcomingSessions />);

    await screen.findByText(/no upcoming sessions/i);

    const created = mk({ title: 'Newly Created', date: daysFromNow(2) });
    window.dispatchEvent(new CustomEvent('session:created', { detail: created }));

    await screen.findByRole('heading', { name: 'Newly Created' });
    expect(screen.getByText('1 sessions this week')).toBeInTheDocument();

    const updated = { ...created, title: 'Renamed Session' };
    window.dispatchEvent(new CustomEvent('session:updated', { detail: updated }));

    await screen.findByRole('heading', { name: 'Renamed Session' });
    expect(screen.queryByRole('heading', { name: 'Newly Created' })).toBeNull();
  });
});
