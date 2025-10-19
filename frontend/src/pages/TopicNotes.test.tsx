import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TopicNotes from '../pages/TopicNotes';
import { DataService } from '../services/dataService';
import type { SharedNote } from '../services/dataService';

// Mock the DataService
vi.mock('../services/dataService');

const mockDataService = vi.mocked(DataService);

describe('TopicNotes Component', () => {
  const mockNotes: SharedNote[] = [
    {
      note_id: 1,
      group_id: 1,
      author_id: '1',
      note_title: 'Test Note 1',
      note_content:
        'This is the content of test note 1. It contains some text that should be truncated if it is too long for display. '.repeat(
          5
        ),
      topic_id: 123,
      visibility: 'group',
      is_active: true,
      created_at: '2025-10-19T10:00:00Z',
      updated_at: '2025-10-19T10:00:00Z',
      attachments: [{ id: 1, filename: 'attachment1.pdf' }],
    },
    {
      note_id: 2,
      group_id: 1,
      author_id: '2',
      note_title: 'Test Note 2',
      note_content: 'Short content',
      topic_id: 123,
      visibility: 'group',
      is_active: true,
      created_at: '2025-10-19T10:05:00Z',
      updated_at: '2025-10-19T10:05:00Z',
      attachments: [],
    },
    {
      note_id: 3,
      group_id: 2,
      author_id: '1',
      note_title: 'Different Topic Note',
      note_content: 'This note belongs to a different topic',
      topic_id: 456,
      visibility: 'group',
      is_active: true,
      created_at: '2025-10-19T10:10:00Z',
      updated_at: '2025-10-19T10:10:00Z',
      attachments: null,
    },
  ];

  const mockOnNoteClick = vi.fn();
  const mockOnEditNote = vi.fn();
  const mockOnDeleteNote = vi.fn();

  const defaultProps = {
    topicId: 123,
    onNoteClick: mockOnNoteClick,
    onEditNote: mockOnEditNote,
    onDeleteNote: mockOnDeleteNote,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDataService.fetchNotes = vi.fn().mockResolvedValue(mockNotes);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders notes for the specified topic', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('Test Note 1')).toBeInTheDocument();
      expect(screen.getByText('Test Note 2')).toBeInTheDocument();
      expect(screen.queryByText('Different Topic Note')).not.toBeInTheDocument();
    });

    // Verify fetchNotes was called
    expect(mockDataService.fetchNotes).toHaveBeenCalledWith({});
  });

  it('filters notes by topic ID correctly', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      // Should show notes with topic_id 123
      expect(screen.getByText('Test Note 1')).toBeInTheDocument();
      expect(screen.getByText('Test Note 2')).toBeInTheDocument();
      // Should not show note with topic_id 456
      expect(screen.queryByText('Different Topic Note')).not.toBeInTheDocument();
    });
  });

  it('handles string/number type mismatches in topic IDs', async () => {
    const notesWithStringIds = [
      {
        ...mockNotes[0],
        topic_id: '123', // String instead of number
      },
    ];

    mockDataService.fetchNotes = vi.fn().mockResolvedValue(notesWithStringIds);

    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test Note 1')).toBeInTheDocument();
    });
  });

  it('truncates long note content', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const noteContent = screen.getByText(/This is the content of test note 1/);
      expect(noteContent.textContent).toContain('…');
      expect(noteContent.textContent?.length).toBeLessThan(mockNotes[0].note_content.length + 10);
    });
  });

  it('shows short content without truncation', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const shortContent = screen.getByText('Short content');
      expect(shortContent.textContent).not.toContain('…');
    });
  });

  it('displays attachment information when present', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('1 attachment')).toBeInTheDocument();
    });
  });

  it('handles multiple attachments correctly', async () => {
    const noteWithMultipleAttachments = {
      ...mockNotes[0],
      attachments: [
        { id: 1, filename: 'file1.pdf' },
        { id: 2, filename: 'file2.doc' },
      ],
    };

    mockDataService.fetchNotes = vi.fn().mockResolvedValue([noteWithMultipleAttachments]);

    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('2 attachments')).toBeInTheDocument();
    });
  });

  it('does not display attachment info when no attachments', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const noteElements = screen.getAllByText(/Test Note/);
      expect(noteElements).toHaveLength(2);

      // Should not show attachment info for note 2 (empty array) or note 3 (null)
      expect(screen.queryByText('0 attachments')).not.toBeInTheDocument();
    });
  });

  it('calls onNoteClick when view button is clicked', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const viewButtons = screen.getAllByTitle('View note');
      expect(viewButtons).toHaveLength(2);
    });

    const viewButtons = screen.getAllByTitle('View note');
    fireEvent.click(viewButtons[0]);

    expect(mockOnNoteClick).toHaveBeenCalledWith(mockNotes[0]);
  });

  it('calls onEditNote when edit button is clicked', async () => {
    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const editButtons = screen.getAllByTitle('Edit note');
      expect(editButtons).toHaveLength(2);
    });

    const editButtons = screen.getAllByTitle('Edit note');
    fireEvent.click(editButtons[0]);

    expect(mockOnEditNote).toHaveBeenCalledWith(mockNotes[0]);
  });

  it('does not show edit button when onEditNote is not provided', async () => {
    const propsWithoutEdit = {
      ...defaultProps,
      onEditNote: undefined,
    };

    render(<TopicNotes {...propsWithoutEdit} />);

    await waitFor(() => {
      expect(screen.queryByTitle('Edit note')).not.toBeInTheDocument();
    });
  });

  it('calls onDeleteNote with confirmation when delete button is clicked', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete note');
      expect(deleteButtons).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByTitle('Delete note');
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this note?');
    expect(mockOnDeleteNote).toHaveBeenCalledWith(1);

    confirmSpy.mockRestore();
  });

  it('does not delete when confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete note');
      fireEvent.click(deleteButtons[0]);
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockOnDeleteNote).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not show delete button when onDeleteNote is not provided', async () => {
    const propsWithoutDelete = {
      ...defaultProps,
      onDeleteNote: undefined,
    };

    render(<TopicNotes {...propsWithoutDelete} />);

    await waitFor(() => {
      expect(screen.queryByTitle('Delete note')).not.toBeInTheDocument();
    });
  });

  it('returns null when no notes exist for the topic', async () => {
    mockDataService.fetchNotes = vi.fn().mockResolvedValue([]);

    const { container } = render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('handles API errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDataService.fetchNotes = vi.fn().mockRejectedValue(new Error('API Error'));

    render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ TopicNotes: Error fetching notes:',
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it('listens for notes invalidation events and refreshes', async () => {
    render(<TopicNotes {...defaultProps} />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockDataService.fetchNotes).toHaveBeenCalledTimes(1);
    });

    // Clear mock calls
    mockDataService.fetchNotes.mockClear();

    // Dispatch notes:invalidate event
    const event = new CustomEvent('notes:invalidate');
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(mockDataService.fetchNotes).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes when refreshSignal prop changes', async () => {
    const { rerender } = render(<TopicNotes {...defaultProps} refreshSignal={1} />);

    await waitFor(() => {
      expect(mockDataService.fetchNotes).toHaveBeenCalledTimes(1);
    });

    // Clear mock calls
    mockDataService.fetchNotes.mockClear();

    // Change refreshSignal
    rerender(<TopicNotes {...defaultProps} refreshSignal={2} />);

    await waitFor(() => {
      expect(mockDataService.fetchNotes).toHaveBeenCalledTimes(1);
    });
  });

  it('cleans up event listeners on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<TopicNotes {...defaultProps} />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('notes:invalidate', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it('handles non-array response from fetchNotes', async () => {
    mockDataService.fetchNotes = vi.fn().mockResolvedValue(null);

    const { container } = render(<TopicNotes {...defaultProps} />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
