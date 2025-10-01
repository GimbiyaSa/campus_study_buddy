// frontend/src/services/dataService.ts
import { buildApiUrl } from '../utils/url';
import { ErrorHandler } from '../utils/errorHandler';

// Enhanced Course type leveraging database richness
export type Course = {
  id: string;
  type: 'institution' | 'casual';
  code?: string;
  title: string;
  term?: string;
  description?: string;
  university?: string;

  // Progress & Analytics (from user_progress + study_hours tables)
  progress?: number;
  totalHours?: number;
  totalTopics?: number;
  completedTopics?: number;
  completedChapters?: number;
  totalChapters?: number;

  // Enrollment details (from user_modules table)
  enrollmentStatus?: 'active' | 'completed' | 'dropped';
  enrolledAt?: string;

  // Study metrics (from study_hours aggregations)
  weeklyHours?: number;
  monthlyHours?: number;
  averageSessionDuration?: number;
  studyStreak?: number;
  lastStudiedAt?: string;

  // Social context (from study_groups + session_attendees)
  activeStudyGroups?: number;
  upcomingSessions?: number;
  studyPartners?: number;

  // Activity timeline
  recentActivity?: {
    type: 'topic_completed' | 'chapter_finished' | 'session_attended' | 'hours_logged';
    description: string;
    timestamp: string;
  }[];

  // Timestamps
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

// Enhanced Study Partner type with rich profile data
export type StudyPartner = {
  id: string;
  name: string;
  avatar?: string;

  // Academic profile (from users table)
  university: string;
  course: string;
  yearOfStudy: number;
  bio?: string;

  // Study preferences & compatibility
  studyPreferences?: {
    preferredTimes: string[];
    studyStyle: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
    groupSize: 'small' | 'medium' | 'large';
    environment: 'quiet' | 'collaborative' | 'flexible';
  };

  // Shared academic context (from user_modules overlap)
  sharedCourses: string[];
  sharedTopics: string[];
  compatibilityScore: number;

  // Activity & engagement metrics
  studyHours: number;
  weeklyHours: number;
  studyStreak: number;
  activeGroups: number;
  sessionsAttended: number;

  // Social proof & reliability
  rating: number;
  reviewCount: number;
  responseRate: number;
  lastActive: string;

  // Connection status
  connectionStatus?: 'not_connected' | 'pending' | 'connected' | 'blocked';
  mutualConnections?: number;

  // Study match details
  recommendationReason?: string;
  sharedGoals?: string[];
};

// Pagination type for API responses
export type PaginatedResponse<T> = {
  courses?: T[];
  data?: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

type CourseFetchOptions = {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'enrolled_at' | 'module_name' | 'progress';
  sortOrder?: 'ASC' | 'DESC';
};

export type StudySession = {
  id: string;
  title: string;
  course?: string;
  courseCode?: string;
  date: string;       // 'YYYY-MM-DD'
  startTime: string;  // 'HH:mm'
  endTime: string;    // 'HH:mm'
  location: string;
  type: 'study' | 'review' | 'project' | 'exam_prep' | 'discussion';
  participants: number;
  maxParticipants?: number;
  status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  isCreator?: boolean;
  isAttending?: boolean;
  groupId?: number | string;
};

export type StudyGroup = {
  id: string; // backend/cosmos id
  name: string;
  description?: string;
  course?: string;
  courseCode?: string;
  maxMembers?: number;
  isPublic: boolean;
  members?: Array<{ userId: string }>;
  createdBy?: string;
  createdAt?: string;
  lastActivity?: string;
  group_type?: 'study' | 'project' | 'exam_prep' | 'discussion';
  member_count?: number; // optional count
};

export type StudyPartner = {
  id: string;
  name: string;
  avatar?: string;
  year: string;
  major: string;
  courses: string[];
  bio?: string;
  studyHours: number;
  rating: number;
  lastActive: string;
};

// -------- Demo fallback data --------
export const FALLBACK_COURSES: Course[] = [
  {
    id: '1',
    type: 'institution',
    code: 'CS301',
    title: 'Data Structures & Algorithms',
    term: '2025 · Semester 2',
    progress: 78,
  },
  {
    id: '2',
    type: 'institution',
    code: 'CS305',
    title: 'Database Systems',
    term: '2025 · Semester 2',
    progress: 65,
  },
  {
    id: '3',
    type: 'institution',
    code: 'MATH204',
    title: 'Linear Algebra',
    term: '2025 · Semester 2',
    progress: 82,
  },
  {
    id: '4',
    type: 'institution',
    code: 'CS403',
    title: 'Software Engineering',
    term: '2025 · Semester 2',
    progress: 45,
  },
  {
    id: '5',
    type: 'casual',
    title: 'Machine Learning Basics',
    description: 'Self-paced learning of ML fundamentals',
    progress: 23,
  },
];

export const FALLBACK_SESSIONS: StudySession[] = [
  { id: '1', title: 'Algorithms Study Group', course: 'Data Structures & Algorithms', courseCode: 'CS301', date: '2025-09-18', startTime: '14:00', endTime: '16:00', location: 'Library Room 204', type: 'study', participants: 4, maxParticipants: 6, status: 'upcoming', isCreator: true, groupId: 1, isAttending: true },
  { id: '2', title: 'Database Design Workshop', course: 'Database Systems', courseCode: 'CS305', date: '2025-09-19', startTime: '10:00', endTime: '12:00', location: 'Computer Lab B', type: 'project', participants: 6, maxParticipants: 8, status: 'upcoming', isCreator: false, groupId: 2, isAttending: false },
  { id: '3', title: 'Linear Algebra Review', course: 'Linear Algebra', courseCode: 'MATH204', date: '2025-09-20', startTime: '15:00', endTime: '17:00', location: 'Study Hall A', type: 'review', participants: 3, maxParticipants: 5, status: 'upcoming', isCreator: true, groupId: 3, isAttending: true },
  { id: '4', title: 'ML Fundamentals Discussion', course: 'Machine Learning Basics', date: '2025-09-15', startTime: '16:00', endTime: '18:00', location: 'Study Hall A', type: 'discussion', participants: 3, status: 'completed', isCreator: true, groupId: 5, isAttending: true },
];

export const FALLBACK_GROUPS: StudyGroup[] = [
  { id: '1', name: 'CS Advanced Study Circle', description: 'Advanced CS topics', course: 'Data Structures & Algorithms', courseCode: 'CS301', isPublic: true, maxMembers: 15, member_count: 12, createdBy: 'Alex Johnson', createdAt: '2025-08-15' },
  { id: '2', name: 'Database Design Masters', description: 'Database design, SQL, optimization', course: 'Database Systems', courseCode: 'CS305', isPublic: true, maxMembers: 12, member_count: 8, createdBy: 'Sarah Chen', createdAt: '2025-08-20' },
  { id: '3', name: 'Math Study Warriors', description: 'Linear algebra, calculus, proofs', course: 'Linear Algebra', courseCode: 'MATH204', isPublic: true, maxMembers: 10, member_count: 6, createdBy: 'Maria Rodriguez', createdAt: '2025-08-25' },
  { id: '4', name: 'Software Engineering Pros', description: 'Patterns, agile, testing', course: 'Software Engineering', courseCode: 'CS403', isPublic: true, maxMembers: 20, member_count: 15, createdBy: 'David Kim', createdAt: '2025-09-01' },
];

export const FALLBACK_PARTNERS: StudyPartner[] = [
  {
    id: '1',
    name: 'Emma Wilson',
    year: '3rd Year',
    major: 'Computer Science',
    courses: ['CS301', 'CS305', 'MATH204'],
    bio: 'Passionate about algorithms and machine learning. Looking for study partners for advanced CS topics.',
    studyHours: 45,
    rating: 4.8,
    lastActive: '2025-09-16',
  },
  {
    id: '2',
    name: 'Marcus Johnson',
    year: '2nd Year',
    major: 'Computer Science',
    courses: ['CS201', 'MATH204', 'PHY101'],
    bio: 'Strong in mathematics, enjoy collaborative problem solving and explaining concepts.',
    studyHours: 38,
    rating: 4.6,
    lastActive: '2025-09-15',
  },
  {
    id: '3',
    name: 'Sophia Chen',
    year: '4th Year',
    major: 'Software Engineering',
    courses: ['CS403', 'CS305', 'CS450'],
    bio: 'Experienced with software design patterns and database optimization. Happy to mentor others.',
    studyHours: 52,
    rating: 4.9,
    lastActive: '2025-09-17',
  },
  {
    id: '4',
    name: 'James Rodriguez',
    year: '3rd Year',
    major: 'Data Science',
    courses: ['STAT301', 'CS301', 'MATH204'],
    bio: 'Statistics and data analysis enthusiast. Great at breaking down complex problems.',
    studyHours: 41,
    rating: 4.7,
    lastActive: '2025-09-14',
  },
  {
    id: '5',
    name: 'Aisha Patel',
    year: '2nd Year',
    major: 'Computer Science',
    courses: ['CS201', 'CS205', 'MATH204'],
    bio: 'Web development and UI/UX interested. Love working on projects and learning new technologies.',
    studyHours: 33,
    rating: 4.5,
    lastActive: '2025-09-16',
  },
  {
    id: '6',
    name: 'Ryan Thompson',
    year: '4th Year',
    major: 'Computer Engineering',
    courses: ['CS403', 'EE301', 'CS450'],
    bio: 'Hardware-software integration expert. Excellent at system design and architecture discussions.',
    studyHours: 48,
    rating: 4.8,
    lastActive: '2025-09-17',
  },
];

// -------- Service --------
export class DataService {
  private static getBaseUrl(): string {
    // In browser, use relative URLs. In tests/Node.js, use localhost
    if (typeof window !== 'undefined') return '';
    return 'http://localhost:3000';
  }

  private static authHeaders(): Headers {
    const h = new Headers();
    // Check for both 'google_id_token' (Google Auth) and 'token' (fallback)
    const googleToken =
      typeof window !== 'undefined' ? localStorage.getItem('google_id_token') : null;
    const generalToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const raw = googleToken || generalToken;

    console.log('🔍 Auth token check:', {
      googleToken: googleToken ? `${googleToken.substring(0, 20)}...` : null,
      generalToken: generalToken ? `${generalToken.substring(0, 20)}...` : null,
      selectedToken: raw ? `${raw.substring(0, 20)}...` : null,
    });

    if (raw) {
      let t = raw;
      try {
        const p = JSON.parse(raw);
        if (typeof p === 'string') t = p;
      } catch {}
      t = t
        .replace(/^["']|["']$/g, '')
        .replace(/^Bearer\s+/i, '')
        .trim();
      if (t) h.set('Authorization', `Bearer ${t}`);
    }

    return h;
  }

  private static devForceFallback(): boolean {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search);
    return q.get('mockSessions') === '1' || localStorage.getItem('mockSessions') === '1';
  }

  static async fetchCourses(): Promise<Course[]> {
    try {
      const res = await fetch(buildApiUrl('/api/v1/courses'), {
        headers: this.authHeaders(),
        credentials: 'include',
      });
      if (res.ok) return await res.json();
    } catch {}
    return FALLBACK_COURSES;
  }

  /**
   * Fetch sessions, with dev toggles:
   * - forceFallback: return FALLBACK_SESSIONS regardless of API
   * - fallbackOnEmpty: if API returns 200 but [], return FALLBACK_SESSIONS
   * You can also set ?mockSessions=1 or localStorage.mockSessions='1'
   */
  static async fetchSessions(opts?: {
    forceFallback?: boolean;
    fallbackOnEmpty?: boolean;
  }): Promise<StudySession[]> {
    const force = opts?.forceFallback || this.devForceFallback();
    if (force) return FALLBACK_SESSIONS;

    try {
      const res = await fetch(buildApiUrl('/api/v1/sessions'), {
        headers: this.authHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const list = (data as any[]).map((s) => ({
          ...s,
          isAttending: !!s.isAttending,
          id: String(s.id),
        }));
        if (list.length === 0 && (opts?.fallbackOnEmpty ?? true)) return FALLBACK_SESSIONS;
        return list;
      }
    } catch {}
    return FALLBACK_SESSIONS;
  }

  static async fetchGroups(): Promise<StudyGroup[]> {
    try {
      const res = await fetch(buildApiUrl('/api/v1/groups'), {
        headers: this.authHeaders(),
        credentials: 'include',
      });
      if (res.ok) return await res.json();
    } catch {}
    return FALLBACK_GROUPS;
  }

  static async joinSession(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(buildApiUrl('/api/v1/partners'), {
        headers: this.authHeaders(),
        credentials: 'include',
      });
      if (res.ok) return await res.json();
    } catch {}
    return FALLBACK_PARTNERS;
  }

  // -------------------- Groups --------------------
  static async fetchMyGroups(): Promise<any[]> {
    try {
      const res = await this.request('/api/v1/groups/my-groups', { headers: this.authHeaders() });
      if (res.ok) return await res.json();
      return await this.fetchGroupsRaw();
    } catch {
      return await this.fetchGroupsRaw();
    }
  }

  static async fetchGroupsRaw(): Promise<any[]> {
    try {
      const res = await this.request('/api/v1/groups', { headers: this.authHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    // fallback to demo-like objects
    return FALLBACK_GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      course: g.course,
      courseCode: g.courseCode,
      maxMembers: g.maxMembers ?? 10,
      isPublic: g.isPublic,
      createdBy: g.createdBy,
      createdAt: g.createdAt,
      lastActivity: g.lastActivity ?? g.createdAt,
      group_type: g.group_type ?? 'study',
      members: Array.from({ length: g.member_count ?? 0 }, (_, i) => ({ userId: String(i + 1) })),
    }));
  }

  static async createGroup(payload: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic?: boolean;
    course?: string;
    courseCode?: string;
    subjects?: string[];
  }): Promise<any | null> {
    try {
      const res = await this.request('/api/v1/groups', {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  static async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async joinGroup(groupId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/join`, {
        method: 'POST',
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async leaveGroup(groupId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/leave`, {
        method: 'POST',
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async inviteToGroup(groupId: string, inviteUserIds: string[]): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/invite`, {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify({ inviteUserIds }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Create a session under a specific group (used by Groups page quick schedule). */
  static async createGroupSession(
    groupId: string,
    payload: {
      title: string;
      description?: string;
      startTime: string; // ISO
      endTime: string;   // ISO
      location: string;
      topics?: string[];
      type?: StudySession['type'];
      course?: string;
      courseCode?: string;
      maxParticipants?: number;
    }
  ): Promise<any | null> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/sessions`, {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

// Small helper for ids in normalize fallback
function cryptoRandomId() {
  try {
    // @ts-ignore
    const buf = crypto?.getRandomValues?.(new Uint8Array(8));
    if (buf) return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {}
  return String(Date.now());
}
