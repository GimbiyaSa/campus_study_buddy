import { useEffect, useState } from 'react';
import { Search, Filter, Heart, X, Users, Sparkles, Loader2 } from 'lucide-react';
import { azureService, type StudyPartner } from '../services/azureIntegrationService';

type PartnerFiltersState = {
  major: string;
  year: string;
  modules: string[];
  studyPreferences: string[];
  availability: string[];
  minCompatibilityScore: number;
  maxDistance: number;
  isOnline: boolean;
};

type PartnerUpdateEvent = {
  type: 'new_partner' | 'partner_updated' | 'partner_removed' | string;
  [key: string]: unknown;
};

const extractPreferenceTags = (partner: StudyPartner): string[] => {
  const tags: string[] = [];
  const { studyPreferences } = partner;

  if (studyPreferences?.studyStyle) {
    tags.push(studyPreferences.studyStyle);
  }

  if (studyPreferences?.groupSize) {
    tags.push(studyPreferences.groupSize);
  }

  if (studyPreferences?.location) {
    tags.push(studyPreferences.location);
  }

  if (studyPreferences?.sessionDuration) {
    tags.push(studyPreferences.sessionDuration);
  }

  if (Array.isArray(studyPreferences?.preferredTimes)) {
    tags.push(...studyPreferences.preferredTimes);
  }

  if (Array.isArray(studyPreferences?.subjects)) {
    tags.push(...studyPreferences.subjects);
  }

  return tags;
};

interface PartnerMatchingProps {
  onPartnerConnect?: (partnerId: number) => void;
}

