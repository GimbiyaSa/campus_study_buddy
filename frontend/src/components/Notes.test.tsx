// src/components/Notes.test.tsx
import { render } from '../test-utils';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Notes from './Notes';

// Helper: ensure we hand an HTMLElement to within()
const asHTMLElement = (el: Element | null): HTMLElement => {
  if (!el) throw new Error('Expected an HTMLElement, got null');
  if (!(el instanceof HTMLElement)) throw new Error('Expected an HTMLElement');
  return el;
};

// Helper: get the currently open modal root (outer fixed overlay)
const getModalRoot = (): HTMLElement => {
  const modals = Array.from(document.querySelectorAll('.fixed.inset-0')) as HTMLElement[];
  if (!modals.length) throw new Error('Modal root not found');
  return modals[modals.length - 1];
};

/* ----- Inline the portal so modal content renders in-tree ----- */
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

/* ---- Minimal DataService mocks (must match Notes.tsx imports) ---- */
const ds = {
  fetchMyGroups: vi.fn(),
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
  uploadNoteAttachments: vi.fn(),
  getNoteAttachmentUrl: vi.fn(),
};

vi.mock('../services/dataService', () => ({
  DataService: {
    fetchMyGroups: (...a: unknown[]) => ds.fetchMyGroups(...a),
    fetchNotes: (...a: unknown[]) => ds.fetchNotes(...a),
    createNote: (...a: unknown[]) => ds.createNote(...a),
    uploadNoteAttachments: (...a: unknown[]) => ds.uploadNoteAttachments(...a),
    getNoteAttachmentUrl: (...a: unknown[]) => ds.getNoteAttachmentUrl(...a),
  },
}));

/* ----------------- Helpers ----------------- */
const nowISO = () => new Date().toISOString();
const user = () => userEvent.setup();

