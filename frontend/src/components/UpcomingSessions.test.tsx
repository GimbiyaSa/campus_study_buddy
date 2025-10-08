import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpcomingSessions from './UpcomingSessions';

/* ---------- Minimal mocks ---------- */
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
  date: over.date ?? daysFromNow(1), // safely within next 7 days
  startTime: over.startTime ?? '23:59',
  participants: over.participants ?? 1,
  maxParticipants: over.maxParticipants ?? 5,
  location: over.location ?? 'Library',
  status: over.status ?? 'upcoming',
  isCreator: over.isCreator ?? false,
  isAttending: over.isAttending ?? false,
  course: over.course ?? 'CS',
});

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

    // Header shows
    await screen.findByRole('heading', { name: /upcoming sessions/i, level: 2 });

    // Count reflects filtered list size (we fed two in-window items)
    expect(screen.getByText('2 sessions this week')).toBeInTheDocument();

    // Titles are present
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
    // Only one card in this test → global query is safe
    await userEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions');
  });
});
