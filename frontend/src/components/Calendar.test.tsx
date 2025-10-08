// src/components/Calendar.test.tsx
import { render, screen, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Calendar from './Calendar';

/* ---- Make Portal render inline for easier querying ---- */
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

/* ---- Stable local "today" so calendar math is deterministic ---- */
const FIXED_NOW = new Date('2025-10-02T12:00:00'); // local time

/* ---- DataService mock used by Calendar ---- */
const fetchSessionsMock = vi.fn();
vi.mock('../services/dataService', () => ({
  DataService: { fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args) },
}));

/* ---- Environment/polyfills that components might rely on ---- */
beforeAll(() => {
  // matchMedia (some libs query it for responsive behavior)
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {}, // deprecated but some libs still call it
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // ResizeObserver
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = RO;

  // IntersectionObserver (tooltip/virtualization sometimes uses it)
  class IO {
    constructor(_: any) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  global.IntersectionObserver = IO;

  // requestAnimationFrame (some transitions/tools rely on it)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
    (cb: FrameRequestCallback) =>
      // use setTimeout so we can flush via fake timers
      setTimeout(() => cb(performance.now()), 0) as unknown as number
  );
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) =>
    clearTimeout(id as unknown as number)
  );
});

/* ---- Quick session factory ---- */
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

/* ---- Helpers: consistent render + flush pending timers/microtasks ---- */
const flush = async () => {
  // microtasks first
  await Promise.resolve();
  await vi.runAllTicks();
  // then timers & rafs
  await vi.advanceTimersByTimeAsync(0);
};

const renderCal = async () => {
  render(<Calendar />);
  await flush();
};

const cellFromChip = (chip: HTMLElement) => chip.parentElement?.parentElement as HTMLElement | null;

