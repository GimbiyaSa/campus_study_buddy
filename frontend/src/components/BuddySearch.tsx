import { useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, Mail, X, Users, Loader2, AlertCircle, Filter } from 'lucide-react';
import { navigate } from '../router';

import { DataService, type StudyPartner } from '../services/dataService';
import { ErrorHandler, type AppError } from '../utils/errorHandler';
import azureIntegrationService from '../services/azureIntegrationService';

export default function BuddySearch() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StudyPartner | null>(null);
  const [invited, setInvited] = useState(false);

  // Filter states
  const [courseFilter, setCourseFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Enhanced state management with unified error handling
  const [suggestions, setSuggestions] = useState<StudyPartner[]>([]);
  const [allSuggestions, setAllSuggestions] = useState<StudyPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  // Track pending invites by partner ID
  const [pendingInvites, setPendingInvites] = useState<Set<string>>(new Set());

  // Filtered suggestions based on user selections
  const filteredSuggestions = useMemo(() => {
    if (!allSuggestions.length) return [];

    return allSuggestions.filter((partner) => {
      // Course filter
      if (
        courseFilter &&
        !partner.sharedCourses?.some((course) =>
          course.toLowerCase().includes(courseFilter.toLowerCase())
        )
      ) {
        return false;
      }

      return true;
    });
  }, [allSuggestions, courseFilter]);

  // Available filter options from data
  const availableCourses = useMemo(() => {
    const courses = new Set<string>();
    allSuggestions.forEach((partner) => {
      partner.sharedCourses?.forEach((course) => courses.add(course));
    });
    return Array.from(courses).sort();
  }, [allSuggestions]);

  // Update suggestions when filters change
  useEffect(() => {
    setSuggestions(filteredSuggestions.slice(0, 4));
  }, [filteredSuggestions]);

  // Fetch study partners using centralized data service with unified error handling
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Get suggestions (new people to connect with)
        const allPartners = await DataService.searchPartners();
        console.log(
          '🔍 BuddySearch raw data:',
          allPartners.map((p) => ({
            name: p.name,
            connectionStatus: p.connectionStatus,
            sharedCourses: p.sharedCourses?.length || 0,
          }))
        );

        // CRITICAL: For dashboard suggestions, ONLY show partners with matched courses
        // This adheres to the "Study Partner Suggestions - Connect with classmates who share your courses"
        const newSuggestions = allPartners
          .filter(
            (partner) =>
              // Must NOT be already connected
              (!partner.connectionStatus ||
                partner.connectionStatus === 'none' ||
                partner.connectionStatus === undefined ||
                partner.connectionStatus !== 'accepted') &&
              // MUST have at least one matched course (adhering to algorithm)
              partner.sharedCourses &&
              partner.sharedCourses.length > 0
          )
          .slice(0, 4);

        console.log(
          '🔍 BuddySearch filtered suggestions with courses:',
          newSuggestions.length,
          'out of',
          allPartners.length
        );

        // Store all non-connected partners for filtering (also require matched courses)
        setAllSuggestions(
          allPartners.filter(
            (partner) =>
              (!partner.connectionStatus ||
                partner.connectionStatus === 'none' ||
                partner.connectionStatus === undefined ||
                partner.connectionStatus !== 'accepted') &&
              partner.sharedCourses &&
              partner.sharedCourses.length > 0
          )
        );
        setSuggestions(newSuggestions);
      } catch (err) {
        const appError = ErrorHandler.handleApiError(err, 'partners');
        setError(appError);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Listen for partner request status updates
    const handlePartnerAccepted = (data: any) => {
      console.log('Partner request accepted:', data);
      setPendingInvites((prev) => {
        const newSet = new Set(prev);
        // Find and remove the partner ID that was accepted
        newSet.delete(data.acceptedBy);
        return newSet;
      });
      // Refresh data
      fetchData();
    };

    const handlePartnerRejected = (data: any) => {
      console.log('Partner request rejected:', data);
      setPendingInvites((prev) => {
        const newSet = new Set(prev);
        // Find and remove the partner ID that was rejected
        newSet.delete(data.rejectedBy);
        return newSet;
      });
    };

    // Listen for general partner updates
    const handleBuddiesInvalidate = () => {
      fetchData();
    };

    const unsubscribeAccepted = azureIntegrationService.onConnectionEvent(
      'partner_accepted',
      handlePartnerAccepted
    );
    const unsubscribeRejected = azureIntegrationService.onConnectionEvent(
      'partner_rejected',
      handlePartnerRejected
    );

    window.addEventListener('buddies:invalidate', handleBuddiesInvalidate);

    return () => {
      unsubscribeAccepted();
      unsubscribeRejected();
      window.removeEventListener('buddies:invalidate', handleBuddiesInvalidate);
    };
  }, []);

  const openModal = (person: StudyPartner) => {
    setSelected(person);
    setInvited(false);
    setOpen(true);
  };

  const closeModal = () => setOpen(false);

  const sendInvite = async () => {
    if (!selected?.id) return;
    setError(null);
    try {
      // 1. Send buddy request to backend (creates connection)
      await DataService.sendBuddyRequest(selected.id);
      // 2. Optionally, send real-time notification (if backend supports it)
      try {
        await azureIntegrationService.sendPartnerRequest(Number(selected.id));
      } catch (notifyErr) {
        // Log but don't block UI if notification fails
        console.warn('Notification send failed:', notifyErr);
      }

      // 3. Update pending invites state
      setPendingInvites((prev) => new Set(prev).add(selected.id));

      // 4. Dispatch event for local state update (optional)
      window.dispatchEvent(new CustomEvent('buddy:connected', { detail: selected }));
      setInvited(true);

      // 5. Close modal immediately after successful invite
      setTimeout(() => {
        closeModal();
        // Reset state for next time
        setInvited(false);
      }, 1000); // Show "Invite sent" for 1 second, then close
    } catch (err) {
      const appError = ErrorHandler.handleApiError(err, 'partners');
      setError(appError);
      setInvited(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    // Trigger re-fetch
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Study Partner Suggestions</h2>
          <p className="text-slate-600">Connect with classmates who share your courses</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              showFilters || courseFilter
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Shared Course</label>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">All courses</option>
                {availableCourses.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {courseFilter && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setCourseFilter('');
                }}
                className="text-sm text-slate-600 hover:text-slate-800 underline"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Error Display */}
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
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
                  >
                    {error.action || 'Try again'}
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

      {/* Enhanced Loading and Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading study partners</h3>
            <p className="text-slate-600">Getting your perfect matches...</p>
          </div>
        </div>
      ) : suggestions.length === 0 ? (
        <EnhancedEmptyState />
      ) : (
        <div className="flex-1">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((s) => (
              <EnhancedSuggestionCard
                key={s.id}
                suggestion={s}
                onConnect={() => openModal(s)}
                isPending={pendingInvites.has(s.id)}
              />
            ))}
          </ul>

          {/* Enhanced Bottom Action */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                <span className="font-medium">{suggestions.length}</span> perfect matches found
              </div>
              <button
                onClick={() => navigate('/partners')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-emerald-700 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-200"
              >
                <Users className="h-4 w-4" />
                Explore all partners
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Modal */}
      <EnhancedProfileModal
        open={open}
        onClose={closeModal}
        person={selected}
        onInvite={sendInvite}
        invited={invited}
      />
    </div>
  );
}

/* ---------- Enhanced Components ---------- */

function EnhancedSuggestionCard({
  suggestion,
  onConnect,
  isPending = false,
}: {
  suggestion: StudyPartner;
  onConnect: () => void;
  isPending?: boolean;
}) {
  const initials = suggestion.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Enhanced match information from backend
  // For suggested partners: ONLY show shared/similar courses
  const sharedCourses = suggestion.sharedCourses || [];
  const sharedTopicsCount = suggestion.sharedTopicsCount || 0;

  // Use match reasons from backend
  const matchReasons = suggestion.matchReasons || [];

  return (
    <li className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 grid place-items-center text-lg font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors mb-1">
            {suggestion.name}
          </h3>
          <p className="text-sm text-slate-700 font-medium mb-2">{suggestion.course}</p>

          {/* Show ONLY shared courses prominently for suggested partners */}
          {sharedCourses.length > 0 && (
            <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs font-semibold text-emerald-800 mb-1">
                Matched courses ({sharedCourses.length}):
              </p>
              <div className="flex flex-wrap gap-1">
                {sharedCourses.map((course, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md font-medium"
                  >
                    {course}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Show shared topics count if available */}
          {sharedTopicsCount > 0 && (
            <p className="text-xs text-emerald-600 font-medium mb-2">
              + {sharedTopicsCount} shared topic{sharedTopicsCount > 1 ? 's' : ''}
            </p>
          )}

          {/* Match reasons from backend */}
          {matchReasons.length > 0 && (
            <div className="flex flex-wrap gap-1 text-xs text-slate-600">
              {matchReasons.map((reason, index) => (
                <span key={index}>
                  {reason}
                  {index < matchReasons.length - 1 ? ' •' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onConnect}
        disabled={
          isPending ||
          suggestion.connectionStatus === 'pending' ||
          suggestion.connectionStatus === 'accepted'
        }
        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold shadow-md hover:shadow-lg focus-visible:outline focus-visible:outline-2 transition-all duration-200 ${
          isPending || suggestion.connectionStatus === 'pending'
            ? 'bg-yellow-100 text-yellow-800 cursor-not-allowed'
            : suggestion.connectionStatus === 'accepted'
            ? 'bg-green-100 text-green-800 cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600'
        }`}
      >
        <Users className="h-4 w-4" />
        {isPending || suggestion.connectionStatus === 'pending'
          ? suggestion.isPendingSent
            ? 'Pending acceptance'
            : 'Pending response'
          : suggestion.connectionStatus === 'accepted'
          ? 'Study buddies'
          : 'Connect'}
      </button>
    </li>
  );
}

function EnhancedEmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mx-auto mb-6">
        <Users className="h-10 w-10 text-emerald-600" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">No study partners yet</h3>
      <p className="text-slate-600 mb-6 max-w-md mx-auto">
        We're still finding the perfect study matches for you. Check back soon or explore all
        available partners.
      </p>
      <button
        onClick={() => navigate('/partners')}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-200"
      >
        <Users className="h-5 w-5" />
        Explore all partners
      </button>
    </div>
  );
}

/* ---------- Enhanced Modal ---------- */

function EnhancedProfileModal({
  open,
  onClose,
  person,
  onInvite,
  invited,
}: {
  open: boolean;
  onClose: () => void;
  person: StudyPartner | null;
  onInvite: () => void;
  invited: boolean;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Esc + scroll lock (enhanced)
  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open || !person) return null;

  const initials = person.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="fixed inset-0 z-[9999] grid place-items-center p-4"
      >
        <div
          ref={dialogRef}
          className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 p-8"
        >
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 grid place-items-center text-xl font-bold">
                {initials}
              </div>
              <div>
                <h3 id="profile-title" className="text-2xl font-bold text-slate-900 mb-1">
                  {person.name}
                </h3>
                <p className="text-slate-600">{person.course || person.university}</p>
              </div>
            </div>
            <button
              ref={closeBtnRef}
              aria-label="Close"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-6 h-6 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h4 className="font-semibold text-slate-900 mb-2">About this study partner</h4>
              <p className="text-sm text-slate-700 leading-relaxed">
                {person.bio ||
                  person.recommendationReason ||
                  'Active study partner with strong academic performance. Looking for consistent study sessions and collaborative learning.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onInvite}
              disabled={invited}
              className={`flex-1 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                invited
                  ? 'bg-green-100 text-green-800 border border-green-200 cursor-default'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {invited ? (
                <>
                  <Check className="w-5 h-5" /> Invite sent
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" /> Send invite
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
