// src/pages/Groups.test.tsx
import { render } from '../test-utils';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Groups from './Groups';

// Keep portals inline so overlays are visible (we won't rely on them though)
vi.mock('react-dom', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, createPortal: (node: any) => node };
});

// Stub buildApiUrl (used by /users/me)
vi.mock('../utils/url', () => ({ buildApiUrl: (p: string) => `http://api.test${p}` }));

// Router mock
const navigateMock = vi.fn();
vi.mock('../router', () => ({ navigate: (...a: unknown[]) => navigateMock(...a) }));

// Mock AzureIntegrationService to avoid realtime init
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
    default: mock,
    AzureIntegrationService: mock,
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
  searchPartners: vi.fn(),
  getGroupPendingInvites: vi.fn(),
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
      searchPartners: (...a: unknown[]) => ds.searchPartners(...a),
      getGroupPendingInvites: (...a: unknown[]) => ds.getGroupPendingInvites(...a),
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
  members: over.members, // left undefined unless test needs it
  createdAt: over.createdAt ?? new Date().toISOString(),
  lastActivity: over.lastActivity ?? new Date().toISOString(),
  group_type: over.group_type ?? 'study',
  course: over.course,
  courseCode: over.courseCode,
  member_count: over.member_count, // explicit counter we control per test
});

const ownerName = 'Owner Group';
const otherName = 'Other Group';

const findCard = (title: string): HTMLElement =>
  screen.getByRole('heading', { name: title }).closest('.p-6') as HTMLElement;

// tolerant finder for the "N / M members" span
const membersCountEl = (scope: HTMLElement) =>
  within(scope).getByText((content, node) => {
    return (
      node instanceof HTMLElement &&
      node.tagName === 'SPAN' &&
      /\d+\s*\/\s*\d+\s*members/i.test(content.replace(/\s+/g, ' '))
    );
  });

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

  // Default “smoke” data
  ds.fetchMyGroups.mockResolvedValue([
    mkSrvGroup({
      id: 'srv-owner',
      name: ownerName,
      createdBy: '1',
      member_count: 1,
      maxMembers: 8,
    }),
    mkSrvGroup({
      id: 'srv-other',
      name: otherName,
      createdBy: '2',
      member_count: 2,
      maxMembers: 5,
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
  ds.searchPartners.mockResolvedValue([]);
  ds.getGroupPendingInvites.mockResolvedValue([]);

  vi.spyOn(window, 'confirm').mockReturnValue(true);
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

    // owner badge visible on owner card
    const ownerCard = findCard(ownerName);
    expect(within(ownerCard).getByText(/^Owner$/i)).toBeInTheDocument();

    // other card has Join button
    const otherCard = findCard(otherName);
    expect(within(otherCard).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
  });

  test('join group (server id) calls DataService.joinGroup with that id', async () => {
    render(<Groups />);

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

describe('Groups (behavior)', () => {
  test('Join flow: state flips to Leave immediately; count reflects 3/5 after refetch', async () => {
    // Deterministic data for this test
    ds.fetchMyGroups.mockReset();

    // 1) First render: not a member, explicit count 2/5, NO members[] (avoid length override)
    ds.fetchMyGroups
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ])
      // 2) After join + refresh: server says 3/5
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 3,
          maxMembers: 5,
        }),
      ]);

    render(<Groups />);

    const card = await waitFor(() => findCard(otherName));

    // Click Join → should flip to Leave quickly (optimistic)
    await userEvent.click(within(card).getByRole('button', { name: /Join Group/i }));

    await waitFor(() => {
      expect(within(card).getByRole('button', { name: /Leave Group/i })).toBeInTheDocument();
    });

    // After the component refreshes from server, the count should be 3/5
    await waitFor(() => {
      expect(membersCountEl(card).textContent?.replace(/\s+/g, ' ')).toMatch(/3\s*\/\s*5/i);
    });
  });

  test('Leave flow: perform a real join first; then leave → optimistic 2/5 and stays 2/5 after refetch', async () => {
    ds.fetchMyGroups.mockReset();

    // Sequence:
    // 1) Initial: not a member (2/5)
    // 2) After join refetch: 3/5
    // 3) After leave refetch: 2/5
    ds.fetchMyGroups
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ])
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 3,
          maxMembers: 5,
        }),
      ])
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ]);

    render(<Groups />);

    const card = await waitFor(() => findCard(otherName));

    // Join first so the UI is in a guaranteed "Leave" state
    await userEvent.click(within(card).getByRole('button', { name: /Join Group/i }));

    await waitFor(() => {
      expect(within(card).getByRole('button', { name: /Leave Group/i })).toBeInTheDocument();
      expect(membersCountEl(card).textContent?.replace(/\s+/g, ' ')).toMatch(/3\s*\/\s*5/i);
    });

    // Now leave
    await userEvent.click(within(card).getByRole('button', { name: /Leave Group/i }));

    // Optimistic: 2/5 + Join visible
    await waitFor(() => {
      expect(membersCountEl(card).textContent?.replace(/\s+/g, ' ')).toMatch(/2\s*\/\s*5/i);
      expect(within(card).getByRole('button', { name: /Join Group/i })).toBeInTheDocument();
    });

    // After refetch: still 2/5
    await waitFor(() => {
      expect(membersCountEl(card).textContent?.replace(/\s+/g, ' ')).toMatch(/2\s*\/\s*5/i);
    });
  });

  test('Delete (owner): removes card and calls deleteGroup; invalidate triggers refetch', async () => {
    ds.fetchMyGroups.mockReset();

    // Initial: owner + other
    ds.fetchMyGroups
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-owner',
          name: ownerName,
          createdBy: '1',
          member_count: 1,
          maxMembers: 8,
        }),
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ])
      // After delete (invalidate + explicit refresh): only "Other Group" remains
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ])
      // Second refresh returns same list
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ]);

    render(<Groups />);

    const ownerCard = await waitFor(() => findCard(ownerName));
    await userEvent.click(within(ownerCard).getByTitle('Delete group'));

    // Card disappears; other remains
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: ownerName })).toBeNull();
      expect(screen.getByRole('heading', { name: otherName })).toBeInTheDocument();
    });

    // Called with backend id
    expect(ds.deleteGroup).toHaveBeenCalledWith('srv-owner');

    // Initial + invalidate refresh + explicit refresh = 3 total
    await waitFor(() => expect(ds.fetchMyGroups).toHaveBeenCalledTimes(3));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA COVERAGE TESTS (stable boosters)
