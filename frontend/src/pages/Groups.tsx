import { useState, useEffect } from 'react';
import { Users, Plus, Settings, MessageSquare, Calendar, TrendingUp } from 'lucide-react';

type StudyGroup = {
  group_id: number;
  group_name: string;
  description?: string;
  creator_id: number;
  module_id: number;
  max_members: number;
  group_type: 'study' | 'project' | 'exam_prep' | 'discussion';
  group_goals?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
  module_name?: string;
  creator_name?: string;
};

export default function Groups() {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fallback data
  const fallbackGroups: StudyGroup[] = [
    {
      group_id: 1,
      group_name: 'CS Advanced Study Group',
      description: 'Advanced computer science topics and algorithms',
      creator_id: 1,
      module_id: 1,
      max_members: 8,
      group_type: 'study',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 5,
      module_name: 'CS 201 - Data Structures',
      creator_name: 'John Doe',
    },
    {
      group_id: 2,
      group_name: 'Math Warriors',
      description: 'Tackling linear algebra together',
      creator_id: 2,
      module_id: 2,
      max_members: 6,
      group_type: 'exam_prep',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 4,
      module_name: 'MATH 204 - Linear Algebra',
      creator_name: 'Jane Smith',
    },
    {
      group_id: 3,
      group_name: 'Physics Lab Partners',
      description: 'Lab work and problem solving',
      creator_id: 3,
      module_id: 3,
      max_members: 4,
      group_type: 'project',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 3,
      module_name: 'PHY 101 - Mechanics',
      creator_name: 'Alex Johnson',
    },
  ];

  useEffect(() => {
    async function fetchGroups() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/groups');
        if (!res.ok) throw new Error('Failed to fetch groups');
        const data = await res.json();
        setGroups(data);
      } catch (err) {
        // setError('Failed to load study groups');
        setGroups(fallbackGroups);
      } finally {
        setLoading(false);
      }
    }
    fetchGroups();
  }, []);

  const joinGroup = async (groupId: number) => {
    try {
      const res = await fetch(`/api/v1/groups/${groupId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to join group');
      // Refresh groups
      const updatedRes = await fetch('/api/v1/groups');
      const updatedData = await updatedRes.json();
      setGroups(updatedData);
    } catch (err) {
      console.error('Error joining group:', err);
    }
  };

  const getGroupTypeColor = (type: string) => {
    switch (type) {
      case 'exam_prep': return 'text-red-600 bg-red-100';
      case 'project': return 'text-blue-600 bg-blue-100';
      case 'discussion': return 'text-purple-600 bg-purple-100';
      default: return 'text-green-600 bg-green-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Groups</h1>
          <p className="text-gray-600">Join or create study groups to collaborate with peers</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition">
          <Plus className="w-5 h-5" />
          Create Group
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-blue-50 text-blue-800 px-4 py-2">Showing demo groups</div>
      )}

      {loading ? (
        <div className="text-center text-slate-600">Loading study groups...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(group => (
            <div key={group.group_id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{group.group_name}</h3>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getGroupTypeColor(group.group_type)} mb-3`}>
                    {group.group_type.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              {group.description && (
                <p className="text-gray-600 text-sm mb-4">{group.description}</p>
              )}

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{group.member_count || 0}/{group.max_members} members</span>
                </div>
                {group.module_name && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>{group.module_name}</span>
                  </div>
                )}
                {group.creator_name && (
                  <div className="text-xs text-gray-500">
                    Created by {group.creator_name}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => joinGroup(group.group_id)}
                  className="flex-1 px-3 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-600 transition"
                >
                  Join Group
                </button>
                <button className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button className="p-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && !loading && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No study groups found</h3>
          <p className="text-gray-600 mb-6">Create your first study group to start collaborating</p>
          <button className="px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition">
            Create Your First Group
          </button>
        </div>
      )}
    </div>
  );
}