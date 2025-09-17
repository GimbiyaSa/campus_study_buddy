import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, BookOpen, Users, Lock, Globe, Plus, X } from 'lucide-react';

type SharedNote = {
  note_id: number;
  group_id: number;
  author_id: number;
  topic_id?: number;
  note_title: string;
  note_content: string;
  visibility: 'group' | 'public' | 'private';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string;
  group_name?: string;
  topic_name?: string;
};

type Module = {
  module_id: number;
  module_code: string;
  module_name: string;
  description?: string;
  university: string;
};

export default function Notes() {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('');
  const [openNote, setOpenNote] = useState<SharedNote | null>(null);

  // Fallback data
  const fallbackNotes: SharedNote[] = [
    {
      note_id: 1,
      group_id: 1,
      author_id: 1,
      topic_id: 1,
      note_title: 'Binary Tree Traversal Methods',
      note_content: 'In-order, pre-order, and post-order traversal techniques for binary trees. Key concepts include recursive approaches and iterative implementations using stacks.',
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
      author_id: 2,
      topic_id: 2,
      note_title: 'Matrix Operations',
      note_content: 'Fundamental matrix operations including addition, multiplication, and determinant calculation. Important for linear algebra applications.',
      visibility: 'group',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'Jane Smith',
      group_name: 'Math Warriors',
      topic_name: 'Linear Algebra',
    },
  ];

  const fallbackModules: Module[] = [
    { module_id: 1, module_code: 'CS201', module_name: 'Data Structures', university: 'University' },
    { module_id: 2, module_code: 'MATH204', module_name: 'Linear Algebra', university: 'University' },
  ];

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [modulesRes, notesRes] = await Promise.all([
          fetch('/api/v1/modules'),
          fetch('/api/v1/groups/notes')
        ]);

        if (!modulesRes.ok || !notesRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [modulesData, notesData] = await Promise.all([
          modulesRes.json(),
          notesRes.json()
        ]);

        setModules(modulesData);
        setNotes(notesData);
      } catch (err) {
        // setError('Failed to load notes and modules');
        setModules(fallbackModules);
        setNotes(fallbackNotes);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.note_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.note_content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (note.author_name?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesModule = !selectedModule || note.topic_id?.toString() === selectedModule;
    const matchesVisibility = !visibilityFilter || note.visibility === visibilityFilter;
    
    return matchesSearch && matchesModule && matchesVisibility && note.is_active;
  });

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public': return <Globe className="w-4 h-4 text-green-500" />;
      case 'group': return <Users className="w-4 h-4 text-blue-500" />;
      case 'private': return <Lock className="w-4 h-4 text-gray-500" />;
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Study Notes</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition">
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
          value={selectedModule}
          onChange={(e) => setSelectedModule(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Modules</option>
          {modules.map(module => (
            <option key={module.module_id} value={module.module_id.toString()}>
              {module.module_code} - {module.module_name}
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
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2 mb-4">Using demo data for preview</div>
      )}

      {/* Notes List */}
      {loading ? (
        <div className="text-center text-slate-600">Loading notes...</div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map(note => (
            <div key={note.note_id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition">
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

              <p className="text-sm text-gray-700 mb-4 line-clamp-3">
                {note.note_content.length > 150 
                  ? `${note.note_content.substring(0, 150)}...`
                  : note.note_content
                }
              </p>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Updated: {new Date(note.updated_at).toLocaleDateString()}</span>
                <button onClick={() => setOpenNote(note)} className="text-brand-600 hover:text-brand-700 font-medium">View Full Note</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredNotes.length === 0 && !loading && (
        <div className="text-center text-gray-500 py-8">
          No notes found matching your criteria
        </div>
      )}

      <NoteModal note={openNote} onClose={() => setOpenNote(null)} />
    </div>
  );
}

function NoteModal({ note, onClose }: { note: SharedNote | null; onClose: () => void }) {
  if (!note) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-card border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{note.note_title}</h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-50"><X className="w-5 h-5 text-gray-500"/></button>
          </div>
          <div className="text-sm text-gray-600 whitespace-pre-wrap">{note.note_content}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
