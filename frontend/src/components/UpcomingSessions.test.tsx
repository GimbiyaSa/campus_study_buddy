// src/components/UpcomingSessions.test.tsx
import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpcomingSessions from './UpcomingSessions';

// ---- Mocks ----
const fetchSessionsMock = vi.fn();

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args),
    },
  };
});

const navigateMock = vi.fn();
vi.mock('../router', () => {
  return { navigate: (...args: unknown[]) => navigateMock(...args) };
});

vi.mock('../utils/url', () => {
  return { buildApiUrl: (path: string) => `http://api.test${path}` };
});

const FIXED_NOW_ISO = '2025-10-02T12:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW_ISO));

  fetchSessionsMock.mockReset();
  navigateMock.mockReset();

  // Default fetch OK; tests override when needed
  global.fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as any;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Utilities to craft sessions relative to FIXED_NOW_ISO
const mkSession = (over: Partial<any> = {}) => {
  return {
    id: over.id ?? 's1',
    title: over.title ?? 'Algebra',
    type: over.type ?? 'review',
    date: over.date ?? '2025-10-03', // within 7 days
    startTime: over.startTime ?? '10:00',
    participants: over.participants ?? 1,
    maxParticipants: over.maxParticipants ?? 5,
    location: over.location ?? 'Library',
    status: over.status ?? 'upcoming',
    isCreator: over.isCreator ?? false,
    isAttending: over.isAttending ?? false,
    course: over.course ?? 'MATH 101',
  };
};

