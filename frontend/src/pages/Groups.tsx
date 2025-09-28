import { useState, useEffect } from 'react';
import { Users, Plus, MessageSquare, Calendar, Trash2 } from 'lucide-react';
import { DataService, type StudyPartner, FALLBACK_PARTNERS } from '../services/dataService';

type StudyGroup = {
  group_id: number;
  group_name: string;
  description?: string;
  creator_id: number;
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
  const [idMap, setIdMap] = useState<Record<number, string>>({}); // local numeric → cosmos id
  const [usingFallback, setUsingFallback] = useState<boolean>(false);

  // join/leave UI state
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<'join' | 'leave' | null>(null);
  const [joinedByMe, setJoinedByMe] = useState<Record<number, boolean>>({}); // membership flag per card

  const fallbackGroups: StudyGroup[] = [
    {
      group_id: 1,
      group_name: 'CS Advanced Study Group',
      description: 'Advanced computer science topics and algorithms',
      creator_id: 1,
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
      creator_id: 2,
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
      creator_id: 3,
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
      creator_id: 4,
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

  function authHeadersJSON(): Headers {
    const h = new Headers();
    h.set('Content-Type', 'application/json');
    const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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

  // map API → local card shape; also capture owner + cosmos id
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
    setOwners((prev) => (prev[numericId] ? prev : { ...prev, [numericId]: createdBy }));
    if (g?.id)
      setIdMap((prev) => (prev[numericId] ? prev : { ...prev, [numericId]: String(g.id) }));

    // membership hint from API if available
    if (Array.isArray(g?.members) && meId) {
      const iAmIn = g.members.some((m: any) => String(m?.userId ?? m?.id) === String(meId));
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

    return {
      group_id: numericId,
      group_name: g?.name ?? g?.group_name ?? 'Untitled group',
      description: g?.description ?? '',
      creator_id: Number.isFinite(g?.creator_id) ? g.creator_id : 0,
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
  }

  function isOwner(group: StudyGroup): boolean {
    const owner =
      owners[group.group_id] || (group.creator_id != null ? String(group.creator_id) : '');
    if (!owner || !meId) return false;
    return String(owner) === String(meId);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/users/me', {
          headers: authHeadersJSON(),
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const id =
            data?.user_id != null ? String(data.user_id) : data?.id != null ? String(data.id) : '';
          if (mounted) setMeId(id);
        } else {
          if (mounted) setMeId('1');
        }
      } catch {
        if (mounted) setMeId('1');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function loadConnections() {
    if (connLoading || connections.length > 0) return;
    setConnLoading(true);
    try {
      const list = await DataService.fetchPartners();
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
      let res = await fetch('/api/v1/groups/my-groups', {
        headers: authHeadersJSON(),
        credentials: 'include',
      });
      if (!res.ok) {
        res = await fetch('/api/v1/groups', { headers: authHeadersJSON(), credentials: 'include' });
      }
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const mapped = (Array.isArray(data) ? data : []).map((g) => toStudyGroup(g));
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
      // demo: keep optimistic state, no server call
      setTimeout(() => {
        setJoiningId(null);
        setPendingAction(null);
      }, 400);
      return;
    }

    try {
      const res = await fetch(`/api/v1/groups/${encodeURIComponent(realId)}/join`, {
        method: 'POST',
        headers: authHeadersJSON(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`join ${res.status}`);
      await refreshGroups();
    } catch (err) {
      console.error('Error joining group:', err);
      // revert
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
      // demo: keep optimistic
      setTimeout(() => {
        setJoiningId(null);
        setPendingAction(null);
      }, 400);
      return;
    }

    try {
      const res = await fetch(`/api/v1/groups/${encodeURIComponent(realId)}/leave`, {
        method: 'POST',
        headers: authHeadersJSON(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`leave ${res.status}`);
      await refreshGroups();
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

    const snapshot = groups;
    setGroups((prev) => prev.filter((g) => g.group_id !== groupId));
    try {
      const res = await fetch(`/api/v1/groups/${encodeURIComponent(realId)}`, {
        method: 'DELETE',
        headers: authHeadersJSON(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      await refreshGroups();
    } catch (err) {
      console.error('Error deleting group:', err);
      setGroups(snapshot);
    }
  };

  // create then keep it; refresh merges (won’t remove local on failure)
  const createGroup = async (payload: {
    name: string;
    description?: string;
    course?: string;
    courseCode?: string;
    maxMembers?: number;
    isPublic?: boolean;
  }) => {
    try {
      const res = await fetch('/api/v1/groups', {
        method: 'POST',
        headers: authHeadersJSON(),
        credentials: 'include',
        body: JSON.stringify({
          name: payload.name,
          description: payload.description || '',
          subjects: [],
          maxMembers: payload.maxMembers ?? 8,
          isPublic: payload.isPublic ?? true,
          course: payload.course || '',
          courseCode: payload.courseCode || '',
        }),
      });
      if (!res.ok) throw new Error('Failed to create group');

      const created = await res.json();
      const sg = toStudyGroup(created);

      // creator is always a member
      setJoinedByMe((prev) => ({ ...prev, [sg.group_id]: true }));

      setGroups((prev) => [sg, ...prev]); // immediate add
      await refreshGroups(); // merge with server view
    } catch (err) {
      console.error('Error creating group:', err);
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
                  </div>
                  {group.module_name && (
                    <div className="text-xs text-gray-500">{group.module_name}</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {owner ? (
                    <>
                      <button
                        onClick={async () => {
                          await loadConnections();
                          const realId = idMap[group.group_id] || String(group.group_id);
                          setOpenInvite({ open: true, groupId: realId });
                        }}
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Invite members"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteGroup(group.group_id)}
                        className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                        title="Delete group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition">
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
                      <button className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition">
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

      {openCreate && (
        <CreateGroupModal onClose={() => setOpenCreate(false)} onCreate={createGroup} />
      )}

      {openInvite.open && (
        <InviteMembersModal
          onClose={() => setOpenInvite({ open: false })}
          groupId={openInvite.groupId!}
          connections={connections}
        />
      )}
    </div>
  );
}

/* ---------------- Create Group Modal (adds Course + Course code) ---------------- */
function CreateGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    description?: string;
    course?: string;
    courseCode?: string;
    maxMembers?: number;
    isPublic?: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [course, setCourse] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [maxMembers, setMaxMembers] = useState<number>(8);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [sending, setSending] = useState(false);

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-gray-200 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Group</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Group name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Algorithms Crew"
              className="w-full rounded-xl border border-gray-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional"
              className="w-full rounded-xl border border-gray-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Course</label>
              <input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g., Data Structures & Algorithms"
                className="w-full rounded-xl border border-gray-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Course code</label>
              <input
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="e.g., CS301"
                className="w-full rounded-xl border border-gray-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Max members</label>
              <input
                type="number"
                min={2}
                max={50}
                value={maxMembers}
                onChange={(e) => setMaxMembers(parseInt(e.target.value || '8', 10))}
                className="w-full rounded-xl border border-gray-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="flex items-end gap-2">
              <input
                id="isPublic"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="isPublic" className="text-sm text-gray-700 select-none">
                Public group
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || sending}
            onClick={async () => {
              try {
                setSending(true);
                await onCreate({
                  name: name.trim(),
                  description: description.trim(),
                  course: course.trim(),
                  courseCode: courseCode.trim(),
                  maxMembers,
                  isPublic,
                });
                onClose();
              } finally {
                setSending(false);
              }
            }}
            className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {sending ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Invite Members Modal ---------------- */
function InviteMembersModal({
  onClose,
  groupId,
  connections,
}: {
  onClose: () => void;
  groupId: string;
  connections: StudyPartner[];
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
      const res = await fetch(`/api/v1/groups/${encodeURIComponent(groupId)}/invite`, {
        method: 'POST',
        headers: authHeadersJSON(),
        credentials: 'include',
        body: JSON.stringify({ inviteUserIds: selectedIds }),
      });
      if (!res.ok) throw new Error('Failed to send invites');
      setSent(true);
    } catch (err) {
      console.error('Error sending invites:', err);
    } finally {
      setSending(false);
    }
  }

  function authHeadersJSON(): Headers {
    const h = new Headers();
    h.set('Content-Type', 'application/json');
    const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
