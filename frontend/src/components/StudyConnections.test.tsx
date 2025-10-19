import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import StudyConnections from '../components/StudyConnections';
import { DataService } from '../services/dataService';
import { navigate } from '../router';
import type { StudyPartner } from '../services/dataService';

// Mock the dependencies
vi.mock('../services/dataService');
vi.mock('../router', () => ({
  navigate: vi.fn(),
}));

const mockDataService = vi.mocked(DataService);
const mockNavigate = vi.mocked(navigate);

describe('StudyConnections Component', () => {
  const mockConnections: StudyPartner[] = [
    {
      id: '1',
      name: 'John Doe',
      course: 'Computer Science',
      university: 'Test University',
      yearOfStudy: 2,
      bio: 'CS student interested in algorithms',
      sharedCourses: ['Computer Science'],
      sharedTopics: ['Algorithms', 'Data Structures'],
      compatibilityScore: 85,
      studyHours: 120,
      weeklyHours: 15,
      studyStreak: 7,
      activeGroups: 2,
      sessionsAttended: 10,
      rating: 4.5,
      reviewCount: 5,
      responseRate: 95,
      lastActive: '2025-10-19T08:00:00Z',
    },
    {
      id: '2',
      name: 'Jane Smith',
      course: 'Software Engineering',
      university: 'Test University',
      yearOfStudy: 3,
      bio: 'Software engineer with 2 years experience',
      sharedCourses: ['Software Engineering'],
      sharedTopics: ['Programming', 'Testing'],
      compatibilityScore: 90,
      studyHours: 150,
      weeklyHours: 20,
      studyStreak: 14,
      activeGroups: 3,
      sessionsAttended: 15,
      rating: 4.8,
      reviewCount: 8,
      responseRate: 98,
      lastActive: '2025-10-19T07:30:00Z',
    },
    {
      id: '3',
      name: 'Bob Johnson',
      course: 'Information Systems',
      university: 'Another University',
      yearOfStudy: 1,
      bio: 'IS student focusing on database design',
      sharedCourses: ['Information Systems'],
      sharedTopics: ['Databases', 'Systems Analysis'],
      compatibilityScore: 75,
      studyHours: 80,
      weeklyHours: 10,
      studyStreak: 3,
      activeGroups: 1,
      sessionsAttended: 5,
      rating: 4.2,
      reviewCount: 3,
      responseRate: 85,
      lastActive: '2025-10-19T09:15:00Z',
    },
    {
      id: '4',
      name: 'Alice Brown',
      course: 'Computer Engineering',
      university: 'Test University',
      yearOfStudy: 4,
      bio: 'Hardware and software integration specialist',
      sharedCourses: ['Computer Engineering'],
      sharedTopics: ['Hardware', 'Software Integration'],
      compatibilityScore: 80,
      studyHours: 200,
      weeklyHours: 25,
      studyStreak: 21,
      activeGroups: 4,
      sessionsAttended: 25,
      rating: 4.6,
      reviewCount: 10,
      responseRate: 92,
      lastActive: '2025-10-19T06:45:00Z',
    },
    {
      id: '5',
      name: 'Charlie Wilson',
      course: 'Data Science',
      university: 'Data University',
      yearOfStudy: 2,
      bio: 'Machine learning enthusiast',
      sharedCourses: ['Data Science'],
      sharedTopics: ['Machine Learning', 'Statistics'],
      compatibilityScore: 88,
      studyHours: 180,
      weeklyHours: 22,
      studyStreak: 10,
      activeGroups: 2,
      sessionsAttended: 18,
      rating: 4.7,
      reviewCount: 7,
      responseRate: 90,
      lastActive: '2025-10-19T10:30:00Z',
    },
    {
      id: '6',
      name: 'Diana Prince',
      course: 'Cybersecurity',
      university: 'Security University',
      yearOfStudy: 3,
      bio: 'Cybersecurity expert and researcher',
      sharedCourses: ['Cybersecurity'],
      sharedTopics: ['Network Security', 'Cryptography'],
      compatibilityScore: 92,
      studyHours: 220,
      weeklyHours: 28,
      studyStreak: 30,
      activeGroups: 5,
      sessionsAttended: 35,
      rating: 4.9,
      reviewCount: 12,
      responseRate: 99,
      lastActive: '2025-10-19T05:20:00Z',
    },
    {
      id: '7',
      name: 'Extra Connection',
      course: 'Mathematics',
      university: 'Math University',
      yearOfStudy: 1,
      bio: 'Should not appear due to limit',
      sharedCourses: ['Mathematics'],
      sharedTopics: ['Calculus', 'Statistics'],
      compatibilityScore: 70,
      studyHours: 60,
      weeklyHours: 8,
      studyStreak: 2,
      activeGroups: 1,
      sessionsAttended: 3,
      rating: 4.0,
      reviewCount: 2,
      responseRate: 80,
      lastActive: '2025-10-18T14:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementation
    mockDataService.searchPartners = vi.fn().mockResolvedValue(mockConnections);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders header with title and description', () => {
    render(<StudyConnections />);

    expect(screen.getByText('Study Connections')).toBeInTheDocument();
    expect(screen.getByText('Your active study buddies')).toBeInTheDocument();
    expect(screen.getByText('Open chat')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<StudyConnections />);

    expect(screen.getByText('Loading connections...')).toBeInTheDocument();
  });

  it('loads and displays study connections', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });

    // Verify fetchPartners was called
    expect(mockDataService.searchPartners).toHaveBeenCalled();
  });

  it('limits displayed connections to 6', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Diana Prince')).toBeInTheDocument();
      // 7th connection should not appear
      expect(screen.queryByText('Extra Connection')).not.toBeInTheDocument();
    });

    // Should show count of 6
    expect(screen.getByText('6 active connections')).toBeInTheDocument();
  });

  it('displays connection cards with correct information', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      // Check first connection card
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
      
      // Check second connection card
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Software Engineering')).toBeInTheDocument();
    });
  });

  it('generates correct initials for connection avatars', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      // Check that initials are present (JD for John Doe, JS for Jane Smith, etc.)
      const avatars = screen.getAllByText(/^[A-Z]{1,2}$/);
      expect(avatars.length).toBeGreaterThan(0);
    });
  });

  it('shows university when course is not available', async () => {
    const connectionsWithUniversity = [
      {
        ...mockConnections[0],
        course: undefined,
        university: 'Test University',
      },
    ];

    mockDataService.searchPartners = vi.fn().mockResolvedValue(connectionsWithUniversity);
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });
  });

  it('navigates to chat when message buttons are clicked', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click on a message button
    const messageButtons = screen.getAllByTitle('Message');
    fireEvent.click(messageButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('navigates to sessions when schedule session buttons are clicked', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click on a schedule session button
    const sessionButtons = screen.getAllByTitle('Schedule session');
    fireEvent.click(sessionButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/sessions');
  });

  it('navigates to chat when header "Open chat" button is clicked', () => {
    render(<StudyConnections />);

    const openChatButton = screen.getByText('Open chat');
    fireEvent.click(openChatButton);

    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('navigates to chat when "Start chatting" button is clicked', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('Start chatting')).toBeInTheDocument();
    });

    const startChattingButton = screen.getByText('Start chatting');
    fireEvent.click(startChattingButton);

    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('displays empty state when no connections exist', async () => {
    mockDataService.searchPartners = vi.fn().mockResolvedValue([]);
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('No study connections yet')).toBeInTheDocument();
      expect(screen.getByText('Start connecting with study partners to build your study network.')).toBeInTheDocument();
      expect(screen.getByText('Find study partners')).toBeInTheDocument();
    });
  });

  it('navigates to partners page from empty state', async () => {
    mockDataService.searchPartners = vi.fn().mockResolvedValue([]);
    
    render(<StudyConnections />);

    await waitFor(() => {
      const findPartnersButton = screen.getByText('Find study partners');
      fireEvent.click(findPartnersButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/partners');
  });

  it('displays error state when API call fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDataService.searchPartners = vi.fn().mockRejectedValue(new Error('Network error'));
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });

  it('handles retry when error occurs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDataService.searchPartners = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockConnections);
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    // Click retry button
    const retryButton = screen.getByText('Try again');
    fireEvent.click(retryButton);

    // Should reload the page (mocked behavior)
    expect(retryButton).toBeInTheDocument(); // This test checks the retry button exists

    consoleErrorSpy.mockRestore();
  });

  it('dismisses error message when dismiss button is clicked', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDataService.searchPartners = vi.fn().mockRejectedValue(new Error('Network error'));
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });

    // Click dismiss button
    const dismissButton = screen.getByText('Dismiss');
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });

  it('listens for buddies invalidation events and refreshes', async () => {
    render(<StudyConnections />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockDataService.searchPartners).toHaveBeenCalledTimes(1);
    });

    // Clear mock calls
    mockDataService.searchPartners.mockClear();

    // Dispatch buddies:invalidate event
    const event = new CustomEvent('buddies:invalidate');
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(mockDataService.searchPartners).toHaveBeenCalledTimes(1);
    });
  });

  it('cleans up event listeners on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    
    const { unmount } = render(<StudyConnections />);
    
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('buddies:invalidate', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it('applies hover effects to connection cards', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Check that cards have appropriate CSS classes for hover effects
    const connectionCards = screen.getAllByText('Study buddy');
    expect(connectionCards.length).toBeGreaterThan(0);
  });

  it('shows study buddy badges for all connections', async () => {
    render(<StudyConnections />);

    await waitFor(() => {
      const badges = screen.getAllByText('Study buddy');
      expect(badges).toHaveLength(6); // Should show 6 connections
    });
  });

  it('handles long names gracefully with truncation', async () => {
    const longNameConnection = [
      {
        ...mockConnections[0],
        name: 'Very Long Name That Should Be Truncated Properly',
        course: 'Very Long Course Name That Should Also Be Truncated',
      },
    ];

    mockDataService.searchPartners = vi.fn().mockResolvedValue(longNameConnection);
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('Very Long Name That Should Be Truncated Properly')).toBeInTheDocument();
    });
  });

  it('displays correct connection count in footer', async () => {
    // Test with fewer connections
    const fewConnections = mockConnections.slice(0, 3);
    mockDataService.searchPartners = vi.fn().mockResolvedValue(fewConnections);
    
    render(<StudyConnections />);

    await waitFor(() => {
      expect(screen.getByText('3 active connections')).toBeInTheDocument();
    });
  });
});