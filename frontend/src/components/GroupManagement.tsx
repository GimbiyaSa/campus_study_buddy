import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Calendar,
  UserPlus,
  Crown,
  MoreVertical,
  X,
  Loader2
} from 'lucide-react';
import { azureService, type StudyGroup, type StudySession, type GroupMember } from '../services/azureIntegrationService';

interface GroupManagementProps {
  onGroupSelect?: (groupId: number) => void;
}

export default function GroupManagement({ onGroupSelect }: GroupManagementProps) {
  const [myGroups, setMyGroups] = useState<StudyGroup[]>([]);
  const [availableGroups, setAvailableGroups] = useState<StudyGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StudyGroup | null>(null);
  const [groupSessions, setGroupSessions] = useState<StudySession[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'my-groups' | 'browse' | 'create'>('my-groups');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | 'create' | null>(null);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [, setShowInviteModal] = useState(false);
  const [createGroupForm, setCreateGroupForm] = useState({
    name: '',
    description: '',
    moduleCode: '',
    isPrivate: false,
    maxMembers: 10,
    studyGoals: '',
    meetingSchedule: ''
  });

  useEffect(() => {
    loadGroupData();
    
    // Subscribe to real-time group updates
    const unsubscribe = azureService.onConnectionEvent('group_update', (update: { type: string; groupId: number }) => {
      handleGroupUpdate(update);
    });

    return () => unsubscribe();
  }, []);

  const loadGroupData = async () => {
    try {
      setLoading(true);
      
      const [myGroupsData, availableGroupsData] = await Promise.all([
        azureService.getMyGroups(),
  azureService.getStudyGroups({})
      ]);
      
      setMyGroups(myGroupsData);
      setAvailableGroups(availableGroupsData.filter(group => 
        !myGroupsData.some(myGroup => myGroup.id === group.id)
      ));
      
    } catch (error) {
      console.error('Error loading group data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupDetails = async (groupId: number) => {
    try {
      const [sessions, members] = await Promise.all([
        azureService.getGroupSessions(groupId),
        azureService.getGroupMembers(groupId)
      ]);
      
      setGroupSessions(sessions);
      setGroupMembers(members);
    } catch (error) {
      console.error('Error loading group details:', error);
    }
  };

  const handleGroupUpdate = (update: { type: string; groupId: number }) => {
    switch (update.type) {
      case 'member_joined':
        if (selectedGroup?.id === update.groupId) {
          loadGroupDetails(update.groupId);
        }
        loadGroupData();
        break;
      case 'member_left':
        if (selectedGroup?.id === update.groupId) {
          loadGroupDetails(update.groupId);
        }
        loadGroupData();
        break;
      case 'group_updated':
        loadGroupData();
        break;
      case 'session_created':
        if (selectedGroup?.id === update.groupId) {
          loadGroupDetails(update.groupId);
        }
        break;
    }
  };

  const handleJoinGroup = async (groupId: number) => {
    try {
      setActionLoading(groupId);
      
      await azureService.joinGroup(groupId);
      
      // Move group from available to my groups
      const group = availableGroups.find(g => g.id === groupId);
      if (group) {
        setMyGroups(prev => [...prev, { ...group, memberCount: group.memberCount + 1 }]);
        setAvailableGroups(prev => prev.filter(g => g.id !== groupId));
      }
      
    } catch (error) {
      console.error('Error joining group:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveGroup = async (groupId: number) => {
    try {
      setActionLoading(groupId);
      
      await azureService.leaveGroup(groupId);
      
      // Remove from my groups
      setMyGroups(prev => prev.filter(g => g.id !== groupId));
      
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }
      
    } catch (error) {
      console.error('Error leaving group:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading('create');
      
      const newGroup = await azureService.createStudyGroup({
        name: createGroupForm.name,
        description: createGroupForm.description,
        moduleCode: createGroupForm.moduleCode,
        isPrivate: createGroupForm.isPrivate,
        maxMembers: createGroupForm.maxMembers,
        tags: [],
        studyGoals: createGroupForm.studyGoals
          ? createGroupForm.studyGoals.split(',').map(goal => goal.trim()).filter(Boolean)
          : [],
        meetingSchedule: createGroupForm.meetingSchedule
          ? {
              frequency: 'weekly',
              preferredDays: [],
              preferredTimes: [],
              duration: createGroupForm.meetingSchedule,
              location: createGroupForm.isPrivate ? 'online' : 'flexible'
            }
          : undefined
      });
      
      setMyGroups(prev => [newGroup, ...prev]);
      setShowCreateModal(false);
      setCreateGroupForm({
        name: '',
        description: '',
        moduleCode: '',
        isPrivate: false,
        maxMembers: 10,
        studyGoals: '',
        meetingSchedule: ''
      });
      
    } catch (error) {
      console.error('Error creating group:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectGroup = (group: StudyGroup) => {
    setSelectedGroup(group);
    loadGroupDetails(group.id);
    onGroupSelect?.(group.id);
  };

  const filteredGroups = (groups: StudyGroup[]) => {
    let filtered = groups;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(group =>
        group.name.toLowerCase().includes(query) ||
        group.moduleCode.toLowerCase().includes(query) ||
        group.description?.toLowerCase().includes(query)
      );
    }
    
    if (filterCategory !== 'all') {
      filtered = filtered.filter(group => 
        group.moduleCode.toLowerCase().includes(filterCategory.toLowerCase())
      );
    }
    
    return filtered;
  };

  const getGroupStatusColor = (group: StudyGroup) => {
    const now = new Date();
    const lastActivity = new Date(group.lastActivity || group.createdAt);
    const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceActivity <= 1) return 'bg-green-100 text-green-600';
    if (daysSinceActivity <= 7) return 'bg-blue-100 text-blue-600';
    if (daysSinceActivity <= 30) return 'bg-yellow-100 text-yellow-600';
    return 'bg-gray-100 text-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your study groups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Groups</h1>
          <p className="text-gray-600">Join groups and collaborate with fellow students</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Group
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setViewMode('my-groups')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'my-groups'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          My Groups ({myGroups.length})
        </button>
        <button
          onClick={() => setViewMode('browse')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'browse'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Browse Groups
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search groups by name, module, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          <option value="cs">Computer Science</option>
          <option value="math">Mathematics</option>
          <option value="eng">Engineering</option>
          <option value="bus">Business</option>
        </select>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups List */}
        <div className="lg:col-span-2">
          {viewMode === 'my-groups' ? (
            <div className="space-y-4">
              {filteredGroups(myGroups).length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No groups yet</h3>
                  <p className="text-gray-600 mb-4">Join your first study group to get started</p>
                  <button
                    onClick={() => setViewMode('browse')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Browse Groups
                  </button>
                </div>
              ) : (
                filteredGroups(myGroups).map((group) => (
                  <div
                    key={group.id}
                    className={`bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all cursor-pointer ${
                      selectedGroup?.id === group.id ? 'ring-2 ring-blue-500 border-blue-300' : ''
                    }`}
                    onClick={() => handleSelectGroup(group)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                          {group.moduleCode.slice(0, 2)}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{group.name}</h3>
                            {group.isPrivate && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Private</span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-2">{group.moduleCode}</p>
                          <p className="text-sm text-gray-700 mb-3 line-clamp-2">{group.description}</p>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {group.memberCount} members
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {groupSessions.filter(s => s.groupId === group.id && new Date(s.scheduledAt) > new Date()).length} upcoming
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGroupStatusColor(group)}`}>
                          Active
                        </span>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLeaveGroup(group.id);
                          }}
                          disabled={actionLoading === group.id}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          {actionLoading === group.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreVertical className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGroups(availableGroups).map((group) => (
                <div
                  key={group.id}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center text-white font-semibold">
                      {group.moduleCode.slice(0, 2)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{group.name}</h3>
                        {group.isPrivate && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Private</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{group.moduleCode}</p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-4 line-clamp-3">{group.description}</p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {group.memberCount}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getGroupStatusColor(group)}`}>
                        Active
                      </span>
                    </div>
                    
                    <button
                      onClick={() => handleJoinGroup(group.id)}
                      disabled={actionLoading === group.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {actionLoading === group.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group Details Sidebar */}
        <div className="space-y-6">
          {selectedGroup ? (
            <>
              {/* Group Info */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Group Details</h3>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Module:</span>
                    <p className="text-sm text-gray-600">{selectedGroup.moduleCode}</p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-700">Members:</span>
                    <p className="text-sm text-gray-600">{selectedGroup.memberCount} / {selectedGroup.maxMembers}</p>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium text-gray-700">Created:</span>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedGroup.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Invite Members
                  </button>
                </div>
              </div>

              {/* Upcoming Sessions */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Upcoming Sessions</h3>
                
                {groupSessions.length === 0 ? (
                  <div className="text-center py-6">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">No sessions scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupSessions.slice(0, 3).map((session) => (
                      <div key={session.id} className="p-3 border border-gray-200 rounded-lg">
                        <h4 className="font-medium text-gray-900 text-sm">{session.title}</h4>
                        <p className="text-xs text-gray-600 mt-1">
                          {new Date(session.scheduledAt).toLocaleDateString()} at{' '}
                          {new Date(session.scheduledAt).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Members */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Members</h3>
                
                <div className="space-y-3">
                  {groupMembers.slice(0, 5).map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-600">{member.role}</p>
                      </div>
                      {member.role === 'admin' && (
                        <Crown className="w-4 h-4 text-yellow-500" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">Select a group to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Create Study Group</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={createGroupForm.name}
                    onChange={(e) => setCreateGroupForm({ ...createGroupForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., CS101 Study Group"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Module Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={createGroupForm.moduleCode}
                    onChange={(e) => setCreateGroupForm({ ...createGroupForm, moduleCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., CS101"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={createGroupForm.description}
                    onChange={(e) => setCreateGroupForm({ ...createGroupForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Describe your study group's goals and activities..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Members
                  </label>
                  <select
                    value={createGroupForm.maxMembers}
                    onChange={(e) => setCreateGroupForm({ ...createGroupForm, maxMembers: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={5}>5 members</option>
                    <option value={10}>10 members</option>
                    <option value={15}>15 members</option>
                    <option value={20}>20 members</option>
                  </select>
                </div>
                
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createGroupForm.isPrivate}
                      onChange={(e) => setCreateGroupForm({ ...createGroupForm, isPrivate: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Make this group private</span>
                  </label>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === 'create'}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'create' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Create Group
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}