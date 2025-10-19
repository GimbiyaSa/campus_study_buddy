import { useEffect, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  ArrowLeft,
  Clock,
  Plus,
  CheckCircle,
  TrendingUp,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { DataService } from '../services/dataService';
import type { SharedNote } from '../services/dataService';
import TopicNotes from './TopicNotes';
import { CreateNoteModal, NoteModal, EditNoteModal } from '../components/Notes';
import { ErrorHandler, type AppError } from '../utils/errorHandler';
import StudyLogDialog, { type StudyLog } from '../components/StudyLogDialog';
import AddTopicDialog from '../components/AddTopicDialog';
import { navigate } from '../router';

// Accept id as prop for custom router
export default function CourseDetails({ id }: { id: string }) {
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [noteCourseId, setNoteCourseId] = useState<string>('');
  const [noteTopicId, setNoteTopicId] = useState<string>('');
  const [openNote, setOpenNote] = useState<SharedNote | null>(null);
  const [editingNote, setEditingNote] = useState<SharedNote | null>(null);
  const [notesRefreshKey, setNotesRefreshKey] = useState(0);
  const [course, setCourse] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showAddTopicDialog, setShowAddTopicDialog] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{
    id: number;
    name: string;
    module: string;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [courses, userGroups] = await Promise.all([
          DataService.fetchCourses(),
          DataService.fetchMyGroups()
        ]);
        const found = courses.find((c: any) => String(c.id) === String(id));
        setCourse(found);
        setGroups(userGroups || []);
        if (found) {
          const t = await DataService.fetchModuleTopics(Number(found.id));
          setTopics(t);
        }
      } catch (err) {
        setError(ErrorHandler.handleApiError(err, 'courses'));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const handleLogHours = async (log: StudyLog) => {
    try {
      await DataService.logStudyHours(log.topicId, {
        hours: log.hours,
        description: log.description,
      });
      console.log('✅ Study hours logged successfully');
      
      // Refresh both course data and topics to update progress
      const courses = await DataService.fetchCourses();
      const updatedCourse = courses.find((c: any) => String(c.id) === String(course.id));
      setCourse(updatedCourse);

      const topicsData = await DataService.fetchModuleTopics(Number(course.id));
      setTopics(topicsData);
      
      // Dispatch event to notify other components to refresh course data
      window.dispatchEvent(new CustomEvent('courses:invalidate', { 
        detail: { courseId: course.id, type: 'progress_update' } 
      }));
    } catch (error) {
      console.error('❌ Failed to log hours:', error);
      alert('Failed to log study hours. Please check your connection and try again.');
    }
  };

  const openLogDialog = (topic: { id: number; name: string; module: string }) => {
    setSelectedTopic(topic);
    setShowLogDialog(true);
  };

  const handleMarkComplete = async (topicId: number) => {
    try {
      await DataService.markTopicComplete(topicId);
      console.log('✅ Topic marked as complete');
      
      // Refresh both course data and topics to update progress
      const courses = await DataService.fetchCourses();
      const updatedCourse = courses.find((c: any) => String(c.id) === String(course.id));
      setCourse(updatedCourse);

      const topicsData = await DataService.fetchModuleTopics(Number(course.id));
      setTopics(topicsData);
      
      // Dispatch event to notify other components to refresh course data
      window.dispatchEvent(new CustomEvent('courses:invalidate', { 
        detail: { courseId: course.id, type: 'progress_update' } 
      }));
    } catch (error) {
      console.error('❌ Failed to mark topic complete:', error);
      alert('Failed to mark topic as complete. Please try again.');
    }
  };

  const handleAddTopic = async (topicData: { topic_name: string; description?: string }) => {
    try {
      await DataService.addTopic(Number(course.id), topicData);
      console.log('✅ Topic added successfully');
      // Refresh topics
      const t = await DataService.fetchModuleTopics(Number(course.id));
      setTopics(t);
    } catch (error) {
      console.error('❌ Failed to add topic:', error);
      alert('Failed to add topic. Please check your connection and try again.');
    }
  };

  const handleEditNote = (note: SharedNote) => {
    setEditingNote(note);
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await DataService.deleteNote(String(noteId));
      console.log('✅ Note deleted successfully');
      // Refresh notes by incrementing the refresh key
      setNotesRefreshKey(k => k + 1);
    } catch (error) {
      console.error('❌ Failed to delete note:', error);
      alert('Failed to delete note. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/courses')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Courses
          </button>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading course details</h3>
            <p className="text-slate-600">Getting your course information...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/courses')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Courses
          </button>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 mb-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-red-900 mb-1">{error.title}</h4>
              <p className="text-sm text-red-700 mb-3">{error.message}</p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/courses')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Courses
          </button>
        </div>
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Course not found</h3>
          <p className="text-slate-600 mb-4">
            The course you're looking for doesn't exist or you don't have access to it.
          </p>
          <button
            onClick={() => navigate('/courses')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  const isInstitution = course.type === 'institution';
  const progressPercentage = Math.round(course.progress ?? 0);

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/courses')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Courses
        </button>
      </div>

      {/* Course Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-6">
          <div
            className={`grid h-16 w-16 place-items-center rounded-2xl flex-shrink-0 ${
              isInstitution ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {isInstitution ? (
              <GraduationCap className="h-8 w-8" />
            ) : (
              <BookOpen className="h-8 w-8" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isInstitution
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                {isInstitution ? 'Institution Course' : 'Personal Topic'}
              </span>
              {isInstitution && course.code && (
                <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-1 text-xs font-medium">
                  {course.code.replace(/_[a-zA-Z0-9]{3,}$/, '')}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{course.title}</h1>
            {course.description && <p className="text-slate-600 mb-4">{course.description}</p>}
            <div className="flex items-center gap-6 text-sm text-slate-500">
              {course.university && <span>📍 {course.university}</span>}
              {course.term && <span>📅 {course.term}</span>}
              <span>⏱️ {course.totalHours || 0}h studied</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Course Progress</p>
              <p className="text-2xl font-bold text-slate-900">{progressPercentage}%</p>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                progressPercentage >= 100
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                  : progressPercentage > 0
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                  : (course.totalHours && course.totalHours > 0)
                  ? 'bg-gradient-to-r from-blue-400 to-blue-500'
                  : 'bg-slate-300'
              }`}
              style={{ 
                width: progressPercentage > 0 
                  ? `${Math.min(100, Math.max(0, progressPercentage))}%`
                  : (course.totalHours && course.totalHours > 0)
                  ? '10%' // Show small blue bar when hours logged but no topics completed
                  : '0%'
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Topics</p>
              <p className="text-2xl font-bold text-slate-900">{topics.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Completed</p>
              <p className="text-2xl font-bold text-slate-900">
                {topics.filter((t) => t.completionStatus === 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Topics Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Course Topics</h2>
            <p className="text-sm text-slate-600">Manage your study topics and track progress</p>
          </div>
          <button
            onClick={() => setShowAddTopicDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Topic
          </button>
        </div>

        {topics.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No topics yet</h3>
            <p className="text-slate-600 mb-4">
              Add topics to start tracking your progress and logging study hours.
            </p>
            <button
              onClick={() => setShowAddTopicDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Your First Topic
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {topics
              .sort((a: any, b: any) => a.orderSequence - b.orderSequence)
              .map((topic: any) => (
                <div key={topic.id} className="p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        topic.completionStatus === 'completed'
                          ? 'bg-emerald-100 text-emerald-600'
                          : topic.completionStatus === 'in_progress'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {topic.completionStatus === 'completed' ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-medium">{topic.orderSequence}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900">{topic.name}</h4>
                      <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                        {topic.hoursSpent > 0 && <span>Latest: {topic.hoursSpent}h studied</span>}
                        {topic.completionStatus === 'completed' ? (
                          topic.completedAt && (
                            <span>
                              Completed {new Date(topic.completedAt).toLocaleDateString()}
                            </span>
                          )
                        ) : (
                          <span className="capitalize">
                            {typeof topic.completionStatus === 'string' ? topic.completionStatus.replace('_', ' ') : ''}
                          </span>
                        )}
                      </div>
                      {/* --- Notes for this topic --- */}
                      <TopicNotes 
                        topicId={topic.id} 
                        onNoteClick={setOpenNote} 
                        onEditNote={handleEditNote}
                        onDeleteNote={handleDeleteNote}
                        refreshSignal={notesRefreshKey} 
                      />
                      <button
                        className="mt-2 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                        onClick={() => {
                          setNoteCourseId(String(course.id));
                          setNoteTopicId(String(topic.id));
                          setShowCreateNote(true);
                        }}
                      >
                        Add Note
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-2">
                    {topic.completionStatus !== 'completed' && (
                      <>
                        <button
                          onClick={() =>
                            openLogDialog({
                              id: topic.id,
                              name: topic.name,
                              module: course.title,
                            })
                          }
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <Clock className="h-4 w-4" />
                          Log Hours
                        </button>
                        <button
                          onClick={() => handleMarkComplete(topic.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Complete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Create Note Modal for topic */}
      {showCreateNote && (
        <CreateNoteModal
          open={showCreateNote}
          groups={groups}
          defaultGroupId={groups.length > 0 ? String(groups[0].id || groups[0].group_id) : ''}
          onClose={() => setShowCreateNote(false)}
          onCreated={() => {
            setShowCreateNote(false);
            setNotesRefreshKey((k) => k + 1);
          }}
          courseId={noteCourseId}
          topicId={noteTopicId}
        />
      )}

      {/* --- Note Modal for viewing --- */}
      {openNote && <NoteModal note={openNote} onClose={() => setOpenNote(null)} />}

      {/* --- Edit Note Modal --- */}
      {editingNote && (
        <EditNoteModal
          note={editingNote}
          groups={groups}
          onClose={() => setEditingNote(null)}
          onUpdated={() => {
            setEditingNote(null);
            setNotesRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Study Log Dialog */}
      <StudyLogDialog
        isOpen={showLogDialog}
        onClose={() => setShowLogDialog(false)}
        onSubmit={handleLogHours}
        topic={selectedTopic || undefined}
      />

      {/* Add Topic Dialog */}
      <AddTopicDialog
        isOpen={showAddTopicDialog}
        onClose={() => setShowAddTopicDialog(false)}
        onSubmit={handleAddTopic}
        courseName={course?.title || ''}
      />
    </div>
  );
}
