import { render } from '../test-utils';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Groups from './Groups';

// Inline portals so modals render in the same tree
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// Stub buildApiUrl (used only for /users/me in this component)
vi.mock('../utils/url', () => ({ buildApiUrl: (p: string) => `http://api.test${p}` }));

// Mock router navigate to avoid real navigation
const navigateMock = vi.fn();
vi.mock('../router', () => ({ navigate: (...a: unknown[]) => navigateMock(...a) }));

// Minimal BroadcastChannel shim to avoid jsdom errors
class BCMock {
  constructor(_name: string) {}
  postMessage() {}
  close() {}
}
(globalThis as any).BroadcastChannel = BCMock;

// ---- DataService mock surface ----
const ds = {
  fetchMyGroups: vi.fn(),
  fetchGroupsRaw: vi.fn(),
  searchPartners: vi.fn(),
  joinGroup: vi.fn(),
  leaveGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createGroup: vi.fn(),
  createSession: vi.fn(),
  scheduleSession24hReminders: vi.fn(),
  notifyGroup: vi.fn(),
  inviteToGroup: vi.fn(),
  createNotification: vi.fn(),
  // NEW
  updateGroup: vi.fn(),
  getGroupMembers: vi.fn(),
};

vi.mock('../services/dataService', () => {
  return {
    DataService: {
      fetchMyGroups: (...a: unknown[]) => ds.fetchMyGroups(...a),
      fetchGroupsRaw: (...a: unknown[]) => ds.fetchGroupsRaw(...a),
      searchPartners: (...a: unknown[]) => ds.searchPartners(...a),
      joinGroup: (...a: unknown[]) => ds.joinGroup(...a),
      leaveGroup: (...a: unknown[]) => ds.leaveGroup(...a),
      deleteGroup: (...a: unknown[]) => ds.deleteGroup(...a),
      createGroup: (...a: unknown[]) => ds.createGroup(...a),
      createSession: (...a: unknown[]) => ds.createSession(...a),
      scheduleSession24hReminders: (...a: unknown[]) => ds.scheduleSession24hReminders(...a),
      notifyGroup: (...a: unknown[]) => ds.notifyGroup(...a),
      inviteToGroup: (...a: unknown[]) => ds.inviteToGroup(...a),
      createNotification: (...a: unknown[]) => ds.createNotification(...a),
      // NEW
      updateGroup: (...a: unknown[]) => ds.updateGroup(...a),
      getGroupMembers: (...a: unknown[]) => ds.getGroupMembers(...a),
    },
    FALLBACK_PARTNERS: [
      { id: 'u1', name: 'Ada Lovelace', major: 'CS' } as any,
      { id: 'u2', name: 'Grace Hopper', major: 'CS' } as any,
    ],
  };
});

