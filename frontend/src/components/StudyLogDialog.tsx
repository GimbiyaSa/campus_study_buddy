import React, { useState } from 'react';
import { X, Clock, BookOpen } from 'lucide-react';

interface StudyLogDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (log: StudyLog) => void;
  topic?: {
    id: number;
    name: string;
    module: string;
  };
}

export interface StudyLog {
  topicId: number;
  hours: number;
  description?: string;
}

export default function StudyLogDialog({ isOpen, onClose, onSubmit, topic }: StudyLogDialogProps) {
  const [hours, setHours] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !topic) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hours <= 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        topicId: topic.id,
        hours,
        description: description || undefined,
      });
      onClose();
      // Reset form
      setHours(1);
      setDescription('');
    } catch (error) {
      console.error('Failed to log study session:', error);
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
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Log Study Session</h2>
              <p className="text-sm text-slate-600">{topic.name}</p>
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
          {/* Module info */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <BookOpen className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-600">Module: {topic.module}</span>
          </div>

          {/* Hours Studied */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Hours Studied *</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-16 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="1.5"
                required
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-slate-500">
                hours
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Be honest about your actual study time (minimum 15 minutes)
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              What did you study? (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Chapter 3 exercises, lab assignment, lecture notes"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || hours <= 0}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Logging...' : 'Log Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
