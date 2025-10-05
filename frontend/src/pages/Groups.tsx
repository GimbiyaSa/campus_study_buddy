// frontend/src/pages/Groups.tsx
import { useState, useEffect, useId, useLayoutEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Users, Plus, MessageSquare, Calendar, Trash2, X, Pencil } from 'lucide-react';
import { buildApiUrl } from '../utils/url';
import { DataService, FALLBACK_PARTNERS, type StudyPartner } from '../services/dataService';

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
};

export default function Groups() {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openCreate, setOpenCreate] = useState(false);
  const [openInvite, setOpenInvite] = useState<{ open: boolean; groupId?: string }>({
    open: false,
  });
  const [connections, setConnections] = useState<StudyPartner[]>([]);
  const [connLoading, setConnLoading] = useState(false);

  const [meId, setMeId] = useState<string>('');
  const [owners, setOwners] = useState<Record<number, string>>({});
  const [idMap, setIdMap] = useState<Record<number, string>>({}); // local numeric → backend id
  const [usingFallback, setUsingFallback] = useState<boolean>(false);

  // join/leave UI state
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<'join' | 'leave' | null>(null);
  const [joinedByMe, setJoinedByMe] = useState<Record<number, boolean>>({});

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
  const [membersByGroup, setMembersByGroup] = useState<Record<number, any[]>>({});
  const [membersLoading, setMembersLoading] = useState<Record<number, boolean>>({});
  const [membersError, setMembersError] = useState<Record<number, string | null>>({});

  const fallbackGroups: StudyGroup[] = [
    {
      group_id: 1,
      group_name: 'CS Advanced Study Group',
      description: 'Advanced computer science topics and algorithms',
      creator_id: '1',
      module_id: 1,
      max_members: 8,
      group_type: 'study',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 5,
      module_name: 'CS 201 - Data Structures',
      creator_name: 'John Doe',
    },
    {
      group_id: 2,
      group_name: 'Math Warriors',
      description: 'Tackling linear algebra together',
      creator_id: '2',
      module_id: 2,
      max_members: 6,
      group_type: 'exam_prep',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 4,
      module_name: 'MATH 204 - Linear Algebra',
      creator_name: 'Jane Smith',
    },
    {
      group_id: 3,
      group_name: 'Physics Lab Partners',
      description: 'Lab work and problem solving',
      creator_id: '3',
      module_id: 3,
      max_members: 4,
      group_type: 'project',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 3,
      module_name: 'PHY 101 - Mechanics',
      creator_name: 'Alex Johnson',
    },
    {
      group_id: 4,
      group_name: 'Fallback Group',
      description: 'Fallback group for testing',
      creator_id: '4',
      module_id: 4,
      max_members: 10,
      group_type: 'discussion',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 1,
      module_name: 'GEN 101 - General',
      creator_name: 'Fallback User',
    },
  ];

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

  // map API → local card shape; capture owner + backend id + my membership
  function toStudyGroup(g: any): StudyGroup {
    const idStr = String(g?.id ?? g?.group_id ?? '');
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) hash = ((hash << 5) - hash + idStr.charCodeAt(i)) | 0;
    const numericId = Number.isFinite(g?.group_id) ? g.group_id : Math.abs(hash || Date.now());

    const createdBy =
      g?.createdBy != null
        ? String(g.createdBy)
        : g?.creator_id != null
        ? String(g.creator_id)
        : '';

    // keep owner map fresh in case backend transfers ownership
    setOwners((prev) =>
      prev[numericId] === createdBy ? prev : { ...prev, [numericId]: createdBy }
    );
    if (g?.id)
      setIdMap((prev) => (prev[numericId] ? prev : { ...prev, [numericId]: String(g.id) }));

    // membership hint from API if available
    if (Array.isArray(g?.members) && meId) {
      const iAmIn = g.members.some(
        (m: any) => String(m?.userId ?? m?.id ?? m?.user_id) === String(meId)
      );
      setJoinedByMe((prev) =>
        prev[numericId] === undefined ? { ...prev, [numericId]: iAmIn } : prev
      );
    } else if (createdBy && meId && String(createdBy) === String(meId)) {
      setJoinedByMe((prev) =>
        prev[numericId] === undefined ? { ...prev, [numericId]: true } : prev
      );
    }

    const membersCount = Array.isArray(g?.members) ? g.members.length : g?.member_count ?? 0;
    const createdAt = g?.createdAt || g?.created_at || new Date().toISOString();
    const updatedAt = g?.lastActivity || g?.updated_at || createdAt;

    const course = g?.course ?? '';
    const courseCode = g?.courseCode ?? '';
    const moduleName =
      course || courseCode
        ? [courseCode, course].filter(Boolean).join(' - ')
        : g?.module_name ?? undefined;

    const base: any = {
      group_id: numericId,
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
    };
    // carry through useful server hints when present
    if (typeof g?.isOwner === 'boolean') base.isOwner = !!g.isOwner;
    if (Array.isArray(g?.members)) base.members = g.members;

    // If I'm the creator, reflect membership immediately (even if server didn't supply a count yet)
    if (meId && String(createdBy || '') === String(meId)) {
      base.member_count = Math.max(1, Number(base.member_count || 0));
      setJoinedByMe((prev) =>
        prev[numericId] === undefined ? { ...prev, [numericId]: true } : prev
      );
    }

    return base as StudyGroup;
  }

  function isOwner(group: StudyGroup): boolean {
    if (!meId) return false;
    // 1) prefer explicit server signal when available
    if ((group as any).isOwner === true) return true;
    // 2) Fallback to createdBy/creator_id logic
    const ownerId =
      owners[group.group_id] ?? (group.creator_id != null ? String(group.creator_id) : '');
    if (ownerId && String(ownerId) === String(meId)) return true;
    // 3) Last resort: if members array is present, accept owner-by-role
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
          if (mounted) setMeId(''); // don't guess; prevents accidental owner UI
        }
      } catch {
        if (mounted) setMeId(''); // keep empty if unknown
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  function mergeGroups(prev: StudyGroup[], incoming: StudyGroup[]): StudyGroup[] {
    const byId = new Map<number, StudyGroup>();
    for (const g of prev) byId.set(g.group_id, g);
    for (const g of incoming) byId.set(g.group_id, g); // prefer incoming
    return Array.from(byId.values());
  }

  async function refreshGroups(): Promise<boolean> {
    try {
      let data: any[] = [];
      try {
        data = await DataService.fetchMyGroups();
      } catch {
        data = await DataService.fetchGroupsRaw();
      }
      const mapped = (Array.isArray(data) ? data : []).map((g: any) => toStudyGroup(g));
      setGroups((prev) =>
        mapped.length > 0 ? mergeGroups(prev, mapped) : prev.length ? prev : fallbackGroups
      );
      setUsingFallback(false);
      return true;
    } catch {
      setGroups((prev) => (prev.length ? prev : fallbackGroups));
      setUsingFallback(true);
      return false;
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    refreshGroups().finally(() => setLoading(false));
  }, []);

  // --- members fetcher (feature-detected) ---
  const membersFn =
    (DataService as any)?.getGroupMembers ||
    (DataService as any)?.fetchGroupMembers ||
    (DataService as any)?.listGroupMembers ||
    (DataService as any)?.getMembers;

  async function loadMembersFor(group: StudyGroup) {
    const backendId = idMap[group.group_id];
    if (!backendId || typeof membersFn !== 'function') return;
    setMembersLoading((p) => ({ ...p, [group.group_id]: true }));
    setMembersError((p) => ({ ...p, [group.group_id]: null }));
    try {
      const list = await membersFn(backendId);
      const arr = Array.isArray(list) ? list : [];
      setMembersByGroup((p) => ({ ...p, [group.group_id]: arr }));
    } catch (e) {
      console.warn('loadMembersFor failed', e);
      setMembersError((p) => ({ ...p, [group.group_id]: 'Could not load members' }));
    } finally {
      setMembersLoading((p) => ({ ...p, [group.group_id]: false }));
    }
  }

  const joinGroup = async (groupId: number) => {
    const realId = idMap[groupId]; // undefined => fallback/demo
    setJoiningId(groupId);
    setPendingAction('join');

    // optimistic UI
    setGroups((prev) =>
      prev.map((g) =>
        g.group_id === groupId ? { ...g, member_count: (g.member_count || 0) + 1 } : g
      )
    );
    setJoinedByMe((prev) => ({ ...prev, [groupId]: true }));

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
      await refreshGroups();
      // refresh member list if expanded
      if (expandedMembers[groupId]) {
        const g = groups.find((x) => x.group_id === groupId);
        if (g) await loadMembersFor(g);
      }
    } catch (err) {
      console.error('Error joining group:', err);
      // revert on hard error
      setGroups((prev) =>
        prev.map((g) =>
          g.group_id === groupId
            ? { ...g, member_count: Math.max((g.member_count || 0) - 1, 0) }
            : g
        )
      );
      setJoinedByMe((prev) => ({ ...prev, [groupId]: false }));
    } finally {
      setJoiningId(null);
      setPendingAction(null);
    }
  };

  const leaveGroup = async (groupId: number) => {
    const realId = idMap[groupId]; // undefined => fallback/demo
    setJoiningId(groupId);
    setPendingAction('leave');

    // optimistic UI
    setGroups((prev) =>
      prev.map((g) =>
        g.group_id === groupId ? { ...g, member_count: Math.max((g.member_count || 0) - 1, 0) } : g
      )
    );
    setJoinedByMe((prev) => ({ ...prev, [groupId]: false }));

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
      await refreshGroups();
      if (expandedMembers[groupId]) {
        const g = groups.find((x) => x.group_id === groupId);
        if (g) await loadMembersFor(g);
      }
    } catch (err) {
      console.error('Error leaving group:', err);
      // revert
      setGroups((prev) =>
        prev.map((g) =>
          g.group_id === groupId ? { ...g, member_count: (g.member_count || 0) + 1 } : g
        )
      );
      setJoinedByMe((prev) => ({ ...prev, [groupId]: true }));
    } finally {
      setJoiningId(null);
      setPendingAction(null);
    }
  };

  const deleteGroup = async (groupId: number) => {
    const realId = idMap[groupId] || String(groupId);
    if (!window.confirm('Delete this group? This action cannot be undone.')) return;

    const snap = groups;
    const target = groups.find((g) => g.group_id === groupId);
    // Optional pre-notify (members still see it even as card disappears)
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

        // Ensure the UI immediately reflects creator membership + ownership
        setJoinedByMe((prev) => ({ ...prev, [sg.group_id]: true }));
        setOwners((prev) => ({ ...prev, [sg.group_id]: meId }));
        if ((created as any)?.id) {
          setIdMap((prev) => ({ ...prev, [sg.group_id]: String((created as any).id) }));
        }

        // Seed visible count to at least 1 (creator)
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

    setJoinedByMe((prev) => ({ ...prev, [localGroup.group_id]: true }));
    setOwners((prev) => ({ ...prev, [localGroup.group_id]: meId }));
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
    // Optimistic broadcast (keeps local date/time so Calendar feels instant)
    const optimistic = {
      id: String(Date.now()),
      title: form.title,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location,
      type: 'study' as const,
      participants: 1,
      status: 'upcoming' as const,
      isCreator: true,
      isAttending: true,
      groupId: groupCtx.groupId,
      course: groupCtx.course,
      courseCode: groupCtx.courseCode,
    };
    broadcastSessionCreated(optimistic);

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
      .map((n: string) => n[0])
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
            {usingFallback && <span className="ml-2 text-xs text-gray-500">(demo data)</span>}
          </p>
        </div>
        <button
          onClick={() => setOpenCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
        >
          <Plus className="w-5 h-5" />
          Create Group
        </button>
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
            const iJoined = !!joinedByMe[group.group_id];

            const realId = idMap[group.group_id] || String(group.group_id);
            const coursePieces = splitModuleName(group.module_name);

            // prefer members already provided by API; else use fetched; else empty
            const immediateMembers =
              (group as any).members && Array.isArray((group as any).members)
                ? (group as any).members
                : membersByGroup[group.group_id] || [];

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
                      {group.member_count || 0}/{group.max_members} members
                    </span>
                    {/* Members toggle (only if we have or can fetch members) */}
                    {(Array.isArray((group as any).members) ||
                      (typeof membersFn === 'function' && !!idMap[group.group_id])) && (
                      <button
                        onClick={async () => {
                          const next = !isExpanded;
                          setExpandedMembers((p) => ({ ...p, [group.group_id]: next }));
                          if (next && !Array.isArray((group as any).members)) {
                            if (!membersByGroup[group.group_id]) {
                              await loadMembersFor(group);
                            }
                          }
                        }}
                        className="ml-2 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                      >
                        {isExpanded ? 'Hide members' : 'View members'}
                      </button>
                    )}
                  </div>
                  {group.module_name && (
                    <div className="text-xs text-gray-500">{group.module_name}</div>
                  )}
                </div>

                {/* Members list */}
                {isExpanded && (
                  <div className="mb-4">
                    {membersLoading[group.group_id] ? (
                      <div className="text-xs text-gray-500">Loading members…</div>
                    ) : membersError[group.group_id] ? (
                      <div className="text-xs text-red-600">{membersError[group.group_id]}</div>
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
                          setOpenInvite({ open: true, groupId: realId });
                        }}
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Invite members"
                      >
                        <Users className="w-4 h-4" />
                      </button>

                      {/* Edit (feature-detected) */}
                      {canEditGroup && (
                        <button
                          onClick={() => {
                            const newName = window
                              .prompt('Update group name:', group.group_name)
                              ?.trim();
                            if (newName && newName !== group.group_name) {
                              (async () => {
                                try {
                                  await (DataService as any).updateGroup(realId, {
                                    name: newName,
                                    description: group.description ?? '',
                                  });
                                  // optimistic local update
                                  setGroups((prev) =>
                                    prev.map((g) =>
                                      g.group_id === group.group_id
                                        ? { ...g, group_name: newName }
                                        : g
                                    )
                                  );
                                  await notifyGroupSafe(realId, {
                                    title: 'Group updated',
                                    message: `“${group.group_name}” was renamed to “${newName}”.`,
                                    metadata: { group_id: realId, field: 'name' },
                                  });
                                  await refreshGroups();
                                } catch (e) {
                                  console.error('Update group failed', e);
                                  alert('Could not update the group.');
                                }
                              })();
                            }
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

                      {/* Open chat (placeholder) */}
                      <button
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Open chat"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>

                      {/* Schedule session */}
                      <button
                        onClick={() =>
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
                      {iJoined ? (
                        <button
                          onClick={() => leaveGroup(group.group_id)}
                          disabled={joiningId === group.group_id}
                          className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
                        >
                          {joiningId === group.group_id && pendingAction === 'leave'
                            ? 'Leaving…'
                            : 'Leave Group'}
                        </button>
                      ) : (
                        <button
                          onClick={() => joinGroup(group.group_id)}
                          disabled={joiningId === group.group_id}
                          className="flex-1 px-3 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-600 transition disabled:opacity-60"
                        >
                          {joiningId === group.group_id && pendingAction === 'join'
                            ? 'Joining…'
                            : 'Join Group'}
                        </button>
                      )}
                      <button
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Open chat"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
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
                Create new group
              </h2>
              <p className="text-sm text-slate-600">Organize a study group with your peers</p>
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
                Create group
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

  const titleId = useId();
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
                <label htmlFor={titleId} className="block mb-1 text-sm font-medium text-slate-800">
                  Session title <span className="text-emerald-700">*</span>
                </label>
                <input
                  id={titleId}
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

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  async function invite() {
    if (selectedIds.length === 0 || sending || sent) return;
    setSending(true);
    try {
      const ok = await DataService.inviteToGroup(groupId, selectedIds);
      if (!ok) throw new Error('invite failed');

      // Notify inviter (you)
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

      // Notify each invitee
      await Promise.all(
        selectedIds.map((uid) =>
          DataService.createNotification({
            user_id: uid,
            notification_type: 'group_invite',
            title: 'You’ve been invited to a study group',
            message: 'Open the app to accept or view the group details.',
            metadata: { group_id: groupId, invited_by: currentUserId, direction: 'received' },
          }).catch(() => null)
        )
      );

      setSent(true);
    } catch (err) {
      console.error('Error sending invites:', err);
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
                return (
                  <li key={p.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-semibold">
                        {initials}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500">{(p as any).major}</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      disabled={sent}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
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
            {sent ? 'Invites sent' : sending ? 'Sending…' : 'Send Invites'}
          </button>
        </div>
      </div>
    </div>
  );
}
