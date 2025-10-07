import React, { useState } from 'react';
import { X, Target, Clock, Calendar, BookOpen } from 'lucide-react';

interface StudyGoalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (goal: StudyGoal) => void;
  topic?: {
    id: number;
    name: string;
    module: string;
  };
}

export interface StudyGoal {
  topicId: number;
  hoursGoal: number;
  targetCompletionDate?: string;
  personalNotes?: string;
}

export default function StudyGoalDialog({
  isOpen,
  onClose,
  onSubmit,
  topic,
}: StudyGoalDialogProps) {
  const [hoursGoal, setHoursGoal] = useState<number>(10);
  const [targetDate, setTargetDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !topic) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hoursGoal <= 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        topicId: topic.id,
        hoursGoal,
        targetCompletionDate: targetDate || undefined,
        personalNotes: notes || undefined,
      });
      onClose();
      // Reset form
      setHoursGoal(10);
      setTargetDate('');
      setNotes('');
    } catch (error) {
      console.error('Failed to set goal:', error);
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
              <Target className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Set Study Goal</h2>
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

          {/* Hours Goal */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Study Hours Goal
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={hoursGoal}
                onChange={(e) => setHoursGoal(parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-16 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="10"
                required
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-slate-500">
                hours
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              How many hours do you want to spend studying this topic?
            </p>
          </div>

          {/* Target Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Target Completion Date (Optional)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Personal Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Personal Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
              rows={3}
              placeholder="Why is this goal important to you? Any specific strategies or milestones?"
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
              disabled={isSubmitting || hoursGoal <= 0}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Setting Goal...' : 'Set Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
