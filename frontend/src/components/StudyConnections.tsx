import { useState, useEffect } from 'react';
import { Users, MessageCircle, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { navigate } from '../router';
import { DataService, type StudyPartner } from '../services/dataService';
import { ErrorHandler, type AppError } from '../utils/errorHandler';

export default function StudyConnections() {
  const [connections, setConnections] = useState<StudyPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  // Fetch accepted study connections
  useEffect(() => {
    async function fetchConnections() {
      setLoading(true);
      setError(null);
      try {
        const partners = await DataService.searchPartners(); // This gets accepted connections
        setConnections(partners.slice(0, 6)); // Show top 6 connections
      } catch (err) {
        const appError = ErrorHandler.handleApiError(err, 'partners');
        setError(appError);
      } finally {
        setLoading(false);
      }
    }

    fetchConnections();

    // Listen for updates when new connections are made
    const handleUpdate = () => {
      fetchConnections();
    };

    window.addEventListener('buddies:invalidate', handleUpdate);

    return () => {
      window.removeEventListener('buddies:invalidate', handleUpdate);
    };
  }, []);

  const handleRetry = () => {
    setError(null);
    // Trigger re-fetch
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Study Connections</h2>
          <p className="text-slate-600">Your active study buddies</p>
        </div>
        <button
          onClick={() => navigate('/chat')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Open chat
        </button>
      </div>

      {/* Error Display */}
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-slate-600">Loading connections...</p>
          </div>
        </div>
      ) : connections.length === 0 ? (
        <EmptyConnections />
      ) : (
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((connection) => (
              <ConnectionCard key={connection.id} connection={connection} />
            ))}
          </div>

          {/* Bottom Action */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                <span className="font-medium">{connections.length}</span> active connections
              </div>
              <button
                onClick={() => navigate('/chat')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-emerald-700 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 transition-all duration-200"
              >
                <MessageCircle className="h-4 w-4" />
                Start chatting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionCard({ connection }: { connection: StudyPartner }) {
  const initials = connection.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-300">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 grid place-items-center text-sm font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
            {connection.name}
          </h3>
          <p className="text-xs text-slate-600 truncate">
            {connection.course || connection.university}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
            Study buddy
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/chat')}
            className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors"
            title="Message"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('/sessions')}
            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
            title="Schedule session"
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyConnections() {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mx-auto mb-4">
        <Users className="h-8 w-8 text-emerald-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">No study connections yet</h3>
      <p className="text-slate-600 mb-4 max-w-sm mx-auto">
        Start connecting with study partners to build your study network.
      </p>
      <button
        onClick={() => navigate('/partners')}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-emerald-700 hover:shadow-lg transition-all duration-200"
      >
        <Users className="h-4 w-4" />
        Find study partners
      </button>
    </div>
  );
}
