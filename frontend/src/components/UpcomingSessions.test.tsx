// src/components/UpcomingSessions.test.tsx
import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpcomingSessions from './UpcomingSessions';

// ---- Mocks ----
const fetchSessionsMock = vi.fn();

vi.mock('../services/dataService', () => ({
  DataService: {
    fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args),
  },
}));

const navigateMock = vi.fn();
vi.mock('../router', () => ({ navigate: (...args: unknown[]) => navigateMock(...args) }));

vi.mock('../utils/url', () => ({ buildApiUrl: (path: string) => `http://api.test${path}` }));

const FIXED_NOW_ISO = '2025-10-02T12:00:00.000Z';

beforeEach(() => {
  // Use real timers for these async component tests
  vi.useRealTimers();

  // Mock Date to be consistent for filtering tests
  vi.setSystemTime(new Date(FIXED_NOW_ISO));

  fetchSessionsMock.mockReset();
  navigateMock.mockReset();

  // default fetch ok
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  }) as any;

  // clean localStorage before each for auth header tests
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Helpers to craft sessions relative to FIXED_NOW_ISO (Oct 2, 2025 12:00Z local)
const mk = (over: Partial<any> = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
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
});

describe('UpcomingSessions', () => {
  test('loads, filters to next 7 days, and sorts by datetime', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'a', title: 'Earlier', date: '2025-10-03', startTime: '08:00' }),
      mk({ id: 'b', title: 'Later', date: '2025-10-05', startTime: '12:30' }),
      mk({ id: 'x', title: 'Outside', date: '2025-10-15', startTime: '09:00' }), // > 7d
      mk({ id: 'p', title: 'Past', date: '2025-10-01', startTime: '10:00' }), // past
    ]);

    render(<UpcomingSessions />);

    expect(screen.getByText(/loading upcoming sessions/i)).toBeInTheDocument();

    await screen.findByText(/upcoming sessions/i);
    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Earlier', 'Later']);

    expect(screen.getByText(/course: math 101/i)).toBeInTheDocument();
    expect(screen.getAllByText(/participants/i)[0]).toBeInTheDocument();
  });

  test('empty state: schedule button dispatches calendar:openSchedule', async () => {
    fetchSessionsMock.mockResolvedValueOnce([]);

    const spy = vi.fn();
    window.addEventListener('calendar:openSchedule', spy);

    render(<UpcomingSessions />);

    await screen.findByText(/no upcoming sessions/i);
    await userEvent.click(screen.getByRole('button', { name: /schedule a session/i }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('error banner shown on fetch failure but header still renders', async () => {
    fetchSessionsMock.mockRejectedValueOnce(new Error('fail'));
    render(<UpcomingSessions />);

    await screen.findByText(/showing demo session data/i);
    expect(screen.getByText(/upcoming sessions/i)).toBeInTheDocument();
  });

  test('session:created in-window inserts in sorted order; out-of-window ignored; duplicate id deduped', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'a', title: 'A', date: '2025-10-03', startTime: '09:00' }),
    ]);
    render(<UpcomingSessions />);

    await screen.findByText('A');
    expect(screen.getByText('1 sessions this week')).toBeInTheDocument();

    const b = mk({ id: 'b', title: 'B', date: '2025-10-02', startTime: '13:00' }); // earlier than A
    window.dispatchEvent(new CustomEvent('session:created', { detail: b }));

    // Sorted ascending: B (Oct 2 13:00) then A (Oct 3 09:00)
    const titles = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(titles).toEqual(['B', 'A']);
    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();

    // Duplicate id should not add again
    window.dispatchEvent(new CustomEvent('session:created', { detail: b }));
    const bChips = screen
      .getAllByRole('heading', { level: 3 })
      .filter((h) => h.textContent === 'B');
    expect(bChips).toHaveLength(1);

    // Out-of-window ignored
    const z = mk({ id: 'z', title: 'Z', date: '2025-10-20' });
    window.dispatchEvent(new CustomEvent('session:created', { detail: z }));
    expect(screen.queryByText('Z')).not.toBeInTheDocument();
  });

  test('sessions:invalidate refetches; if refetch fails, keeps current list', async () => {
    fetchSessionsMock
      .mockResolvedValueOnce([mk({ id: 'a', title: 'A' })]) // initial
      .mockRejectedValueOnce(new Error('oops')); // invalidate fails

    render(<UpcomingSessions />);

    await screen.findByText('A');

    window.dispatchEvent(new Event('sessions:invalidate'));
    // Still shows A because error is swallowed
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
  });

  test('Attend: optimistic +1 and pill; rolls back on 409/403/404; sends Authorization header from localStorage', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({
        id: 'att',
        title: 'AttendMe',
        participants: 1,
        maxParticipants: 2,
        isCreator: false,
        isAttending: false,
      }),
    ]);

    // persist a quoted Bearer value; code should normalize to "Bearer abc123"
    localStorage.setItem('google_id_token', JSON.stringify('Bearer abc123'));

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 409 }) // join -> rollback
      .mockResolvedValue({ ok: true, status: 200 });

    render(<UpcomingSessions />);
    await screen.findByText('AttendMe');

    const card = screen.getByRole('heading', { name: 'AttendMe' }).closest('div')!;
    const btn = within(card).getByRole('button', { name: /attend/i });
    await userEvent.click(btn);

    // optimistic
    await screen.findByText(/attending/i);
    expect(within(card).getByText(/2 \/ 2/)).toBeInTheDocument();

    // rollback
    await waitFor(() => expect(within(card).queryByText(/attending/i)).not.toBeInTheDocument());
    expect(within(card).getByText(/1 \/ 2/)).toBeInTheDocument();

    // verify Authorization header normalized
    const firstCall = (global.fetch as any).mock.calls[0];
    const init = firstCall[1] as RequestInit;
    const auth = (init.headers as Headers).get('Authorization');
    expect(auth).toBe('Bearer abc123');
  });

  test('Leave: optimistic -1 and remove pill; rolls back on 400/403/404', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({
        id: 'lev',
        title: 'LeaveMe',
        participants: 2,
        maxParticipants: 5,
        isCreator: false,
        isAttending: true,
      }),
    ]);

    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 400 }); // leave -> rollback

    render(<UpcomingSessions />);
    await screen.findByText('LeaveMe');

    const card = screen.getByRole('heading', { name: 'LeaveMe' }).closest('div')!;
    const btn = within(card).getByRole('button', { name: /leave/i });
    await userEvent.click(btn);

    // optimistic
    await waitFor(() => expect(within(card).queryByText(/attending/i)).not.toBeInTheDocument());
    expect(within(card).getByText(/1 \/ 5/)).toBeInTheDocument();

    // rollback
    await waitFor(() => {
      expect(within(card).getByText(/attending/i)).toBeInTheDocument();
      expect(within(card).getByText(/2 \/ 5/)).toBeInTheDocument();
    });
  });

  test('Cancel (organizer): optimistic removal, DELETE called, then sessions:invalidate dispatched and refetch applied', async () => {
    fetchSessionsMock
      .mockResolvedValueOnce([
        mk({ id: 'org', title: 'OrganizerOne', isCreator: true }),
        mk({ id: 'other', title: 'Other' }),
      ])
      .mockResolvedValueOnce([mk({ id: 'other', title: 'Other' })]); // after invalidate

    (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 });

    const invalidateSpy = vi.fn();
    window.addEventListener('sessions:invalidate', invalidateSpy);

    render(<UpcomingSessions />);
    await screen.findByText('OrganizerOne');

    const orgCard = screen.getByRole('heading', { name: 'OrganizerOne' }).closest('div')!;
    const cancelBtn = within(orgCard).getByRole('button', { name: /cancel session/i });
    await userEvent.click(cancelBtn);

    await waitFor(() => expect(screen.queryByText('OrganizerOne')).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.test/api/v1/sessions/org',
      expect.objectContaining({ method: 'DELETE' })
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  test('View Details navigates to /sessions', async () => {
    fetchSessionsMock.mockResolvedValueOnce([mk({ id: 'x', title: 'Details' })]);
    render(<UpcomingSessions />);

    await screen.findByText('Details');
    const card = screen.getByRole('heading', { name: 'Details' }).closest('div')!;
    await userEvent.click(within(card).getByRole('button', { name: /view details/i }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions');
  });

  test('button visibility: cannot Attend if full; cannot Leave when not attending; no controls when status != upcoming', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'full', title: 'Full', participants: 5, maxParticipants: 5, isAttending: false }), // full
      mk({ id: 'noleave', title: 'NoLeave', isAttending: false }), // not attending
      mk({ id: 'ongo', title: 'Ongoing', status: 'ongoing', isAttending: false }), // not upcoming
    ]);

    render(<UpcomingSessions />);
    await screen.findByText('Full');

    const fullCard = screen.getByRole('heading', { name: 'Full' }).closest('div')!;
    expect(within(fullCard).queryByRole('button', { name: /attend/i })).not.toBeInTheDocument();

    const noLeaveCard = screen.getByRole('heading', { name: 'NoLeave' }).closest('div')!;
    expect(within(noLeaveCard).queryByRole('button', { name: /leave/i })).not.toBeInTheDocument();

    const ongoingCard = screen.getByRole('heading', { name: 'Ongoing' }).closest('div')!;
    // neither attend nor leave when not upcoming
    expect(within(ongoingCard).queryByRole('button', { name: /attend/i })).not.toBeInTheDocument();
    expect(within(ongoingCard).queryByRole('button', { name: /leave/i })).not.toBeInTheDocument();
  });

  test('time-until labels: "Starting soon", "45m", "3h 15m", "2 days"', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'soon', title: 'Soon', date: '2025-10-02', startTime: '12:00' }), // diff 0 -> Starting soon
      mk({ id: '45m', title: 'In45', date: '2025-10-02', startTime: '12:45' }),
      mk({ id: '3h15', title: 'In3h15', date: '2025-10-02', startTime: '15:15' }),
      mk({ id: '2d', title: 'In2Days', date: '2025-10-04', startTime: '09:00' }),
    ]);

    render(<UpcomingSessions />);

    await screen.findByText('Soon');
    const soonCard = screen.getByRole('heading', { name: 'Soon' }).closest('div')!;
    expect(within(soonCard).getByText(/starting soon/i)).toBeInTheDocument();

    const m45 = screen.getByRole('heading', { name: 'In45' }).closest('div')!;
    expect(within(m45).getByText('45m')).toBeInTheDocument();

    const h3 = screen.getByRole('heading', { name: 'In3h15' }).closest('div')!;
    expect(within(h3).getByText('3h 15m')).toBeInTheDocument();

    const d2 = screen.getByRole('heading', { name: 'In2Days' }).closest('div')!;
    expect(within(d2).getByText('2 days')).toBeInTheDocument();
  });

  test('type tag colors (class contains expected palette)', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'exam', title: 'Exam', type: 'exam_prep' }),
      mk({ id: 'proj', title: 'Proj', type: 'project' }),
      mk({ id: 'rev', title: 'Rev', type: 'review' }),
      mk({ id: 'disc', title: 'Disc', type: 'discussion' }),
      mk({ id: 'study', title: 'Study', type: 'study' }),
    ]);

    render(<UpcomingSessions />);
    await screen.findByText('Exam');

    const tag = (title: string) =>
      screen
        .getByRole('heading', { name: title })
        .parentElement!.querySelector('span:nth-of-type(1)') as HTMLElement;

    expect(tag('Exam').className).toContain('bg-red-100');
    expect(tag('Proj').className).toContain('bg-blue-100');
    expect(tag('Rev').className).toContain('bg-yellow-100');
    expect(tag('Disc').className).toContain('bg-purple-100');
    expect(tag('Study').className).toContain('bg-green-100');
  });

  test('event listeners are registered and cleaned up on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const remSpy = vi.spyOn(window, 'removeEventListener');

    fetchSessionsMock.mockResolvedValueOnce([]);
    const { unmount } = render(<UpcomingSessions />);

    await screen.findByText(/no upcoming sessions/i);
    expect(addSpy).toHaveBeenCalledWith('session:created', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('sessions:invalidate', expect.any(Function));

    unmount();
    expect(remSpy).toHaveBeenCalledWith('session:created', expect.any(Function));
    expect(remSpy).toHaveBeenCalledWith('sessions:invalidate', expect.any(Function));

    addSpy.mockRestore();
    remSpy.mockRestore();
  });
});
