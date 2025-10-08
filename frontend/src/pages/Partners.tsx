// src/pages/Partners.tsx
import { useMemo, useState, useLayoutEffect, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  X,
  Mail,
  Check,
  Loader2,
  AlertCircle,
  Users,
  Heart,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { type StudyPartner, DataService } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';
import { ErrorHandler, type AppError } from '../utils/errorHandler';

export default function Partners() {
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [minMutual, setMinMutual] = useState<number>(0);

  // Enhanced state management - unified with database
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnersError, setPartnersError] = useState<AppError | null>(null);

  // Database-driven data
  const [suggestions, setSuggestions] = useState<StudyPartner[]>([]);
  const [allPartners, setAllPartners] = useState<StudyPartner[]>([]);
  const [buddies, setBuddies] = useState<StudyPartner[]>([]);

  // Modal state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StudyPartner | null>(null);
  const [invited, setInvited] = useState(false);

  // Track pending invites by partner ID
  const [pendingInvites, setPendingInvites] = useState<Set<string>>(new Set());

  // Database-driven filtering and results
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPartners.filter((partner) => {
      // Text search
      const textFields = [
        partner.name,
        partner.course,
        partner.university,
        partner.bio || '',
        ...(partner.sharedCourses || []),
        ...(partner.studyPreferences?.preferredTimes || []),
        partner.studyPreferences?.environment || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchText = q === '' || textFields.includes(q);

      // Tag filtering (study preferences)
      const partnerTags = [
        ...(partner.studyPreferences?.preferredTimes || []),
        partner.studyPreferences?.environment || '',
        partner.studyPreferences?.studyStyle || '',
      ];
      const matchTags =
        activeTags.length === 0 ||
        activeTags.every((tag) =>
          partnerTags.some((partnerTag) => partnerTag.toLowerCase().includes(tag.toLowerCase()))
        );

      // Mutual courses filter
      const sharedCount = partner.sharedCourses?.length || 0;
      const matchMutual = sharedCount >= minMutual;

      return matchText && matchTags && matchMutual;
    });
  }, [query, activeTags, minMutual, allPartners]);

  // Available tags from actual data
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allPartners.forEach((partner) => {
      (partner.studyPreferences?.preferredTimes || []).forEach((time) => tagSet.add(time));
      if (partner.studyPreferences?.environment) tagSet.add(partner.studyPreferences.environment);
      if (partner.studyPreferences?.studyStyle) tagSet.add(partner.studyPreferences.studyStyle);
    });
    return Array.from(tagSet).sort();
  }, [allPartners]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function clearFilters() {
    setQuery('');
    setActiveTags([]);
    setMinMutual(0);
  }

  function openModal(partner: StudyPartner) {
    setSelected(partner);
    setInvited(false);
    setOpen(true);
  }

  // Enhanced data fetching with unified error handling
  useEffect(() => {
    let mounted = true;

    async function fetchSuggestions() {
      setLoading(true);
      setError(null);
      try {
        // Use search endpoint to find potential new partners (not connected yet)
        const data = await DataService.searchPartners();
        if (mounted) {
          // Log the actual data to debug
          console.log('🔍 Raw partner data:', data.map(p => ({ name: p.name, connectionStatus: p.connectionStatus })));
          
          // Filter to only show people not connected yet (be more permissive)
          const newPartners = data.filter(partner => 
            !partner.connectionStatus || 
            partner.connectionStatus === 'none' || 
            partner.connectionStatus === undefined ||
            partner.connectionStatus !== 'accepted'
          );
          
          console.log('🔍 Filtered partners:', newPartners.length, 'out of', data.length);
          
          // Top suggestions based on compatibility score
          const topSuggestions = newPartners
            .sort((a, b) => (b.compatibilityScore || 0) - (a.compatibilityScore || 0))
            .slice(0, 4);
          setSuggestions(topSuggestions);
          setAllPartners(newPartners); // Only show available partners for connection
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          const appError = ErrorHandler.handleApiError(err, 'partners');
          setError(appError);
          setLoading(false);
        }
      }
    }

    async function fetchBuddies() {
      setPartnersLoading(true);
      setPartnersError(null);
      try {
        // Fetch existing buddies (accepted connections)
        const data = await DataService.fetchPartners();
        if (mounted) {
          // Filter to only show accepted connections
          const acceptedBuddies = data.filter(partner => 
            partner.connectionStatus === 'accepted'
          );
          setBuddies(acceptedBuddies);
        }
      } catch (err) {
        if (mounted) {
          const appError = ErrorHandler.handleApiError(err, 'partners');
          setPartnersError(appError);
        }
      } finally {
        if (mounted) setPartnersLoading(false);
      }
    }

    fetchSuggestions();
    fetchBuddies();

    const onAdded = (e: Event) => {
      const detail: any = (e as CustomEvent).detail;
      if (!detail) return;
      const b = detail as StudyPartner;
      setBuddies((prev) => (prev.some((x) => String(x.id) === String(b.id)) ? prev : [b, ...prev]));
    };

    const onInvalidate = () => {
      fetchSuggestions();
      fetchBuddies();
    };

    // Listen for real-time partner request acceptance/rejection
    const handlePartnerAccepted = (event: any) => {
      console.log('🎉 Partner request accepted!', event);
      // Refresh both suggestions and buddies lists
      fetchSuggestions();
      fetchBuddies();
      // Show success notification
      // You could add a toast notification here
    };

    const handlePartnerRejected = (event: any) => {
      console.log('😔 Partner request rejected', event);
      // Refresh suggestions to update button states
      fetchSuggestions();
    };

    // Set up Azure Web PubSub listeners
    const unsubscribeAccepted = azureIntegrationService.onConnectionEvent(
      'partner_request_accepted',
      handlePartnerAccepted
    );
    const unsubscribeRejected = azureIntegrationService.onConnectionEvent(
      'partner_request_rejected',
      handlePartnerRejected
    );

    window.addEventListener('buddy:connected', onAdded as EventListener);
    window.addEventListener('buddies:invalidate', onInvalidate);

    return () => {
      mounted = false;
      unsubscribeAccepted();
      unsubscribeRejected();
      window.removeEventListener('buddy:connected', onAdded as EventListener);
      window.removeEventListener('buddies:invalidate', onInvalidate);
    };
  }, []);

  const handleRetry = () => {
    setError(null);
    setPartnersError(null);
    // Trigger re-fetch
    window.dispatchEvent(new Event('buddies:invalidate'));
  };

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Find study partners</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Connect with classmates who share your courses and study preferences. Build meaningful
          study relationships.
        </p>
      </div>

      {/* Enhanced Error Display with unified red styling */}
      {(error || partnersError) && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-red-900 mb-1">{(error || partnersError)?.title}</h4>
              <p className="text-sm text-red-700 mb-3">{(error || partnersError)?.message}</p>
              <div className="flex flex-wrap gap-3">
                {(error || partnersError)?.retryable && (
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {(error || partnersError)?.action || 'Try again'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setError(null);
                    setPartnersError(null);
                  }}
                  className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Layout: 2 left cards + right column spanning both */}
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:auto-rows-min gap-8">
        {/* Enhanced Suggested Partners Section */}
        <section
          className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-lg hover:shadow-xl transition-shadow duration-300"
          aria-labelledby="suggestions-title"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 id="suggestions-title" className="text-2xl font-bold text-slate-900 mb-2">
                Suggested for you
              </h2>
              <p className="text-slate-600">
                Perfect matches based on your courses and preferences
              </p>
            </div>
            <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-full font-semibold text-sm">
              {suggestions.length} matches
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Loading study partners
                </h3>
                <p className="text-slate-600">Getting your perfect matches...</p>
              </div>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestions.map((suggestion, i) => (
                <EnhancedSuggestionCard
                  key={i}
                  suggestion={suggestion}
                  onConnect={() => openModal(suggestion)}
                  isPending={pendingInvites.has(suggestion.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Enhanced Study Buddies Sidebar */}
        <aside
          className="lg:col-start-3 lg:row-span-2 lg:sticky lg:top-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-lg"
          aria-labelledby="buddies-title"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 id="buddies-title" className="text-2xl font-bold text-slate-900 mb-2">
                Study connections
              </h2>
              <p className="text-slate-600 text-sm">Your study network</p>
            </div>
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold text-sm">
              {buddies.length}
            </div>
          </div>

          {partnersLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600">Loading connections...</p>
            </div>
          ) : buddies.length === 0 ? (
            <EnhancedEmptyBuddies />
          ) : (
            <ul className="space-y-4">
              {buddies.map((b) => (
                <EnhancedBuddyCard key={String(b.id)} buddy={b} />
              ))}
            </ul>
          )}
        </aside>

        {/* Enhanced Search & Filter Section */}
        <section
          className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-lg"
          aria-labelledby="search-title"
        >
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 id="search-title" className="text-2xl font-bold text-slate-900 mb-2">
                Discover more partners
              </h2>
              <p className="text-slate-600">Filter by preferences and shared courses</p>
            </div>
            <button
              onClick={clearFilters}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 underline underline-offset-2 transition-colors"
            >
              Clear all filters
            </button>
          </div>

          {/* Enhanced Search Bar */}
          <div className="flex flex-col gap-4 md:flex-row md:items-end mb-6">
            <div className="flex-1">
              <label htmlFor="q" className="block text-sm font-semibold text-slate-700 mb-2">
                Search partners
              </label>
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, course, or tag..."
                  className="w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all duration-200"
                />
              </div>
            </div>

            {/* Enhanced Mutual Courses Filter */}
            <div className="flex items-end gap-3">
              <div>
                <label htmlFor="mutual" className="block text-sm font-semibold text-slate-700 mb-2">
                  Minimum shared courses
                </label>
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <input
                    id="mutual"
                    type="number"
                    min={0}
                    max={5}
                    value={minMutual}
                    onChange={(e) => setMinMutual(Number(e.target.value))}
                    className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all duration-200"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Tag Filters */}
          <fieldset className="mb-6">
            <legend className="text-sm font-semibold text-slate-700 mb-3">Study preferences</legend>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                    className={[
                      'px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300',
                    ].join(' ')}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Enhanced Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700" aria-live="polite">
                {results.length} {results.length === 1 ? 'partner found' : 'partners found'}
              </div>
              {results.length > 0 && (
                <div className="text-xs text-slate-500">Sorted by compatibility</div>
              )}
            </div>

            {results.length === 0 ? (
              <EnhancedNoResults />
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((partner, i) => (
                  <EnhancedPartnerCard
                    key={`r-${i}`}
                    partner={partner}
                    onConnect={() => openModal(partner)}
                    isPending={pendingInvites.has(partner.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Enhanced Modal */}
      <EnhancedProfileModal
        open={open}
        person={selected}
        invited={invited}
        onInvite={async () => {
          if (!selected?.id) return;
          setInvited(false);
          try {
            // Send buddy request to backend
            await DataService.sendBuddyRequest(selected.id);
            // Optionally, send real-time notification
            try {
              await azureIntegrationService.sendPartnerRequest(Number(selected.id));
            } catch (notifyErr) {
              // Log but don't block UI if notification fails
              console.warn('Notification send failed:', notifyErr);
            }

            // Update pending invites state
            setPendingInvites((prev) => new Set(prev).add(selected.id));
            setInvited(true);

            // Close modal after showing success
            setTimeout(() => {
              setOpen(false);
              setInvited(false);
            }, 1000);

            window.dispatchEvent(new Event('buddies:invalidate'));
            // Optionally, initiate chat here in the future
          } catch (err) {
            // Optionally, show error to user
            setInvited(false);
            alert('Failed to send invite. Please try again.');
          }
        }}
        onClose={() => setOpen(false)}
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
  const initials = initialsFrom(suggestion.name || '—');
  const sharedCoursesText = suggestion.sharedCourses?.length
    ? `${suggestion.sharedCourses.length} shared course${
        suggestion.sharedCourses.length !== 1 ? 's' : ''
      }`
    : 'No shared courses';
  const preferredTimes = suggestion.studyPreferences?.preferredTimes || [];

  return (
    <li className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 grid place-items-center text-lg font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors text-lg">
              {suggestion.name}
            </h3>
            <p className="text-sm text-slate-600 mb-2">{suggestion.course}</p>
            <p className="text-xs text-slate-500">{suggestion.university}</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium">
                {sharedCoursesText}
              </span>
              {preferredTimes.slice(0, 2).map((time) => (
                <span
                  key={time}
                  className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                >
                  {time}
                </span>
              ))}
              {preferredTimes.length > 2 && (
                <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600">
                  +{preferredTimes.length - 2} more
                </span>
              )}
            </div>
          </div>
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

function EnhancedBuddyCard({ buddy }: { buddy: StudyPartner }) {
  const initials = initialsFrom(buddy.name || '—');

  return (
    <li className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-emerald-200 transition-all duration-200">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 grid place-items-center text-sm font-bold flex-shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 mb-1">{buddy.name}</p>
        <p className="text-xs text-slate-600">{buddy.bio || buddy.lastActive || 'Study partner'}</p>
        {buddy.studyHours > 0 && (
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-emerald-600 font-medium">
              {buddy.studyHours}h studied together
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Heart className="h-4 w-4 text-pink-500" />
        <span className="text-xs font-medium text-slate-600">{buddy.rating || 5.0}</span>
      </div>
    </li>
  );
}

function EnhancedPartnerCard({
  partner,
  onConnect,
  isPending = false,
}: {
  partner: StudyPartner;
  onConnect: () => void;
  isPending?: boolean;
}) {
  const initials = initialsFrom(partner.name || '—');
  const sharedCoursesText = partner.sharedCourses?.length
    ? `${partner.sharedCourses.length} shared course${
        partner.sharedCourses.length !== 1 ? 's' : ''
      }`
    : 'No shared courses';
  const preferredTimes = partner.studyPreferences?.preferredTimes || [];

  return (
    <li className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 grid place-items-center text-sm font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">
            {partner.name}
          </h3>
          <p className="text-xs text-slate-600">{partner.course}</p>
          <p className="text-xs text-slate-500">{partner.university}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
          {sharedCoursesText}
        </span>
        {preferredTimes.slice(0, 2).map((time) => (
          <span key={time} className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-700">
            {time}
          </span>
        ))}
      </div>

      <button
        onClick={onConnect}
        disabled={
          isPending ||
          partner.connectionStatus === 'pending' ||
          partner.connectionStatus === 'accepted'
        }
        className={`w-full inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
          isPending || partner.connectionStatus === 'pending'
            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200 cursor-not-allowed'
            : partner.connectionStatus === 'accepted'
            ? 'bg-green-100 text-green-800 border border-green-200 cursor-not-allowed'
            : 'bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
        }`}
      >
        {isPending || partner.connectionStatus === 'pending'
          ? 'Pending'
          : partner.connectionStatus === 'accepted'
          ? 'Buddies'
          : 'Connect'}
      </button>
    </li>
  );
}

function EnhancedEmptyBuddies() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center mx-auto mb-4">
        <Users className="h-8 w-8 text-blue-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">No connections yet</h3>
      <p className="text-sm text-slate-600 mb-4">
        Start building your study network by connecting with suggested partners.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700 font-medium">
          💡 Tip: Send invites to build lasting study relationships
        </p>
      </div>
    </div>
  );
}

function EnhancedNoResults() {
  return (
    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300">
      <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-4">
        <Search className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">No partners found</h3>
      <p className="text-sm text-slate-600 mb-4">
        Try adjusting your filters or search terms to find more study partners.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <span className="text-xs px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
          Remove filters
        </span>
        <span className="text-xs px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
          Try different keywords
        </span>
        <span className="text-xs px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
          Lower requirements
        </span>
      </div>
    </div>
  );
}

/* ---------- Enhanced Modal ---------- */
function EnhancedProfileModal({
  open,
  person,
  invited,
  onInvite,
  onClose,
}: {
  open: boolean;
  person: StudyPartner | null;
  invited: boolean;
  onInvite: () => void;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  const initials = initialsFrom(person.name || '—');

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
        aria-labelledby="p-title"
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
                <h3 id="p-title" className="text-2xl font-bold text-slate-900 mb-1">
                  {person.name}
                </h3>
                <p className="text-slate-600">{person.course}</p>
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
                  `${person.name} is looking for study partners who share similar courses and study preferences.`}
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
              disabled={
                invited ||
                person.connectionStatus === 'pending' ||
                person.connectionStatus === 'accepted'
              }
              className={`flex-1 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                invited || person.connectionStatus === 'pending'
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-200 cursor-default'
                  : person.connectionStatus === 'accepted'
                  ? 'bg-green-100 text-green-800 border border-green-200 cursor-default'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {invited ? (
                <>
                  <Clock className="w-5 h-5" /> Invite sent
                </>
              ) : person.connectionStatus === 'pending' ? (
                person.isPendingSent ? (
                  <>
                    <Clock className="w-5 h-5" /> Pending acceptance
                  </>
                ) : (
                  <>
                    <Clock className="w-5 h-5" /> Pending response
                  </>
                )
              ) : person.connectionStatus === 'accepted' ? (
                <>
                  <Check className="w-5 h-5" /> Study buddies
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

/* ---------- helpers ---------- */
function initialsFrom(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
