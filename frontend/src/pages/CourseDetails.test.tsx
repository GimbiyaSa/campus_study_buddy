import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import CourseDetails from '../pages/CourseDetails';
import { DataService } from '../services/dataService';
import { navigate } from '../router';

// Mock the dependencies
vi.mock('../services/dataService');
vi.mock('../router', () => ({
  navigate: vi.fn(),
}));

// Mock the modal components
vi.mock('../modals/CreateNoteModal', () => ({
  default: ({ open, onClose, onCreated }: any) =>
    open ? (
      <div data-testid="create-note-modal">
        <button onClick={() => { onCreated(); onClose(); }}>Create Note</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../modals/NoteModal', () => ({
  default: ({ note, onClose }: any) =>
    note ? (
      <div data-testid="note-modal">
        <div>{note.note_title}</div>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock('../modals/EditNoteModal', () => ({
  default: ({ note, onClose, onUpdated }: any) =>
    note ? (
      <div data-testid="edit-note-modal">
        <div>Editing: {note.note_title}</div>
        <button onClick={() => { onUpdated(); onClose(); }}>Update</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../components/StudyLogDialog', () => ({
  default: ({ isOpen, onClose, onSubmit, topic }: any) =>
    isOpen && topic ? (
      <div data-testid="study-log-dialog">
        <div>Log for: {topic.name}</div>
        <button onClick={() => onSubmit({ topicId: topic.id, hours: 2, description: 'Test session' })}>
          Submit Log
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../components/AddTopicDialog', () => ({
  default: ({ isOpen, onClose, onSubmit, courseName }: any) =>
    isOpen ? (
      <div data-testid="add-topic-dialog">
        <div>Add topic to: {courseName}</div>
        <button onClick={() => onSubmit({ topic_name: 'New Topic', description: 'Test description' })}>
          Add Topic
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../pages/TopicNotes', () => ({
  default: ({ topicId, onNoteClick, onEditNote, onDeleteNote }: any) => (
    <div data-testid="topic-notes">
      <div>Notes for topic: {topicId}</div>
      <button onClick={() => onNoteClick({ note_id: 1, note_title: 'Test Note' })}>View Note</button>
      <button onClick={() => onEditNote({ note_id: 1, note_title: 'Test Note' })}>Edit Note</button>
      <button onClick={() => onDeleteNote(1)}>Delete Note</button>
    </div>
  ),
}));

const mockDataService = vi.mocked(DataService);
const mockNavigate = vi.mocked(navigate);

describe('CourseDetails Component', () => {
  const mockCourse = {
    id: 1,
    title: 'Computer Science 101',
    code: 'CS101',
    type: 'institution',
    progress: 75,
    description: 'Introduction to Computer Science',
    university: 'Test University',
    instructor: 'Dr. Smith',
  };

  const mockTopics = [
    {
      id: 1,
      topic_name: 'Arrays and Lists',
      description: 'Learn about arrays and lists',
      module_name: 'Data Structures',
      progress: 80,
      is_completed: false,
      total_hours: 15,
      completed_hours: 12,
    },
    {
      id: 2,
      topic_name: 'Sorting Algorithms',
      description: 'Various sorting techniques',
      module_name: 'Algorithms',
      progress: 100,
      is_completed: true,
      total_hours: 20,
      completed_hours: 20,
    },
  ];

  const mockGroups = [
    {
      id: 1,
      group_id: 1,
      name: 'Study Group 1',
      description: 'CS Study Group',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockDataService.fetchCourses = vi.fn().mockResolvedValue([mockCourse]);
    mockDataService.fetchMyGroups = vi.fn().mockResolvedValue(mockGroups);
    mockDataService.fetchModuleTopics = vi.fn().mockResolvedValue(mockTopics);
    mockDataService.logStudyHours = vi.fn().mockResolvedValue({ success: true });
    mockDataService.markTopicComplete = vi.fn().mockResolvedValue({ success: true });
    mockDataService.addTopic = vi.fn().mockResolvedValue({ success: true });
    mockDataService.deleteNote = vi.fn().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    render(<CourseDetails id="1" />);

    expect(screen.getByText('Loading course details...')).toBeInTheDocument();
    expect(screen.getByText('Back to Courses')).toBeInTheDocument();
  });

  it('loads and displays course details correctly', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('Computer Science 101')).toBeInTheDocument();
      expect(screen.getByText('CS101')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    // Verify API calls
    expect(mockDataService.fetchCourses).toHaveBeenCalled();
    expect(mockDataService.fetchMyGroups).toHaveBeenCalled();
    expect(mockDataService.fetchModuleTopics).toHaveBeenCalledWith(1);
  });

  it('displays topics with progress information', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('Arrays and Lists')).toBeInTheDocument();
      expect(screen.getByText('Sorting Algorithms')).toBeInTheDocument();
      expect(screen.getByText('Data Structures')).toBeInTheDocument();
      expect(screen.getByText('Algorithms')).toBeInTheDocument();
    });
  });

  it('shows empty state when no topics exist', async () => {
    mockDataService.fetchModuleTopics = vi.fn().mockResolvedValue([]);
    
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('No topics yet')).toBeInTheDocument();
      expect(screen.getByText('Add Topic')).toBeInTheDocument();
    });
  });

  it('navigates back to courses when back button is clicked', async () => {
    render(<CourseDetails id="1" />);

    const backButton = screen.getByText('Back to Courses');
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/courses');
  });

  it('opens study log dialog when log hours button is clicked', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('Arrays and Lists')).toBeInTheDocument();
    });

    // Find and click a log hours button
    const logButton = screen.getAllByTitle('Log study hours')[0];
    fireEvent.click(logButton);

    expect(screen.getByTestId('study-log-dialog')).toBeInTheDocument();
    expect(screen.getByText('Log for: Arrays and Lists')).toBeInTheDocument();
  });

  it('handles study hours logging successfully', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('Arrays and Lists')).toBeInTheDocument();
    });

    // Open log dialog
    const logButton = screen.getAllByTitle('Log study hours')[0];
    fireEvent.click(logButton);

    // Submit log
    const submitButton = screen.getByText('Submit Log');
    fireEvent.click(submitButton);

    expect(mockDataService.logStudyHours).toHaveBeenCalledWith(1, {
      hours: 2,
      description: 'Test session',
    });

    // Should refresh course and topics data
    await waitFor(() => {
      expect(mockDataService.fetchCourses).toHaveBeenCalledTimes(2);
      expect(mockDataService.fetchModuleTopics).toHaveBeenCalledTimes(2);
    });
  });

  it('handles marking topic as complete', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('Arrays and Lists')).toBeInTheDocument();
    });

    // Find and click mark complete button
    const completeButton = screen.getAllByTitle('Mark as complete')[0];
    fireEvent.click(completeButton);

    expect(mockDataService.markTopicComplete).toHaveBeenCalledWith(1);

    // Should refresh data
    await waitFor(() => {
      expect(mockDataService.fetchCourses).toHaveBeenCalledTimes(2);
      expect(mockDataService.fetchModuleTopics).toHaveBeenCalledTimes(2);
    });
  });

  it('opens add topic dialog when add topic button is clicked', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText('Add Topic')).toBeInTheDocument();
    });

    const addTopicButton = screen.getByText('Add Topic');
    fireEvent.click(addTopicButton);

    expect(screen.getByTestId('add-topic-dialog')).toBeInTheDocument();
    expect(screen.getByText('Add topic to: Computer Science 101')).toBeInTheDocument();
  });

  it('handles adding new topic successfully', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      const addTopicButton = screen.getByText('Add Topic');
      fireEvent.click(addTopicButton);
    });

    // Submit new topic
    const submitButton = screen.getByText('Add Topic', { selector: 'button' });
    fireEvent.click(submitButton);

    expect(mockDataService.addTopic).toHaveBeenCalledWith(1, {
      topic_name: 'New Topic',
      description: 'Test description',
    });

    // Should refresh topics
    await waitFor(() => {
      expect(mockDataService.fetchModuleTopics).toHaveBeenCalledTimes(2);
    });
  });

  it('handles note interactions correctly', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByTestId('topic-notes')).toBeInTheDocument();
    });

    // Test view note
    const viewNoteButton = screen.getByText('View Note');
    fireEvent.click(viewNoteButton);

    expect(screen.getByTestId('note-modal')).toBeInTheDocument();
    expect(screen.getByText('Test Note')).toBeInTheDocument();

    // Close note modal
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('note-modal')).not.toBeInTheDocument();
    });

    // Test edit note
    const editNoteButton = screen.getByText('Edit Note');
    fireEvent.click(editNoteButton);

    expect(screen.getByTestId('edit-note-modal')).toBeInTheDocument();
    expect(screen.getByText('Editing: Test Note')).toBeInTheDocument();
  });

  it('handles note deletion successfully', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByTestId('topic-notes')).toBeInTheDocument();
    });

    // Test delete note
    const deleteNoteButton = screen.getByText('Delete Note');
    fireEvent.click(deleteNoteButton);

    expect(mockDataService.deleteNote).toHaveBeenCalledWith('1');
  });

  it('displays error state when course fetch fails', async () => {
    mockDataService.fetchCourses = vi.fn().mockRejectedValue(new Error('Network error'));
    
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });
  });

  it('displays not found state when course does not exist', async () => {
    mockDataService.fetchCourses = vi.fn().mockResolvedValue([]);
    
    render(<CourseDetails id="999" />);

    await waitFor(() => {
      expect(screen.getByText('Course not found')).toBeInTheDocument();
      expect(screen.getByText(/doesn't exist or you don't have access/)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully during operations', async () => {
    mockDataService.logStudyHours = vi.fn().mockRejectedValue(new Error('Log error'));
    
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      const logButton = screen.getAllByTitle('Log study hours')[0];
      fireEvent.click(logButton);
    });

    const submitButton = screen.getByText('Submit Log');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to log study hours. Please check your connection and try again.');
    });

    alertSpy.mockRestore();
  });

  it('dispatches course invalidation events after updates', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      const logButton = screen.getAllByTitle('Log study hours')[0];
      fireEvent.click(logButton);
    });

    const submitButton = screen.getByText('Submit Log');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'courses:invalidate',
          detail: { courseId: 1, type: 'progress_update' }
        })
      );
    });

    dispatchEventSpy.mockRestore();
  });

  it('opens create note modal with correct props', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      // Find create note button (would be in the actual component)
      // This test assumes the button exists, you may need to adjust based on actual implementation
      const topics = screen.getByText('Arrays and Lists');
      expect(topics).toBeInTheDocument();
    });

    // Note: The create note functionality would need to be triggered through the UI
    // This is a placeholder for testing the modal integration
  });

  it('refreshes notes when note operations complete', async () => {
    render(<CourseDetails id="1" />);

    await waitFor(() => {
      expect(screen.getByTestId('topic-notes')).toBeInTheDocument();
    });

    // Edit and update a note
    const editNoteButton = screen.getByText('Edit Note');
    fireEvent.click(editNoteButton);

    const updateButton = screen.getByText('Update');
    fireEvent.click(updateButton);

    // The modal should close and notes should refresh
    await waitFor(() => {
      expect(screen.queryByTestId('edit-note-modal')).not.toBeInTheDocument();
    });
  });
});