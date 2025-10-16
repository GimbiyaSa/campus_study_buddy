import { render, screen, fireEvent, waitFor } from '../test-utils';
import NotificationHandler from './NotificationHandler';
import { expect, vi, beforeEach, describe, test } from 'vitest';
import { DataService } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';

const mockPendingInvitations = [
  {
    requestId: 1,
    requesterId: '123',
    requesterName: 'Alice Smith',
    requesterUniversity: 'Test University',
    requesterCourse: 'Computer Science',
    message: "Let's study together!",
    timestamp: '2025-01-01T12:00:00Z',
  },
  {
    requestId: 2,
    requesterId: '456',
    requesterName: 'Bob Johnson',
    requesterUniversity: 'Test University',
    requesterCourse: 'Mathematics',
    message: 'Looking for a study buddy',
    timestamp: '2025-01-01T10:00:00Z',
  },
];

describe('NotificationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Mock DataService methods
    vi.spyOn(DataService, 'getPendingInvitations').mockResolvedValue(mockPendingInvitations);
    vi.spyOn(DataService, 'acceptPartnerRequest').mockResolvedValue();
    vi.spyOn(DataService, 'rejectPartnerRequest').mockResolvedValue();

    // Mock Azure integration service
    vi.spyOn(azureIntegrationService, 'onConnectionEvent').mockImplementation(() => () => {});

    // Mock window.dispatchEvent
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    // Mock console methods to avoid test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('renders notification bell button', () => {
    render(<NotificationHandler />);

    const notificationButton = screen.getByLabelText(/notifications/i);
    expect(notificationButton).toBeInTheDocument();

    const bellIcon = screen.getByRole('button');
    expect(bellIcon).toBeInTheDocument();
  });

  test('loads pending invitations on mount', async () => {
    render(<NotificationHandler />);

    // Should call getPendingInvitations
    await waitFor(() => {
      expect(DataService.getPendingInvitations).toHaveBeenCalledTimes(1);
    });
  });

  test('shows unread count badge when there are notifications', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  test('opens notification dropdown when bell is clicked', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Click the notification bell
    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Should show notifications dropdown
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();
  });

  test('displays pending invitations in dropdown', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Should display both pending invitations
    expect(screen.getByText('Alice Smith wants to be your study partner')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson wants to be your study partner')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('"Let\'s study together!"')).toBeInTheDocument();
    expect(screen.getByText('"Looking for a study buddy"')).toBeInTheDocument();
  });

  test('shows empty state when no notifications', async () => {
    vi.spyOn(DataService, 'getPendingInvitations').mockResolvedValue([]);

    render(<NotificationHandler />);

    // Wait for empty state to load
    await waitFor(() => {
      expect(DataService.getPendingInvitations).toHaveBeenCalled();
    });

    // Click the notification bell
    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Should show empty state
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  test('closes dropdown when clicking outside', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Should show dropdown
    expect(screen.getByText('Notifications')).toBeInTheDocument();

    // Click outside (on the overlay)
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);

    // Dropdown should be closed
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  test('accepts partner request successfully', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Find and click Accept button for Alice Smith
    const acceptButtons = screen.getAllByText('Accept');
    fireEvent.click(acceptButtons[0]);

    // Should call acceptPartnerRequest
    await waitFor(() => {
      expect(DataService.acceptPartnerRequest).toHaveBeenCalledWith(1);
    });

    // Should dispatch buddies:invalidate event
    expect(window.dispatchEvent).toHaveBeenCalledWith(new Event('buddies:invalidate'));

    // Notification should be removed from list
    await waitFor(() => {
      expect(
        screen.queryByText('Alice Smith wants to be your study partner')
      ).not.toBeInTheDocument();
    });
  });

  test('declines partner request successfully', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Find and click Decline button for Alice Smith
    const declineButtons = screen.getAllByText('Decline');
    fireEvent.click(declineButtons[0]);

    // Should call rejectPartnerRequest
    await waitFor(() => {
      expect(DataService.rejectPartnerRequest).toHaveBeenCalledWith(1);
    });

    // Notification should be removed from list
    await waitFor(() => {
      expect(
        screen.queryByText('Alice Smith wants to be your study partner')
      ).not.toBeInTheDocument();
    });
  });

  test('handles accept request error', async () => {
    vi.spyOn(DataService, 'acceptPartnerRequest').mockRejectedValue(new Error('Network error'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Find and click Accept button
    const acceptButtons = screen.getAllByText('Accept');
    fireEvent.click(acceptButtons[0]);

    // Should show error alert
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        'Failed to accept partner request. Please try again.'
      );
    });

    // Notification should still be in list
    expect(screen.getByText('Alice Smith wants to be your study partner')).toBeInTheDocument();
  });

  test('handles decline request error', async () => {
    vi.spyOn(DataService, 'rejectPartnerRequest').mockRejectedValue(new Error('Network error'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Find and click Decline button
    const declineButtons = screen.getAllByText('Decline');
    fireEvent.click(declineButtons[0]);

    // Should show error alert
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        'Failed to reject partner request. Please try again.'
      );
    });

    // Notification should still be in list
    expect(screen.getByText('Alice Smith wants to be your study partner')).toBeInTheDocument();
  });

  test('removes notification when X button is clicked', async () => {
    render(<NotificationHandler />);

    // Wait for notifications to load and open dropdown
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Find and click remove button (X) for first notification
    const removeButtons = screen.getAllByLabelText(/remove notification/i);
    fireEvent.click(removeButtons[0]);

    // Notification should be removed
    await waitFor(() => {
      expect(
        screen.queryByText('Alice Smith wants to be your study partner')
      ).not.toBeInTheDocument();
    });

    // Count should decrease
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  test('handles Azure integration service event listeners', () => {
    render(<NotificationHandler />);

    // Should set up event listeners
    expect(azureIntegrationService.onConnectionEvent).toHaveBeenCalledWith(
      'notification',
      expect.any(Function)
    );
    expect(azureIntegrationService.onConnectionEvent).toHaveBeenCalledWith(
      'partner_accepted',
      expect.any(Function)
    );
    expect(azureIntegrationService.onConnectionEvent).toHaveBeenCalledWith(
      'partner_rejected',
      expect.any(Function)
    );
  });

  test('handles new incoming notifications via Azure service', async () => {
    let notificationHandler: ((notification: any) => void) | undefined;

    vi.spyOn(azureIntegrationService, 'onConnectionEvent').mockImplementation((event, handler) => {
      if (event === 'notification') {
        notificationHandler = handler as (notification: any) => void;
      }
      return () => {};
    });

    render(<NotificationHandler />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Simulate incoming notification
    const newNotification = {
      type: 'partner_request',
      data: {
        requestId: 3,
        requesterId: '789',
        requesterName: 'Carol White',
        requesterCourse: 'Physics',
        message: 'Study physics together?',
        timestamp: '2025-01-01T14:00:00Z',
      },
    };

    notificationHandler!(newNotification);

    // Count should increase
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  test('limits notifications to 10 items', async () => {
    let notificationHandler: ((notification: any) => void) | undefined;

    vi.spyOn(azureIntegrationService, 'onConnectionEvent').mockImplementation((event, handler) => {
      if (event === 'notification') {
        notificationHandler = handler as (notification: any) => void;
      }
      return () => {};
    });

    // Start with fewer notifications to test the limit
    vi.spyOn(DataService, 'getPendingInvitations').mockResolvedValue([mockPendingInvitations[0]]);

    render(<NotificationHandler />);

    // Wait for initial load (1 notification)
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    // Add 10 more notifications to exceed the limit
    for (let i = 0; i < 10; i++) {
      const newNotification = {
        type: 'partner_request',
        data: {
          requestId: 100 + i,
          requesterId: `user${i}`,
          requesterName: `User ${i}`,
          requesterCourse: 'Test Course',
          message: `Message ${i}`,
          timestamp: new Date().toISOString(),
        },
      };
      notificationHandler!(newNotification);
    }

    // Should have max 10 notifications (shows 9+ in badge)
    await waitFor(() => {
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

 test('displays notification timestamp correctly', async () => {
  render(<NotificationHandler />);

  await waitFor(() => {
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  const bellButton = screen.getByLabelText(/notifications/i);
  fireEvent.click(bellButton);

  const tsA = new Date('2025-01-01T12:00:00Z'); // Alice
  const tsB = new Date('2025-01-01T10:00:00Z'); // Bob

  const fmt = (timeZone?: string) =>
    new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone,
    });

  const expectedA_JOH = fmt('Africa/Johannesburg').format(tsA);
  const expectedB_JOH = fmt('Africa/Johannesburg').format(tsB);
  const expectedA_UTC = fmt('UTC').format(tsA);
  const expectedB_UTC = fmt('UTC').format(tsB);

  const matchAny = (a: string, b: string) => (_: string, node?: Element | null) => {
    const txt = (node?.textContent ?? '').replace(/\s+/g, ' ');
    return txt.includes(a) || txt.includes(b);
  };

  // Use getAllByText to avoid "multiple elements found" error
  expect(screen.getAllByText(matchAny(expectedA_JOH, expectedA_UTC)).length).toBeGreaterThan(0);
  expect(screen.getAllByText(matchAny(expectedB_JOH, expectedB_UTC)).length).toBeGreaterThan(0);
});



  test('handles unknown notification type gracefully', async () => {
    let notificationHandler: ((notification: any) => void) | undefined;

    vi.spyOn(azureIntegrationService, 'onConnectionEvent').mockImplementation((event, handler) => {
      if (event === 'notification') {
        notificationHandler = handler as (notification: any) => void;
      }
      return () => {};
    });

    render(<NotificationHandler />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Simulate unknown notification type
    const unknownNotification = {
      type: 'unknown_type',
      data: {},
    };

    notificationHandler!(unknownNotification);

    // Open dropdown
    const bellButton = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellButton);

    // Should show unknown notification message
    await waitFor(() => {
      expect(screen.getByText('Unknown notification type: unknown_type')).toBeInTheDocument();
    });
  });
});