// Helpers to craft API-shaped groups that map cleanly through toStudyGroup()
const mkSrvGroup = (over: Partial<any> = {}) => ({
  id: over.id ?? 'g-cosmos-' + Math.random().toString(36).slice(2),
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

const FIXED_NOW = new Date('2025-10-02T12:00:00');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  Object.values(ds).forEach((f) => (f as any).mockReset());
  navigateMock.mockReset();

  // /users/me → I am user '1' (owner of owner group)
  (global.fetch as any) = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/v1/users/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: '1', name: 'Me' }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  // default: fetchMyGroups returns two "real" groups (one owned, one not) + one "demo" group (no cosmos id)
  ds.fetchMyGroups.mockResolvedValue([
    mkSrvGroup({
      name: ownerName,
      createdBy: '1',
      members: [{ userId: '1', role: 'owner' }],
      course: 'Data Structures',
      courseCode: 'CS201',
    }),
    mkSrvGroup({
      name: otherName,
      createdBy: '2',
      members: [{ userId: '2', role: 'owner' }],
      maxMembers: 10,
    }),
    {
      group_id: 777,
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
  ds.leaveGroup.mockResolvedValue(true);
  ds.deleteGroup.mockResolvedValue(true);
  ds.createGroup.mockResolvedValue(null); // force optimistic by default
  ds.createSession.mockResolvedValue({ id: 'sess-1', groupId: 'whatever' });
  ds.scheduleSession24hReminders.mockResolvedValue(undefined);
  ds.notifyGroup.mockResolvedValue(undefined);
  ds.searchPartners.mockResolvedValue([
    { id: 'u1', name: 'Ada Lovelace', major: 'CS' },
    { id: 'u2', name: 'Grace Hopper', major: 'CS' },
  ] as any);
  ds.inviteToGroup.mockResolvedValue(true);
  ds.createNotification.mockResolvedValue(true);

  // NEW defaults for new methods
  ds.updateGroup.mockResolvedValue(undefined);
  ds.getGroupMembers.mockResolvedValue([]);

  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {}); // silence alerts in tests
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Groups page', () => {
  test('loads groups (owner & non-owner), renders header + cards', async () => {
    render(<Groups />);

    expect(screen.getByText(/Loading study groups/i)).toBeInTheDocument();
    await screen.findByRole('heading', { name: /Study Groups/i });

    expect(screen.getByRole('heading', { name: ownerName })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: otherName })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demo Local' })).toBeInTheDocument();

    const ownerCard = findCard(ownerName);
    expect(within(ownerCard).getByText('Owner')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Invite members')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Delete group')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Open chat')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Schedule a session')).toBeInTheDocument();

    const otherCard = findCard(otherName);
    expect(within(otherCard).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
  });

  test('fallback path: when both APIs fail we render demo groups and mark (demo data)', async () => {
    ds.fetchMyGroups.mockRejectedValueOnce(new Error('boom'));
    ds.fetchGroupsRaw.mockRejectedValueOnce(new Error('nope'));

    render(<Groups />);
    await screen.findByText(/demo data/i);

    expect(await screen.findByText(/CS Advanced Study Group/i)).toBeInTheDocument();
  });

  test('join group (real id): optimistic + rollback when API returns false', async () => {
    ds.joinGroup.mockResolvedValueOnce(false);

    render(<Groups />);
    const otherCard = await waitFor(() => findCard(otherName));
    const membersLine = within(otherCard).getByText(/members/i);
    const btn = within(otherCard).getByRole('button', { name: /Join Group/i });

    const before = membersLine.textContent!;
    await userEvent.click(btn);

    await waitFor(() => {
      expect(membersLine.textContent).not.toBe(before);
    });

    await waitFor(() => {
      expect(within(otherCard).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
    });
  });

  test('join group (demo local without real id): completes locally (no API calls)', async () => {
    render(<Groups />);
    const demo = await waitFor(() => findCard('Demo Local'));
    const members = within(demo).getByText(/members/i);
    const before = members.textContent!;
    const btn = within(demo).getByRole('button', { name: /Join Group/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(members.textContent).not.toBe(before);
    });
  });

  test('leave group (real id): optimistic decrement + rollback when API returns false', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({ name: ownerName, createdBy: '1', members: [{ userId: '1', role: 'owner' }] }),
      mkSrvGroup({
        name: otherName,
        createdBy: '2',
        members: [
          { userId: '2', role: 'owner' },
          { userId: '1', role: 'member' },
        ],
        maxMembers: 10,
      }),
    ]);

    ds.leaveGroup.mockResolvedValueOnce(false);

    render(<Groups />);
    const other = await waitFor(() => findCard(otherName));

    const leaveBtn = within(other).getByRole('button', { name: /Leave Group/i });
    const members = within(other).getByText(/members/i);
    const before = members.textContent!;
    await userEvent.click(leaveBtn);

    await waitFor(() => {
      expect(members.textContent).not.toBe(before);
    });

    await waitFor(() => {
      expect(within(other).getByRole('button', { name: /Leave Group/i })).toBeInTheDocument();
    });
  });

  test('delete group: confirm → optimistic remove → API failure reverts', async () => {
    ds.deleteGroup.mockResolvedValueOnce(false);

    render(<Groups />);
    const ownerCard = await waitFor(() => findCard(ownerName));
    const del = within(ownerCard).getByTitle('Delete group');
    await userEvent.click(del);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: ownerName })).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: ownerName })).toBeInTheDocument();
    });
  });

  test('create group: success path adds server group, then joinGroup is called, owner badge present', async () => {
    const created = mkSrvGroup({
      id: 'srv-123',
      name: 'Server Group',
      createdBy: '1',
      members: [{ userId: '1', role: 'owner' }],
    });
    ds.createGroup.mockResolvedValueOnce(created);

    render(<Groups />);

    await userEvent.click(await screen.findByRole('button', { name: /Create Group/i }));
    await screen.findByRole('heading', { name: /Create new group/i });
    await userEvent.type(screen.getByLabelText(/Group name/i), ' Server Group');
    await userEvent.click(screen.getByRole('button', { name: /Create group/i }));

    expect(await screen.findByRole('heading', { name: 'Server Group' })).toBeInTheDocument();
    const card = findCard('Server Group');
    expect(within(card).getByText('Owner')).toBeInTheDocument();

    // NEW: should auto-join on server after create
    await waitFor(() => {
      expect(ds.joinGroup).toHaveBeenCalledWith('srv-123');
    });
  });

  test('create group: optimistic fallback when API returns null', async () => {
    ds.createGroup.mockResolvedValueOnce(null);

    render(<Groups />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Group/i }));

    await screen.findByRole('heading', { name: /Create new group/i });
    await userEvent.type(screen.getByLabelText(/Group name/i), ' Local Only');
    await userEvent.click(screen.getByRole('button', { name: /Create group/i }));

    expect(await screen.findByRole('heading', { name: 'Local Only' })).toBeInTheDocument();
  });

  test('schedule session: optimistic event then API success triggers reminder + notify', async () => {
    const createdSpy = vi.fn();
    const invalidateSpy = vi.fn();
    window.addEventListener('session:created', createdSpy as EventListener);
    window.addEventListener('sessions:invalidate', invalidateSpy as EventListener);

    render(<Groups />);
    const ownerCard = await waitFor(() => findCard(ownerName));
    const scheduleBtn = within(ownerCard).getByTitle('Schedule a session');
    await userEvent.click(scheduleBtn);

    await screen.findByRole('heading', { name: /Schedule a session/i });
    await userEvent.type(screen.getByLabelText(/^Date/i), '2025-10-07');
    await userEvent.type(screen.getByLabelText(/Start time/i), '09:00');
    await userEvent.type(screen.getByLabelText(/End time/i), '10:00');
    await userEvent.type(screen.getByLabelText(/Location/i), ' Room 101');

    await userEvent.click(screen.getByRole('button', { name: /Schedule/i }));

    await waitFor(() => {
      expect(createdSpy).toHaveBeenCalled();
    });
    expect(invalidateSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(ds.scheduleSession24hReminders).toHaveBeenCalledTimes(1);
      expect(ds.notifyGroup).toHaveBeenCalledTimes(1);
    });
  });

  test('invite members modal: loads connections, select & send invites triggers invite + notifications', async () => {
    render(<Groups />);
    const ownerCard = await waitFor(() => findCard(ownerName));
    const inviteBtn = within(ownerCard).getByTitle('Invite members');
    await userEvent.click(inviteBtn);

    await screen.findByText(/Invite Members/i);
    const items = screen.getAllByRole('checkbox');
    expect(items.length).toBeGreaterThan(0);

    await userEvent.click(items[0]);
    await userEvent.click(items[1]);

    const sendBtn = screen.getByRole('button', { name: /Send Invites/i });
    await userEvent.click(sendBtn);

    await waitFor(() => {
      expect(ds.inviteToGroup).toHaveBeenCalledTimes(1);
      expect(ds.createNotification).toHaveBeenCalled();
    });

    await screen.findByRole('button', { name: /Invites sent/i });
  });

  test('broadcast groups:invalidate causes a refresh that merges groups', async () => {
    render(<Groups />);
    await screen.findByRole('heading', { name: ownerName });

    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({ name: ownerName, createdBy: '1' }),
      mkSrvGroup({ name: otherName, createdBy: '2' }),
      mkSrvGroup({ name: 'New After Broadcast', createdBy: '3' }),
    ]);

    window.dispatchEvent(new Event('groups:invalidate'));

    await screen.findByRole('heading', { name: 'New After Broadcast' });
  });

  /* ---------------------- NEW: Edit group flows ---------------------- */

  test('edit group (happy path): button visible, modal pre-fills, updateGroup + notify + refresh', async () => {
    render(<Groups />);

    const ownerCard = await waitFor(() => findCard(ownerName));
    // Edit button should be present because we mock updateGroup on DataService
    const editBtn = within(ownerCard).getByTitle('Edit group');
    await userEvent.click(editBtn);

    await screen.findByRole('heading', { name: /Edit group/i });
    const nameInput = screen.getByLabelText(/Group name/i);
    expect((nameInput as HTMLInputElement).value).toMatch(ownerName);

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, ' Renamed Group');

    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(ds.updateGroup).toHaveBeenCalledTimes(1);
    });
    // notifyGroup called after update
    await waitFor(() => {
      expect(ds.notifyGroup).toHaveBeenCalled();
    });
    // refresh kicks in (fetchMyGroups called again at least once)
    await waitFor(() => {
      expect(ds.fetchMyGroups).toHaveBeenCalledTimes(2);
    });
  });

  test('edit group (failure): shows alert and refreshes', async () => {
    ds.updateGroup.mockRejectedValueOnce(new Error('nope'));

    render(<Groups />);

    const ownerCard = await waitFor(() => findCard(ownerName));
    const editBtn = within(ownerCard).getByTitle('Edit group');
    await userEvent.click(editBtn);

    await screen.findByRole('heading', { name: /Edit group/i });
    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(ds.fetchMyGroups).toHaveBeenCalledTimes(2);
    });
  });

  /* ---------------------- NEW: Members list fetching ---------------------- */

  test('members panel: fetches via getGroupMembers and renders chips', async () => {
    // Return a third group without inline members to force fetch
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({ name: ownerName, createdBy: '1', members: [{ userId: '1', role: 'owner' }] }),
      mkSrvGroup({ name: otherName, createdBy: '2', members: [{ userId: '2', role: 'owner' }] }),
      // no members array; has backend id so idMap exists
      { id: 'g-55', name: 'Members Group', createdBy: '9', maxMembers: 6 },
    ]);

    ds.getGroupMembers.mockResolvedValueOnce([
      { userId: '9', name: 'Owner Nine', role: 'owner' },
      { userId: '1', name: 'Me', role: 'member' },
    ]);

    render(<Groups />);

    const mgCard = await screen.findByRole('heading', { name: 'Members Group' });
    const card = mgCard.closest('.p-6') as HTMLElement;

    const toggle = within(card).getByRole('button', { name: /View members/i });
    await userEvent.click(toggle);

    await screen.findByText('Owner Nine');
    await screen.findByText('Me');
    expect(ds.getGroupMembers).toHaveBeenCalledWith('g-55');
  });

  test('members panel: fetch error shows error message', async () => {
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({ name: ownerName, createdBy: '1', members: [{ userId: '1', role: 'owner' }] }),
      { id: 'g-err', name: 'Err Group', createdBy: '8', maxMembers: 3 },
    ]);
    ds.getGroupMembers.mockRejectedValueOnce(new Error('boom'));

    render(<Groups />);

    const errCard = await screen.findByRole('heading', { name: 'Err Group' });
    const card = errCard.closest('.p-6') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /View members/i }));

    await screen.findByText(/Could not load members/i);
  });

  /* ---------------------- Tiny extra: Open chat action ---------------------- */

  test('clicking Open chat uses navigate("/chat")', async () => {
    render(<Groups />);
    const ownerCard = await waitFor(() => findCard(ownerName));
    await userEvent.click(within(ownerCard).getByTitle('Open chat'));
    expect(navigateMock).toHaveBeenCalledWith('/chat');
  });
});
