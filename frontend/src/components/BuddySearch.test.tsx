import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BuddySearch from './BuddySearch';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { DataService } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';
import { navigate } from '../router';

// Mock navigate function
vi.mock('../router', () => ({
  navigate: vi.fn(),
}));

// Mock DataService
vi.mock('../services/dataService', () => ({
  DataService: {
    searchPartners: vi.fn(),
    fetchPartners: vi.fn(),
    sendBuddyRequest: vi.fn(),
  },
}));

// Mock Azure Integration Service
vi.mock('../services/azureIntegrationService', () => ({
  default: {
    onConnectionEvent: vi.fn(() => () => {}),
    sendPartnerRequest: vi.fn(),
  },
}));

const mockSuggestions = [
  {
    id: '1',
    name: 'Alice Smith',
    course: 'Mathematics',
    university: 'Test University',
    yearOfStudy: 2,
    bio: 'Love early mornings and group study!',
    sharedCourses: ['Calculus II', 'Linear Algebra'],
    sharedTopics: ['calculus', 'algebra'],
    compatibilityScore: 95,
    studyHours: 25,
    weeklyHours: 5,
    studyStreak: 7,
    activeGroups: 2,
    sessionsAttended: 12,
    rating: 4.8,
    reviewCount: 15,
    responseRate: 98,
    lastActive: '2025-10-08T10:00:00Z',
    connectionStatus: 'none' as const,
  },
  {
    id: '2',
    name: 'Bob Lee',
    course: 'Physics',
    university: 'Test University',
    yearOfStudy: 3,
    bio: 'Night owl, prefers solo sessions.',
    sharedCourses: ['Physics I'],
    sharedTopics: ['mechanics'],
    compatibilityScore: 80,
    studyHours: 15,
    weeklyHours: 3,
    studyStreak: 4,
    activeGroups: 1,
    sessionsAttended: 8,
    rating: 4.5,
    reviewCount: 10,
    responseRate: 85,
    lastActive: '2025-10-07T20:00:00Z',
    connectionStatus: undefined,
  },
];

const mockConnections = [
  {
    id: '3',
    name: 'Charlie Brown',
    course: 'Computer Science',
    university: 'Test University',
    yearOfStudy: 2,
    connectionStatus: 'accepted' as const,
    sharedCourses: ['Data Structures'],
    sharedTopics: ['algorithms'],
    compatibilityScore: 90,
    studyHours: 30,
    weeklyHours: 6,
    studyStreak: 10,
    activeGroups: 3,
    sessionsAttended: 20,
    rating: 5.0,
    reviewCount: 25,
    responseRate: 100,
    lastActive: '2025-10-08T09:00:00Z',
  },
];

