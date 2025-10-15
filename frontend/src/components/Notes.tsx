import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Users, Lock, Globe, Plus, X, BookOpen, StickyNote } from 'lucide-react';
import { DataService } from '../services/dataService';
import type { SharedNote, StudyGroup } from '../services/dataService';

export default function Notes() {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>(''); // group_id
  const [visibilityFilter, setVisibilityFilter] = useState<string>(''); // group|public|private
  const [openNote, setOpenNote] = useState<SharedNote | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [dateWindow, setDateWindow] = useState<'7d' | '30d' | 'all'>('7d');


  // demo fallback when API unavailable
  const fallbackNotes: SharedNote[] = [
    {
      note_id: 1,
      group_id: 1,
      author_id: '1',
      topic_id: 1,
      note_title: 'Binary Tree Traversal Methods',
      note_content:
        'In-order, pre-order, and post-order traversal techniques for binary trees. Key concepts include recursive approaches and iterative implementations using stacks.',
      attachments: null,
      visibility: 'public',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'John Doe',
      group_name: 'CS Advanced',
      topic_name: 'Data Structures',
    },
    {
      note_id: 2,
      group_id: 2,
      author_id: '2',
      topic_id: 2,
      note_title: 'Matrix Operations',
      note_content:
        'Fundamental matrix operations including addition, multiplication, and determinant calculation. Important for linear algebra applications.',
      attachments: null,
      visibility: 'group',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'Jane Smith',
      group_name: 'Math Warriors',
      topic_name: 'Linear Algebra',
    },
    {
      note_id: 3,
      group_id: 3,
      author_id: '3',
      topic_id: 3,
      note_title: 'Fallback Note',
      note_content: 'This is a fallback note for testing.',
      attachments: null,
      visibility: 'private',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'Fallback Author',
      group_name: 'Fallback Group',
      topic_name: 'Fallback Topic',
    },
  ];

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        // Load groups first (for filter + create modal)
        const myGroups = await DataService.fetchMyGroups();
        const mapped: StudyGroup[] = myGroups.map((g: any) => ({
          id: String(g.group_id ?? g.id),
          name: g.group_name ?? g.name,
          description: g.description,
          course: g.module_name ?? g.course,
          courseCode: g.module_code ?? g.courseCode,
          members: g.member_count ?? g.members,
          member_count: g.member_count ?? g.members,
          maxMembers: g.max_members ?? g.maxMembers,
          isPublic: !!(g.is_public ?? g.isPublic ?? true),
          tags: Array.isArray(g.tags) ? g.tags : undefined,
          createdBy: g.creator_name ?? g.createdBy,
          createdById: String(g.creator_id ?? g.createdById ?? ''),
          createdByName: g.creator_name ?? g.createdByName,
          createdAt: g.created_at ?? g.createdAt,
          lastActivity: g.updated_at ?? g.lastActivity,
          group_type: g.group_type,
          session_count: g.session_count ?? g.sessionCount,
          isMember: g.isMember ?? true,
          membersList: Array.isArray(g.membersList) ? g.membersList : undefined,
          isOwner: !!g.isOwner,
        }));
        setGroups(mapped);

        // Load notes (all) to allow search + client-side group filter
        const allNotes = await DataService.fetchNotes();
        if (allNotes.length === 0) {
          setNotes(fallbackNotes);
        } else {
          setNotes(allNotes);
        }
      } catch {
        setErr('Using demo data for preview');
        setGroups([
          {
            id: '1',
            name: 'CS Advanced Study Circle',
            isPublic: true,
            member_count: 12,
            members: 12,
            maxMembers: 15,
            createdBy: 'Alex Johnson',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
          },
          {
            id: '2',
            name: 'Math Warriors',
            isPublic: true,
            member_count: 8,
            members: 8,
            maxMembers: 10,
            createdBy: 'Jane Smith',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
          },
        ] as StudyGroup[]);
        setNotes(fallbackNotes);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

const filteredNotes = useMemo(() => {
  const term = searchTerm.trim().toLowerCase();

  const cutoff = (() => {
    if (dateWindow === 'all') return null;
    const now = Date.now();
    const days = dateWindow === '7d' ? 7 : 30;
    return new Date(now - days * 24 * 60 * 60 * 1000);
  })();

  return notes.filter((note) => {
    if (!note || !note.note_title || !note.note_content) return false;
    const updatedAt = new Date(note.updated_at || note.created_at || 0);
    if (cutoff && !(updatedAt >= cutoff)) return false;

    const matchesSearch =
      !term ||
      note.note_title.toLowerCase().includes(term) ||
      note.note_content.toLowerCase().includes(term) ||
      (note.author_name ?? '').toLowerCase().includes(term) ||
      (note.group_name ?? '').toLowerCase().includes(term);

    const matchesGroup = !selectedGroup || String(note.group_id) === selectedGroup;
    const matchesVisibility = !visibilityFilter || note.visibility === visibilityFilter;

    return matchesSearch && matchesGroup && matchesVisibility && note.is_active;
    });
    }, [notes, searchTerm, selectedGroup, visibilityFilter, dateWindow]);


  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Globe className="w-4 h-4 text-green-500" />;
      case 'group':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'private':
        return <Lock className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-brand-600" />
          <h2 className="text-xl font-semibold text-gray-900">Study Notes</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
        >
          <Plus className="w-4 h-4" />
          Create Note
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[250px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Visibility</option>
          <option value="public">Public</option>
          <option value="group">Group</option>
          <option value="private">Private</option>
        </select>

        <select
        value={dateWindow}
        onChange={(e) => setDateWindow(e.target.value as any)}
        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>

      </div>

      {/* Error message */}
      {err && <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2 mb-4">{err}</div>}

      {/* Notes List */}
      {loading ? (
        <div className="text-center text-slate-600">Loading notes...</div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <div
              key={note.note_id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 truncate">{note.note_title}</h3>
                {getVisibilityIcon(note.visibility)}
              </div>

              <div className="space-y-2 mb-4">
                {note.author_name && (
                  <p className="text-sm text-gray-600">By: {note.author_name}</p>
                )}
                {note.group_name && (
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {note.group_name}
                  </p>
                )}
                {note.topic_name && (
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {note.topic_name}
                  </p>
                )}
              </div>
              
              {/* attachments badge ABOVE the excerpt */}
              {Array.isArray(note.attachments) && note.attachments.length > 0 && (
                <div className="mb-2">
                  <span className="inline-block text-[11px] px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                    {note.attachments.length} attachment{note.attachments.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <p className="text-sm text-gray-700 mb-4 line-clamp-3">
                {note.note_content.length > 150
                  ? `${note.note_content.substring(0, 150)}...`
                  : note.note_content}
              </p>

              <div className="flex items-center justify-between text-xs text-gray-500">

                <span>Updated: {new Date(note.updated_at).toLocaleDateString()}</span>
                <button
                  onClick={() => setOpenNote(note)}
                  className="text-brand-600 hover:text-brand-700 font-medium"
                >
                  View Full Note
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredNotes.length === 0 && !loading && (
        <div className="text-center text-gray-500 py-8">No notes found matching your criteria</div>
      )}

      <NoteModal note={openNote} onClose={() => setOpenNote(null)} />
      <CreateNoteModal
      open={showCreate}
      groups={groups}
      onClose={() => setShowCreate(false)}
      onCreated={(n) => {
      setNotes((prev) => [n, ...prev]); // instant

      DataService.fetchNotes(
        selectedGroup ? { groupId: selectedGroup } : undefined
      ).then((fresh) => {
        if (Array.isArray(fresh) && fresh.length) setNotes(fresh);
      }).catch(() => {});
      }}

      defaultGroupId={selectedGroup || (groups[0]?.id ?? '')}
    />

    </div>
  );
}

function normalizeAttachments(raw: any): Array<{ name: string; url?: string; container?: string; blob?: string }> {
  // stringified JSON -> parse
  let att = raw;
  if (typeof raw === 'string') {
    try { att = JSON.parse(raw); } catch { att = []; }
  }
  // { attachments: [...] } or { files: [...] }
  if (att && typeof att === 'object' && !Array.isArray(att)) {
    if (Array.isArray(att.attachments)) att = att.attachments;
    else if (Array.isArray(att.files)) att = att.files;
    else att = [att];
  }
  if (!Array.isArray(att)) att = [];

  return att.map((a: any, i: number) => {
    const name = a?.fileName || a?.filename || a?.name || a?.blob || a?.key || `File ${i + 1}`;
    const url = a?.url; // if backend already provided
    const container = a?.container || a?.bucket || 'user-files';
    const blob = a?.blob || a?.key || a?.path || a?.url || '';
    return { name, url, container, blob };
  });
}


function NoteModal({ note, onClose }: { note: SharedNote | null; onClose: () => void }) {
  if (!note) return null;

  const attachments = normalizeAttachments(note.attachments);

  const openUrl = (u: string) => {
    const a = document.createElement('a');
    a.href = u;
    a.rel = 'noopener';
    a.target = '_blank';
    a.click();
  };

  const handleDownload = async (att: { url?: string; container?: string; blob?: string }) => {
    if (att.url) return openUrl(att.url);
    if (!att.blob) return;
    const url = await DataService.getNoteAttachmentUrl(note!.note_id, att.container!, att.blob);
    if (url) openUrl(url);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-card border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{note.note_title}</h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="text-sm text-gray-600 whitespace-pre-wrap">{note.note_content}</div>

          {attachments.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Attachments</h4>
              <ul className="space-y-2">
                {attachments.map((att, idx) => (
                  <li key={idx} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-3">{att.name}</span>

                    {/* If URL exists, render a real link; else render a button that mints a URL */}
                    {att.url ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener"
                        className="px-3 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 text-xs"
                        // optional: force download instead of viewing
                        // download
                      >
                        Download
                      </a>
                    ) : (
                      <button
                        onClick={() => handleDownload(att)}
                        className="px-3 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 text-xs"
                      >
                        Download
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}



function CreateNoteModal({
  open,
  groups,
  defaultGroupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  groups: StudyGroup[];
  defaultGroupId?: string;
  onClose: () => void;
  onCreated: (n: SharedNote) => void;
}) {
  const [groupId, setGroupId] = useState<string>(defaultGroupId ?? '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'group' | 'public' | 'private'>('group');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // top of CreateNoteModal
  const [files, setFiles] = useState<File[]>([]);


  useEffect(() => {
    setGroupId(defaultGroupId ?? '');
  }, [defaultGroupId]);

  if (!open) return null;

  const canSave = groupId && title.trim() && content.trim();

  async function handleCreate() {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);
    try {
      // 1) create note
      const created = await DataService.createNote(groupId, {
        note_title: title.trim(),
        note_content: content.trim(),
        visibility,
      });
      if (!created) {
        setErr('Failed to create note');
        return;
      }

      let finalNote = created;

      // 2) optional attachments upload
      if (files.length) {
        const updated = await DataService.uploadNoteAttachments(created.note_id, files);
        if (updated) finalNote = updated;
      }

      // 3) add to list & reset
      onCreated(finalNote);
      onClose();
      setTitle('');
      setContent('');
      setVisibility('group');
      setFiles([]);
    } catch {
      setErr('Failed to create note');
    } finally {
      setSaving(false);
    }
  }


  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        {/* Same modal styling as group creation */}
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-card border border-gray-100">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-brand-600" />
              <h3 className="text-lg font-semibold text-gray-900">Create Note</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2">{err}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Group</label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select a group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="group">Group</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Binary Tree Traversal"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your study notes…"
                rows={8}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
            <label className="block text-sm text-gray-700 mb-1">Attachments (optional)</label>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-500 mt-1">PDFs, images, etc. You can leave this empty.</p>
            </div>

          </div>

          <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canSave || saving}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
