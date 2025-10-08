import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import Notes from './Notes';

/* Inline the portal so modal content (if any) renders in-tree, harmless for these smoke tests */
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

/* ---- Minimal DataService mocks (match Notes.tsx imports) ---- */
const ds = {
  fetchMyGroups: vi.fn(),
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
};

vi.mock('../services/dataService', () => ({
  DataService: {
    fetchMyGroups: (...a: unknown[]) => ds.fetchMyGroups(...a),
    fetchNotes: (...a: unknown[]) => ds.fetchNotes(...a),
    createNote: (...a: unknown[]) => ds.createNote(...a),
  },
}));

beforeEach(() => {
  vi.useRealTimers();
  Object.values(ds).forEach((f) => (f as any).mockReset());
});

afterEach(() => {
  vi.clearAllMocks();
});

const nowISO = () => new Date().toISOString();

describe('Notes (basic smoke tests)', () => {
  test('renders header and a note when services succeed', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([{ id: '1', name: 'CS Advanced' }]);
    ds.fetchNotes.mockResolvedValueOnce([
      {
        note_id: 10,
        group_id: 1,
        author_id: 1,
        topic_id: 1,
        note_title: 'Binary Tree Traversal Methods',
        note_content: 'In-order, pre-order, and post-order...',
        visibility: 'public',
        is_active: true,
        created_at: nowISO(),
        updated_at: nowISO(),
        author_name: 'John Doe',
        group_name: 'CS Advanced',
        topic_name: 'Data Structures',
      },
    ]);

    render(<Notes />);

    // Stable header text used by the component
    expect(await screen.findByText(/study notes/i)).toBeInTheDocument();

    // The single mocked note shows up
    expect(await screen.findByText('Binary Tree Traversal Methods')).toBeInTheDocument();

    // "Create Note" button should be present in the header
    expect(screen.getByRole('button', { name: /create note/i })).toBeInTheDocument();

    // Basic call assertions
    expect(ds.fetchMyGroups).toHaveBeenCalledTimes(1);
    expect(ds.fetchNotes).toHaveBeenCalledTimes(1);
  });

  test('handles service failures without crashing (header remains visible)', async () => {
    ds.fetchMyGroups.mockRejectedValueOnce(new Error('fail groups'));
    ds.fetchNotes.mockRejectedValueOnce(new Error('fail notes'));

    const { container } = render(<Notes />);

    // Header should still render even if data calls fail
    expect(await screen.findByText(/study notes/i)).toBeInTheDocument();

    // Keep it conservative: ensure the component actually rendered some DOM
    expect(container.firstElementChild).toBeTruthy();
  });
});
