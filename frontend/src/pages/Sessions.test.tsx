import { render } from '../test-utils';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Sessions from './Sessions';

// Inline the portal so modal markup is in the tree
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// --- Mock DataService ---
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

// --- Helpers ---
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
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  Object.values(ds).forEach((f) => (f as any).mockReset());

  // default dataset: creator session, joinable session, attended session, cancelled
  ds.fetchSessions.mockResolvedValue([
    mkSession({
      id: 'c1',
      title: 'Creator',
      isCreator: true,
      isAttending: true,
      status: 'upcoming',
      participants: 2,
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
      groupId: '42',
    }),
    mkSession({
      id: 'x1',
      title: 'Cancelled',
      status: 'cancelled',
      isCreator: false,
      isAttending: false,
    }),
  ]);

  // sensible defaults for actions (tests override when needed)
  ds.createSession.mockResolvedValue(null); // force optimistic by default
  ds.updateSession.mockResolvedValue(null); // force optimistic by default
  ds.deleteSession.mockResolvedValue({ ok: true, data: { status: 'cancelled' } });
  ds.joinSession.mockResolvedValue(true);
  ds.leaveSession.mockResolvedValue(true);
  ds.fetchMyGroups.mockResolvedValue([
    { id: 'g1', name: 'Group A', course: 'Data Structures', courseCode: 'CS201' },
    { id: 'g2', name: 'Group B' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Sessions page', () => {
  test('loading → renders list and status counts; filter tabs work', async () => {
    render(<Sessions />);

    // Loading
    expect(screen.getByText(/Loading sessions/i)).toBeInTheDocument();

    // List shown
    await screen.findByRole('heading', { name: /Plan study sessions/i });
    // cards present
    expect(screen.getByRole('heading', { name: 'Creator' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Joinable' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cancelled' })).toBeInTheDocument();

    // counts shown in tab labels
    // all(4), upcoming(3), ongoing(0), completed(0), cancelled(1)
    expect(screen.getByRole('button', { name: /All \(4\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upcoming \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelled \(1\)/ })).toBeInTheDocument();

    // click "Cancelled" filter -> only cancelled card remains
    await userEvent.click(screen.getByRole('button', { name: /Cancelled \(1\)/ }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Creator')).not.toBeInTheDocument();

    // back to all
    await userEvent.click(screen.getByRole('button', { name: /All \(4\)/ }));
    expect(await screen.findByText('Creator')).toBeInTheDocument();
  });

  test('create session (optimistic fallback) via modal; broadcasts created + invalidate', async () => {
    const createdSpy = vi.fn();
    const invalidateSpy = vi.fn();
    window.addEventListener('session:created', createdSpy as EventListener);
    window.addEventListener('sessions:invalidate', invalidateSpy as EventListener);

    render(<Sessions />);
    await screen.findByRole('button', { name: /New session/i });
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    // groups fetched and shown
    await screen.findByRole('combobox', { name: /Study group/i });

    // Fill required fields quickly
    await userEvent.type(screen.getByLabelText(/Session title/i), ' New One');
    await userEvent.type(screen.getByLabelText(/^Date/i), '2025-10-04');
    await userEvent.type(screen.getByLabelText(/Location/i), ' Lab');
    await userEvent.type(screen.getByLabelText(/Start time/i), '14:00');
    await userEvent.type(screen.getByLabelText(/End time/i), '15:00');

    await userEvent.click(screen.getByRole('button', { name: /Create session/i }));

    // Optimistic card appears with status "Upcoming" & Attending/Organizer pill
    await screen.findByRole('heading', { name: 'New One' });
    const card = findCard('New One');
    expect(within(card).getByText(/Upcoming/i)).toBeInTheDocument();
    expect(createdSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  test('create session success path (API returns created) added at top', async () => {
    // make create return concrete object
    ds.createSession.mockResolvedValueOnce(
      mkSession({
        id: 'srv1',
        title: 'From Server',
        isCreator: true,
        isAttending: true,
        status: 'upcoming',
      })
    );

    render(<Sessions />);
    await screen.findByRole('button', { name: /New session/i });
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    await screen.findByRole('combobox', { name: /Study group/i });
    await userEvent.type(screen.getByLabelText(/Session title/i), ' Server One');
    await userEvent.type(screen.getByLabelText(/^Date/i), '2025-10-05');
    await userEvent.type(screen.getByLabelText(/Location/i), ' Room');
    await userEvent.type(screen.getByLabelText(/Start time/i), '10:00');
    await userEvent.type(screen.getByLabelText(/End time/i), '11:00');

    await userEvent.click(screen.getByRole('button', { name: /Create session/i }));

    // card titled "From Server" appears
    expect(await screen.findByRole('heading', { name: 'From Server' })).toBeInTheDocument();
  });

  test('modal: selecting group auto-fills course/code when fields are empty', async () => {
    render(<Sessions />);

    await screen.findByRole('button', { name: /New session/i });
    await userEvent.click(screen.getByRole('button', { name: /New session/i }));

    const groupSelect = await screen.findByRole('combobox', { name: /Study group/i });
    // Initially empty fields
    const courseInput = screen.getByLabelText(/Course name/i) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/Course code/i) as HTMLInputElement;
    expect(courseInput.value).toBe('');
    expect(codeInput.value).toBe('');

    // Choose Group A -> has course + code -> auto-fill
    await userEvent.selectOptions(groupSelect, 'g1');
    expect(courseInput.value).toBe('Data Structures');
    expect(codeInput.value).toBe('CS201');

    // If user clears course/code then picks group B (no prefill values) -> still stays cleared
    await userEvent.clear(courseInput);
    await userEvent.clear(codeInput);
    await userEvent.selectOptions(groupSelect, 'g2');
    expect(courseInput.value).toBe('');
    expect(codeInput.value).toBe('');
  });

  test('edit session: success path updates fields; optimistic fallback when API returns null', async () => {
    // Make one session editable (Creator)
    render(<Sessions />);
    await screen.findByText('Creator');
    const card = findCard('Creator');
    const editBtn = within(card).getByRole('button', { name: /Edit session/i });
    await userEvent.click(editBtn);

    // Success path: return updated title for first save
    ds.updateSession.mockResolvedValueOnce({ title: 'Creator (Updated)' });

    // form seeded with current session data; change title + save
    const titleInput = await screen.findByLabelText(/Session title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Creator (Updated)');

    await userEvent.click(screen.getByRole('button', { name: /Update session/i }));
    await screen.findByRole('heading', { name: 'Creator (Updated)' });

    // Open again -> now force optimistic (null return)
    const newCard = findCard('Creator (Updated)');
    await userEvent.click(within(newCard).getByRole('button', { name: /Edit session/i }));
    const ti2 = await screen.findByLabelText(/Session title/i);
    await userEvent.clear(ti2);
    await userEvent.type(ti2, 'Creator (Optimistic)');
    await userEvent.click(screen.getByRole('button', { name: /Update session/i }));

    await screen.findByRole('heading', { name: 'Creator (Optimistic)' });
  });

  test('delete/cancel: creator sees delete; after action status becomes Cancelled', async () => {
    render(<Sessions />);

    const card = await waitFor(() => findCard('Creator'));
    const del = within(card).getByRole('button', { name: /Delete session/i });
    await userEvent.click(del);

    // Status badge becomes Cancelled
    await waitFor(() => {
      expect(within(card).getByText(/Cancelled/i)).toBeInTheDocument();
    });
  });

  test('join: optimistic attending increments participants; rollback when joinSession returns false', async () => {
    // Make join fail (false) to force rollback
    ds.joinSession.mockResolvedValueOnce(false);

    render(<Sessions />);
    const card = await waitFor(() => findCard('Joinable'));

    // Attend button visible
    const attendBtn = within(card).getByRole('button', { name: /Attend/i });
    await userEvent.click(attendBtn);

    // Optimistic: Attending pill should appear and participants 2 / 2
    await screen.findByText('Joinable');
    await waitFor(() => {
      expect(within(card).getByText(/2 \/ 2/)).toBeInTheDocument();
    });

    // Rollback: pill disappears and participants return to 1 / 2
    await waitFor(() => {
      expect(within(card).queryByText(/Attending/)).not.toBeInTheDocument();
      expect(within(card).getByText(/1 \/ 2/)).toBeInTheDocument();
    });
  });

  test('leave: optimistic not-attending decrements; rollback when leaveSession returns false', async () => {
    ds.leaveSession.mockResolvedValueOnce(false);

    render(<Sessions />);
    const card = await waitFor(() => findCard('Attending'));
    const leaveBtn = within(card).getByRole('button', { name: /Leave/i });
    // initial participants default is 1; after optimistic it will show 0 / 5 (if max present)
    await userEvent.click(leaveBtn);

    // Optimistic: Attending pill removed
    await waitFor(() => {
      expect(within(card).queryByText(/Attending/)).not.toBeInTheDocument();
    });

    // Rollback: Attending pill returns
    await waitFor(() => {
      expect(within(card).getByText(/Attending/)).toBeInTheDocument();
    });
  });

  test('chat button navigates to group chat when session has groupId and user is attending', async () => {
    // set up a spy-able location
    const origLoc = window.location;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    render(<Sessions />);
    const card = await waitFor(() => findCard('Attending'));
    const btn = within(card).getByRole('button', { name: /Open chat/i });
    await userEvent.click(btn);

    expect((window.location as any).href).toBe(
      '/groups/42/chat?session=' + (card.querySelector('h3')?.textContent ? 'a1' : 'a1')
    );

    // restore
    Object.defineProperty(window, 'location', { value: origLoc });
  });

  test('empty state appears when filter hides all items and shows CTA', async () => {
    ds.fetchSessions.mockResolvedValueOnce([]); // no sessions at all
    render(<Sessions />);

    await screen.findByText(/No sessions found/i);
    expect(screen.getByRole('button', { name: /New session/i })).toBeInTheDocument();
  });
});
