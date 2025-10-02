// frontend/src/pages/__tests__/Sessions.test.tsx
import { render, screen, waitFor, within } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach, afterEach, describe } from 'vitest';

// Mock react-dom portal so the modal renders inline for testing
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// ---------- Test data ----------
const mockSessions = [
  {
    id: '1',
    title: 'My Session',
    course: 'Data Structures',
    courseCode: 'CS101',
    date: '2025-05-01',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Library',
    participants: 1,
    maxParticipants: 5,
    status: 'upcoming',
    isCreator: true,
    isAttending: true,
    // no groupId (chat button appears but handler early-returns)
  },
  {
    id: '2',
    title: 'Other Session',
    course: 'Algorithms',
    courseCode: 'CS301',
    date: '2025-05-02',
    startTime: '12:00',
    endTime: '13:00',
    location: 'Lab',
    participants: 0,
    maxParticipants: 5,
    status: 'upcoming',
    isCreator: false,
    isAttending: false,
    groupId: 'g1',
  },
];

const mockGroups = [{ id: 'g1', name: 'Study Group A', course: 'Algorithms', courseCode: 'CS301' }];

// ---------- Mocks ----------
vi.mock('../../services/dataService', () => {
  return {
    DataService: {
      fetchSessions: vi.fn().mockResolvedValue(mockSessions),
      createSession: vi.fn(), // set per-test when needed
      updateSession: vi.fn().mockImplementation((id: string, patch: any) => ({
        ...(mockSessions.find((s) => s.id === id) || {}),
        ...patch,
        id,
      })),
      deleteSession: vi.fn().mockResolvedValue({ ok: true, data: { status: 'cancelled' } }),
      joinSession: vi.fn().mockResolvedValue(true),
      leaveSession: vi.fn().mockResolvedValue(true),
      fetchMyGroups: vi.fn().mockResolvedValue(mockGroups),
    },
  };
});

vi.mock('../../utils/url', () => {
  return { buildApiUrl: (path: string) => `http://api.test${path}` };
});

import { DataService } from '../services/dataService';
import Sessions from '../pages/Sessions';

// ----- Local, test-file-only window.location stub (no @ts-expect-error) -----
let originalLocation: Location;