describe('BuddySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(DataService.searchPartners).mockResolvedValue(mockSuggestions);
    vi.mocked(DataService.fetchPartners).mockResolvedValue(mockConnections);
    vi.mocked(DataService.sendBuddyRequest).mockResolvedValue(undefined);
    vi.mocked(azureIntegrationService.sendPartnerRequest).mockResolvedValue(undefined);
  });

  test('renders loading state initially', () => {
    render(<BuddySearch />);
    expect(screen.getByText(/Loading study partners/i)).toBeInTheDocument();
    expect(screen.getByText(/Getting your perfect matches/i)).toBeInTheDocument();
  });

  test('renders suggestions and opens profile modal; send invite updates button', async () => {
    render(<BuddySearch />);

    // Wait for suggestions to load
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Expect suggestion cards to be rendered
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Lee')).toBeInTheDocument();
    expect(screen.getByText('95% match')).toBeInTheDocument();
    expect(screen.getByText('80% match')).toBeInTheDocument();

    // Click the first Connect button
    const connectButtons = screen.getAllByRole('button', { name: /connect/i });
    await userEvent.click(connectButtons[0]);

    // Modal should open and show profile name
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Alice Smith')).toBeInTheDocument();
    expect(within(dialog).getByText(/Love early mornings and group study!/i)).toBeInTheDocument();

    const inviteBtn = within(dialog).getByRole('button', { name: /send invite/i });
    expect(inviteBtn).toBeEnabled();

    // Send invite
    await userEvent.click(inviteBtn);

    // Check that the API was called
    expect(DataService.sendBuddyRequest).toHaveBeenCalledWith('1');
    expect(azureIntegrationService.sendPartnerRequest).toHaveBeenCalledWith(1);

    // Button should show "Invite sent"
    await waitFor(() => {
      expect(within(dialog).getByText(/invite sent/i)).toBeInTheDocument();
    });
  });

  test('handles API error during data loading', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(DataService.searchPartners).mockRejectedValue(new Error('Network error'));

    render(<BuddySearch />);

    // Should show error state - checking for the actual error text that appears
    await waitFor(() => {
      expect(screen.getByText(/Study Partners Unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Unable to load study partner recommendations/i)).toBeInTheDocument();

    consoleError.mockRestore();
  });

  test('shows empty state when no suggestions available', async () => {
    vi.mocked(DataService.searchPartners).mockResolvedValue([]);
    vi.mocked(DataService.fetchPartners).mockResolvedValue([]);

    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText(/No study partners yet/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/We're still finding the perfect study matches/i)).toBeInTheDocument();

    // Check explore all partners button
    const exploreButton = screen.getByRole('button', { name: /explore all partners/i });
    await userEvent.click(exploreButton);
    expect(vi.mocked(navigate)).toHaveBeenCalledWith('/partners');
  });

  test('handles invite send error', async () => {
    vi.mocked(DataService.sendBuddyRequest).mockRejectedValue(new Error('Request failed'));

    render(<BuddySearch />);

    // Wait for suggestions and open modal
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByRole('button', { name: /connect/i });
    await userEvent.click(connectButtons[0]);

    const dialog = await screen.findByRole('dialog');
    const inviteBtn = within(dialog).getByRole('button', { name: /send invite/i });

    // Try to send invite (should fail)
    await userEvent.click(inviteBtn);

    // Should show error - checking for the actual error text that appears
    await waitFor(() => {
      expect(screen.getByText(/Study Partners Unavailable|Unable to send/i)).toBeInTheDocument();
    });
  });

  test('navigates to partners page when clicking see all partners', async () => {
    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const seeAllButton = screen.getByRole('button', { name: /see all partners/i });
    await userEvent.click(seeAllButton);

    expect(vi.mocked(navigate)).toHaveBeenCalledWith('/partners');
  });

  test('closes modal when clicking cancel', async () => {
    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByRole('button', { name: /connect/i });
    await userEvent.click(connectButtons[0]);

    const dialog = await screen.findByRole('dialog');
    const cancelBtn = within(dialog).getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelBtn);

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('closes modal when clicking close button', async () => {
    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByRole('button', { name: /connect/i });
    await userEvent.click(connectButtons[0]);

    const dialog = await screen.findByRole('dialog');
    const closeBtn = within(dialog).getByRole('button', { name: /close/i });
    await userEvent.click(closeBtn);

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('handles pending invites state correctly', async () => {
    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Send invite to first person
    const connectButtons = screen.getAllByRole('button', { name: /connect/i });
    await userEvent.click(connectButtons[0]);

    const dialog = await screen.findByRole('dialog');
    const inviteBtn = within(dialog).getByRole('button', { name: /send invite/i });
    await userEvent.click(inviteBtn);

    // Wait for modal to close
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Button should now show pending state
    await waitFor(() => {
      const updatedButtons = screen.getAllByRole('button');
      const pendingButton = updatedButtons.find(
        (btn) => btn.textContent?.includes('Pending') || btn.textContent?.includes('pending')
      );
      expect(pendingButton).toBeInTheDocument();
    });
  });

  test('handles retry action on error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(DataService.searchPartners).mockRejectedValue(new Error('Network error'));

    // Mock window.location.reload
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: mockReload },
    });

    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText(/Study Partners Unavailable/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /refresh/i });
    await userEvent.click(retryButton);

    expect(mockReload).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  test('dismisses error when clicking dismiss', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(DataService.searchPartners).mockRejectedValue(new Error('Network error'));

    render(<BuddySearch />);

    await waitFor(() => {
      expect(screen.getByText(/Study Partners Unavailable/i)).toBeInTheDocument();
    });

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismissButton);

    // Error should be dismissed
    await waitFor(() => {
      expect(screen.queryByText(/Study Partners Unavailable/i)).not.toBeInTheDocument();
    });

    consoleError.mockRestore();
  });
});