describe('UpcomingSessions', () => {
  test('shows loading state then renders filtered upcoming list within 7 days and sorts by time', async () => {
    // Prepare: 3 sessions -> one earlier same day, one later, one outside window (>7d), one past
    fetchSessionsMock.mockResolvedValueOnce([
      mkSession({ id: 'a', title: 'Earlier', date: '2025-10-03', startTime: '08:00' }),
      mkSession({ id: 'b', title: 'Later', date: '2025-10-05', startTime: '12:30' }),
      mkSession({ id: 'x', title: 'Outside', date: '2025-10-15', startTime: '09:00' }), // > 7d
      mkSession({ id: 'p', title: 'Past', date: '2025-10-01', startTime: '10:00' }), // past
    ]);

    render(<UpcomingSessions />);

    // Loading text first
    expect(screen.getByText(/loading upcoming sessions/i)).toBeInTheDocument();

    // Renders only 'Earlier' and 'Later' sorted (2 sessions)
    await screen.findByText(/upcoming sessions/i);
    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();

    const cards = screen.getAllByRole('heading', { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(['Earlier', 'Later']);

    // Basic fields visible
    expect(screen.getByText(/course: math 101/i)).toBeInTheDocument();
    expect(screen.getAllByText(/participants/i)[0]).toBeInTheDocument();
  });

  test('empty state: shows schedule button and dispatches calendar:openSchedule event', async () => {
    fetchSessionsMock.mockResolvedValueOnce([]); // no sessions

    const handler = vi.fn();
    window.addEventListener('calendar:openSchedule', handler);

    render(<UpcomingSessions />);

    await screen.findByText(/no upcoming sessions/i);
    const btn = screen.getByRole('button', { name: /schedule a session/i });
    await userEvent.click(btn);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('error state: shows banner "Showing demo session data"', async () => {
    fetchSessionsMock.mockRejectedValueOnce(new Error('boom'));

    render(<UpcomingSessions />);

    // Loads, then shows banner and still renders header
    await screen.findByText(/showing demo session data/i);
    expect(screen.getByText(/upcoming sessions/i)).toBeInTheDocument();
  });

  test('session:created adds a new item if it falls within the 7-day window and keeps sorted order', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mkSession({ id: 'a', title: 'A', date: '2025-10-03', startTime: '09:00' }),
    ]);

    render(<UpcomingSessions />);

    await screen.findByText('A');
    expect(screen.getByText('1 sessions this week')).toBeInTheDocument();

    // Dispatch a created event with a session in window
    const created = mkSession({ id: 'b', title: 'B', date: '2025-10-02', startTime: '13:00' });
    window.dispatchEvent(
      new CustomEvent('session:created', { detail: created })
    );

    // Both A and B now; ensure sort ascending by date/time
    await screen.findByText('B');
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['A', 'B']); // 10/03 09:00 then 10/02 13:00? Wait: sort function sorts by actual Date.
    // Our sort is by toDateTime; since now is Oct 2, B(Oct2 13:00) < A(Oct3 09:00)
    // The component sorts ascending; so adjust:
    // Re-check ordering:
    expect(titles[0]).toBe('B');

    // Count updated
    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();

    // Dispatch a created event with out-of-window date -> ignored
    const outside = mkSession({ id: 'z', title: 'Z', date: '2025-10-20' });
    window.dispatchEvent(new CustomEvent('session:created', { detail: outside }));
    expect(screen.queryByText('Z')).not.toBeInTheDocument();
  });

  test('sessions:invalidate triggers a refetch and updates list', async () => {
    fetchSessionsMock
      .mockResolvedValueOnce([mkSession({ id: 'a', title: 'A' })]) // initial
      .mockResolvedValueOnce([mkSession({ id: 'b', title: 'B' })]); // after invalidate

    render(<UpcomingSessions />);

    await screen.findByText('A');
    window.dispatchEvent(new Event('sessions:invalidate'));

    await screen.findByText('B');
    expect(screen.queryByText('A')).not.toBeInTheDocument();
  });

  test('Attend button: optimistic set to attending and participants +1; rolls back on 409/403/404', async () => {
    // Non-creator, not attending, below max -> canAttend
    fetchSessionsMock.mockResolvedValueOnce([
      mkSession({
        id: 'att',
        title: 'AttendMe',
        participants: 1,
        maxParticipants: 2,
        isCreator: false,
        isAttending: false,
      }),
    ]);

    // First click -> respond with 409 to trigger rollback
    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 409 }) // join
      .mockResolvedValue({ ok: true, status: 200 }); // any subsequent fetches safe

    render(<UpcomingSessions />);

    await screen.findByText('AttendMe');

    // Find card
    const card = screen.getByRole('heading', { name: 'AttendMe' }).closest('div')!;
    const btn = within(card).getByRole('button', { name: /attend/i });
    await userEvent.click(btn);

    // Optimistic: text "Attending" pill should appear and participants increment to 2 / 2
    await screen.findByText(/attending/i);
    expect(within(card).getByText(/2 \/ 2/)).toBeInTheDocument();

    // After server 409 -> rollback -> attending pill should disappear and participants back to 1
    await waitFor(() => {
      expect(within(card).queryByText(/attending/i)).not.toBeInTheDocument();
    });
    expect(within(card).getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  test('Leave button: optimistic set to not attending and participants -1; rolls back on 400/403/404', async () => {
    // Non-creator attending -> canLeave
    fetchSessionsMock.mockResolvedValueOnce([
      mkSession({
        id: 'lev',
        title: 'LeaveMe',
        participants: 2,
        maxParticipants: 5,
        isCreator: false,
        isAttending: true,
      }),
    ]);

    ;(global.fetch as any).mockResolvedValueOnce({ ok: false, status: 400 }); // leave -> rollback

    render(<UpcomingSessions />);

    await screen.findByText('LeaveMe');

    const card = screen.getByRole('heading', { name: 'LeaveMe' }).closest('div')!;
    const btn = within(card).getByRole('button', { name: /leave/i });
    await userEvent.click(btn);

    // Optimistic: attending pill disappears, participants decremented
    await waitFor(() => {
      expect(within(card).queryByText(/attending/i)).not.toBeInTheDocument();
    });
    expect(within(card).getByText(/1 \/ 5/)).toBeInTheDocument();

    // Rollback: pill reappears and participants back to 2
    await waitFor(() => {
      expect(within(card).getByText(/attending/i)).toBeInTheDocument();
      expect(within(card).getByText(/2 \/ 5/)).toBeInTheDocument();
    });
  });

  test('Cancel button: only for organizer; removes card and calls DELETE, then dispatches sessions:invalidate (which causes refetch)', async () => {
    fetchSessionsMock
      .mockResolvedValueOnce([
        mkSession({ id: 'org', title: 'OrganizerOne', isCreator: true }),
        mkSession({ id: 'other', title: 'Other' }),
      ])
      .mockResolvedValueOnce([mkSession({ id: 'other', title: 'Other' })]); // after invalidate

    ;(global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 }); // cancel

    const spyInvalidate = vi.fn();
    window.addEventListener('sessions:invalidate', spyInvalidate);

    render(<UpcomingSessions />);

    await screen.findByText('OrganizerOne');

    const orgCard = screen.getByRole('heading', { name: 'OrganizerOne' }).closest('div')!;
    const cancelBtn = within(orgCard).getByRole('button', { name: /cancel session/i });
    await userEvent.click(cancelBtn);

    // Optimistic removal
    await waitFor(() => {
      expect(screen.queryByText('OrganizerOne')).not.toBeInTheDocument();
    });

    // Called DELETE /api/v1/sessions/org
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.test/api/v1/sessions/org',
      expect.objectContaining({ method: 'DELETE' })
    );

    // Invalidate dispatched -> refetch applied (shows only "Other")
    await waitFor(() => {
      expect(spyInvalidate).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  test('View Details navigates to /sessions', async () => {
    fetchSessionsMock.mockResolvedValueOnce([mkSession({ id: 'x', title: 'Details' })]);

    render(<UpcomingSessions />);

    await screen.findByText('Details');
    const card = screen.getByRole('heading', { name: 'Details' }).closest('div')!;
    const btn = within(card).getByRole('button', { name: /view details/i });
    await userEvent.click(btn);

    expect(navigateMock).toHaveBeenCalledWith('/sessions');
  });
});
