import React, { useState } from 'react';
import { X, BookOpen, Loader2, Plus } from 'lucide-react';

interface AddTopicDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (topic: { topic_name: string; description?: string }) => Promise<void>;
  courseName: string;
}

export default function AddTopicDialog({ isOpen, onClose, onSubmit, courseName }: AddTopicDialogProps) {
  const [topicName, setTopicName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicName.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        topic_name: topicName.trim(),
        description: description.trim() || undefined,
      });
      onClose();
      // Reset form
      setTopicName('');
      setDescription('');
    } catch (error) {
      console.error('Failed to add topic:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add Topic</h2>
              <p className="text-sm text-slate-600">{courseName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label htmlFor="topicName" className="block text-sm font-medium text-slate-900 mb-2">
              Topic Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="topicName"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="e.g., Arrays and Lists, Database Design, React Fundamentals"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
              disabled={isSubmitting}
            />
            <p className="text-xs text-slate-500 mt-1">
              Choose a clear, specific name for this study topic
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-900 mb-2">
              Description (Optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this topic covers, learning objectives, or key concepts..."
              rows={4}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-slate-500 mt-1">
              Optional description to help you remember what this topic is about
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !topicName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isSubmitting ? 'Adding...' : 'Add Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}