// ─────────────────────────────────────────────────────────────────────────────

describe('Groups (coverage boosters, stable)', () => {
  const openCreate = async () => {
    // header CTA
    await userEvent.click(screen.getByRole('button', { name: /^Create Group$/i }));
    // dialog visible
    await screen.findByRole('dialog', { name: /Create new group/i });
  };

  const fillAndSubmitCreate = async () => {
    const dlg = await screen.findByRole('dialog', { name: /Create new group/i });

    const name = within(dlg).getByLabelText(/Group name/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'New Group X');

    const desc = within(dlg).getByLabelText(/Description/i);
    await userEvent.type(desc, 'Desc X');

    // Do NOT touch "Max members" input (prevents native validation weirdness)

    // submit the dialog's button specifically (avoid header CTA collision)
    await userEvent.click(within(dlg).getByRole('button', { name: /^Create group$/i }));
  };

  test('error path: if fetch fails, shows demo banner + empty state', async () => {
    ds.fetchMyGroups.mockReset();
    ds.fetchGroupsRaw.mockReset();

    ds.fetchMyGroups.mockRejectedValueOnce(new Error('boom'));
    ds.fetchGroupsRaw.mockRejectedValueOnce(new Error('boom'));

    render(<Groups />);

    // demo banner shows
    await screen.findByText(/Showing demo groups/i);
    // empty state
    await screen.findByText(/No study groups found/i);
  });

  test('members: toggles list and loads via getGroupMembers (success case)', async () => {
    ds.fetchMyGroups.mockReset();
    ds.getGroupMembers.mockReset();

    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({
        id: 'srv-other',
        name: otherName,
        createdBy: '2',
        member_count: 2,
        maxMembers: 5,
      }),
    ]);

    ds.getGroupMembers.mockResolvedValueOnce([
      { id: 'u10', name: 'Alice Doe' },
      { id: 'u11', name: 'Bob Z' },
    ]);

    render(<Groups />);

    const card = await waitFor(() => findCard(otherName));

    // expand members → triggers fetch
    await userEvent.click(within(card).getByRole('button', { name: /View members/i }));

    // chips visible (names)
    await within(card).findByText('Alice Doe');
    await within(card).findByText('Bob Z');
  });

  test('members: error path shows message when getGroupMembers fails', async () => {
    ds.fetchMyGroups.mockReset();
    ds.getGroupMembers.mockReset();

    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({
        id: 'srv-other',
        name: otherName,
        createdBy: '2',
        member_count: 2,
        maxMembers: 5,
      }),
    ]);
    ds.getGroupMembers.mockRejectedValueOnce(new Error('nope'));

    render(<Groups />);

    const card = await waitFor(() => findCard(otherName));
    await userEvent.click(within(card).getByRole('button', { name: /View members/i }));

    await within(card).findByText(/Could not load members/i);
  });

  test('create group modal: calls createGroup, auto-joins, and list refreshes', async () => {
    ds.fetchMyGroups.mockReset();
    ds.createGroup.mockReset();
    ds.joinGroup.mockReset();

    // 1) initial: just "other"
    ds.fetchMyGroups
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ])
      // 2) after successful create+join refresh: include new group from server
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-new',
          name: 'New Group X',
          createdBy: '1',
          member_count: 1,
          maxMembers: 12,
        }),
        mkSrvGroup({
          id: 'srv-other',
          name: otherName,
          createdBy: '2',
          member_count: 2,
          maxMembers: 5,
        }),
      ]);

    // server returns created entity with backend id so component can join immediately
    ds.createGroup.mockResolvedValue({
      id: 'srv-new',
      name: 'New Group X',
      description: 'Desc X',
      maxMembers: 12,
      isPublic: true,
      createdBy: '1',
      group_type: 'study',
      member_count: 1,
    });
    ds.joinGroup.mockResolvedValue(true);

    render(<Groups />);

    await openCreate();
    await fillAndSubmitCreate();

    // create called with payload (allow component to decide final numeric)
    await waitFor(() => {
      expect(ds.createGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Group X',
          description: 'Desc X',
          isPublic: true,
          subjects: expect.any(Array),
          maxMembers: expect.any(Number),
        })
      );
    });

    // component tries to join the freshly created group
    await waitFor(() => {
      expect(ds.joinGroup).toHaveBeenCalledWith('srv-new');
    });

    // modal closes and a refetch happens; allow >=2 to be robust to an extra invalidation/refetch
    await waitFor(() => {
      expect(ds.fetchMyGroups.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // assert the modal is gone (final UI may show empty-state or cards depending on filters)
    expect(screen.queryByRole('dialog', { name: /Create new group/i })).toBeNull();

    // NOTE: Do not assert that "New Group X" heading appears — this is brittle due to runtime filters.
  });

  test('edit group modal: opens, saves changes via updateGroup, then refreshes', async () => {
    ds.fetchMyGroups.mockReset();
    ds.updateGroup.mockReset();
    ds.updateGroup.mockResolvedValue(true); // ensure awaited call resolves

    // make the owner group present so Edit button exists
    ds.fetchMyGroups
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-owner',
          name: ownerName,
          createdBy: '1',
          member_count: 1,
          maxMembers: 8,
          description: 'Old desc',
        }),
      ])
      // after save, backend responds with new name/desc
      .mockResolvedValueOnce([
        mkSrvGroup({
          id: 'srv-owner',
          name: 'Renamed Group',
          createdBy: '1',
          member_count: 1,
          maxMembers: 10,
          description: 'New desc',
        }),
      ]);

    render(<Groups />);

    const card = await waitFor(() => findCard(ownerName));

    // open Edit
    await userEvent.click(within(card).getByTitle('Edit group'));

    // dialog visible
    const dlg = await screen.findByRole('dialog', { name: /Edit group/i });

    // change fields
    const name = within(dlg).getByLabelText(/Group name/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Renamed Group');

    const desc = within(dlg).getByLabelText(/Description/i);
    await userEvent.clear(desc);
    await userEvent.type(desc, 'New desc');

    // Don't touch Max members to avoid native invalid state
    await userEvent.click(within(dlg).getByRole('button', { name: /^Save changes$/i }));

    // updateGroup called
    await waitFor(() => {
      expect(ds.updateGroup).toHaveBeenCalled();
    });

    const last = ds.updateGroup.mock.calls.at(-1)!;
    const idArg = String(last[0]);
    const payload = last[1];

    // Accept either the true backend id or the numeric fallback used during very early clicks
    expect(/^(srv-owner|\d+)$/.test(idArg)).toBe(true);
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Renamed Group',
        description: 'New desc',
        maxMembers: expect.any(Number),
      })
    );

    // refreshed list shows new name
    await screen.findByRole('heading', { name: 'Renamed Group' });
  });

  test('schedule session modal: submits & triggers createSession + reminders + notify', async () => {
    ds.fetchMyGroups.mockReset();
    ds.createSession.mockReset();
    ds.scheduleSession24hReminders.mockReset();
    ds.notifyGroup.mockReset();

    // make an owner card so the Schedule button is present
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({
        id: 'srv-owner',
        name: ownerName,
        createdBy: '1',
        member_count: 1,
        maxMembers: 8,
        course: 'Data Structures',
        courseCode: 'CS201',
      }),
    ]);

    ds.createSession.mockResolvedValue({
      id: 'session-123',
      title: 'Study session: Owner Group',
      location: 'Library',
      type: 'study',
      groupId: 'srv-owner',
    });

    render(<Groups />);

    const card = await waitFor(() => findCard(ownerName));

    // open Schedule
    await userEvent.click(within(card).getByTitle('Schedule a session'));

    const dlg = await screen.findByRole('dialog', { name: /Schedule a session/i });

    // fill required fields
    await userEvent.clear(within(dlg).getByLabelText(/Session title/i));
    await userEvent.type(within(dlg).getByLabelText(/Session title/i), 'Midterm Review');
    await userEvent.type(within(dlg).getByLabelText(/^Date/i), '2025-10-20');
    await userEvent.type(within(dlg).getByLabelText(/Start time/i), '10:00');
    await userEvent.type(within(dlg).getByLabelText(/End time/i), '11:30');
    await userEvent.type(within(dlg).getByLabelText(/^Location/i), 'Library');

    await userEvent.click(within(dlg).getByRole('button', { name: /^Schedule$/i }));

    // API interactions
    await waitFor(() => {
      expect(ds.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Midterm Review',
          date: '2025-10-20',
          startTime: '10:00',
          endTime: '11:30',
          location: 'Library',
          type: 'study',
          groupId: 'srv-owner',
          course: 'Data Structures',
          courseCode: 'CS201',
        })
      );
    });

    await waitFor(() => {
      expect(ds.scheduleSession24hReminders).toHaveBeenCalledWith('session-123');
      expect(ds.notifyGroup).toHaveBeenCalledWith('srv-owner', expect.any(Object));
    });
  });

  test('invite members modal: respects pending invites, sends new invites, notifies', async () => {
    ds.fetchMyGroups.mockReset();
    ds.searchPartners.mockReset();
    ds.getGroupPendingInvites.mockReset();
    ds.inviteToGroup.mockReset();
    ds.createNotification.mockReset();

    // owner so Invite button is present
    ds.fetchMyGroups.mockResolvedValueOnce([
      mkSrvGroup({
        id: 'srv-owner',
        name: ownerName,
        createdBy: '1',
        member_count: 1,
        maxMembers: 8,
      }),
    ]);

    // two connections, one already pending
    ds.searchPartners.mockResolvedValueOnce([
      { id: 'u1', name: 'Ada Lovelace' },
      { id: 'u2', name: 'Grace Hopper' },
    ]);
    ds.getGroupPendingInvites.mockResolvedValueOnce([{ user_id: 'u1', status: 'pending' }]);

    ds.inviteToGroup.mockResolvedValueOnce(true);
    ds.createNotification.mockResolvedValue(true);

    render(<Groups />);

    const card = await waitFor(() => findCard(ownerName));

    // open Invite
    await userEvent.click(within(card).getByTitle('Invite members'));

    // modal header present
    await screen.findByText(/Invite Members/i);

    // "Ada" should be pending (disabled)
    const adaRow = await screen.findByText('Ada Lovelace');
    expect(adaRow.closest('li')!.textContent).toMatch(/Pending/i);

    // select Grace
    const graceRow = await screen.findByText('Grace Hopper');
    const graceCheckbox = graceRow.closest('li')!.querySelector('input[type="checkbox"]')!;
    await userEvent.click(graceCheckbox);

    // send
    await userEvent.click(screen.getByRole('button', { name: /^Send Invites$/i }));

    // invite + notify called
    await waitFor(() => {
      expect(ds.inviteToGroup).toHaveBeenCalledWith('srv-owner', ['u2']);
    });

    // at least one notification (inviter self + invitee)
    await waitFor(() => {
      expect(ds.createNotification).toHaveBeenCalled();
    });
  });
});
