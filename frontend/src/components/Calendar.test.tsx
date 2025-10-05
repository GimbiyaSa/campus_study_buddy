// src/components/Calendar.test.tsx
import { render, screen, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import Calendar from './Calendar';

/* Make Portal render inline for easier querying */
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

/* Fixed local "today" so calendar math is deterministic */
const FIXED_NOW = new Date('2025-10-02T12:00:00'); // local time

/* Quick session factory */
const mk = (overrides: Partial<any> = {}) => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  title: overrides.title ?? 'Algorithms Study Group',
  course: overrides.course ?? 'CS',
  courseCode: overrides.courseCode ?? 'CS101',
  date: overrides.date ?? '2025-10-02', // today
  startTime: overrides.startTime ?? '10:00',
  endTime: overrides.endTime ?? '11:00',
  location: overrides.location ?? 'Library',
  participants: overrides.participants ?? 3,
  maxParticipants: overrides.maxParticipants,
  status: overrides.status ?? 'upcoming',
  type: overrides.type ?? 'study',
  isCreator: overrides.isCreator ?? true,
  isAttending: overrides.isAttending ?? true,
});

/* DataService mock used by Calendar */
const fetchSessionsMock = vi.fn();
vi.mock('../services/dataService', () => ({
  DataService: { fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args) },
}));

