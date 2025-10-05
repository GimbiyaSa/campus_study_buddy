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
    },
    FALLBACK_PARTNERS: [
      { id: 'u1', name: 'Ada Lovelace', major: 'CS' } as any,
      { id: 'u2', name: 'Grace Hopper', major: 'CS' } as any,
    ],
  };
});

// Helpers to craft API-shaped groups that map cleanly through toStudyGroup()
const mkSrvGroup = (over: Partial<any> = {}) => ({
  // server/cosmos id (string) ensures idMap entry so actions use "real" id
  id: over.id ?? 'g-cosmos-' + Math.random().toString(36).slice(2),
  name: over.name ?? 'Algorithms Crew',
  description: over.description ?? 'Study hard things',
  maxMembers: over.maxMembers ?? 8,
  isPublic: over.isPublic ?? true,
  createdBy: over.createdBy ?? '1', // owner user id
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
    mkSrvGroup({ name: ownerName, createdBy: '1', members: [{ userId: '1', role: 'owner' }], course: 'Data Structures', courseCode: 'CS201' }),
    mkSrvGroup({ name: otherName, createdBy: '2', members: [{ userId: '2', role: 'owner' }], maxMembers: 10 }),
    // demo-like: no `id` field → no idMap entry; shows "fallback" join/leave behavior
    { group_id: 777, group_name: 'Demo Local', max_members: 5, group_type: 'study', member_count: 1, creator_id: 3, module_name: 'GEN 101 - General', is_active: true },
  ]);

  // raw fallback not used unless fetchMyGroups throws
  ds.fetchGroupsRaw.mockResolvedValue([]);

  // sensible defaults for actions
  ds.joinGroup.mockResolvedValue(true);
  ds.leaveGroup.mockResolvedValue(true);
  ds.deleteGroup.mockResolvedValue(true);
  ds.createGroup.mockResolvedValue(null);       // force optimistic by default
  ds.createSession.mockResolvedValue({ id: 'sess-1', groupId: 'whatever' });
  ds.scheduleSession24hReminders.mockResolvedValue(undefined);
  ds.notifyGroup.mockResolvedValue(undefined);
  ds.searchPartners.mockResolvedValue([
    { id: 'u1', name: 'Ada Lovelace', major: 'CS' },
    { id: 'u2', name: 'Grace Hopper', major: 'CS' },
  ] as any);
  ds.inviteToGroup.mockResolvedValue(true);
  ds.createNotification.mockResolvedValue(true);

  // confirm() default to true; tests can override
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Groups page', () => {
  test('loads groups (owner & non-owner), renders header + cards', async () => {
    render(<Groups />);

    // Loading then header
    expect(screen.getByText(/Loading study groups/i)).toBeInTheDocument();
    await screen.findByRole('heading', { name: /Study Groups/i });

    // Cards appear
    expect(screen.getByRole('heading', { name: ownerName })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: otherName })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demo Local' })).toBeInTheDocument();

    // Owner badge & owner actions visible only for the owner card
    const ownerCard = findCard(ownerName);
    expect(within(ownerCard).getByText('Owner')).toBeInTheDocument();
    // buttons with tooltips (title attr)
    expect(within(ownerCard).getByTitle('Invite members')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Delete group')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Open chat')).toBeInTheDocument();
    expect(within(ownerCard).getByTitle('Schedule a session')).toBeInTheDocument();

    // Non owner card presents Join/Leave (initially Join since we aren't a member)
    const otherCard = findCard(otherName);
    expect(within(otherCard).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
  });

  test('fallback path: when both APIs fail we render demo groups and mark (demo data)', async () => {
    ds.fetchMyGroups.mockRejectedValueOnce(new Error('boom'));
    ds.fetchGroupsRaw.mockRejectedValueOnce(new Error('nope'));

    render(<Groups />);
    await screen.findByText(/demo data/i); // marker in subtitle when usingFallback

    // some fallback names present
    expect(await screen.findByText(/CS Advanced Study Group/i)).toBeInTheDocument();
  });

  test('join group (real id): optimistic + rollback when API returns false', async () => {
    ds.joinGroup.mockResolvedValueOnce(false); // trigger rollback

    render(<Groups />);
    const otherCard = await waitFor(() => findCard(otherName));

    const membersLine = within(otherCard).getByText(/members/i);
    const btn = within(otherCard).getByRole('button', { name: /Join Group/i });

    // capture initial count
    const before = membersLine.textContent!;
    await userEvent.click(btn);

    // optimistic: count bumps and button shows Joining…
    await waitFor(() => {
      expect(membersLine.textContent).not.toBe(before);
    });

    // rollback: count returns & join button visible again
    await waitFor(() => {
      expect(within(otherCard).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
    });
  });

  test('join group (demo local without real id): completes locally (no API calls), clears progress soon', async () => {
    render(<Groups />);
    const demo = await waitFor(() => findCard('Demo Local'));
    const members = within(demo).getByText(/members/i);
    const before = members.textContent!;
    const btn = within(demo).getByRole('button', { name: /Join Group/i });
    await userEvent.click(btn);

    // optimistic: count increments; button may switch to Leave Group
    await waitFor(() => {
      expect(members.textContent).not.toBe(before);
    });
  });

  test('leave group (real id): optimistic decrement + rollback when API returns false', async () => {
    // Make "other" pretend already joined (by returning members including me)
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({ name: ownerName, createdBy: '1', members: [{ userId: '1', role: 'owner' }] }),
      mkSrvGroup({ name: otherName, createdBy: '2', members: [{ userId: '2', role: 'owner' }, { userId: '1', role: 'member' }], maxMembers: 10 }),
    ]);

    ds.leaveGroup.mockResolvedValueOnce(false); // force rollback

    render(<Groups />);
    const other = await waitFor(() => findCard(otherName));

    // should show Leave
    const leaveBtn = within(other).getByRole('button', { name: /Leave Group/i });
    const members = within(other).getByText(/members/i);
    const before = members.textContent!;
    await userEvent.click(leaveBtn);

    // optimistic decrement
    await waitFor(() => {
      expect(members.textContent).not.toBe(before);
    });

    // rollback -> Leave appears again
    await waitFor(() => {
      expect(within(other).getByRole('button', { name: /Leave Group/i })).toBeInTheDocument();
    });
  });

  test('delete group: confirm → optimistic remove → API failure reverts', async () => {
    ds.deleteGroup.mockResolvedValueOnce(false); // fail to force revert

    render(<Groups />);
    const ownerCard = await waitFor(() => findCard(ownerName));
    const del = within(ownerCard).getByTitle('Delete group');
    await userEvent.click(del);

    // owner card temporarily gone
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: ownerName })).not.toBeInTheDocument();
    });

    // revert after failure
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: ownerName })).toBeInTheDocument();
    });
  });

  test('create group: success path adds server group, then refresh merges & owner badge present', async () => {
    const serverCreated = mkSrvGroup({ name: 'Server Group', createdBy: '1', members: [{ userId: '1', role: 'owner' }] });
    ds.createGroup.mockResolvedValueOnce(serverCreated);

    render(<Groups />);

    await screen.findByRole('button', { name: /Create Group/i });
    await userEvent.click(screen.getByRole('button', { name: /Create Group/i }));

    await screen.findByRole('heading', { name: /Create new group/i });
    await userEvent.type(screen.getByLabelText(/Group name/i), ' Server Group');
    await userEvent.click(screen.getByRole('button', { name: /Create group/i }));

    // card appears
    expect(await screen.findByRole('heading', { name: 'Server Group' })).toBeInTheDocument();
    const card = findCard('Server Group');
    expect(within(card).getByText('Owner')).toBeInTheDocument();
  });

  test('create group: optimistic fallback when API returns null', async () => {
    ds.createGroup.mockResolvedValueOnce(null); // keep default

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

    // Modal opens with default title incorporating group name
    await screen.findByRole('heading', { name: /Schedule a session/i });
    const titleInput = screen.getByLabelText(/Session title/i) as HTMLInputElement;
    expect(titleInput.value).toMatch(new RegExp(`Study session: ${ownerName}`));

    await userEvent.type(screen.getByLabelText(/^Date/i), '2025-10-07');
    await userEvent.type(screen.getByLabelText(/Start time/i), '09:00');
    await userEvent.type(screen.getByLabelText(/End time/i), '10:00');
    await userEvent.type(screen.getByLabelText(/Location/i), ' Room 101');

    await userEvent.click(screen.getByRole('button', { name: /Schedule/i }));

    // We dispatch optimistic "session:created" immediately, then again after API success re-broadcast
    await waitFor(() => {
      expect(createdSpy).toHaveBeenCalled();
    });
    // Also invalidation fired at least once
    expect(invalidateSpy).toHaveBeenCalled();

    // API calls for reminder + notify
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

    // Connections list shown
    await screen.findByText(/Invite Members/i);
    const items = screen.getAllByRole('checkbox');
    expect(items.length).toBeGreaterThan(0);

    // pick both
    await userEvent.click(items[0]);
    await userEvent.click(items[1]);

    const sendBtn = screen.getByRole('button', { name: /Send Invites/i });
    await userEvent.click(sendBtn);

    await waitFor(() => {
      expect(ds.inviteToGroup).toHaveBeenCalledTimes(1);
      // one notification to inviter + one per invitee (2)
      expect(ds.createNotification).toHaveBeenCalled();
    });

    // Button text changes to "Invites sent"
    await screen.findByRole('button', { name: /Invites sent/i });
  });

  test('broadcast groups:invalidate causes a refresh that merges groups', async () => {
    render(<Groups />);
    await screen.findByRole('heading', { name: ownerName });

    // Next refresh returns an extra group
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({ name: ownerName, createdBy: '1' }),
      mkSrvGroup({ name: otherName, createdBy: '2' }),
      mkSrvGroup({ name: 'New After Broadcast', createdBy: '3' }),
    ]);

    window.dispatchEvent(new Event('groups:invalidate'));

    await screen.findByRole('heading', { name: 'New After Broadcast' });
  });
});
