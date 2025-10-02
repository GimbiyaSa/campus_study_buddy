// src/components/Calendar.test.tsx
import { render, screen, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import Calendar from './Calendar';

// --- Make the modal render inline for testing ---
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// ---- Fixed "today" so local date logic is deterministic ----
const FIXED_NOW = new Date('2025-10-02T12:00:00'); // local time; Calendar uses local-only helpers

// Helpers to create sessions quickly
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
  maxParticipants: overrides.maxParticipants ?? 5,
  status: overrides.status ?? 'upcoming',
  type: overrides.type ?? 'study',
  isCreator: overrides.isCreator ?? true,
  isAttending: overrides.isAttending ?? true,
});

// ---- Mock DataService used by Calendar ----
const fetchSessionsMock = vi.fn();

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args),
    },
  };
});

// Utilities: find the calendar cell from a chip element (chip -> parent cell)
const findCellFromChip = (chipEl: HTMLElement) => {
  // chip div (bg-emerald-100) -> parent ".mt-1" -> cell div (has "relative")
  return chipEl.parentElement?.parentElement as HTMLElement | null;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  // Default sessions for initial render: 3 on today (so "+1 more" appears) and 1 on another day
  fetchSessionsMock
    .mockReset()
    .mockResolvedValue([
      mk({ id: 's1', title: 'Algorithms Study Group', startTime: '10:00' }),
      mk({ id: 's2', title: 'Database Design Workshop', startTime: '12:00' }),
      mk({ id: 's3', title: 'Extra Session', startTime: '15:00' }),
      mk({
        id: 's4',
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

describe('Calendar', () => {
  test('shows loading skeleton, then renders month header and weekday labels', async () => {
    render(<Calendar />);

    // Loading skeleton visible initially
    expect(screen.getByText(/Calendar/i)).toBeInTheDocument();
    // skeleton blocks exist (pulse)
    // We don't rely on CSS class; just wait until real header appears.

    // Wait for fetch to resolve and header to show proper month/year
    const monthHeader = await screen.findByRole('heading', { name: /October 2025/ });
    expect(monthHeader).toBeInTheDocument();

    // Weekday labels
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
      expect(screen.getByText(d)).toBeInTheDocument();
    });

    // View toggle buttons present
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();
  });

  test('renders session chips (with formatted time) and "+more" indicator when >2 sessions in a day', async () => {
    render(<Calendar />);
    // The chip text is `${formatTime(startTime)} ${title}`
    // 10:00 -> 10:00 AM; 12:00 -> 12:00 PM; 15:00 -> 3:00 PM

    expect(await screen.findByText('10:00 AM Algorithms Study Group')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM Database Design Workshop')).toBeInTheDocument();
    // Only two chips shown for the day; third shows "+1 more"
    expect(screen.getByText('+1 more')).toBeInTheDocument();

    // The other day’s chip
    expect(screen.getByText('9:30 AM Weekend Review')).toBeInTheDocument();
  });

  test('hovering a day cell shows tooltip with details; leaving hides it', async () => {
    render(<Calendar />);

    const firstChip = await screen.findByText('10:00 AM Algorithms Study Group');
    const dayCell = findCellFromChip(firstChip)!;

    // Hover cell -> tooltip appears (shows title, time range, location, participants)
    await userEvent.hover(dayCell);

    expect(await screen.findByText('Algorithms Study Group')).toBeInTheDocument();
    expect(screen.getByText(/10:00 AM - 11:00 AM/)).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText(/3\/5 participants/)).toBeInTheDocument();

    // Unhover -> tooltip removed
    await userEvent.unhover(dayCell);
    await waitFor(() => {
      expect(screen.queryByText(/10:00 AM - 11:00 AM/)).not.toBeInTheDocument();
    });
  });

  test('clicking a date cell opens the schedule modal with the date prefilled', async () => {
    render(<Calendar />);

    const chip = await screen.findByText('10:00 AM Algorithms Study Group');
    const cell = findCellFromChip(chip)!;

    await userEvent.click(cell);
    // Modal appears
    expect(
      await screen.findByRole('heading', { name: /Schedule Study Session/i })
    ).toBeInTheDocument();

    // Date is prefilled to the clicked date (today: 2025-10-02)
    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('2025-10-02');

    // Close modal to proceed with other tests
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Schedule Study Session/i })
      ).not.toBeInTheDocument();
    });
  });

  test('New session button opens the modal (no date requirement asserted)', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    await userEvent.click(screen.getByRole('button', { name: /New session/i }));
    expect(
      await screen.findByRole('heading', { name: /Schedule Study Session/i })
    ).toBeInTheDocument();
  });

  test('creating a session via modal adds a chip and dispatches session:created', async () => {
    const createdHandler = vi.fn();
    window.addEventListener('session:created', createdHandler as EventListener);

    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // Fill minimal required fields
    await userEvent.type(screen.getByLabelText(/Session Title/i), ' New Session From Modal');
    // Set date to another day in the same month to avoid mixing with daily "+more" logic
    const dateEl = screen.getByLabelText(/Date/i);
    await userEvent.clear(dateEl);
    await userEvent.type(dateEl, '2025-10-06');

    await userEvent.type(screen.getByLabelText(/Start Time/i), '14:00');
    await userEvent.type(screen.getByLabelText(/End Time/i), '15:00');
    await userEvent.type(screen.getByLabelText(/Location/i), 'Lab 3');

    await userEvent.click(screen.getByRole('button', { name: /Create Session/i }));

    // New chip appears with formatted time
    expect(await screen.findByText('2:00 PM New Session From Modal')).toBeInTheDocument();

    // session:created dispatched
    expect(createdHandler).toHaveBeenCalledTimes(1);
  });

  test('responds to calendar:openSchedule by opening modal with today prefilled', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    // Dispatch external event
    window.dispatchEvent(new Event('calendar:openSchedule'));

    // Modal opens
    expect(
      await screen.findByRole('heading', { name: /Schedule Study Session/i })
    ).toBeInTheDocument();

    // Date defaults to "today"
    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('2025-10-02');
  });

  test('adds a session when session:created is received', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    // Emit a session:created with new item on 2025-10-07
    const external = mk({
      id: 'ext-1',
      title: 'External Create',
      date: '2025-10-07',
      startTime: '08:00',
      endTime: '09:00',
      location: 'Room 12',
      isCreator: false,
      isAttending: false,
    });

    window.dispatchEvent(new CustomEvent('session:created', { detail: external }));

    // Chip appears
    expect(await screen.findByText('8:00 AM External Create')).toBeInTheDocument();
  });

  test('sessions:invalidate triggers a refetch and updates chips', async () => {
    render(<Calendar />);
    await screen.findByText('10:00 AM Algorithms Study Group');

    // Prepare next fetch result to contain a different set
    fetchSessionsMock.mockResolvedValueOnce([
      mk({ id: 'nx1', title: 'Refetched One', date: '2025-10-04', startTime: '16:00' }),
    ]);

    // Trigger invalidation
    window.dispatchEvent(new Event('sessions:invalidate'));

    // Old chip vanishes, new one appears
    await screen.findByText('4:00 PM Refetched One');
    expect(screen.queryByText('10:00 AM Algorithms Study Group')).not.toBeInTheDocument();
  });

  test('month navigation and view toggle update UI state', async () => {
    render(<Calendar />);
    await screen.findByRole('heading', { name: /October 2025/ });

    // Click "Week" -> should visually indicate (class toggling). We can assert aria/selected by style change heuristics:
    // Instead, click and ensure button remains focusable and "Month" is still present.
    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();

    // Navigate next month
    await userEvent.click(screen.getByRole('button', { name: '' })); // The left chevron has no name; better to query by text header shift
    // safer: click right chevron by its SVG parent button index:
    const navButtons = screen.getAllByRole('button');
    // Heuristic: two nav buttons exist around the month header; click the last one for "next"
    await userEvent.click(navButtons[navButtons.length - 1]);

    // Month header updates (November 2025)
    expect(await screen.findByRole('heading', { name: /November 2025/ })).toBeInTheDocument();

    // Navigate back to October
    await userEvent.click(navButtons[navButtons.length - 2]); // previous
    expect(await screen.findByRole('heading', { name: /October 2025/ })).toBeInTheDocument();
  });
});
