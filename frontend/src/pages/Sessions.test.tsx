// frontend/src/pages/__tests__/Sessions.test.tsx
import { render, screen, waitFor, within } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach, afterEach, describe } from 'vitest';

// IMPORTANT: mock react-dom portal so the modal renders inline for testing
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// Mock DataService used by Sessions page
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
    // no groupId here (chat will be present but handler early-returns)
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

// Path note: adjust the relative path if your structure differs
vi.mock('../../services/dataService', () => {
  return {
    DataService: {
      fetchSessions: vi.fn().mockResolvedValue(mockSessions),
      createSession: vi.fn(), // we'll set per-test
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

import { DataService } from '../services/dataService';
import Sessions from './Sessions';

describe('Sessions page', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('loads and renders sessions with counts and cards', async () => {
    render(<Sessions />);

    // heading
    expect(await screen.findByText(/Plan study sessions/i)).toBeInTheDocument();

    // both cards appear
    expect(screen.getByText('My Session')).toBeInTheDocument();
    expect(screen.getByText('Other Session')).toBeInTheDocument();

    // filter/counts reflect 2 sessions
    expect(screen.getByRole('button', { name: /All \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upcoming \(2\)/i })).toBeInTheDocument();
  });

  test('filters work (Completed empty state)', async () => {
    render(<Sessions />);

    await screen.findByText('My Session');

    // Click "Completed"
    await userEvent.click(screen.getByRole('button', { name: /Completed \(0\)/i }));
    expect(
      screen.getByText(/No completed sessions at the moment\./i)
    ).toBeInTheDocument();
  });

  test('create session (optimistic fallback) shows new card', async () => {
    // Force optimistic path by resolving undefined
    (DataService.createSession as any).mockResolvedValueOnce(undefined);

    render(<Sessions />);
    await screen.findByText('My Session');

    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // Fill the modal
    await userEvent.type(
      screen.getByLabelText(/Session title/i),
      ' New Optimistic Session'
    );
    await userEvent.type(screen.getByLabelText(/^Date/i), '2025-06-01');
    await userEvent.type(screen.getByLabelText(/^Start time/i), '09:00');
    await userEvent.type(screen.getByLabelText(/^End time/i), '10:00');
    await userEvent.type(screen.getByLabelText(/^Location/i), 'Room 42');

    await userEvent.click(
      screen.getByRole('button', { name: /Create session/i })
    );

    // Should appear immediately (optimistic)
    expect(await screen.findByText('New Optimistic Session')).toBeInTheDocument();
  });

  test('edit session updates the card title', async () => {
    render(<Sessions />);
    await screen.findByText('My Session');

    // click edit on "My Session"
    const myCard = screen.getByText('My Session').closest('div')!;
    const editBtn = within(myCard.parentElement!.parentElement!).getByRole('button', {
      name: /edit session/i,
    });
    await userEvent.click(editBtn);

    const titleInput = await screen.findByLabelText(/Session title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'My Session (Edited)');

    await userEvent.click(screen.getByRole('button', { name: /Update session/i }));

    // Title updated
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
    // helpful CTA
    expect(screen.getAllByRole('button', { name: /New session/i })[0]).toBeInTheDocument();
  });
});