/* ---- Test lifecycle ---- */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  // Default payload: three on "today" (to trigger "+more") + one on another day
  fetchSessionsMock.mockReset().mockResolvedValue([
    mk({ id: 's1', title: 'Algorithms Study Group', startTime: '10:00' }),
    mk({ id: 's2', title: 'Database Design Workshop', startTime: '12:00' }),
    mk({ id: 's3', title: 'Extra Session', startTime: '15:00' }),
    mk({
      id: 'w1',
      title: 'Weekend Review',
      date: '2025-10-05',
      startTime: '09:30',
      location: 'Hall A',
    }),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/* ========================= Tests ========================= */
describe('Calendar', () => {
  test('shows skeleton, then renders month header and weekday labels', async () => {
    await renderCal();

    // Skeleton header text appears immediately
    expect(screen.getByText('Calendar')).toBeInTheDocument();

    // Month header resolves after fetch/effects
    const header = await screen.findByRole('heading', { name: /October 2025/ });
    expect(header).toBeInTheDocument();

    for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }

    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();
  });

  test('renders chips with formatted time and "+more" when >2 sessions on a day', async () => {
    await renderCal();

    expect(await screen.findByText('10:00 AM Algorithms Study Group')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM Database Design Workshop')).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument(); // third chip hidden
    expect(screen.getByText('9:30 AM Weekend Review')).toBeInTheDocument();
  });

  test('hovering a day reveals full tooltip; unhover hides', async () => {
    await renderCal();

    const chip = await screen.findByText('10:00 AM Algorithms Study Group');
    const cell = cellFromChip(chip)!;

    await userEvent.hover(cell);
    await flush();
    expect(await screen.findByText('Algorithms Study Group')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText(/3 participants/)).toBeInTheDocument();

    await userEvent.unhover(cell);
    await flush();
    await waitFor(() =>
      expect(screen.queryByText('Algorithms Study Group')).not.toBeInTheDocument()
    );
  });

  test('clicking a day opens schedule modal and pre-fills local date', async () => {
    await renderCal();

    const chip = await screen.findByText('10:00 AM Algorithms Study Group');
    const cell = cellFromChip(chip)!;

    await userEvent.click(cell);
    await flush();

    const modalTitle = await screen.findByRole('heading', { name: /Schedule Study Session/i });
    expect(modalTitle).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('2025-10-02');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Schedule Study Session/ })
      ).not.toBeInTheDocument()
    );
  });

  test('New session button opens modal; Escape and backdrop close it; body overflow toggled', async () => {
    await renderCal();
    await screen.findByRole('heading', { name: /October 2025/ });

    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    await flush();

    expect(
      await screen.findByRole('heading', { name: /Schedule Study Session/i })
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    // Backdrop click
    const backdrop = Array.from(document.querySelectorAll('div')).find((d) =>
      d.className.includes?.('bg-black/40')
    ) as HTMLDivElement;
    await userEvent.click(backdrop);
    await flush();

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Schedule Study Session/ })
      ).not.toBeInTheDocument()
    );
    expect(document.body.style.overflow).toBe('');

    // Open again, then ESC to close
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    await screen.findByRole('heading', { name: /Schedule Study Session/i });
    await userEvent.keyboard('{Escape}');
    await flush();
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Schedule Study Session/ })
      ).not.toBeInTheDocument()
    );
  });

  test('creating via modal adds chip, dispatches event, resets form and restores overflow', async () => {
    const handler = vi.fn();
    window.addEventListener('session:created', handler as EventListener);

    await renderCal();
    await screen.findByRole('heading', { name: /October 2025/ });
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    await screen.findByRole('heading', { name: /Schedule Study Session/i });

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
    await flush();

    expect(await screen.findByText('2:00 PM New Session Modal')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Schedule Study Session/ })
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    // event fired (component may dispatch internally and we dispatched when creating)
    expect(handler).toHaveBeenCalled();

    // form was reset (reopen and assert blanks)
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    await screen.findByRole('heading', { name: /Schedule Study Session/i });
    expect((screen.getByLabelText(/Session Title/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Max Participants/i) as HTMLInputElement).value).toBe('');
  });

  test('calendar:openSchedule opens modal with today prefilled', async () => {
    await renderCal();
    await screen.findByRole('heading', { name: /October 2025/ });

    window.dispatchEvent(new Event('calendar:openSchedule'));
    await flush();

    const dateInput = await screen.findByLabelText(/Date/i);
    expect((dateInput as HTMLInputElement).value).toBe('2025-10-02');
  });

  test('session:created adds new chip but dedupes by id if same event is re-broadcast', async () => {
    await renderCal();
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
    await flush();

    expect(await screen.findByText('8:00 AM External Create')).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent('session:created', { detail: external }));
    await flush();

    const chips = screen.getAllByText('8:00 AM External Create');
    expect(chips).toHaveLength(1);
  });

  test('sessions:invalidate refetches and updates grid', async () => {
    await renderCal();
    await screen.findByText('10:00 AM Algorithms Study Group');

    // Next fetch returns a different set
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'nx1', title: 'Refetched One', date: '2025-10-04', startTime: '16:00' }),
    ]);

    window.dispatchEvent(new Event('sessions:invalidate'));
    await flush();

    await screen.findByText('4:00 PM Refetched One');
    expect(screen.queryByText('10:00 AM Algorithms Study Group')).not.toBeInTheDocument();
  });

  test('month navigation and view toggle mutate UI state', async () => {
    await renderCal();
    await screen.findByRole('heading', { name: /October 2025/ });

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();

    // Navigate next month (right chevron likely last nav button)
    const beforeButtons = screen.getAllByRole('button');
    await userEvent.click(beforeButtons[beforeButtons.length - 1]);
    await flush();
    expect(await screen.findByRole('heading', { name: /November 2025/ })).toBeInTheDocument();

    // Go back
    await userEvent.click(beforeButtons[beforeButtons.length - 2]);
    await flush();
    expect(await screen.findByRole('heading', { name: /October 2025/ })).toBeInTheDocument();
  });

  test('time formatting edges: 00:05 -> 12:05 AM, 12:00 -> 12:00 PM', async () => {
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 't1', title: 'Early', startTime: '00:05' }),
      mk({ id: 't2', title: 'Noon', startTime: '12:00' }),
    ]);
    await renderCal();

    expect(await screen.findByText('12:05 AM Early')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM Noon')).toBeInTheDocument();
  });

  test('DataService failure on initial load is handled; loading ends and header still renders', async () => {
    fetchSessionsMock.mockReset().mockRejectedValueOnce(new Error('boom'));
    await renderCal();

    const header = await screen.findByRole('heading', { name: /October 2025/ });
    expect(header).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });

  test('cleans up event listeners on unmount (calendar:openSchedule & sessions listeners)', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    await renderCal();
    await screen.findByRole('heading', { name: /October 2025/ });

    // Registered
    expect(addSpy).toHaveBeenCalledWith('calendar:openSchedule', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('session:created', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('sessions:invalidate', expect.any(Function));

    const { unmount } = render(<div />); // get a stable unmount from last render
    unmount();
    await flush();

    expect(removeSpy).toHaveBeenCalledWith('calendar:openSchedule', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('session:created', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('sessions:invalidate', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