export default function PartnerMatching({ onPartnerConnect }: PartnerMatchingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PartnerFiltersState>({
    major: '',
    year: '',
    modules: [],
    studyPreferences: [],
    availability: [],
    minCompatibilityScore: 0.6,
    maxDistance: 50,
    isOnline: false
  });
  
  const [partners, setPartners] = useState<StudyPartner[]>([]);
  const [filteredPartners, setFilteredPartners] = useState<StudyPartner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<StudyPartner | null>(null);
  const [connectingTo, setConnectingTo] = useState<number | null>(null);
  const [pendingConnections, setPendingConnections] = useState<Set<number>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  const [availableFilters, setAvailableFilters] = useState({
    majors: [] as string[],
    years: [] as string[],
    modules: [] as string[],
    studyPreferences: [] as string[]
  });

  useEffect(() => {
    loadPartners();
    loadFilterOptions();
    
    // Subscribe to real-time partner updates
    const unsubscribe = azureService.onConnectionEvent('partner_update', (update: PartnerUpdateEvent) => {
      if (update.type === 'new_partner' || update.type === 'partner_updated') {
        void loadPartners();
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    filterPartners();
  }, [searchQuery, filters, partners]);

  const loadPartners = async () => {
    try {
      setLoading(true);
      
      const [recommendedPartners, allPartners] = await Promise.all([
        azureService.getPartnerRecommendations(50),
        azureService.searchPartners({ limit: 50, minCompatibilityScore: 0.3 })
      ]);
      
      // Combine and deduplicate
      const allPartnersMap = new Map<number, StudyPartner>();
      [...recommendedPartners, ...allPartners].forEach((partner) => {
        allPartnersMap.set(partner.id, partner);
      });
      
      const uniquePartners = Array.from(allPartnersMap.values())
        .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
      
      setPartners(uniquePartners);
      
      // Load pending connections
      const pending = await azureService.getPartnerMatches('pending');
      const pendingSet = new Set<number>();

      pending.forEach((match: any) => {
        const potentialIds = [
          match.partnerId,
          match.partner_id,
          match.matched_user_id,
          match.partner?.id,
          match.partnerUserId
        ];

        for (const value of potentialIds) {
          if (typeof value === 'number') {
            pendingSet.add(value);
            break;
          }

          if (typeof value === 'string') {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              pendingSet.add(parsed);
              break;
            }
          }
        }
      });

      setPendingConnections(pendingSet);
      
    } catch (error) {
      console.error('Error loading partners:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    try {
      // These would come from your backend API
      setAvailableFilters({
        majors: ['Computer Science', 'Engineering', 'Business', 'Mathematics', 'Physics', 'Chemistry', 'Biology'],
        years: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate'],
        modules: ['CS101', 'CS201', 'MATH101', 'ENG101', 'BUS101', 'PHYS101'],
        studyPreferences: ['Visual Learner', 'Auditory Learner', 'Kinesthetic Learner', 'Group Study', 'Solo Study', 'Morning Person', 'Night Owl']
      });
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  const filterPartners = () => {
    let filtered = partners;

    const trimmedQuery = searchQuery.trim().toLowerCase();

    if (trimmedQuery) {
      filtered = filtered.filter((partner) =>
        partner.name.toLowerCase().includes(trimmedQuery) ||
        partner.major.toLowerCase().includes(trimmedQuery) ||
        partner.modules.some((module) => module.toLowerCase().includes(trimmedQuery)) ||
        partner.bio?.toLowerCase().includes(trimmedQuery)
      );
    }

    // Apply filters
    if (filters.major) {
      filtered = filtered.filter(partner => partner.major === filters.major);
    }

    if (filters.year) {
      filtered = filtered.filter(partner => partner.year === filters.year);
    }

    if (filters.modules.length > 0) {
      filtered = filtered.filter((partner) =>
        filters.modules.some((module) => partner.modules.includes(module))
      );
    }

    if (filters.studyPreferences.length > 0) {
      filtered = filtered.filter((partner) => {
        const partnerTags = extractPreferenceTags(partner).map(tag => tag.toLowerCase());
        return filters.studyPreferences.some(pref => partnerTags.includes(pref.toLowerCase()));
      });
    }

    if (filters.minCompatibilityScore > 0) {
      filtered = filtered.filter(partner => partner.compatibilityScore >= filters.minCompatibilityScore);
    }

    if (filters.isOnline) {
      filtered = filtered.filter(partner => partner.isOnline);
    }

    setFilteredPartners(filtered);
  };

  const handleConnect = async (partnerId: number) => {
    try {
      setConnectingTo(partnerId);
      const partner = partners.find((p) => p.id === partnerId);
      const compatibility = partner ? Math.round(partner.compatibilityScore * 100) : null;
      const message = compatibility !== null
        ? `Hi! I'd love to study together. We have a ${compatibility}% compatibility match!`
        : `Hi! I'd love to study together. Let's connect!`;

      await azureService.sendPartnerRequest(partnerId, undefined, message);

      setPendingConnections((prev) => {
        const updated = new Set(prev);
        updated.add(partnerId);
        return updated;
      });

      onPartnerConnect?.(partnerId);
      
      // Show success message
      console.log('Connection request sent!');
      
    } catch (error) {
      console.error('Error sending connection request:', error);
    } finally {
      setConnectingTo(null);
    }
  };

  const getCompatibilityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100';
    if (score >= 0.6) return 'text-blue-600 bg-blue-100';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getCompatibilityLabel = (score: number) => {
    if (score >= 0.9) return 'Perfect Match';
    if (score >= 0.8) return 'Excellent Match';
    if (score >= 0.6) return 'Good Match';
    if (score >= 0.4) return 'Fair Match';
    return 'Low Match';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Finding your perfect study partners...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-600" />
            Find Study Partners
          </h1>
          <p className="text-gray-600">Discover compatible study partners using AI-powered matching</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {viewMode === 'cards' ? 'List View' : 'Card View'}
          </button>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search by name, major, modules, or interests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Major Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Major</label>
              <select
                value={filters.major}
                onChange={(e) => setFilters({ ...filters, major: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Majors</option>
                {availableFilters.majors.map(major => (
                  <option key={major} value={major}>{major}</option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <select
                value={filters.year}
                onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Years</option>
                {availableFilters.years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Compatibility Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Min Compatibility: {Math.round(filters.minCompatibilityScore * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.minCompatibilityScore}
                onChange={(e) => setFilters({ ...filters, minCompatibilityScore: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Online Status Filter */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.isOnline}
                  onChange={(e) => setFilters({ ...filters, isOnline: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Online now</span>
              </label>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end">
            <button
              onClick={() => setFilters({
                major: '',
                year: '',
                modules: [],
                studyPreferences: [],
                availability: [],
                minCompatibilityScore: 0.6,
                maxDistance: 50,
                isOnline: false
              })}
              className="text-gray-600 hover:text-gray-800 text-sm"
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600">
          Found {filteredPartners.length} study partner{filteredPartners.length !== 1 ? 's' : ''}
        </p>
        
        <select className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
          <option value="compatibility">Sort by Compatibility</option>
          <option value="name">Sort by Name</option>
          <option value="year">Sort by Year</option>
          <option value="online">Online First</option>
        </select>
      </div>

      {/* Partners Grid/List */}
      {filteredPartners.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No partners found</h3>
          <p className="text-gray-600 mb-4">Try adjusting your search criteria or filters</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setFilters({
                major: '',
                year: '',
                modules: [],
                studyPreferences: [],
                availability: [],
                minCompatibilityScore: 0.3,
                maxDistance: 50,
                isOnline: false
              });
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reset Search
          </button>
        </div>
      ) : (
        <div className={viewMode === 'cards' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
          : 'space-y-4'
        }>
          {filteredPartners.map((partner) => {
            const preferenceTags = extractPreferenceTags(partner);

            return (
              <div
                key={partner.id}
                className={`bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 ${
                  viewMode === 'cards' ? 'p-6' : 'p-4 flex items-center gap-4'
                }`}
              >
                {viewMode === 'cards' ? (
                  /* Card View */
                  <>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {partner.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{partner.name}</h3>
                        <p className="text-sm text-gray-600">{partner.major} • {partner.year}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {partner.isOnline && (
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      )}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCompatibilityColor(partner.compatibilityScore)}`}>
                        {Math.round(partner.compatibilityScore * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Compatibility Score */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Compatibility</span>
                      <span className="text-sm text-gray-600">{getCompatibilityLabel(partner.compatibilityScore)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${partner.compatibilityScore * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Modules */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Shared Modules</p>
                    <div className="flex flex-wrap gap-1">
                      {partner.modules.slice(0, 3).map((module, index) => (
                        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                          {module}
                        </span>
                      ))}
                      {partner.modules.length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          +{partner.modules.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Study Preferences */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Study Style</p>
                    <div className="flex flex-wrap gap-1">
                      {preferenceTags.slice(0, 2).map((pref, index) => (
                        <span key={index} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          {pref}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bio */}
                  {partner.bio && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{partner.bio}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPartner(partner)}
                      className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      View Profile
                    </button>
                    
                    {pendingConnections.has(partner.id) ? (
                      <button
                        disabled
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed"
                      >
                        Request Sent
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(partner.id)}
                        disabled={connectingTo === partner.id}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {connectingTo === partner.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Heart className="w-4 h-4" />
                        )}
                        Connect
                      </button>
                    )}
                  </div>
                  </>
                ) : (
                  /* List View */
                  <>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                      {partner.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{partner.name}</h3>
                      <p className="text-sm text-gray-600">{partner.major} • {partner.year}</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCompatibilityColor(partner.compatibilityScore)}`}>
                        {Math.round(partner.compatibilityScore * 100)}% match
                      </span>
                      {partner.isOnline && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          Online
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-1">
                      {partner.modules.slice(0, 2).map((module, index) => (
                        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                          {module}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPartner(partner)}
                      className="px-3 py-1 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                    >
                      View
                    </button>
                    
                    {pendingConnections.has(partner.id) ? (
                      <button
                        disabled
                        className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed text-sm"
                      >
                        Sent
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(partner.id)}
                        disabled={connectingTo === partner.id}
                        className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                      >
                        {connectingTo === partner.id ? '...' : 'Connect'}
                      </button>
                    )}
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Partner Profile Modal */}
      {selectedPartner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">Partner Profile</h2>
                <button
                  onClick={() => setSelectedPartner(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Detailed partner info would go here */}
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-xl mx-auto mb-3">
                    {selectedPartner.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedPartner.name}</h3>
                  <p className="text-gray-600">{selectedPartner.major} • {selectedPartner.year}</p>
                </div>
                
                {/* More detailed profile content would go here */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}