beforeEach(() => {
  vi.useRealTimers();
  Object.values(ds).forEach((f) => (f as any).mockReset());
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ----------------- Tests ----------------- */
describe('Notes (basic + behavior)', () => {
  test('renders header and a note when services succeed', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([
      { id: '1', name: 'CS Advanced' },
      { id: '2', name: 'Math Warriors' },
    ]);
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

    expect(await screen.findByRole('heading', { name: /study notes/i })).toBeInTheDocument();
    expect(await screen.findByText('Binary Tree Traversal Methods')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create note/i })).toBeInTheDocument();

    expect(ds.fetchMyGroups).toHaveBeenCalledTimes(1);
    expect(ds.fetchNotes).toHaveBeenCalledTimes(1);
  });

  test('handles service failures without crashing (header remains visible)', async () => {
    ds.fetchMyGroups.mockRejectedValueOnce(new Error('fail groups'));
    ds.fetchNotes.mockRejectedValueOnce(new Error('fail notes'));

    const { container } = render(<Notes />);

    expect(await screen.findByRole('heading', { name: /study notes/i })).toBeInTheDocument();
    expect(container.firstElementChild).toBeTruthy();
  });

  test('search and filters (group/visibility/date) refine the visible notes', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

    ds.fetchMyGroups.mockResolvedValueOnce([
      { id: '1', name: 'CS Advanced' },
      { id: '2', name: 'Math Warriors' },
    ]);
    ds.fetchNotes.mockResolvedValueOnce([
      {
        note_id: 1,
        group_id: 1,
        author_id: 1,
        topic_id: 1,
        note_title: 'Binary Trees Overview',
        note_content: 'Trees are hierarchical...',
        visibility: 'public',
        is_active: true,
        created_at: nowISO(),
        updated_at: nowISO(),
        author_name: 'A',
        group_name: 'CS Advanced',
        topic_name: 'Data Structures',
      },
      {
        note_id: 2,
        group_id: 2,
        author_id: 2,
        topic_id: 2,
        note_title: 'Matrix Operations',
        note_content: 'Matrix addition, multiplication...',
        visibility: 'group',
        is_active: true,
        created_at: nowISO(),
        updated_at: nowISO(),
        author_name: 'B',
        group_name: 'Math Warriors',
        topic_name: 'Linear Algebra',
      },
      {
        note_id: 3,
        group_id: 2,
        author_id: 3,
        topic_id: 3,
        note_title: 'Very Old Private Note',
        note_content: 'Should be filtered by date window (default 7d)',
        visibility: 'private',
        is_active: true,
        created_at: fortyDaysAgo,
        updated_at: fortyDaysAgo,
        author_name: 'C',
        group_name: 'Math Warriors',
        topic_name: 'Legacy',
      },
    ]);

    render(<Notes />);

    await screen.findByRole('heading', { name: /study notes/i });

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const [groupSelect, visibilitySelect, dateSelect] = selects;

    await user().selectOptions(dateSelect, 'all');

    expect(await screen.findByText('Binary Trees Overview')).toBeInTheDocument();
    expect(screen.getByText('Matrix Operations')).toBeInTheDocument();
    expect(screen.getByText('Very Old Private Note')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Search notes...') as HTMLInputElement;
    await user().clear(search);
    await user().type(search, 'matrix');

    await screen.findByText('Matrix Operations');
    expect(screen.queryByText('Binary Trees Overview')).toBeNull();
    expect(screen.queryByText('Very Old Private Note')).toBeNull();

    await user().clear(search);
    await user().selectOptions(groupSelect, '1');

    expect(await screen.findByText('Binary Trees Overview')).toBeInTheDocument();
    expect(screen.queryByText('Matrix Operations')).toBeNull();

    await user().selectOptions(visibilitySelect, 'public');
    expect(screen.getByText('Binary Trees Overview')).toBeInTheDocument();

    await user().selectOptions(dateSelect, '7d');
    expect(screen.queryByText('Very Old Private Note')).toBeNull();
  });

  test('opens "View Full Note" modal; renders attachments; mints SAS when needed', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([{ id: '1', name: 'CS Advanced' }]);
    ds.fetchNotes.mockResolvedValueOnce([
      {
        note_id: 11,
        group_id: 1,
        author_id: 1,
        topic_id: 1,
        note_title: 'Attachments Demo',
        note_content: 'Body',
        visibility: 'public',
        is_active: true,
        created_at: nowISO(),
        updated_at: nowISO(),
        author_name: 'X',
        group_name: 'CS Advanced',
        topic_name: 'DS',
        attachments: [
          { name: 'Has SAS', url: 'https://acct.blob.core.windows.net/c/thing.pdf?sv=1&sig=2' },
          { name: 'No SAS', container: 'files', blob: 'doc.pdf' },
        ],
      },
    ]);

    render(<Notes />);

    const [viewBtn] = await screen.findAllByRole('button', { name: /view full note/i });
    await user().click(viewBtn);

    // Scope all queries to the modal container to avoid matching the card title
    const modal = getModalRoot();

    // Wait for the unique modal title (level: 3) so we don't collide with the "Attachments" section header
    await within(modal).findByRole('heading', { name: /attachments demo/i, level: 3 });

    // Verify one real <a> with SAS inside the modal
    const downloadLinks = within(modal).queryAllByRole('link', { name: /^download$/i });
    expect(downloadLinks.length).toBe(1);
    expect(downloadLinks[0]).toHaveAttribute('href', expect.stringContaining('sig='));

    // The “No SAS” one is a button that should mint a SAS via DataService
    ds.getNoteAttachmentUrl.mockResolvedValueOnce(
      'https://acct.blob.core.windows.net/files/doc.pdf?sv=1&sig=abc'
    );
    const downloadButtons = within(modal).getAllByRole('button', { name: /^download$/i });
    await user().click(downloadButtons[0]);
    expect(ds.getNoteAttachmentUrl).toHaveBeenCalledWith(11, 'files', 'doc.pdf');
  });

  test('create note flow: opens modal, validates, saves, refreshes list', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([
      { id: '1', name: 'CS Advanced' },
      { id: '2', name: 'Math Warriors' },
    ]);
    ds.fetchNotes.mockResolvedValueOnce([]); // start empty

    render(<Notes />);

    const createBtn = await screen.findByRole('button', { name: /create note/i });
    await user().click(createBtn);

    const modalTitle = await screen.findByRole('heading', { name: /create note/i, level: 3 });
    const modalRoot = asHTMLElement(modalTitle.closest('.w-full') ?? modalTitle.parentElement);

    // Controls inside the modal
    const [groupSelect, visibilitySelect] = within(modalRoot).getAllByRole('combobox') as HTMLSelectElement[];
    const titleInput = within(modalRoot).getByPlaceholderText('e.g. Binary Tree Traversal') as HTMLInputElement;
    const contentArea = within(modalRoot).getByPlaceholderText('Write your study notes…') as HTMLTextAreaElement;
    const fileInput = modalRoot.querySelector('input[type="file"]') as HTMLInputElement;

    const createInModal = within(modalRoot).getByRole('button', { name: /^create$/i });
    expect(createInModal).toBeDisabled();

    await user().selectOptions(groupSelect, '1');
    await user().selectOptions(visibilitySelect, 'group');
    await user().type(titleInput, 'New Graph Notes');
    await user().type(contentArea, 'Graph theory basics...');

    const fakeFile = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await user().upload(fileInput, fakeFile);

    await waitFor(() => expect(createInModal).not.toBeDisabled());

    ds.createNote.mockResolvedValueOnce({
      note_id: 100,
      group_id: 1,
      author_id: 1,
      topic_id: 1,
      note_title: 'New Graph Notes',
      note_content: 'Graph theory basics...',
      visibility: 'group',
      is_active: true,
      created_at: nowISO(),
      updated_at: nowISO(),
      author_name: 'You',
      group_name: 'CS Advanced',
      topic_name: 'Graphs',
      attachments: [],
    });

    ds.uploadNoteAttachments.mockResolvedValueOnce({
      note_id: 100,
      group_id: 1,
      author_id: 1,
      topic_id: 1,
      note_title: 'New Graph Notes',
      note_content: 'Graph theory basics...',
      visibility: 'group',
      is_active: true,
      created_at: nowISO(),
      updated_at: nowISO(),
      author_name: 'You',
      group_name: 'CS Advanced',
      topic_name: 'Graphs',
      attachments: [{ name: 'hello.txt', url: 'https://files/hello.txt?sv=1&sig=abc' }],
    });

    ds.fetchNotes.mockResolvedValueOnce([
      {
        note_id: 100,
        group_id: 1,
        author_id: 1,
        topic_id: 1,
        note_title: 'New Graph Notes',
        note_content: 'Graph theory basics...',
        visibility: 'group',
        is_active: true,
        created_at: nowISO(),
        updated_at: nowISO(),
        author_name: 'You',
        group_name: 'CS Advanced',
        topic_name: 'Graphs',
        attachments: [{ name: 'hello.txt', url: 'https://files/hello.txt?sv=1&sig=abc' }],
      },
    ]);

    await user().click(createInModal);

    expect(await screen.findByText('New Graph Notes')).toBeInTheDocument();

    expect(ds.createNote).toHaveBeenCalledTimes(1);
    expect(ds.uploadNoteAttachments).toHaveBeenCalledTimes(1);
    expect(ds.fetchNotes).toHaveBeenCalledTimes(2); // initial + refresh
  });

  test('create note shows error if create fails (stays open, button re-enabled)', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([{ id: '1', name: 'CS Advanced' }]);
    ds.fetchNotes.mockResolvedValueOnce([]);

    render(<Notes />);

    const createBtn = await screen.findByRole('button', { name: /create note/i });
    await user().click(createBtn);

    const modalTitle = await screen.findByRole('heading', { name: /create note/i, level: 3 });
    const modalRoot = asHTMLElement(modalTitle.closest('.w-full') ?? modalTitle.parentElement);

    const [groupSelect] = within(modalRoot).getAllByRole('combobox') as HTMLSelectElement[];
    const titleInput = within(modalRoot).getByPlaceholderText('e.g. Binary Tree Traversal') as HTMLInputElement;
    const contentArea = within(modalRoot).getByPlaceholderText('Write your study notes…') as HTMLTextAreaElement;
    const createInModal = within(modalRoot).getByRole('button', { name: /^create$/i });

    await user().selectOptions(groupSelect, '1');
    await user().type(titleInput, 'Will Fail');
    await user().type(contentArea, 'x');

    await waitFor(() => expect(createInModal).not.toBeDisabled());

    ds.createNote.mockRejectedValueOnce(new Error('nope'));

    await user().click(createInModal);

    expect(await screen.findByText('Failed to create note')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create note/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^create$/i })).not.toBeDisabled());
  });
});
