import { useState, useEffect, useId, useLayoutEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Users, Plus, MessageSquare, Calendar, Trash2, X, Pencil } from 'lucide-react';
import { buildApiUrl } from '../utils/url';
import { DataService, FALLBACK_PARTNERS, type StudyPartner } from '../services/dataService';
import { navigate } from '../router';

type StudyGroup = {
  group_id: number;
  group_name: string;
  description?: string;
  creator_id: string;
  module_id: number;
  max_members: number;
  group_type: 'study' | 'project' | 'exam_prep' | 'discussion';
  group_goals?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
  module_name?: string;
  creator_name?: string;
  // optional passthroughs
  members?: Array<any>;
  isOwner?: boolean;
  /** NEW: if backend says you're invited */
  isInvited?: boolean;
  /** Stable backend id (string) for state keys and API calls */
  _backendId?: string;
};

export default function Groups() {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openCreate, setOpenCreate] = useState(false);
  const [openInvite, setOpenInvite] = useState<{ open: boolean; groupId?: string }>({
    open: false,
  });

  // NEW: edit modal state
  const [openEdit, setOpenEdit] = useState<{
    open: boolean;
    backendId?: string; // /api id for this group
    groupLocalId?: number;
    defaults?: Partial<{
      name: string;
      description: string;
      maxMembers: number;
      isPublic: boolean;
    }>;
  }>({ open: false });

  const [connections, setConnections] = useState<StudyPartner[]>([]);
  const [connLoading, setConnLoading] = useState(false);

  const [meId, setMeId] = useState<string>('');
  // owners keyed by backend id
  const [owners, setOwners] = useState<Record<string, string>>({});
  // local numeric → backend id (kept for compatibility)
  const [idMap, setIdMap] = useState<Record<number, string>>({});

  // join/leave UI state (by local numeric for spinners only)
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<'join' | 'leave' | null>(null);
  // membership keyed by backend id (stable)
  const [joinedByMe, setJoinedByMe] = useState<Record<string, boolean>>({});

  // invite accept/decline UI state (local numeric for spinners only)
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [respondingAction, setRespondingAction] = useState<'accept' | 'decline' | null>(null);

  // schedule-session modal state
  const [openSchedule, setOpenSchedule] = useState<{
    open: boolean;
    groupId?: string; // backend id
    groupLocalId?: number;
    groupName?: string;
    course?: string;
    courseCode?: string;
  }>({ open: false });

  // members UI state
  const [expandedMembers, setExpandedMembers] = useState<Record<number, boolean>>({});
  // members keyed by backend id (stable)
  const [membersByGroup, setMembersByGroup] = useState<Record<string, any[]>>({});
  const [membersLoading, setMembersLoading] = useState<Record<string, boolean>>({});
  const [membersError, setMembersError] = useState<Record<string, string | null>>({});

  // ---- headers consistent with DataService ----
  function authHeadersJSON(): Headers {
    const h = new Headers();
    h.set('Content-Type', 'application/json');

    const googleToken =
      typeof window !== 'undefined' ? localStorage.getItem('google_id_token') : null;
    const generalToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const raw = googleToken || generalToken;

    if (raw) {
      let t = raw;
      try {
        const p = JSON.parse(raw);
        if (typeof p === 'string') t = p;
      } catch {}
      t = t
        .replace(/^["']|["']$/g, '')
        .replace(/^Bearer\s+/i, '')
        .trim();
      if (t) h.set('Authorization', `Bearer ${t}`);
    }
    return h;
  }

  // --- safe group notifier (feature-detected) ---
  async function notifyGroupSafe(
    groupId: string,
    payload: {
      title: string;
      message: string;
      notification_type?: string;
      metadata?: Record<string, any>;
    }
  ) {
    if (!groupId) return;
    const fn = (DataService as any)?.notifyGroup;
    if (typeof fn !== 'function') return;
    const { title, message, metadata, notification_type } = payload;
    try {
      await fn(groupId, {
        notification_type: notification_type || 'message',
        title,
        message,
        metadata: metadata || {},
      });
    } catch (e) {
      console.warn('notifyGroupSafe failed (non-fatal)', e);
    }
  }

  const canEditGroup = typeof (DataService as any)?.updateGroup === 'function';

  // --- broadcast helpers so other views can react in real-time ---
  function broadcastGroupCreated(group: any) {
    try {
      const detail = { type: 'group.created', group, ts: Date.now() };
      window.dispatchEvent(new CustomEvent('groups:invalidate', { detail }));
      // @ts-ignore
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('studybuddy-events');
        bc.postMessage(detail);
        bc.close();
      }
    } catch {}
  }

  function broadcastSessionCreated(session: any) {
    try {
      window.dispatchEvent(new CustomEvent('session:created', { detail: session }));
      window.dispatchEvent(new Event('sessions:invalidate'));
      // @ts-ignore
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('studybuddy-events');
        bc.postMessage({ type: 'session.created', session, ts: Date.now() });
        bc.close();
      }
    } catch {}
  }

  function stableHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    h = Math.abs(h);
    return h || 1;
  }

  // map API → local card shape; capture owner + backend id + my membership
  function toStudyGroup(g: any): StudyGroup {
    const backendId = String(g?.id ?? g?.group_id ?? g?.uuid ?? g?._id ?? '');
    const localNumeric = Number.isFinite(g?.group_id)
      ? Number(g.group_id)
      : backendId
      ? stableHash(backendId)
      : stableHash(String(g?.name ?? '') + String(g?.createdAt ?? ''));

    const createdBy =
      g?.createdBy != null
        ? String(g.createdBy)
        : g?.creator_id != null
        ? String(g.creator_id)
        : '';

    // keep owner map fresh in case backend transfers ownership (key by backendId)
    if (backendId) {
      setOwners((prev) =>
        prev[backendId] === createdBy ? prev : { ...prev, [backendId]: createdBy }
      );
    }

    // map local numeric → backend id for legacy lookups
    if (backendId) {
      setIdMap((prev) => (prev[localNumeric] ? prev : { ...prev, [localNumeric]: backendId }));
    }

    // membership hint from API if available (key by backendId)
    if (backendId && Array.isArray(g?.members) && meId) {
      const iAmIn = g.members.some(
        (m: any) => String(m?.userId ?? m?.id ?? m?.user_id) === String(meId)
      );
      setJoinedByMe((prev) =>
        prev[backendId] === undefined ? { ...prev, [backendId]: iAmIn } : prev
      );
    } else if (backendId && createdBy && meId && String(createdBy) === String(meId)) {
      setJoinedByMe((prev) =>
        prev[backendId] === undefined ? { ...prev, [backendId]: true } : prev
      );
    }

    const membersCount = Array.isArray(g?.members)
      ? g.members.length
      : typeof g?.member_count === 'number'
      ? g.member_count
      : undefined;
    const createdAt = g?.createdAt || g?.created_at || new Date().toISOString();
    const updatedAt = g?.lastActivity || g?.updated_at || createdAt;

    const course = g?.course ?? '';
    const courseCode = g?.courseCode ?? '';
    const moduleName =
      course || courseCode
        ? [courseCode, course].filter(Boolean).join(' - ')
        : g?.module_name ?? undefined;

    const base: any = {
      group_id: localNumeric,
      group_name: g?.name ?? g?.group_name ?? 'Untitled group',
      description: g?.description ?? '',
      creator_id: createdBy, // normalized to string
      module_id: Number.isFinite(g?.module_id) ? g.module_id : 0,
      max_members: Number.isFinite(g?.maxMembers) ? g.maxMembers : g?.max_members ?? 10,
      group_type: (g?.group_type ?? 'study') as StudyGroup['group_type'],
      group_goals: g?.group_goals,
      is_active: g?.is_active ?? true,
      created_at: createdAt,
      updated_at: updatedAt,
      member_count: membersCount,
      module_name: moduleName,
      creator_name: g?.createdByName || g?.creator_name,
      _backendId: backendId,
    };
    if (typeof g?.isOwner === 'boolean') base.isOwner = !!g.isOwner;
    if (Array.isArray(g?.members)) base.members = g.members;

    // If I'm the creator, reflect membership immediately
    if (backendId && meId && String(createdBy || '') === String(meId)) {
      base.member_count = Math.max(1, Number(base.member_count || 0));
      setJoinedByMe((prev) =>
        prev[backendId] === undefined ? { ...prev, [backendId]: true } : prev
      );
    }
    if (typeof g?.isInvited === 'boolean') (base as any).isInvited = !!g.isInvited;

    return base as StudyGroup;
  }

  function isOwner(group: StudyGroup): boolean {
    if (!meId) return false;
    if ((group as any).isOwner === true) return true;
    const backendId = (group as any)._backendId as string | undefined;
    if (backendId) {
      const ownerId = owners[backendId];
      if (ownerId && String(ownerId) === String(meId)) return true;
    }
    const ownerIdFallback = group.creator_id != null ? String(group.creator_id) : '';
    if (ownerIdFallback && String(ownerIdFallback) === String(meId)) return true;

    const m = (group as any).members;
    if (Array.isArray(m)) {
      const mine = m.find((x: any) => String(x?.userId ?? x?.id ?? x?.user_id) === String(meId));
      if (mine) {
        const role = String(mine.role || '').toLowerCase();
        if (role === 'owner' || role === 'admin') return true;
      }
    }
    return false;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(buildApiUrl('/api/v1/users/me'), {
          headers: authHeadersJSON(),
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const id =
            data?.user_id != null ? String(data.user_id) : data?.id != null ? String(data.id) : '';
          if (mounted) setMeId(id);
        } else {
          if (mounted) setMeId('');
        }
      } catch {
        if (mounted) setMeId('');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // once meId is known, refresh so server hints can mark membership/ownership
  useEffect(() => {
    if (meId) {
      refreshGroups();
    }
  }, [meId]);

  // listen for broadcasted changes (created elsewhere)
  useEffect(() => {
    const onInv = () => {
      refreshGroups();
    };
    window.addEventListener('groups:invalidate', onInv);
    // @ts-ignore
    const hasBC = 'BroadcastChannel' in window;
    // @ts-ignore
    const bc = hasBC ? new BroadcastChannel('studybuddy-events') : null;
    if (bc) {
      bc.onmessage = (ev: MessageEvent) => {
        if (ev?.data?.type === 'group.created') refreshGroups();
      };
    }
    return () => {
      window.removeEventListener('groups:invalidate', onInv);
      if (bc) bc.close();
    };
  }, []);

  async function loadConnections() {
    if (connLoading || connections.length > 0) return;
    setConnLoading(true);
    try {
      const list = await DataService.searchPartners();
      setConnections(Array.isArray(list) && list.length > 0 ? list : FALLBACK_PARTNERS);
    } catch {
      setConnections(FALLBACK_PARTNERS);
    } finally {
      setConnLoading(false);
    }
  }

  async function refreshGroups(): Promise<boolean> {
    try {
      let allGroups: any[] = [];

      // Always get all available groups first
      try {
        allGroups = await DataService.fetchGroupsRaw();
      } catch (err) {
        console.error('Failed to fetch all groups:', err);
        return false;
      }

      // Then try to get user's joined groups specifically
      let myGroupIds: Set<string> = new Set();
      try {
        const myGroups = await DataService.fetchMyGroups();
        myGroupIds = new Set(
          myGroups.map((g: any) => String(g?.id ?? g?.group_id ?? '')).filter(Boolean)
        );
      } catch (err) {
        console.warn('⚠️ Could not fetch user groups:', err);
      }

      const mapped = (Array.isArray(allGroups) ? allGroups : []).map((g: any) => toStudyGroup(g));
      setGroups(mapped);

      // Set joinedByMe state based on actual membership
      const newJoinedByMe: Record<string, boolean> = {};
      mapped.forEach((group) => {
        const backendId = (group as any)._backendId as string | undefined;
        if (backendId) {
          newJoinedByMe[backendId] = myGroupIds.has(backendId);
        }
      });

      setJoinedByMe(newJoinedByMe);

      setError(null);
      return true;
    } catch {
      setGroups([]);
      setError('Showing demo groups');
      return false;
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    refreshGroups().finally(() => setLoading(false));
  }, []);

  // Auto-load members for groups only when member list is expanded
  useEffect(() => {
    // Only load members when a group is expanded and members haven't been loaded yet
    const expandedGroupIds = Object.keys(expandedMembers).filter(
      (id) => expandedMembers[Number(id)]
    );

    if (expandedGroupIds.length > 0 && typeof membersFn === 'function') {
      expandedGroupIds.forEach(async (groupIdStr) => {
        const groupId = Number(groupIdStr);
        const group = groups.find((g) => g.group_id === groupId);
        const backendId = (group as any)?._backendId as string | undefined;

        if (backendId && !membersByGroup[backendId] && !membersLoading[backendId]) {
          await loadMembersFor(group!);
        }
      });
    }
  }, [expandedMembers, groups.length]); // React to expansion changes

  // --- members fetcher (feature-detected) ---
  const membersFn =
    typeof DataService.getGroupMembers === 'function'
      ? (groupId: string) => DataService.getGroupMembers(groupId)
      : null;

  // --- optional invite endpoints (feature-detected) ---
  const acceptInviteFn =
    (DataService as any)?.acceptGroupInvite ||
    (DataService as any)?.acceptInvitation ||
    (DataService as any)?.groupsAcceptInvite;

  const declineInviteFn =
    (DataService as any)?.declineGroupInvite ||
    (DataService as any)?.declineInvitation ||
    (DataService as any)?.groupsDeclineInvite;

  function backendIdForLocal(localId: number): string | null {
    const viaMap = idMap[localId];
    if (viaMap) return viaMap;
    const g = groups.find((x) => x.group_id === localId);
    const bid = (g as any)?._backendId as string | undefined;
    return bid || null;
  }

  async function loadMembersFor(group: StudyGroup) {
    const backendId = (group as any)._backendId as string | undefined;
    if (!backendId || typeof membersFn !== 'function') {
      return;
    }

    setMembersLoading((p) => ({ ...p, [backendId]: true }));
    setMembersError((p) => ({ ...p, [backendId]: null }));

    try {
      const list = await membersFn(backendId);
      const arr = Array.isArray(list) ? list : [];
      setMembersByGroup((p) => ({ ...p, [backendId]: arr }));
    } catch (e) {
      // Check if it's a network error (backend not running)
      if (e instanceof TypeError && e.message.includes('fetch')) {
        setMembersError((p) => ({ ...p, [backendId]: 'Backend server not running' }));
      } else if (
        e instanceof Error &&
        (e.message.includes('Failed to fetch') || e.message.includes('Network'))
      ) {
        setMembersError((p) => ({ ...p, [backendId]: 'Cannot connect to server' }));
      } else {
        setMembersError((p) => ({ ...p, [backendId]: 'Could not load members' }));
      }
    } finally {
      setMembersLoading((p) => ({ ...p, [backendId]: false }));
    }
  }

  const joinGroup = async (groupId: number) => {
    const realId = backendIdForLocal(groupId);
    setJoiningId(groupId);
    setPendingAction('join');

    // optimistic UI
    setGroups((prev) =>
      prev.map((g) =>
        g.group_id === groupId
          ? { ...g, member_count: (g.member_count || 0) + 1, isInvited: false as any }
          : g
      )
    );
    if (realId) setJoinedByMe((prev) => ({ ...prev, [realId]: true }));

    if (!realId) {
      setTimeout(() => {
        setJoiningId(null);
        setPendingAction(null);
      }, 400);
      return;
    }

    try {
      const ok = await DataService.joinGroup(realId);
      if (!ok) throw new Error('join failed');

      // Notify chat page about group joined
      window.dispatchEvent(
        new CustomEvent('group:joined', { detail: { groupId: realId, group_id: realId } })
      );

      // Refresh groups to get accurate member count from server
      await refreshGroups();

      // If members list is expanded, reload members. Otherwise, clear cache so they reload on next expand
      if (expandedMembers[groupId]) {
        // List is expanded - reload members immediately
        const g = groups.find((x) => x.group_id === groupId);
        if (g) await loadMembersFor(g);
      } else if (realId && membersByGroup[realId]) {
        // List is collapsed - just clear cache
        setMembersByGroup((prev) => {
          const updated = { ...prev };
          delete updated[realId];
          return updated;
        });
      }

      // re-assert membership in case of eventual consistency
      setJoinedByMe((prev) => ({ ...prev, [realId]: true }));

      // notify invite UIs (modal) that server invite state may have changed
      try {
        window.dispatchEvent(
          new CustomEvent('group.invites.changed', { detail: { groupId: realId } })
        );
      } catch {}
    } catch (err) {
      console.error('Error joining group:', err);
      // Revert optimistic update
      setGroups((prev) =>
        prev.map((g) =>
          g.group_id === groupId
            ? { ...g, member_count: Math.max((g.member_count || 0) - 1, 0) }
            : g
        )
      );
      if (realId) setJoinedByMe((prev) => ({ ...prev, [realId]: false }));
    } finally {
      setJoiningId(null);
      setPendingAction(null);
    }
  };

  const leaveGroup = async (groupId: number) => {
    const realId = backendIdForLocal(groupId);
    setJoiningId(groupId);
    setPendingAction('leave');

    // optimistic UI
    setGroups((prev) =>
      prev.map((g) =>
        g.group_id === groupId ? { ...g, member_count: Math.max((g.member_count || 0) - 1, 0) } : g
      )
    );
    if (realId) setJoinedByMe((prev) => ({ ...prev, [realId]: false }));

    if (!realId) {
      setTimeout(() => {
        setJoiningId(null);
        setPendingAction(null);
      }, 400);
      return;
    }

    try {
      const ok = await DataService.leaveGroup(realId);
      if (!ok) throw new Error('leave failed');

      // Notify chat page about group left
      window.dispatchEvent(
        new CustomEvent('group:left', { detail: { groupId: realId, group_id: realId } })
      );

      // Refresh groups to get accurate member count from server
      await refreshGroups();

      // If members list is expanded, reload members. Otherwise, clear cache so they reload on next expand
      if (expandedMembers[groupId]) {
        // List is expanded - reload members immediately
        const g = groups.find((x) => x.group_id === groupId);
        if (g) await loadMembersFor(g);
      } else if (realId && membersByGroup[realId]) {
        // List is collapsed - just clear cache
        setMembersByGroup((prev) => {
          const updated = { ...prev };
          delete updated[realId];
          return updated;
        });
      }
    } catch (err) {
      console.error('Error leaving group:', err);
      // Revert optimistic update
      setGroups((prev) =>
        prev.map((g) =>
          g.group_id === groupId ? { ...g, member_count: (g.member_count || 0) + 1 } : g
        )
      );
      if (realId) setJoinedByMe((prev) => ({ ...prev, [realId]: true }));
    } finally {
      setJoiningId(null);
      setPendingAction(null);
    }
  };

  const acceptInvite = async (groupId: number) => {
    const realId = backendIdForLocal(groupId) ?? String(groupId);
    if (typeof acceptInviteFn !== 'function') {
      return joinGroup(groupId);
    }

    setRespondingId(groupId);
    setRespondingAction('accept');

    try {
      const ok = await acceptInviteFn(realId);
      if (!ok) throw new Error('accept failed');

      // Optimistic: mark as joined
      setJoinedByMe((prev) => ({ ...prev, [realId]: true }));
      setGroups((prev) =>
        prev.map((g) =>
          g.group_id === groupId
            ? {
                ...g,
                member_count: Math.max(1, (g.member_count || 0) + 1),
                isInvited: false as any,
              }
            : g
        )
      );

      await refreshGroups();
      // Re-assert post-refresh
      setJoinedByMe((prev) => ({ ...prev, [realId]: true }));

      // notify invite UIs (modal)
      try {
        window.dispatchEvent(
          new CustomEvent('group.invites.changed', { detail: { groupId: realId } })
        );
      } catch {}
    } catch (err) {
      console.error('Error accepting invite:', err);
    } finally {
      setRespondingId(null);
      setRespondingAction(null);
    }
  };

  const declineInvite = async (groupId: number) => {
    const realId = backendIdForLocal(groupId) ?? String(groupId);
    if (typeof declineInviteFn !== 'function') {
      setGroups((prev) =>
        prev.map((g) => (g.group_id === groupId ? { ...g, isInvited: false as any } : g))
      );
      // notify invite UIs (modal)
      try {
        window.dispatchEvent(
          new CustomEvent('group.invites.changed', { detail: { groupId: realId } })
        );
      } catch {}
      return;
    }

    setRespondingId(groupId);
    setRespondingAction('decline');

    try {
      const ok = await declineInviteFn(realId);
      if (!ok) throw new Error('decline failed');

      setGroups((prev) =>
        prev.map((g) => (g.group_id === groupId ? { ...g, isInvited: false as any } : g))
      );

      await refreshGroups();

      // notify invite UIs (modal)
      try {
        window.dispatchEvent(
          new CustomEvent('group.invites.changed', { detail: { groupId: realId } })
        );
      } catch {}
    } catch (err) {
      console.error('Error declining invite:', err);
    } finally {
      setRespondingId(null);
      setRespondingAction(null);
    }
  };

  const deleteGroup = async (groupId: number) => {
    const realId = backendIdForLocal(groupId) || String(groupId);
    if (!window.confirm('Delete this group? This action cannot be undone.')) return;

    const snap = groups;
    const target = groups.find((g) => g.group_id === groupId);
    if (target) {
      await notifyGroupSafe(realId, {
        title: 'Group deleted',
        message: `“${target.group_name}” was deleted by the owner.`,
        metadata: { group_id: realId },
      });
    }

    setGroups((prev) => prev.filter((g) => g.group_id !== groupId));
    try {
      const ok = await DataService.deleteGroup(realId);
      if (!ok) throw new Error('delete failed');
      window.dispatchEvent(new Event('groups:invalidate'));
      await refreshGroups();
    } catch (err) {
      console.error('Error deleting group:', err);
      setGroups(snap);
    }
  };

  // --- create group (API-first; optimistic fallback; broadcast) ---
  const handleCreateGroup = async (form: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic?: boolean;
  }) => {
    try {
      const created = await DataService.createGroup({
        name: form.name,
        description: form.description || '',
        subjects: [],
        maxMembers: form.maxMembers ?? 8,
        isPublic: form.isPublic ?? true,
      });

      if (created) {
        const sg = toStudyGroup(created);

        try {
          const newId = String((created as any)?.id ?? (sg as any)?._backendId);
          if (newId && (DataService as any)?.joinGroup) {
            await (DataService as any).joinGroup(newId);
          }
        } catch (e) {
          console.warn('joinGroup right after create failed (non-fatal)', e);
        }

        setJoinedByMe((prev) => {
          const bid = (sg as any)?._backendId as string | undefined;
          return bid ? { ...prev, [bid]: true } : prev;
        });
        setOwners((prev) => {
          const bid = (sg as any)?._backendId as string | undefined;
          return bid ? { ...prev, [bid]: meId } : prev;
        });
        if ((created as any)?.id) {
          setIdMap((prev) => ({ ...prev, [sg.group_id]: String((created as any).id) }));
        }

        setGroups((prev) => [{ ...sg, member_count: Math.max(1, sg.member_count || 0) }, ...prev]);

        broadcastGroupCreated({ ...sg, member_count: Math.max(1, sg.member_count || 0) });

        await refreshGroups();
        return;
      }
    } catch (err) {
      console.error('Error creating group:', err);
    }

    // ---- Fallback optimistic create (no API) ----
    const localId = Date.now();
    const localGroup = toStudyGroup({
      id: String(localId),
      name: form.name,
      description: form.description || '',
      maxMembers: form.maxMembers ?? 8,
      isPublic: form.isPublic ?? true,
      createdBy: meId,
      members: [{ userId: meId, role: 'admin', joinedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      group_type: 'study',
    });

    setJoinedByMe((prev) => {
      const bid = (localGroup as any)?._backendId as string | undefined;
      return bid ? { ...prev, [bid]: true } : prev;
    });
    setOwners((prev) => {
      const bid = (localGroup as any)?._backendId as string | undefined;
      return bid ? { ...prev, [bid]: meId } : prev;
    });
    setGroups((prev) => [localGroup, ...prev]);
    broadcastGroupCreated(localGroup);
  };

  // --- schedule a session for a group ---
  const handleScheduleSession = async (
    groupCtx: {
      groupId: string; // backend id
      groupLocalId: number;
      groupName: string;
      course?: string;
      courseCode?: string;
    },
    form: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      location: string;
      description?: string;
    }
  ) => {
    if (!groupCtx.groupId) return;

    try {
      const created = await DataService.createSession({
        title: form.title,
        course: groupCtx.course,
        courseCode: groupCtx.courseCode,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location,
        type: 'study',
        groupId: groupCtx.groupId,
      });

      if (created) {
        broadcastSessionCreated({
          id: String((created as any).id ?? Date.now()),
          title: (created as any).title ?? form.title,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          location: (created as any).location ?? form.location,
          type: (created as any).type ?? 'study',
          participants: (created as any).participants ?? 1,
          status: (created as any).status ?? 'upcoming',
          isCreator: true,
          isAttending: true,
          groupId: String((created as any).groupId ?? groupCtx.groupId),
          course: (created as any).course ?? groupCtx.course,
          courseCode: (created as any).courseCode ?? groupCtx.courseCode,
        });

        const sessionId = (created as any).id;
        const whenLocal = new Date(`${form.date}T${form.startTime}`).toLocaleString();
        try {
          if (sessionId && (DataService as any)?.scheduleSession24hReminders) {
            await (DataService as any).scheduleSession24hReminders(sessionId);
          }
        } catch (e) {
          console.warn('scheduleSession24hReminders failed (non-fatal)', e);
        }
        try {
          await notifyGroupSafe(groupCtx.groupId, {
            notification_type: 'message',
            title: 'New study session',
            message: `“${form.title.trim()}” at ${whenLocal} • ${form.location.trim()}`,
            metadata: { session_id: sessionId, group_id: groupCtx.groupId },
          });
        } catch {}
      }
    } catch (err) {
      console.error('Error scheduling session:', err);
    }
  };

  // --- update group (API-first; optimistic update; notify; refresh) ---
  const handleUpdateGroup = async (
    ctx: { backendId: string; groupLocalId: number; originalName: string },
    form: { name: string; description?: string; maxMembers?: number; isPublic?: boolean }
  ) => {
    // Optimistic update in the grid
    setGroups((prev) =>
      prev.map((g) =>
        g.group_id === ctx.groupLocalId
          ? {
              ...g,
              group_name: form.name,
              description: form.description ?? g.description,
              max_members: typeof form.maxMembers === 'number' ? form.maxMembers : g.max_members,
            }
          : g
      )
    );

    try {
      const payload: any = { name: form.name };
      if ('description' in form) payload.description = form.description ?? '';
      if ('maxMembers' in form) payload.maxMembers = form.maxMembers;
      if ('isPublic' in form) payload.isPublic = form.isPublic;

      await (DataService as any).updateGroup(ctx.backendId, payload);

      await notifyGroupSafe(ctx.backendId, {
        title: 'Group updated',
        message:
          ctx.originalName !== form.name
            ? `“${ctx.originalName}” was renamed to “${form.name}”.`
            : `“${form.name}” details were updated.`,
        metadata: { group_id: ctx.backendId },
      });

      await refreshGroups();
    } catch (e) {
      console.error('Update group failed', e);
      alert('Could not update the group.');
      await refreshGroups();
    }
  };

  const getGroupTypeColor = (type: string) => {
    switch (type) {
      case 'exam_prep':
        return 'text-red-600 bg-red-100';
      case 'project':
        return 'text-blue-600 bg-blue-100';
      case 'discussion':
        return 'text-purple-600 bg-purple-100';
      default:
        return 'text-green-600 bg-green-100';
    }
  };

  // helper: derive course + code from module_name like "CS 201 - Data Structures"
  function splitModuleName(mod?: string): { courseCode?: string; course?: string } {
    if (!mod) return {};
    const parts: string[] = String(mod).split(' - ');
    if (parts.length >= 2) {
      return { courseCode: parts[0], course: parts.slice(1).join(' - ') };
    }
    return { course: mod };
  }

  // small helper to render a user chip from various API shapes
  function renderMemberChip(m: any, idx: number) {
    const name: string =
      m?.name ??
      m?.displayName ??
      m?.fullName ??
      m?.username ??
      m?.email ??
      m?.id ??
      m?.userId ??
      `User ${idx + 1}`;
    const initials = String(name)
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div
        key={`${(m?.id ?? m?.userId ?? name) as string}:${idx}`}
        className="inline-flex items-center gap-2 rounded-full bg-slate-100 text-slate-700 px-2 py-1 text-xs"
        title={name}
      >
        <span className="inline-grid place-items-center w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-semibold">
          {initials}
        </span>
        <span className="max-w-[140px] truncate">{name}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Groups</h1>
          <p className="text-gray-600">
            Join or create study groups to collaborate with peers
            {error && <span className="ml-2 text-xs text-gray-500">(demo data)</span>}
          </p>
          <div className="mt-2">
            <button
              onClick={() => navigate('/sessions')}
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              <Calendar className="h-4 w-4" />
              Go to Sessions
            </button>
          </div>
        </div>
        {groups.length > 0 && (
          <button
            onClick={() => setOpenCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
          >
            <Plus className="w-5 h-5" />
            Create Group
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2">Showing demo groups</div>
      )}

      {loading ? (
        <div className="text-center text-slate-600">Loading study groups...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.filter(Boolean).map((group) => {
            if (!group || !group.group_name || !group.group_type) return null;
            const owner = isOwner(group);
            const backendId = (group as any)._backendId as string | undefined;
            const iJoined = backendId ? !!joinedByMe[backendId] : false;

            const realId = backendId || idMap[group.group_id] || String(group.group_id);
            const coursePieces = splitModuleName(group.module_name);

            const immediateMembers =
              (group as any).members && Array.isArray((group as any).members)
                ? (group as any).members
                : backendId && Array.isArray(membersByGroup[backendId])
                ? membersByGroup[backendId]
                : [];

            // Use backend member_count as source of truth, with loaded members for display only
            const actualMemberCount = group.member_count || 0;

            const isExpanded = !!expandedMembers[group.group_id];

            return (
              <div
                key={group.group_id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{group.group_name}</h3>
                      {owner && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Owner
                        </span>
                      )}
                      {!owner && (group as any).isInvited === true && !iJoined && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          Invited
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getGroupTypeColor(
                        group.group_type
                      )} mb-3`}
                    >
                      {group.group_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                {group.description && (
                  <p className="text-gray-600 text-sm mb-4">{group.description}</p>
                )}

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>
                      {actualMemberCount}/{group.max_members} members
                    </span>
                    <button
                      onClick={async () => {
                        const next = !isExpanded;
                        setExpandedMembers((p) => ({ ...p, [group.group_id]: next }));

                        // Only load members when expanding and they're not already loaded
                        if (
                          next &&
                          backendId &&
                          typeof membersFn === 'function' &&
                          !membersByGroup[backendId]
                        ) {
                          await loadMembersFor(group);
                        }
                      }}
                      className="ml-2 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                    >
                      {isExpanded ? 'Hide members' : 'View members'}
                    </button>
                  </div>
                  {group.module_name && (
                    <div className="text-xs text-gray-500">{group.module_name}</div>
                  )}
                </div>

                {/* Members list */}
                {isExpanded && (
                  <div className="mb-4">
                    {backendId && membersLoading[backendId] ? (
                      <div className="text-xs text-gray-500">Loading members…</div>
                    ) : backendId && membersError[backendId] ? (
                      <div className="text-xs text-red-600">{membersError[backendId]}</div>
                    ) : immediateMembers.length === 0 ? (
                      <div className="text-xs text-gray-500">No members listed.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {immediateMembers.map((m: any, i: number) => renderMemberChip(m, i))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {owner ? (
                    <>
                      {/* Invite */}
                      <button
                        onClick={async () => {
                          await loadConnections();
                          if (realId) setOpenInvite({ open: true, groupId: realId });
                        }}
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Invite members"
                      >
                        <Users className="w-4 h-4" />
                      </button>

                      {/* Edit (now opens the full edit modal) */}
                      {canEditGroup && (
                        <button
                          onClick={() => {
                            if (!realId) return;
                            setOpenEdit({
                              open: true,
                              backendId: realId,
                              groupLocalId: group.group_id,
                              defaults: {
                                name: group.group_name,
                                description: group.description || '',
                                maxMembers: group.max_members ?? 8,
                                isPublic: true,
                              },
                            });
                          }}
                          className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                          title="Edit group"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete (pre-notifies members) */}
                      <button
                        onClick={() => deleteGroup(group.group_id)}
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Delete group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Open chat (only for members) */}
                      {iJoined && realId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/chat?groupId=${realId}`)}
                          className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                          title="Open group chat"
                          aria-label="Open group chat"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}

                      {/* Schedule session */}
                      <button
                        onClick={() =>
                          realId &&
                          setOpenSchedule({
                            open: true,
                            groupId: realId,
                            groupLocalId: group.group_id,
                            groupName: group.group_name,
                            course: coursePieces.course,
                            courseCode: coursePieces.courseCode,
                          })
                        }
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Schedule a session"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {(group as any).isInvited === true && !iJoined ? (
                        <>
                          <button
                            onClick={() => acceptInvite(group.group_id)}
                            disabled={
                              !realId ||
                              (respondingId === group.group_id && respondingAction === 'accept')
                            }
                            className="flex-1 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition disabled:opacity-60"
                          >
                            {respondingId === group.group_id && respondingAction === 'accept'
                              ? 'Accepting…'
                              : 'Accept Invite'}
                          </button>
                          <button
                            onClick={() => declineInvite(group.group_id)}
                            disabled={
                              !realId ||
                              (respondingId === group.group_id && respondingAction === 'decline')
                            }
                            className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
                          >
                            {respondingId === group.group_id && respondingAction === 'decline'
                              ? 'Declining…'
                              : 'Decline'}
                          </button>
                        </>
                      ) : (
                        <>
                          {iJoined ? (
                            <button
                              onClick={() => leaveGroup(group.group_id)}
                              disabled={!realId || joiningId === group.group_id}
                              className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
                            >
                              {joiningId === group.group_id && pendingAction === 'leave'
                                ? 'Leaving…'
                                : 'Leave Group'}
                            </button>
                          ) : (
                            <button
                              onClick={() => joinGroup(group.group_id)}
                              disabled={!realId || joiningId === group.group_id}
                              className="flex-1 px-3 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-600 transition disabled:opacity-60"
                            >
                              {joiningId === group.group_id && pendingAction === 'join'
                                ? 'Joining…'
                                : 'Join Group'}
                            </button>
                          )}
                        </>
                      )}

                      {/* Chat (only for members) */}
                      {iJoined && realId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/chat?groupId=${realId}`)}
                          className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                          title="Open group chat"
                          aria-label="Open group chat"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}

                      {/* Schedule (optional: show only to members/owner) */}
                      {(iJoined || owner) && (
                        <button
                          onClick={() =>
                            realId &&
                            setOpenSchedule({
                              open: true,
                              groupId: realId,
                              groupLocalId: group.group_id,
                              groupName: group.group_name,
                              course: coursePieces.course,
                              courseCode: coursePieces.courseCode,
                            })
                          }
                          className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                          title="Schedule a session"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {groups.length === 0 && !loading && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No study groups found</h3>
          <p className="text-gray-600 mb-6">Create your first study group to start collaborating</p>
          <button
            onClick={() => setOpenCreate(true)}
            className="px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
          >
            Create Your First Group
          </button>
        </div>
      )}

      {/* Create Group Modal */}
      <GroupModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSubmit={handleCreateGroup}
      />

      {/* Edit Group Modal */}
      <GroupModal
        open={openEdit.open}
        onClose={() => setOpenEdit({ open: false })}
        mode="edit"
        onSubmit={(form) => {
          if (!openEdit.backendId || !openEdit.groupLocalId) return;
          handleUpdateGroup(
            {
              backendId: openEdit.backendId,
              groupLocalId: openEdit.groupLocalId,
              originalName: openEdit.defaults?.name || '',
            },
            form
          );
        }}
        defaults={openEdit.defaults}
      />

      {/* Schedule Session Modal */}
      <ScheduleSessionModal
        open={openSchedule.open}
        onClose={() => setOpenSchedule({ open: false })}
        groupName={openSchedule.groupName}
        defaults={{
          title: openSchedule.groupName
            ? `Study session: ${openSchedule.groupName}`
            : 'Study session',
          course: openSchedule.course,
          courseCode: openSchedule.courseCode,
        }}
        onSubmit={(form) => {
          if (!openSchedule.groupId || !openSchedule.groupLocalId || !openSchedule.groupName)
            return;
          handleScheduleSession(
            {
              groupId: openSchedule.groupId,
              groupLocalId: openSchedule.groupLocalId,
              groupName: openSchedule.groupName,
              course: openSchedule.course,
              courseCode: openSchedule.courseCode,
            },
            form
          );
        }}
      />

      {/* Invite Members Modal */}
      {openInvite.open && (
        <InviteMembersModal
          onClose={() => setOpenInvite({ open: false })}
          groupId={openInvite.groupId!}
          connections={connections}
          currentUserId={meId}
        />
      )}
    </div>
  );
}

/* ---------------- Group Modal (portal; matches Sessions style) ---------------- */
function GroupModal({
  open,
  onClose,
  onSubmit,
  defaults,
  mode = 'create',
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (g: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic?: boolean;
  }) => void;
  defaults?: Partial<{
    name: string;
    description: string;
    maxMembers: number;
    isPublic: boolean;
  }>;
  mode?: 'create' | 'edit';
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [name, setName] = useState(defaults?.name || '');
  const [description, setDescription] = useState(defaults?.description || '');
  const [maxMembers, setMaxMembers] = useState<number>(defaults?.maxMembers ?? 8);
  const [isPublic, setIsPublic] = useState<boolean>(defaults?.isPublic ?? true);

  const titleId = useId();
  const nameId = useId();
  const descId = useId();
  const maxId = useId();

  useEffect(() => {
    if (!open) return;
    setName(defaults?.name || '');
    setDescription(defaults?.description || '');
    setMaxMembers(defaults?.maxMembers ?? 8);
    setIsPublic(defaults?.isPublic ?? true);
  }, [open, defaults]);

  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      maxMembers,
      isPublic,
    });
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                {mode === 'edit' ? 'Edit group' : 'Create new group'}
              </h2>
              <p className="text-sm text-slate-600">
                {mode === 'edit'
                  ? 'Update details for your study group'
                  : 'Organize a study group with your peers'}
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 hover:bg-slate-50"
            >
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={nameId} className="block mb-1 text-sm font-medium text-slate-800">
                  Group name <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Algorithms Crew"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={descId} className="block mb-1 text-sm font-medium text-slate-800">
                  Description
                </label>
                <textarea
                  id={descId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label htmlFor={maxId} className="block mb-1 text-sm font-medium text-slate-800">
                  Max members
                </label>
                <input
                  id={maxId}
                  type="number"
                  min={2}
                  max={50}
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(parseInt(e.target.value || '8', 10))}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="flex items-end gap-2">
                <input
                  id="gg_isPublic"
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="gg_isPublic" className="text-sm text-slate-700 select-none">
                  Public group
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                {mode === 'edit' ? 'Save changes' : 'Create group'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

/* --------------- Schedule Session Modal --------------- */
function ScheduleSessionModal({
  open,
  onClose,
  onSubmit,
  groupName,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    description?: string;
  }) => void;
  groupName?: string;
  defaults?: Partial<{ title: string; course: string; courseCode: string }>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [title, setTitle] = useState(
    defaults?.title || (groupName ? `Study session: ${groupName}` : 'Study session')
  );
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const headingId = useId();
  const titleInputId = useId();
  const dateId = useId();
  const stId = useId();
  const etId = useId();
  const locId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    setTitle(defaults?.title || (groupName ? `Study session: ${groupName}` : 'Study session'));
    setDate('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setDescription('');
  }, [open, defaults, groupName]);

  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime || !location.trim()) return;
    onSubmit({
      title: title.trim(),
      date,
      startTime,
      endTime,
      location: location.trim(),
      description: description.trim() || undefined,
    });
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 id={headingId} className="text-lg font-semibold text-slate-900">
                Schedule a session
              </h2>
              <p className="text-sm text-slate-600">
                {groupName ? `For ${groupName}` : 'Plan a study session'}
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 hover:bg-slate-50"
            >
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor={titleInputId}
                  className="block mb-1 text-sm font-medium text-slate-800"
                >
                  Session title <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={titleInputId}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Midterm Review"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={dateId} className="block mb-1 text-sm font-medium text-slate-800">
                  Date <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={dateId}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={stId} className="block mb-1 text-sm font-medium text-slate-800">
                  Start time <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={stId}
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={etId} className="block mb-1 text-sm font-medium text-slate-800">
                  End time <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={etId}
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={locId} className="block mb-1 text-sm font-medium text-slate-800">
                  Location <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={locId}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Library Room 204"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={descId} className="block mb-1 text-sm font-medium text-slate-800">
                  Notes (optional)
                </label>
                <textarea
                  id={descId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What will you cover?"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                Schedule
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ---------------- Invite Members Modal ---------------- */
function InviteMembersModal({
  onClose,
  groupId,
  connections,
  currentUserId,
}: {
  onClose: () => void;
  groupId: string;
  connections: StudyPartner[];
  /** used to send "group invite sent" notification back to the inviter */
  currentUserId: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // NEW: ids that already have a pending invite for this group
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await DataService.getGroupPendingInvites(groupId);
        const ids = (Array.isArray(rows) ? rows : [])
          .filter((r) => String(r.status).toLowerCase() === 'pending')
          .map((r) => String(r.user_id));
        if (mounted) setPendingIds(new Set(ids));
      } catch {
        if (mounted) setPendingIds(new Set());
      }
    })();
    return () => {
      mounted = false;
    };
  }, [groupId]);

  const toggle = (id: string) => {
    if (pendingIds.has(id)) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  useEffect(() => {
    if (!groupId) return;

    async function refetchPending() {
      try {
        const rows = await DataService.getGroupPendingInvites(groupId);
        const ids = (Array.isArray(rows) ? rows : [])
          .filter((r) => String(r.status).toLowerCase() === 'pending')
          .map((r) => String(r.user_id));
        setPendingIds(new Set(ids));
      } catch {
        // keep existing pendingIds on failure
      }
    }

    const handler = (ev: any) => {
      if (ev?.detail?.groupId !== groupId) return;
      refetchPending();
    };

    window.addEventListener('group.invites.changed', handler);
    return () => window.removeEventListener('group.invites.changed', handler);
  }, [groupId]);

  async function invite() {
    if (selectedIds.length === 0 || sending || sent) return;
    setSending(true);
    try {
      const ok = await DataService.inviteToGroup(groupId, selectedIds);
      if (!ok) throw new Error('invite failed');

      (async () => {
        try {
          if (currentUserId) {
            await DataService.createNotification({
              user_id: currentUserId,
              notification_type: 'group_invite',
              title: 'Group invites sent',
              message: `You invited ${selectedIds.length} ${
                selectedIds.length === 1 ? 'person' : 'people'
              } to join your group.`,
              metadata: { group_id: groupId, invitee_ids: selectedIds, direction: 'sent' },
            });
          }
          await Promise.allSettled(
            selectedIds.map((uid) =>
              DataService.createNotification({
                user_id: uid,
                notification_type: 'group_invite',
                title: 'You’ve been invited to a study group',
                message: 'Open the app to accept or view the group details.',
                metadata: { group_id: groupId, invited_by: currentUserId, direction: 'received' },
              })
            )
          );
        } catch {}
      })();

      setSent(true);

      setPendingIds((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });

      setSelectedIds([]);

      window.dispatchEvent(new Event('groups:invalidate'));

      try {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              type: 'success',
              message: `Sent ${selectedIds.length} invite${selectedIds.length === 1 ? '' : 's'}`,
            },
          })
        );
      } catch {}

      setTimeout(onClose, 900);
    } catch (err) {
      console.error('Error sending invites:', err);
      alert('Could not send invites. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-gray-200 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Members</h3>

        <div className="max-h-80 overflow-auto rounded-xl border border-gray-200">
          {connections.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No connections to invite.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {connections.map((p) => {
                const initials = (p.name || '')
                  .trim()
                  .split(/\s+/)
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                const partnerSaysPending =
                  p.connectionStatus === 'pending' || (p as any).isPendingSent;
                const isPending = pendingIds.has(p.id) || partnerSaysPending;

                return (
                  <li key={p.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-semibold">
                        {initials}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          {p.name}
                          {isPending && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{(p as any).major}</div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      disabled={sent || isPending}
                      title={isPending ? 'Invite already sent' : undefined}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3" aria-live="polite">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            {sent ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={invite}
            disabled={selectedIds.length === 0 || sending || sent}
            className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {sent ? 'Invites sent ✓' : sending ? 'Sending…' : 'Send Invites'}
          </button>
        </div>
      </div>
    </div>
  );
}
