import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import GroupChat from './GroupChat';
import { UserContext } from '../contexts/UserContext';
import * as DataService from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';

// Mock the services
vi.mock('../services/dataService');
vi.mock('../services/azureIntegrationService');
vi.mock('../router', () => ({
  navigate: vi.fn(),
}));

const mockDataService = vi.mocked(DataService.DataService);
const mockAzureService = vi.mocked(azureIntegrationService);

// Mock user context
const mockUser = {
  user_id: 123,
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
  university: 'Test University',
  course: 'Computer Science',
  year_of_study: 2,
  is_active: true,
};

const renderWithContext = (component: React.ReactElement) => {
  const mockContextValue = {
    currentUser: mockUser,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refreshUser: vi.fn(),
  };

  return render(<UserContext.Provider value={mockContextValue}>{component}</UserContext.Provider>);
};

describe('GroupChat Component', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    // Setup default mock implementations
    mockDataService.fetchGroupMessages = vi.fn().mockResolvedValue([]);
    mockDataService.sendGroupMessage = vi.fn().mockResolvedValue({ success: true });
    mockAzureService.retryConnection = vi.fn().mockResolvedValue(undefined);
    mockAzureService.joinGroupChat = vi.fn().mockResolvedValue('group_test');
    mockAzureService.leaveGroupChat = vi.fn().mockResolvedValue(undefined);
    mockAzureService.onConnectionEvent = vi.fn().mockReturnValue(() => {});
    // Mock scrollIntoView for GroupChat
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const defaultProps = {
    groupId: 'test-group-123',
    groupName: 'Test Study Group',
  };

  it('renders group chat interface correctly', async () => {
    renderWithContext(<GroupChat {...defaultProps} />);

    // Check if header elements are present
    expect(screen.getByText('Test Study Group')).toBeInTheDocument();
    expect(screen.getByText('Group Chat')).toBeInTheDocument();

    // Check if back button is present
    expect(screen.getByTitle('Back to groups')).toBeInTheDocument();

    // Check if message input is present
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderWithContext(<GroupChat {...defaultProps} />);

    expect(screen.getByLabelText('Loading messages')).toBeInTheDocument();
  });

  it('loads and displays group messages', async () => {
    const mockMessages = [
      {
        id: '1',
        content: 'Hello everyone!',
        senderId: 'other-user',
        senderName: 'Other User',
        timestamp: '2025-10-19T10:00:00Z',
      },
      {
        id: '2',
        content: 'Hi there!',
        senderId: '123',
        senderName: 'Test User',
        timestamp: '2025-10-19T10:05:00Z',
      },
    ];

    mockDataService.fetchGroupMessages = vi.fn().mockResolvedValue(mockMessages);

    renderWithContext(<GroupChat {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    // Verify that fetchGroupMessages was called with correct parameters
    expect(mockDataService.fetchGroupMessages).toHaveBeenCalledWith('test-group-123');
  });

  it('shows empty state when no messages', async () => {
    mockDataService.fetchGroupMessages = vi.fn().mockResolvedValue([]);

    renderWithContext(<GroupChat {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Start the conversation!')).toBeInTheDocument();
      expect(screen.getByText('Be the first to send a message to your group.')).toBeInTheDocument();
    });
  });

  it('sends messages when form is submitted', async () => {
    renderWithContext(<GroupChat {...defaultProps} />);

    const messageInput = screen.getByPlaceholderText('Type your message...') as HTMLTextAreaElement;
    const sendButton = screen.getByText('Send');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading messages')).not.toBeInTheDocument();
    });

    // Type a message
    fireEvent.change(messageInput, { target: { value: 'Test message' } });
    expect(messageInput.value).toBe('Test message');

    // Send the message
    fireEvent.click(sendButton);

    // Verify that sendGroupMessage was called
    expect(mockDataService.sendGroupMessage).toHaveBeenCalledWith('test-group-123', 'Test message');

    // Verify that input is cleared
    await waitFor(() => {
      expect(messageInput.value).toBe('');
    });
  });

  it('sends message on Enter key press', async () => {
    renderWithContext(<GroupChat {...defaultProps} />);

    const messageInput = screen.getByPlaceholderText('Type your message...');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading messages')).not.toBeInTheDocument();
    });

    // Type a message
    fireEvent.change(messageInput, { target: { value: 'Enter key message' } });

    // Press Enter key
    fireEvent.keyPress(messageInput, { key: 'Enter', code: 'Enter', charCode: 13 });

    // Verify that sendGroupMessage was called
    expect(mockDataService.sendGroupMessage).toHaveBeenCalledWith(
      'test-group-123',
      'Enter key message'
    );
  });

  it('does not send empty messages', async () => {
    renderWithContext(<GroupChat {...defaultProps} />);

    const sendButton = screen.getByText('Send');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading messages')).not.toBeInTheDocument();
    });

    // Try to send empty message
    fireEvent.click(sendButton);

    // Verify that sendGroupMessage was not called
    expect(mockDataService.sendGroupMessage).not.toHaveBeenCalled();
  });

  it('joins and leaves group chat on mount/unmount', async () => {
    const { unmount } = renderWithContext(<GroupChat {...defaultProps} />);

    // Verify join was called
    await waitFor(() => {
      expect(mockAzureService.joinGroupChat).toHaveBeenCalledWith('test-group-123');
    });

    // Unmount component
    unmount();

    // Verify leave was called
    expect(mockAzureService.leaveGroupChat).toHaveBeenCalledWith('test-group-123');
  });

  it('handles message loading errors gracefully', async () => {
    mockDataService.fetchGroupMessages = vi.fn().mockRejectedValue(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithContext(<GroupChat {...defaultProps} />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load group messages:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('handles message sending errors gracefully', async () => {
    mockDataService.sendGroupMessage = vi.fn().mockRejectedValue(new Error('Send error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithContext(<GroupChat {...defaultProps} />);

    const messageInput = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByText('Send');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading messages')).not.toBeInTheDocument();
    });

    // Type and send a message
    fireEvent.change(messageInput, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to send group message:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('displays messages from different users with correct styling', async () => {
    const mockMessages = [
      {
        id: '1',
        content: 'Message from other user',
        senderId: 'other-user',
        senderName: 'Other User',
        timestamp: '2025-10-19T10:00:00Z',
      },
      {
        id: '2',
        content: 'My message',
        senderId: '123',
        senderName: 'Test User',
        timestamp: '2025-10-19T10:05:00Z',
      },
    ];

    mockDataService.fetchGroupMessages = vi.fn().mockResolvedValue(mockMessages);

    renderWithContext(<GroupChat {...defaultProps} />);

    await waitFor(() => {
      const otherUserMessage = screen.getByText('Message from other user');
      const myMessage = screen.getByText('My message');

      expect(otherUserMessage).toBeInTheDocument();
      expect(myMessage).toBeInTheDocument();

      // Check if sender names are displayed for other users
      expect(screen.getByText('Other User')).toBeInTheDocument();
    });
  });

  it('retries message loading when service is initializing', async () => {
    // Mock initial failure with service initializing error
    mockDataService.fetchGroupMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error('Service initializing'))
      .mockResolvedValueOnce([]);

    vi.useFakeTimers();

    renderWithContext(<GroupChat {...defaultProps} />);

    // Wait for initial error
    await waitFor(() => {
      expect(mockDataService.fetchGroupMessages).toHaveBeenCalledTimes(1);
    });

    // Fast-forward time to trigger retry
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockDataService.fetchGroupMessages).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });
});
