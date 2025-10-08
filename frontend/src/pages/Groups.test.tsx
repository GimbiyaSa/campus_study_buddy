// src/pages/Groups.test.tsx
import { render } from '../test-utils';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Groups from './Groups';

// Keep portals inline so any overlay content would still be visible (we won't rely on it though)
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// Stub buildApiUrl (used by /users/me)
vi.mock('../utils/url', () => ({ buildApiUrl: (p: string) => `http://api.test${p}` }));

// Router mock
const navigateMock = vi.fn();
vi.mock('../router', () => ({ navigate: (...a: unknown[]) => navigateMock(...a) }));

// Mock AzureIntegrationService to avoid real-time init & satisfy both default and named imports
vi.mock('../services/azureIntegrationService', () => {
  const mock = {
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    initializeRealTimeConnection: vi.fn(),
    disconnect: vi.fn(),
    sendTyping: vi.fn(),
    sendMessage: vi.fn(),
    webPubSubClient: {
      joinGroup: vi.fn(),
      leaveGroup: vi.fn(),
    },
  };
  return {
    default: mock, // default import usage
    AzureIntegrationService: mock, // named import usage (if any)
  };
});

// BroadcastChannel shim
class BCMock {
  constructor(_name: string) {}
  postMessage() {}
  close() {}
}
(globalThis as any).BroadcastChannel = BCMock;

// -------- DataService surface (only what we touch here) --------
const ds = {
  fetchMyGroups: vi.fn(),
  fetchGroupsRaw: vi.fn(),
  joinGroup: vi.fn(),
  leaveGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createGroup: vi.fn(),
  createSession: vi.fn(),
  scheduleSession24hReminders: vi.fn(),
  notifyGroup: vi.fn(),
  inviteToGroup: vi.fn(),
  createNotification: vi.fn(),
  updateGroup: vi.fn(),
  getGroupMembers: vi.fn(),
};

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchMyGroups: (...a: unknown[]) => ds.fetchMyGroups(...a),
      fetchGroupsRaw: (...a: unknown[]) => ds.fetchGroupsRaw(...a),
      joinGroup: (...a: unknown[]) => ds.joinGroup(...a),
      leaveGroup: (...a: unknown[]) => ds.leaveGroup(...a),
      deleteGroup: (...a: unknown[]) => ds.deleteGroup(...a),
      createGroup: (...a: unknown[]) => ds.createGroup(...a),
      createSession: (...a: unknown[]) => ds.createSession(...a),
      scheduleSession24hReminders: (...a: unknown[]) => ds.scheduleSession24hReminders(...a),
      notifyGroup: (...a: unknown[]) => ds.notifyGroup(...a),
      inviteToGroup: (...a: unknown[]) => ds.inviteToGroup(...a),
      createNotification: (...a: unknown[]) => ds.createNotification(...a),
      updateGroup: (...a: unknown[]) => ds.updateGroup(...a),
      getGroupMembers: (...a: unknown[]) => ds.getGroupMembers(...a),
    },
  };
});

// Helper to craft API-shaped groups quickly
const mkSrvGroup = (over: Partial<any> = {}) => ({
  id: over.id ?? 'g-' + Math.random().toString(36).slice(2),
  name: over.name ?? 'Algorithms Crew',
  description: over.description ?? 'Study hard things',
  maxMembers: over.maxMembers ?? 8,
  isPublic: over.isPublic ?? true,
  createdBy: over.createdBy ?? '1',
  members: over.members ?? [{ userId: over.createdBy ?? '1', role: 'owner' }],
  createdAt: over.createdAt ?? new Date().toISOString(),
  lastActivity: over.lastActivity ?? new Date().toISOString(),
  group_type: over.group_type ?? 'study',
  course: over.course,
  courseCode: over.courseCode,
});

const ownerName = 'Owner Group';
const otherName = 'Other Group';

const findCard = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('.p-6') as HTMLElement;

beforeEach(() => {
  vi.useRealTimers();

  Object.values(ds).forEach((f) => (f as any).mockReset());
  navigateMock.mockReset();

  // /users/me → I am user '1'
  (global.fetch as any) = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/v1/users/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: '1', name: 'Me' }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  // Default groups: one I own, one I don't, plus one demo/local (no server id)
  ds.fetchMyGroups.mockResolvedValue([
    mkSrvGroup({
      id: 'srv-owner',
      name: ownerName,
      createdBy: '1',
      members: [{ userId: '1', role: 'owner' }],
      course: 'Data Structures',
      courseCode: 'CS201',
    }),
    mkSrvGroup({
      id: 'srv-other',
      name: otherName,
      createdBy: '2',
      members: [{ userId: '2', role: 'owner' }],
      maxMembers: 10,
    }),
    {
      group_id: 777, // signals demo/local object in your UI
      group_name: 'Demo Local',
      max_members: 5,
      group_type: 'study',
      member_count: 1,
      creator_id: 3,
      module_name: 'GEN 101 - General',
      is_active: true,
    },
  ]);

  ds.fetchGroupsRaw.mockResolvedValue([]);
  ds.joinGroup.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Groups (basic smoke tests)', () => {
  test('renders header and cards (owner, non-owner, and demo)', async () => {
    render(<Groups />);

    // initial skeleton
    expect(screen.getByText(/Loading study groups/i)).toBeInTheDocument();

    // header
    await screen.findByRole('heading', { name: /Study Groups/i });

    // cards
    expect(screen.getByRole('heading', { name: ownerName })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: otherName })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demo Local' })).toBeInTheDocument();

    // owner badge visible on owner card (scope within card to avoid title clash)
    const ownerCard = findCard(ownerName);
    expect(within(ownerCard).getByText(/^Owner$/i)).toBeInTheDocument();

    // other card has Join button
    const otherCard = findCard(otherName);
    expect(within(otherCard).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
  });

  test('join group (server id) calls DataService.joinGroup with that id', async () => {
    render(<Groups />);

    // Click "Join Group" on the non-owner server group
    const otherCard = await waitFor(() => findCard(otherName));
    await userEvent.click(within(otherCard).getByRole('button', { name: /Join Group/i }));
    expect(ds.joinGroup).toHaveBeenCalledWith('srv-other');
  });

  test('Open chat button navigates to /chat', async () => {
    render(<Groups />);
    const ownerCard = await waitFor(() => findCard(ownerName));
    await userEvent.click(within(ownerCard).getByTitle('Open chat'));
    expect(navigateMock).toHaveBeenCalledWith('/chat');
  });
});