/* Helper: get day cell from a chip node */
const cellFromChip = (chip: HTMLElement) =>
  chip.parentElement?.parentElement as HTMLElement | null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  // Default payload: three on "today" (to trigger "+more") + one on another day
  fetchSessionsMock.mockReset().mockResolvedValue([
    mk({ id: 's1', title: 'Algorithms Study Group', startTime: '10:00' }),
    mk({ id: 's2', title: 'Database Design Workshop', startTime: '12:00' }),
    mk({ id: 's3', title: 'Extra Session', startTime: '15:00' }),
    mk({ id: 'w1', title: 'Weekend Review', date: '2025-10-05', startTime: '09:30', location: 'Hall A' }),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Calendar', () => {
  test('shows skeleton, then renders month header and weekday labels', async () => {
    render(<Calendar />);

    // Skeleton header text appears immediately
    expect(screen.getByText('Calendar')).toBeInTheDocument();

    // Month header resolves after fetch
    const header = await screen.findByRole('heading', { name: /October 2025/ });
    expect(header).toBeInTheDocument();

    // Weekday labels present (don’t assert on styling)
    for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }

    // View toggle exists
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();
  });

  test('renders chips with formatted time and "+more" when >2 sessions on a day', async () => {
    render(<Calendar />);

    expect(await screen.findByText('10:00 AM Algorithms Study Group')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM Database Design Workshop')).toBeInTheDocument();
    // third chip hidden, show "+1 more"
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    // another day
    expect(screen.getByText('9:30 AM Weekend Review')).toBeInTheDocument();
  });

  test('hovering a day reveals full tooltip; unhover hides', async () => {
    render(<Calendar />);
    const chip = await screen.findByText('10:00 AM Algorithms Study Group');
    const cell = cellFromChip(chip)!;

    await userEvent.hover(cell);
    expect(await screen.findByText('Algorithms Study Group')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText(/3 participants/)).toBeInTheDocument(); // no "/max" since undefined

    await userEvent.unhover(cell);
    await waitFor(() => {
      expect(screen.queryByText('Algorithms Study Group')).not.toBeInTheDocument();
    });
  });

  test('clicking a day opens schedule modal and pre-fills local date', async () => {
    render(<Calendar />);
    const chip = await screen.findByText('10:00 AM Algorithms Study Group');
    const cell = cellFromChip(chip)!;

    await userEvent.click(cell);
    const modalTitle = await screen.findByRole('heading', { name: /Schedule Study Session/i });
    expect(modalTitle).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('2025-10-02');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Schedule Study Session/ })).not.toBeInTheDocument()
    );
  });

  test('New session button opens modal; Escape and backdrop close it; body overflow toggled', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    expect(await screen.findByRole('heading', { name: /Schedule Study Session/i })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    // Backdrop is the first of two fixed layers; click anywhere outside form by clicking the overlay via pointer-events:
    const allDivs = document.querySelectorAll('div');
    const backdrop = Array.from(allDivs).find((d) => d.className.includes('bg-black/40')) as HTMLDivElement;
    await userEvent.click(backdrop);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Schedule Study Session/ })).not.toBeInTheDocument()
    );
    expect(document.body.style.overflow).toBe('');

    // Open again, then ESC to close
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    await screen.findByRole('heading', { name: /Schedule Study Session/i });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Schedule Study Session/ })).not.toBeInTheDocument()
    );
  });

  test('creating via modal adds chip, dispatches event, resets form and restores overflow', async () => {
    const handler = vi.fn();
    window.addEventListener('session:created', handler as EventListener);

    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // Fill required + some optional fields (including maxParticipants)
    await userEvent.type(screen.getByLabelText(/Session Title/i), ' New Session Modal');
    const dateEl = screen.getByLabelText(/Date/i);
    await userEvent.clear(dateEl);
    await userEvent.type(dateEl, '2025-10-06');
    await userEvent.type(screen.getByLabelText(/Start Time/i), '14:00');
    await userEvent.type(screen.getByLabelText(/End Time/i), '15:00');
    await userEvent.type(screen.getByLabelText(/^Location/i), ' Lab 3');
    const mp = screen.getByLabelText(/Max Participants/i) as HTMLInputElement;
    await userEvent.type(mp, '12');

    await userEvent.click(screen.getByRole('button', { name: /Create Session/i }));

    // New chip appears and modal closes
    expect(await screen.findByText('2:00 PM New Session Modal')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Schedule Study Session/ })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    // event fired
    expect(handler).toHaveBeenCalledTimes(1);

    // form was reset (reopen and assert blanks)
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    await screen.findByRole('heading', { name: /Schedule Study Session/i });
    expect((screen.getByLabelText(/Session Title/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Max Participants/i) as HTMLInputElement).value).toBe('');
  });

  test('calendar:openSchedule opens modal with today prefilled', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    window.dispatchEvent(new Event('calendar:openSchedule'));
    const dateInput = await screen.findByLabelText(/Date/i);
    expect((dateInput as HTMLInputElement).value).toBe('2025-10-02');
  });

  test('session:created adds new chip but dedupes by id if same event is re-broadcast', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    const external = mk({
      id: 'ext-dup',
      title: 'External Create',
      date: '2025-10-07',
      startTime: '08:00',
      endTime: '09:00',
      location: 'Room 12',
      isCreator: false,
      isAttending: false,
    });

    window.dispatchEvent(new CustomEvent('session:created', { detail: external }));
    expect(await screen.findByText('8:00 AM External Create')).toBeInTheDocument();

    // Re-emit same id: should not duplicate chip
    window.dispatchEvent(new CustomEvent('session:created', { detail: external }));
    // still exactly one
    const chips = screen.getAllByText('8:00 AM External Create');
    expect(chips).toHaveLength(1);
  });

  test('sessions:invalidate refetches and updates grid', async () => {
    render(<Calendar />);
    await screen.findByText('10:00 AM Algorithms Study Group');

    // Next fetch returns a different set
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'nx1', title: 'Refetched One', date: '2025-10-04', startTime: '16:00' }),
    ]);

    window.dispatchEvent(new Event('sessions:invalidate'));

    await screen.findByText('4:00 PM Refetched One');
    expect(screen.queryByText('10:00 AM Algorithms Study Group')).not.toBeInTheDocument();
  });

  test('month navigation and view toggle mutate UI state', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    // Toggle Week (don’t assert CSS classes; verify control remains)
    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();

    // Navigate next month via the right chevron (last of the nav buttons around header area)
    const allButtonsBefore = screen.getAllByRole('button');
    await userEvent.click(allButtonsBefore[allButtonsBefore.length - 1]);
    expect(await screen.findByRole('heading', { name: /November 2025/ })).toBeInTheDocument();

    // Go back (previous chevron likely next to it)
    await userEvent.click(allButtonsBefore[allButtonsBefore.length - 2]);
    expect(await screen.findByRole('heading', { name: /October 2025/ })).toBeInTheDocument();
  });

  test('time formatting edges: 00:05 -> 12:05 AM, 12:00 -> 12:00 PM', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 't1', title: 'Early', startTime: '00:05' }),
      mk({ id: 't2', title: 'Noon', startTime: '12:00' }),
    ]);
    render(<Calendar />);

    expect(await screen.findByText('12:05 AM Early')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM Noon')).toBeInTheDocument();
  });

  test('DataService failure on initial load is handled; loading ends and header still renders', async () => {
    fetchSessionsMock.mockReset().mockRejectedValueOnce(new Error('boom'));
    render(<Calendar />);

    // It should not crash; header appears once loading ends (no sessions)
    const header = await screen.findByRole('heading', { name: /October 2025/ });
    expect(header).toBeInTheDocument();
    // No chips expected
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });

  test('cleans up event listeners on unmount (calendar:openSchedule & sessions listeners)', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    // We register 3 listeners total across effects
    expect(addSpy).toHaveBeenCalledWith('calendar:openSchedule', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('session:created', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('sessions:invalidate', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('calendar:openSchedule', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('session:created', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('sessions:invalidate', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
