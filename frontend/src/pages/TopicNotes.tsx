import { useEffect, useState } from 'react';
import { DataService } from '../services/dataService';
import type { SharedNote } from '../services/dataService';
import { Paperclip, Eye, Edit, Trash2 } from 'lucide-react';

export default function TopicNotes({ 
  topicId, 
  onNoteClick, 
  onEditNote, 
  onDeleteNote, 
  refreshSignal 
}: { 
  topicId: number; 
  onNoteClick: (note: SharedNote) => void; 
  onEditNote?: (note: SharedNote) => void;
  onDeleteNote?: (noteId: number) => void;
  refreshSignal?: any;
}) {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  
  const fetchNotes = () => {
    DataService.fetchNotes({}).then((all) => {
      const filtered = Array.isArray(all) ? all.filter(n => {
        // Handle potential type mismatches between topic_id and topicId
        const noteTopicId = n.topic_id;
        const targetTopicId = topicId;
        return noteTopicId == targetTopicId; // Use loose equality to handle string/number mismatches
      }) : [];
      setNotes(filtered);
    }).catch(error => {
      console.error('❌ TopicNotes: Error fetching notes:', error);
    });
  };
  
  useEffect(() => {
    fetchNotes();
    
    // Listen for note invalidation events (when notes are created/updated from other pages)
    const handleNotesInvalidate = () => {
      fetchNotes(); // Refresh topic notes when changes happen elsewhere
    };

    window.addEventListener('notes:invalidate', handleNotesInvalidate as EventListener);
    
    return () => {
      window.removeEventListener('notes:invalidate', handleNotesInvalidate as EventListener);
    };
    // eslint-disable-next-line
  }, [topicId, refreshSignal]);

  if (!notes.length) return null;

  return (
    <div className="mt-3">
      <h5 className="text-sm font-semibold text-slate-800 mb-1">Notes</h5>
      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.note_id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900 truncate flex-1">{note.note_title}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button 
                  className="text-xs text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" 
                  onClick={() => onNoteClick(note)}
                  title="View note"
                >
                  <Eye className="w-3 h-3" />
                </button>
                {onEditNote && (
                  <button 
                    className="text-xs text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50" 
                    onClick={() => onEditNote(note)}
                    title="Edit note"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                )}
                {onDeleteNote && (
                  <button 
                    className="text-xs text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50" 
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this note?')) {
                        onDeleteNote(note.note_id);
                      }
                    }}
                    title="Delete note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-600 leading-relaxed">{note.note_content.slice(0, 200)}{note.note_content.length > 200 ? '…' : ''}</div>
            {note.attachments && Array.isArray(note.attachments) && note.attachments.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <Paperclip className="w-4 h-4 text-slate-500" />
                <span className="text-xs text-slate-500">{note.attachments.length} attachment{note.attachments.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}