import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X, StickyNote, AlertCircle } from 'lucide-react';
import { DataService } from '../services/dataService';
import type { SharedNote, StudyGroup } from '../services/dataService';

export default function Notes() {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; retryable?: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>(''); // group_id
  const [visibilityFilter, setVisibilityFilter] = useState<string>(''); // group|public|private
  const [openNote, setOpenNote] = useState<SharedNote | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingNote, setEditingNote] = useState<SharedNote | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [dateWindow, setDateWindow] = useState<'7d' | '30d' | 'all'>('7d');


  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
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
        setNotes(allNotes);
      } catch {
        setError({
          title: 'Failed to load notes',
          message: 'Unable to load notes. Please check your connection or try again.',
          retryable: true,
        });
        setGroups([]);
        setNotes([]);
      } finally {
        setLoading(false);
      }
    }
    
    load();
    
    // Listen for note invalidation events (when notes are created/updated from other pages)
    const handleNotesInvalidate = (event: CustomEvent) => {
      console.log('🔄 Notes invalidation event received:', event.detail);
      load(); // Refresh notes when changes happen elsewhere
    };

    window.addEventListener('notes:invalidate', handleNotesInvalidate as EventListener);
    
    return () => {
      window.removeEventListener('notes:invalidate', handleNotesInvalidate as EventListener);
    };
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

  const handleEditNote = (note: SharedNote) => {
    setEditingNote(note);
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return;
    }

    setDeletingNoteId(String(noteId));
    try {
      await DataService.deleteNote(String(noteId));
      // Remove from local state
      setNotes(prev => prev.filter(n => n.note_id !== noteId));
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note. Please try again.');
    } finally {
      setDeletingNoteId(null);
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
        {filteredNotes.length > 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
          >
            <Plus className="w-4 h-4" />
            Create Note
          </button>
        )}
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

      {/* Enhanced Error Display (copied from Courses) */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 mb-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-red-900 mb-1">{error.title}</h4>
              <p className="text-sm text-red-700 mb-3">{error.message}</p>
              <div className="flex flex-wrap gap-2">
                {error.retryable && (
                  <button
                    onClick={() => {
                      setError(null);
                      setLoading(true);
                      // re-run load
                      (async () => {
                        try {
                          const myGroups = await DataService.fetchMyGroups();
                          const mapped = myGroups.map((g: any) => ({
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
                          const allNotes = await DataService.fetchNotes();
                          setNotes(allNotes);
                        } catch {
                          setError({
                            title: 'Failed to load notes',
                            message: 'Unable to load notes. Please check your connection or try again.',
                            retryable: true,
                          });
                          setGroups([]);
                          setNotes([]);
                        } finally {
                          setLoading(false);
                        }
                      })();
                    }}
                    className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
                  >
                    Try again
                  </button>
                )}
                <button
                  onClick={() => setError(null)}
                  className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      {loading ? (
        <div className="text-center text-slate-600">Loading notes...</div>
      ) : error ? null : filteredNotes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mx-auto mb-6">
            <StickyNote className="h-10 w-10 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-3">No notes yet</h3>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Capture your first study note to get started. Notes you create or share will appear here.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-200"
          >
            <Plus className="h-5 w-5" />
            Capture Note
          </button>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <div
              key={note.note_id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition h-52 flex flex-col"
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2" title={note.note_title}>{note.note_title}</h3>
                <span className="text-xs px-2 py-1 rounded flex-shrink-0 bg-gray-100 text-gray-600">
                  {note.visibility}
                </span>
              </div>

              <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                {note.visibility === 'group' && note.group_name ? `${note.group_name} • ` : ''}
                {note.updated_at && note.created_at && note.updated_at !== note.created_at
                  ? `Updated: ${new Date(note.updated_at).toLocaleDateString()}`
                  : `Created: ${new Date(note.created_at).toLocaleDateString()}`}
              </p>
              
              <p className="text-sm text-gray-700 flex-1 line-clamp-4 mb-3">
                {note.note_content}
              </p>

              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={() => setOpenNote(note)}
                  className="text-brand-600 hover:text-brand-700 font-medium"
                >
                  View Full →
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditNote(note)}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.note_id)}
                    disabled={deletingNoteId === String(note.note_id)}
                    className="text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    {deletingNoteId === String(note.note_id) ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NoteModal note={openNote} onClose={() => setOpenNote(null)} />
      <CreateNoteModal
        open={showCreate}
        groups={groups}
        onClose={() => setShowCreate(false)}
        onCreated={(n) => {
          setNotes((prev) => [n, ...prev]);
          DataService.fetchNotes(selectedGroup ? { groupId: selectedGroup } : undefined)
            .then((fresh) => {
              if (Array.isArray(fresh) && fresh.length) setNotes(fresh);
            })
            .catch(() => {});
        }}
        defaultGroupId={selectedGroup || (groups[0]?.id ?? '')}
      />
      <EditNoteModal
        note={editingNote}
        groups={groups}
        onClose={() => setEditingNote(null)}
        onUpdated={async (updatedNote) => {
          // Refetch the latest note from backend to ensure attachments are up-to-date
          try {
            const fresh = await DataService.fetchNotes();
            const latest = Array.isArray(fresh) ? fresh.find(n => n.note_id === updatedNote.note_id) : updatedNote;
            setNotes(prev => prev.map(n => n.note_id === updatedNote.note_id ? (latest || updatedNote) : n));
            setEditingNote(null);
            setOpenNote(latest || updatedNote); // Show the latest note in view modal
          } catch {
            setNotes(prev => prev.map(n => n.note_id === updatedNote.note_id ? updatedNote : n));
            setEditingNote(null);
            setOpenNote(updatedNote);
          }
        }}
      />
    </div>
  );
}

// --- helpers for Azure blob URLs ---
function hasSAS(u?: string) {
  return !!u && /[?&](sv|se|sp|sig)=/i.test(u);
}

/** Parses https://{acct}.blob.core.windows.net/{container}/{blob...}[?sas] */
function parseAzureBlobUrl(u?: string): { container?: string; blob?: string } {
  if (!u) return {};
  try {
    const url = new URL(u);
    const parts = url.pathname.replace(/^\/+/, '').split('/');
    const container = parts.shift();
    const blob = parts.join('/');
    return { container, blob };
  } catch {
    return {};
  }
}

function normalizeAttachments(
  raw: any
): Array<{ name: string; url?: string; container?: string; blob?: string }> {
  // stringified JSON -> parse
  let att = raw;
  if (typeof raw === 'string') {
    try {
      att = JSON.parse(raw);
    } catch {
      att = [];
    }
  }
  // { attachments: [...] } or { files: [...] } or single object
  if (att && typeof att === 'object' && !Array.isArray(att)) {
    if (Array.isArray(att.attachments)) att = att.attachments;
    else if (Array.isArray(att.files)) att = att.files;
    else att = [att];
  }
  if (!Array.isArray(att)) att = [];

  return att.map((a: any, i: number) => {
    const name = a?.fileName || a?.filename || a?.name || a?.blob || a?.key || `File ${i + 1}`;

    const url: string | undefined = a?.url;

    // DO NOT set blob = url; only take explicit blob/key/path,
    // or parse it *from* the url if present.
    let container: string | undefined = a?.container || a?.bucket;
    let blob: string | undefined = a?.blob || a?.key || a?.path;

    if ((!container || !blob) && url) {
      const parsed = parseAzureBlobUrl(url);
      container = container || parsed.container || 'user-files';
      blob = blob || parsed.blob;
    }

    // default container only if we have a blob path
    if (!container && blob) container = 'user-files';

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
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownload = async (att: { url?: string; container?: string; blob?: string }) => {
    // If url already has a SAS, open directly
    if (hasSAS(att.url)) return openUrl(att.url!);

    // If we already have container/blob, mint SAS
    if (att.container && att.blob) {
      const sas = await DataService.getNoteAttachmentUrl(note!.note_id, att.container, att.blob);
      if (sas) return openUrl(sas);
    }

    // If there is a bare url (no SAS), try parsing container/blob and minting
    if (att.url) {
      const parsed = parseAzureBlobUrl(att.url);
      if (parsed.container && parsed.blob) {
        const sas = await DataService.getNoteAttachmentUrl(
          note!.note_id,
          parsed.container,
          parsed.blob
        );
        if (sas) return openUrl(sas);
      }
    }

    // Nothing workable; silently do nothing or show a toast if you have one
    // toast.error('Could not download file.');
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
                    {hasSAS(att.url) ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener"
                        className="px-3 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 text-xs"
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
  courseId,
  topicId,
}: {
  open: boolean;
  groups: StudyGroup[];
  defaultGroupId?: string;
  onClose: () => void;
  onCreated: (n: SharedNote) => void;
  courseId?: string;
  topicId?: string;
}) {
  const [groupId, setGroupId] = useState<string>(defaultGroupId ?? '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'group' | 'public' | 'private'>('private');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [internalCourseId, setInternalCourseId] = useState<string>(courseId ?? '');
  const [internalTopicId, setInternalTopicId] = useState<string>(topicId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);

  console.log('🔍 CreateNoteModal props:', { courseId, topicId, internalCourseId, internalTopicId });

  useEffect(() => {
    setGroupId(defaultGroupId ?? '');
  }, [defaultGroupId]);

  useEffect(() => {
    if (open) {
      DataService.fetchCourses().then(setCourses).catch(() => setCourses([]));
    }
  }, [open]);

  useEffect(() => {
    if (internalCourseId) {
      console.log('[Notes] Fetching topics for courseId:', internalCourseId);
      DataService.fetchModuleTopics(Number(internalCourseId))
        .then((data) => {
          console.log('[Notes] Topics loaded for courseId', internalCourseId, ':', data);
          console.log('[Notes] Topic names for courseId', internalCourseId, ':', data.map(t => t.name || t.topic_name || t.title));
          setTopics(Array.isArray(data) ? data : []);
        })
        .catch((err) => {
          console.error('[Notes] Error fetching topics for courseId', internalCourseId, err);
          setTopics([]);
        });
    } else {
      setTopics([]);
      setInternalTopicId('');
    }
  }, [internalCourseId]);

  if (!open) return null;

  const MAX_CONTENT_LENGTH = 1000;
  const contentTooLong = content.length > MAX_CONTENT_LENGTH;
  const canSave = title.trim() && content.trim() && !contentTooLong && (visibility !== 'group' || groupId);

  async function handleCreate() {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);
    try {
      // 1) create note - use groupId for group notes, fallback for others
      const targetGroupId = visibility === 'group' ? groupId : (groups[0]?.id || '1');
      
      const created = await DataService.createNote(targetGroupId, {
        note_title: title.trim(),
        note_content: content.trim(),
        visibility,
        topic_id: internalTopicId ? parseInt(internalTopicId) : null, // Link to topic if selected
      });
      console.log('🔍 Note created with topic_id:', internalTopicId ? parseInt(internalTopicId) : null, 'Full note:', created);
      if (!created) {
        setErr('Failed to create note');
        return;
      }

      let finalNote = created;

      // 2) optional attachments upload
      if (files.length) {
        try {
          const updated = await DataService.uploadNoteAttachments(created.note_id, files);
          if (updated) finalNote = updated;
        } catch (error) {
          console.error('Failed to upload attachments, but note was created:', error);
          // Note was created successfully, just attachments failed
          // We'll continue with the created note
        }
      }

      // 3) add to list & reset
      onCreated(finalNote);
      onClose();
      setTitle('');
      setContent('');
      setInternalCourseId('');
      setInternalTopicId('');
      setVisibility('private');
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Course <span className="text-red-500">*</span></label>
                <select
                  value={internalCourseId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    console.log('[Notes] Course selected:', selectedId);
                    const selectedCourse = courses.find(c => c.id == selectedId);
                    console.log('[Notes] Selected course object:', selectedCourse);
                    setInternalCourseId(selectedId);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select course...</option>
                  {courses.map((c) => {
                    console.log('[Notes] Course option:', c.id, c.title);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Topic <span className="text-red-500">*</span></label>
                <select
                  value={internalTopicId}
                  onChange={(e) => setInternalTopicId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  disabled={!internalCourseId}
                >
                  <option value="">{internalCourseId ? 'Select topic...' : 'Select course first'}</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.topic_name || t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Group {visibility === 'group' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  disabled={visibility !== 'group'}
                >
                  <option value="">
                    {visibility === 'group' ? 'Select group...' : 
                     visibility === 'public' ? 'Not applicable - public to all users' :
                     'Not applicable - private only'}
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {visibility === 'public' && (
                  <p className="text-xs text-green-600 mt-1">
                    Visible to all site users
                  </p>
                )}
                {visibility === 'private' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Only visible to you
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => {
                    const newVis = e.target.value as any;
                    setVisibility(newVis);
                    if (newVis !== 'group') {
                      setGroupId('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="private">Private (only me)</option>
                  <option value="group">Group (group members)</option>
                  <option value="public">Public (all users)</option>
                </select>
              </div>
            </div>

            <div>
                <label className="block text-sm text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Binary Tree Traversal"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
                <label className="block text-sm text-gray-700 mb-1">Content <span className="text-red-500">*</span></label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your study notes…"
                rows={8}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                maxLength={MAX_CONTENT_LENGTH + 1}
              />
              <div className="flex justify-between text-xs mt-1">
                <span>{content.length}/{MAX_CONTENT_LENGTH} characters</span>
                {contentTooLong && <span className="text-red-600">Content too long (max {MAX_CONTENT_LENGTH})</span>}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Attachments (optional)</label>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                PDFs, images, etc. You can leave this empty.
              </p>
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


function EditNoteModal({
  note,
  groups,
  onClose,
  onUpdated,
}: {
  note: SharedNote | null;
  groups: StudyGroup[];
  onClose: () => void;
  onUpdated: (note: SharedNote) => void;
}) {
  const [groupId, setGroupId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'group' | 'public' | 'private'>('private');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');
  const [courses, setCourses] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  // Initialize form with note data
  useEffect(() => {
    if (note) {
      setTitle(note.note_title || '');
      setContent(note.note_content || '');
      setVisibility(note.visibility as any || 'private');
      setGroupId(String(note.group_id || ''));
      setTopicId(String(note.topic_id || ''));
      setFiles([]);
    }
  }, [note]);

  // Set courseId based on topic (if available) when editing
  useEffect(() => {
    if (note && note.topic_id) {
      // Find course for topic (if available in courses)
      DataService.fetchCourses().then((allCourses) => {
        setCourses(allCourses);
        // Try to find course containing this topic
        const found = allCourses.find((c: any) =>
          Array.isArray(c.topics) && c.topics.some((t: any) => t.id === note.topic_id)
        );
        if (found) {
          setCourseId(String(found.id));
        }
      }).catch(() => setCourses([]));
    } else if (note) {
      DataService.fetchCourses().then(setCourses).catch(() => setCourses([]));
    }
  }, [note]);

  // Fetch topics for selected course and preselect topic if editing
  useEffect(() => {
    if (courseId) {
      DataService.fetchModuleTopics(Number(courseId))
        .then((data) => {
          setTopics(Array.isArray(data) ? data : []);
          // If editing, preselect topic if it exists in the list
          if (note && note.topic_id) {
            const found = Array.isArray(data) ? data.find((t: any) => t.id === note.topic_id) : null;
            if (found) setTopicId(String(found.id));
          }
        })
        .catch((err) => {
          console.error('Error fetching topics:', err);
          setTopics([]);
        });
    } else {
      setTopics([]);
    }
  }, [courseId, note]);
  // Show attachments in EditNoteModal
  const attachments = note && note.attachments ? normalizeAttachments(note.attachments) : [];
            {attachments.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Existing Attachments</h4>
                <ul className="space-y-2">
                  {attachments.map((att, idx) => (
                    <li key={idx} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-3">{att.name}</span>
                      {hasSAS(att.url) ? (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener"
                          className="px-3 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 text-xs"
                        >
                          Download
                        </a>
                      ) : (
                        <button
                          onClick={() => {/* TODO: implement download logic if needed */}}
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

  if (!note) return null;

  const MAX_CONTENT_LENGTH = 1000;
  const contentTooLong = content.length > MAX_CONTENT_LENGTH;
  const canSave = title.trim() && content.trim() && !contentTooLong && (visibility !== 'group' || groupId);

  async function handleUpdate() {
    if (!canSave || saving || !note) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await DataService.updateNote(String(note.note_id), {
        note_title: title.trim(),
        note_content: content.trim(),
        visibility,
        topic_id: topicId ? parseInt(topicId) : null,
      });
      let finalNote = updated;
      // Upload new attachments if any
      if (files.length && updated) {
        const updatedWithFiles = await DataService.uploadNoteAttachments(updated.note_id, files);
        if (updatedWithFiles) finalNote = updatedWithFiles;
      }
      if (!finalNote) {
        setErr('Failed to update note');
        return;
      }
      onUpdated(finalNote);
    } catch {
      setErr('Failed to update note');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-card border border-gray-100">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-brand-600" />
              <h3 className="text-lg font-semibold text-gray-900">Edit Note</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-50">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2">{err}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Course</label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select course...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Topic</label>
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  disabled={!courseId}
                >
                  <option value="">{courseId ? 'Select topic...' : 'Select course first'}</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.topic_name || t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Group {visibility === 'group' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  disabled={visibility !== 'group'}
                >
                  <option value="">
                    {visibility === 'group' ? 'Select group...' : 
                     visibility === 'public' ? 'Not applicable - public to all users' :
                     'Not applicable - private only'}
                  </option>
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
                  onChange={(e) => {
                    const newVis = e.target.value as any;
                    setVisibility(newVis);
                    if (newVis !== 'group') {
                      setGroupId('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="private">Private (only me)</option>
                  <option value="group">Group (group members)</option>
                  <option value="public">Public (all users)</option>
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
                maxLength={MAX_CONTENT_LENGTH + 1}
              />
              <div className="flex justify-between text-xs mt-1">
                <span>{content.length}/{MAX_CONTENT_LENGTH} characters</span>
                {contentTooLong && <span className="text-red-600">Content too long (max {MAX_CONTENT_LENGTH})</span>}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Attachments (optional)</label>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                PDFs, images, etc. You can leave this empty.
              </p>
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
              onClick={handleUpdate}
              disabled={!canSave || saving}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Updating…' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Export the modal components
export { NoteModal, CreateNoteModal, EditNoteModal };
