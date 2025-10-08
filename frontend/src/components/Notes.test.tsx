import { render } from '../test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Notes from './Notes';

// Inline the portal so the modal content renders in-tree for tests
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// --- Mock DataService (matches Notes.tsx usage) ---
const ds = {
  fetchMyGroups: vi.fn(),
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
};

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchMyGroups: (...a: unknown[]) => ds.fetchMyGroups(...a),
      fetchNotes: (...a: unknown[]) => ds.fetchNotes(...a),
      createNote: (...a: unknown[]) => ds.createNote(...a),
    },
  };
});

const FALLBACK_TITLES = ['Binary Tree Traversal Methods', 'Matrix Operations', 'Fallback Note'];

beforeEach(() => {
  vi.useFakeTimers();

  Object.values(ds).forEach((f) => (f as any).mockReset());

  // default: groups + notes succeed
  ds.fetchMyGroups.mockResolvedValue([
    { id: '1', name: 'CS Advanced' },
    { id: '2', name: 'Math Warriors' },
  ]);
  ds.fetchNotes.mockResolvedValue([
    {
      note_id: 10,
      group_id: 1,
      author_id: 1,
      topic_id: 1,
      note_title: 'Binary Tree Traversal Methods',
      note_content: 'In-order, pre-order, and post-order...',
      visibility: 'public',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'John Doe',
      group_name: 'CS Advanced',
      topic_name: 'Data Structures',
    },
    {
      note_id: 11,
      group_id: 2,
      author_id: 2,
      topic_id: 2,
      note_title: 'Matrix Operations',
      note_content: 'Fundamental matrix operations including addition...',
      visibility: 'group',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'Jane Smith',
      group_name: 'Math Warriors',
      topic_name: 'Linear Algebra',
    },
    // ignored by filter: inactive
    {
      note_id: 12,
      group_id: 9,
      author_id: 9,
      topic_id: 1,
      note_title: 'Inactive Note',
      note_content: 'This should be filtered out',
      visibility: 'private',
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // ignored by filter: missing title
    {
      note_id: 13,
      group_id: 9,
      author_id: 9,
      topic_id: 1,
      note_title: '',
      note_content: 'Missing title so filtered out',
      visibility: 'public',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Notes', () => {
  test('renders header, fetches groups+notes, shows cards with icons and metadata', async () => {
    render(<Notes />);

    // Header present
    expect(screen.getByText(/Study Notes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Note/i })).toBeInTheDocument();

    // Loading -> then content
    expect(screen.getByText(/Loading notes/i)).toBeInTheDocument();
    await screen.findByText('Binary Tree Traversal Methods');

    // Two valid notes rendered; ignored items are filtered out
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.queryByText('Inactive Note')).not.toBeInTheDocument();

    // Icons: visibility and group (Matrix is "group" -> Users blue)
    const matrixCard = screen.getByText('Matrix Operations').closest('div')!;
    expect((matrixCard.parentElement as HTMLElement).querySelector('.text-blue-500')).toBeTruthy();

    // Author / group / topic metadata
    expect(screen.getByText(/By: John Doe/i)).toBeInTheDocument();
    expect(screen.getByText('CS Advanced')).toBeInTheDocument();
    expect(screen.getByText('Data Structures')).toBeInTheDocument();

    // groups dropdown populated
    // (component renders group names, not modules)
    expect(screen.getByRole('option', { name: /CS Advanced/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Math Warriors/i })).toBeInTheDocument();

    // DataService methods called
    expect(ds.fetchMyGroups).toHaveBeenCalledTimes(1);
    expect(ds.fetchNotes).toHaveBeenCalledTimes(1);
  });

  test('fallback path: when service calls throw, fallback notes appear (no crash)', async () => {
    ds.fetchMyGroups.mockRejectedValueOnce(new Error('nope'));
    ds.fetchNotes.mockRejectedValueOnce(new Error('nope'));

    render(<Notes />);

    for (const t of FALLBACK_TITLES) {
      expect(await screen.findByText(new RegExp(t, 'i'))).toBeInTheDocument();
    }
  });

  test('search filters by title, content, author_name, or group_name (case-insensitive)', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    const search = screen.getByPlaceholderText(/Search notes/i);

    // title
    await userEvent.type(search, 'Matrix');
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.queryByText('Binary Tree Traversal Methods')).not.toBeInTheDocument();

    // author_name
    await userEvent.clear(search);
    await userEvent.type(search, 'john doe');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();
    expect(screen.queryByText('Matrix Operations')).not.toBeInTheDocument();

    // content fragment
    await userEvent.clear(search);
    await userEvent.type(search, 'pre-order');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();

    // group_name
    await userEvent.clear(search);
    await userEvent.type(search, 'math warriors');
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
  });

  test('group filter works (pick CS Advanced then Math Warriors)', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    const allSelects = screen.getAllByRole('combobox');
    const groupSelect = allSelects[0]; // first select is group
    await userEvent.selectOptions(groupSelect, '1');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();
    expect(screen.queryByText('Matrix Operations')).not.toBeInTheDocument();

    await userEvent.selectOptions(groupSelect, '2');
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.queryByText('Binary Tree Traversal Methods')).not.toBeInTheDocument();
  });

  test('visibility filter works (public / group / private)', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    const visSelect = screen.getAllByRole('combobox')[1]; // last select is visibility
    await userEvent.selectOptions(visSelect, 'public');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();
    expect(screen.queryByText('Matrix Operations')).not.toBeInTheDocument();

    await userEvent.selectOptions(visSelect, 'group');
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.queryByText('Binary Tree Traversal Methods')).not.toBeInTheDocument();

    // none match private
    await userEvent.selectOptions(visSelect, 'private');
    await screen.findByText(/No notes found matching your criteria/i);
  });

  test('content is truncated to 150 chars in card, but modal shows full text; modal closes by X and backdrop', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([]);
    ds.fetchNotes.mockResolvedValueOnce([
      {
        note_id: 21,
        group_id: 1,
        author_id: 1,
        topic_id: 1,
        note_title: 'Very Long Note',
        note_content: 'A'.repeat(200),
        visibility: 'private',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    render(<Notes />);
    await screen.findByText('Very Long Note');

    const card = screen.getByText('Very Long Note').closest('div')!;
    const preview = within(card).getByText(/A{150}\.\.\./);
    expect(preview).toBeInTheDocument();

    // Open modal
    await userEvent.click(within(card).getByRole('button', { name: /View Full Note/i }));
    // Full content (no truncation)
    expect(screen.getByText(/^A{200}$/)).toBeInTheDocument();

    // Close via X button (no accessible name in markup)
    await userEvent.click(screen.getByRole('button', { name: '' }));
    await waitFor(() => expect(screen.queryByText(/^A{200}$/)).not.toBeInTheDocument());

    // Reopen and close via backdrop click
    await userEvent.click(within(card).getByRole('button', { name: /View Full Note/i }));
    expect(screen.getByText(/^A{200}$/)).toBeInTheDocument();
    const backdrop = document.querySelector('.bg-black\\/40') as HTMLElement;
    await userEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByText(/^A{200}$/)).not.toBeInTheDocument());
  });

  test('shows empty-state message when filters remove all items (no loading)', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    const search = screen.getByPlaceholderText(/Search notes/i);
    await userEvent.type(search, 'no-match-phrase-xyz');

    await screen.findByText(/No notes found matching your criteria/i);
  });
});
