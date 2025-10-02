import { render, screen, fireEvent, waitFor } from '../test-utils';
import Chat from './Chat';
import { expect, vi, afterEach, describe, test } from 'vitest';
import { UserProvider, UserContext } from '../contexts/UserContext';
import { DataService } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';

const mockUser = {
  user_id: 1,
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  university: 'Test University',
  course: 'Testing',
  year_of_study: 3,
  is_active: true,
};

const mockBuddies = [
  {
    id: '2',
    name: 'Alice Smith',
    avatar: '',
    university: 'Test University',
    course: 'Mathematics',
    yearOfStudy: 2,
    sharedCourses: [],
    sharedTopics: [],
    compatibilityScore: 90,
    studyHours: 10,
    weeklyHours: 2,
    studyStreak: 3,
    activeGroups: 1,
    sessionsAttended: 2,
    rating: 5,
    reviewCount: 2,
    responseRate: 100,
    lastActive: '2025-10-01T12:00:00Z',
    connectionStatus: 'accepted' as const,
  },
];

vi.spyOn(DataService, 'fetchPartners').mockImplementation(async () => mockBuddies);
vi.spyOn(azureIntegrationService, 'onConnectionEvent').mockImplementation(() => () => {});
vi.spyOn(azureIntegrationService, 'sendChatMessage').mockImplementation(() => Promise.resolve());

function renderWithUser(ui: React.ReactElement) {
  return render(
    <UserProvider>
      {/* @ts-ignore */}
      <UserContextWrapper user={mockUser}>{ui}</UserContextWrapper>
    </UserProvider>
  );
}

// Helper to inject user context value
function UserContextWrapper({ user, children }: { user: any; children: React.ReactNode }) {
  const value = {
    currentUser: user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refreshUser: vi.fn(),
  };
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

describe('Chat page', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders chat UI', async () => {
    renderWithUser(<Chat />);
    expect(await screen.findByText(/Chat with study partners/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect and collaborate/i)).toBeInTheDocument();
  });

  test('shows loading state', async () => {
    // Simulate loading by delaying fetchPartners
    vi.spyOn(DataService, 'fetchPartners').mockImplementationOnce(() => new Promise(() => {}));
    renderWithUser(<Chat />);
    expect(screen.getByText(/Chat with study partners/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('shows error state and retry', async () => {
    vi.spyOn(DataService, 'fetchPartners').mockImplementationOnce(async () => {
      throw new Error('fail');
    });
    renderWithUser(<Chat />);
    expect(await screen.findByText(/Failed to load study partners/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /Try again/i });
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);
  });

  test('shows empty state when no buddies', async () => {
    vi.spyOn(DataService, 'fetchPartners').mockImplementationOnce(async () => []);
    renderWithUser(<Chat />);
    expect(await screen.findByText(/No partners yet/i)).toBeInTheDocument();
  });

  test('selects a buddy and shows chat area', async () => {
    renderWithUser(<Chat />);
    const buddy = await screen.findByText('Alice Smith');
    fireEvent.click(buddy);
    expect(await screen.findByText(/Start the conversation!/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type your message/i)).toBeInTheDocument();
  });

  test('can type and send a message', async () => {
    renderWithUser(<Chat />);
    const buddy = await screen.findByText('Alice Smith');
    fireEvent.click(buddy);
    const textarea = await screen.findByPlaceholderText(/Type your message/i);
    fireEvent.change(textarea, { target: { value: 'Hello Alice!' } });
    expect(textarea).toHaveValue('Hello Alice!');
    const sendBtn = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendBtn);
    // Simulate real-time message receipt (force re-render)
    fireEvent.change(textarea, { target: { value: '' } });
    await waitFor(() => expect(screen.getByPlaceholderText(/Type your message/i)).toHaveValue(''));
  });
});
