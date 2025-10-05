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

// Make buildApiUrl predictable
vi.mock('../utils/url', () => ({ buildApiUrl: (p: string) => `http://api.test${p}` }));

const okJson = (data: any) => ({ ok: true, status: 200, json: async () => data });
const fail = () => ({ ok: false, status: 500, json: async () => ({}) });

const FALLBACK_TITLES = [
  'Binary Tree Traversal Methods',
  'Matrix Operations',
  'Fallback Note',
];

beforeEach(() => {
  vi.useFakeTimers(); // not strictly needed but consistent with other suites
  // default: success fetch; tests override as needed
  global.fetch = vi.fn()
    // modules
    .mockResolvedValueOnce(okJson([
      { module_id: 1, module_code: 'CS201', module_name: 'Data Structures', university: 'U' },
      { module_id: 2, module_code: 'MATH204', module_name: 'Linear Algebra', university: 'U' },
    ]))
    // notes
    .mockResolvedValueOnce(okJson([
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
      // should be ignored by filter: inactive
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
      // should be ignored by filter: missing title
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
    ])) as any;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Notes', () => {
  test('renders header, fetches modules+notes, shows cards with icons and metadata', async () => {
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

    // Icons: visibility and group
    const matrixCard = screen.getByText('Matrix Operations').closest('div')!;
    expect(
      (matrixCard.parentElement as HTMLElement).querySelector('.text-blue-500')
    ).toBeTruthy(); // group -> Users blue

    // Author / group / topic metadata
    expect(screen.getByText(/By: John Doe/i)).toBeInTheDocument();
    expect(screen.getByText('CS Advanced')).toBeInTheDocument();
    expect(screen.getByText('Data Structures')).toBeInTheDocument();

    // modules dropdown populated from fetch
    expect(screen.getByRole('option', { name: /CS201 - Data Structures/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /MATH204 - Linear Algebra/i })).toBeInTheDocument();

    // Two fetch calls were made to the expected endpoints
    const calls = (global.fetch as any).mock.calls.map((c: any) => c[0]);
    expect(calls).toEqual([
      'http://api.test/api/v1/modules',
      'http://api.test/api/v1/groups/notes',
    ]);
  });

  test('fallback path: when fetch fails, fallback notes appear (no crash)', async () => {
    // Next render: make both endpoints fail -> component uses fallback arrays
    (global.fetch as any)
      .mockReset()
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail());

    render(<Notes />);

    // Fallback titles should render
    for (const t of FALLBACK_TITLES) {
      expect(await screen.findByText(new RegExp(t, 'i'))).toBeInTheDocument();
    }
  });

  test('search filters by title, content, or author_name (case-insensitive)', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    const search = screen.getByPlaceholderText(/Search notes/i);
    // Search by title
    await userEvent.type(search, 'Matrix');
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.queryByText('Binary Tree Traversal Methods')).not.toBeInTheDocument();

    // Search by author name
    await userEvent.clear(search);
    await userEvent.type(search, 'john doe');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();
    expect(screen.queryByText('Matrix Operations')).not.toBeInTheDocument();

    // Search by content fragment
    await userEvent.clear(search);
    await userEvent.type(search, 'pre-order');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();
  });

  test('module filter uses note.topic_id string equality', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    // topic_id of Binary… is 1, Matrix… is 2 (per setup)
    const moduleSelect = screen.getByRole('combobox', { name: '' }); // first select after search
    await userEvent.selectOptions(moduleSelect, '1');
    expect(screen.getByText('Binary Tree Traversal Methods')).toBeInTheDocument();
    expect(screen.queryByText('Matrix Operations')).not.toBeInTheDocument();

    await userEvent.selectOptions(moduleSelect, '2');
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.queryByText('Binary Tree Traversal Methods')).not.toBeInTheDocument();
  });

  test('visibility filter works (public / group / private)', async () => {
    render(<Notes />);
    await screen.findByText('Binary Tree Traversal Methods');

    const visSelects = screen.getAllByRole('combobox');
    const visSelect = visSelects[visSelects.length - 1]; // last select is visibility
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
    // Provide a long content to hit truncation
    (global.fetch as any).mockReset()
      .mockResolvedValueOnce(okJson([])) // modules (we won't use dropdown here)
      .mockResolvedValueOnce(okJson([
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
      ]));

    render(<Notes />);
    await screen.findByText('Very Long Note');

    const card = screen.getByText('Very Long Note').closest('div')!;
    const preview = within(card).getByText(/A{150}\.\.\./);
    expect(preview).toBeInTheDocument();

    // Open modal
    await userEvent.click(within(card).getByRole('button', { name: /View Full Note/i }));
    // Full content (no truncation)
    expect(screen.getByText(/^A{200}$/)).toBeInTheDocument();

    // Close via X button
    await userEvent.click(screen.getByRole('button', { name: '' })); // the X has no accessible name
    await waitFor(() => expect(screen.queryByText(/^A{200}$/)).not.toBeInTheDocument());

    // Reopen and close via backdrop click
    await userEvent.click(within(card).getByRole('button', { name: /View Full Note/i }));
    expect(screen.getByText(/^A{200}$/)).toBeInTheDocument();
    // Backdrop is the first absolute overlay (click on it)
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