beforeEach(() => {
  // Keep real timers
  vi.useRealTimers();

  // Save original location
  originalLocation = window.location;

  // Replace with configurable stub so code can assign to href
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
  // Restore original window.location cleanly
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: false,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe('Sessions page', () => {
  test('loads and renders sessions with counts and cards', async () => {
    render(<Sessions />);

    // Heading appears after load
    expect(await screen.findByText(/Plan study sessions/i)).toBeInTheDocument();

    // Cards
    expect(screen.getByText('My Session')).toBeInTheDocument();
    expect(screen.getByText('Other Session')).toBeInTheDocument();

    // Filter/counts
    expect(screen.getByRole('button', { name: /All \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upcoming \(2\)/i })).toBeInTheDocument();
  });

  test('filters work (Completed empty state)', async () => {
    render(<Sessions />);
    await screen.findByText('My Session');

    await userEvent.click(screen.getByRole('button', { name: /Completed \(0\)/i }));
    expect(screen.getByText(/No completed sessions at the moment\./i)).toBeInTheDocument();
  });

  test('create session (optimistic fallback) shows new card', async () => {
    // Force optimistic path by returning undefined
    (DataService.createSession as any).mockResolvedValueOnce(undefined);

    render(<Sessions />);
    await screen.findByText('My Session');

    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // Fill modal
    await userEvent.type(screen.getByLabelText(/Session title/i), ' New Optimistic Session');
    await userEvent.type(screen.getByLabelText(/^Date/i), '2025-06-01');
    await userEvent.type(screen.getByLabelText(/^Start time/i), '09:00');
    await userEvent.type(screen.getByLabelText(/^End time/i), '10:00');
    await userEvent.type(screen.getByLabelText(/^Location/i), 'Room 42');

    await userEvent.click(screen.getByRole('button', { name: /Create session/i }));

    // Should appear immediately (optimistic)
    expect(await screen.findByText('New Optimistic Session')).toBeInTheDocument();
  });

  test('edit session updates the card title', async () => {
    render(<Sessions />);
    await screen.findByText('My Session');

    // Click edit on "My Session"
    const myCard = screen.getByText('My Session').closest('div')!;
    const editBtn = within(myCard.parentElement!.parentElement!).getByRole('button', {
      name: /edit session/i,
    });
    await userEvent.click(editBtn);

    const titleInput = await screen.findByLabelText(/Session title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'My Session (Edited)');

    await userEvent.click(screen.getByRole('button', { name: /Update session/i }));

    expect(await screen.findByText('My Session (Edited)')).toBeInTheDocument();
  });

  test('join and leave adjust participants and buttons', async () => {
    render(<Sessions />);
    await screen.findByText('Other Session');

    // "Other Session" initially has Attend
    const otherCard = screen.getByText('Other Session').closest('div')!;
    const otherRoot = otherCard.parentElement!.parentElement!;
    const attendBtn = within(otherRoot).getByRole('button', { name: /Attend/i });
    await userEvent.click(attendBtn);

    // participants -> 1 / 5 and "Leave" should appear
    await waitFor(() => {
      expect(within(otherRoot).getByText(/1 \/ 5/)).toBeInTheDocument();
      expect(within(otherRoot).getByRole('button', { name: /Leave/i })).toBeInTheDocument();
    });

    // Leave
    await userEvent.click(within(otherRoot).getByRole('button', { name: /Leave/i }));

    // participants -> 0 / 5 and "Attend" should return
    await waitFor(() => {
      expect(within(otherRoot).getByText(/0 \/ 5/)).toBeInTheDocument();
      expect(within(otherRoot).getByRole('button', { name: /Attend/i })).toBeInTheDocument();
    });
  });

  test('delete marks session as Cancelled', async () => {
    render(<Sessions />);
    await screen.findByText('My Session');

    const myCard = screen.getByText('My Session').closest('div')!;
    const root = myCard.parentElement!.parentElement!;
    const del = within(root).getByRole('button', { name: /Delete session/i });
    await userEvent.click(del);

    // Status chip becomes Cancelled
    await screen.findByText(/Cancelled/i);
  });

  test('empty state renders when no sessions', async () => {
    (DataService.fetchSessions as any).mockResolvedValueOnce([]);

    render(<Sessions />);

    await screen.findByText(/Plan study sessions/i);
    expect(screen.getByText(/No sessions found/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /New session/i })[0]).toBeInTheDocument();
  });

  test('group dropdown: selecting a group can auto-fill course & code if empty', async () => {
    render(<Sessions />);
    await screen.findByText('My Session');

    // Open create modal
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // Clear course + code (ensure empty so auto-fill takes effect)
    const code = screen.getByLabelText(/Course code/i);
    const course = screen.getByLabelText(/Course name/i);
    await userEvent.clear(code);
    await userEvent.clear(course);

    // Select a group
    const groupSelect = screen.getByLabelText(/Study group/i);
    await userEvent.selectOptions(groupSelect, 'g1');

    // Auto-filled from mockGroups
    expect((screen.getByLabelText(/Course code/i) as HTMLInputElement).value).toBe('CS301');
    expect((screen.getByLabelText(/Course name/i) as HTMLInputElement).value).toBe('Algorithms');
  });

  test('chat button navigates when session has groupId and isAttending', async () => {
    // Arrange: fetchSessions returns a session that is attending + has groupId
    (DataService.fetchSessions as any).mockResolvedValueOnce([
      {
        ...mockSessions[1],
        title: 'Chat Eligible',
        isAttending: true,
      },
    ]);

    render(<Sessions />);
    await screen.findByText('Chat Eligible');

    const card = screen.getByText('Chat Eligible').closest('div')!;
    const root = card.parentElement!.parentElement!;
    const chatBtn = within(root).getByRole('button', { name: /Open chat/i });

    await userEvent.click(chatBtn);

    expect(window.location.href).toMatch(/\/groups\/g1\/chat\?session=/i);
  });
});
