import { buildApiUrl } from '../utils/url';
// Centralized data service to ensure consistency across the app

export type Course = {
  id: string;
  type: 'institution' | 'casual';
  code?: string;
  title: string;
  term?: string;
  description?: string;
  progress?: number;
};

export type StudySession = {
  id: string;
  title: string;
  course?: string;
  courseCode?: string;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  location: string;
  type: 'study' | 'review' | 'project' | 'exam_prep' | 'discussion';
  participants: number;
  maxParticipants?: number;
  status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  isCreator?: boolean;
  /** RSVP + chat */
  isAttending?: boolean;
  groupId?: number;
};

export type StudyGroup = {
  id: string;
  name: string;
  description: string;
  course?: string;
  courseCode?: string;
  members: number;
  maxMembers?: number;
  isPublic: boolean;
  tags: string[];
  createdBy: string;
  createdAt: string;
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
  {
    id: '1',
    title: 'Algorithms Study Group',
    course: 'Data Structures & Algorithms',
    courseCode: 'CS301',
    date: '2025-09-18',
    startTime: '14:00',
    endTime: '16:00',
    location: 'Library Room 204',
    type: 'study',
    participants: 4,
    maxParticipants: 6,
    status: 'upcoming',
    isCreator: true,
    groupId: 1,
    isAttending: true,
  },
  {
    id: '2',
    title: 'Database Design Workshop',
    course: 'Database Systems',
    courseCode: 'CS305',
    date: '2025-09-19',
    startTime: '10:00',
    endTime: '12:00',
    location: 'Computer Lab B',
    type: 'project',
    participants: 6,
    maxParticipants: 8,
    status: 'upcoming',
    isCreator: false,
    groupId: 2,
    isAttending: false,
  },
  {
    id: '3',
    title: 'Linear Algebra Review',
    course: 'Linear Algebra',
    courseCode: 'MATH204',
    date: '2025-09-20',
    startTime: '15:00',
    endTime: '17:00',
    location: 'Study Hall A',
    type: 'review',
    participants: 3,
    maxParticipants: 5,
    status: 'upcoming',
    isCreator: true,
    groupId: 3,
    isAttending: true,
  },
  {
    id: '4',
    title: 'ML Fundamentals Discussion',
    course: 'Machine Learning Basics',
    date: '2025-09-15',
    startTime: '16:00',
    endTime: '18:00',
    location: 'Study Hall A',
    type: 'discussion',
    participants: 3,
    status: 'completed',
    isCreator: true,
    groupId: 5,
    isAttending: true,
  },
];

export const FALLBACK_GROUPS: StudyGroup[] = [
  {
    id: '1',
    name: 'CS Advanced Study Circle',
    description:
      'For students tackling advanced computer science topics like algorithms, data structures, and system design.',
    course: 'Data Structures & Algorithms',
    courseCode: 'CS301',
    members: 12,
    maxMembers: 15,
    isPublic: true,
    tags: ['algorithms', 'data-structures', 'competitive-programming'],
    createdBy: 'Alex Johnson',
    createdAt: '2025-08-15',
  },
  {
    id: '2',
    name: 'Database Design Masters',
    description:
      'Learn database design patterns, SQL optimization, and modern database technologies.',
    course: 'Database Systems',
    courseCode: 'CS305',
    members: 8,
    maxMembers: 12,
    isPublic: true,
    tags: ['sql', 'database-design', 'optimization'],
    createdBy: 'Sarah Chen',
    createdAt: '2025-08-20',
  },
  {
    id: '3',
    name: 'Math Study Warriors',
    description:
      'Collaborative problem-solving for linear algebra, calculus, and discrete mathematics.',
    course: 'Linear Algebra',
    courseCode: 'MATH204',
    members: 6,
    maxMembers: 10,
    isPublic: true,
    tags: ['linear-algebra', 'calculus', 'proofs'],
    createdBy: 'Maria Rodriguez',
    createdAt: '2025-08-25',
  },
  {
    id: '4',
    name: 'Software Engineering Pros',
    description:
      'Best practices, design patterns, and agile methodologies for software development.',
    course: 'Software Engineering',
    courseCode: 'CS403',
    members: 15,
    maxMembers: 20,
    isPublic: true,
    tags: ['design-patterns', 'agile', 'testing'],
    createdBy: 'David Kim',
    createdAt: '2025-09-01',
  },
  {
    id: '5',
    name: 'ML Enthusiasts',
    description: 'Exploring machine learning concepts, projects, and real-world applications.',
    members: 10,
    isPublic: true,
    tags: ['machine-learning', 'python', 'tensorflow', 'projects'],
    createdBy: 'Emma Wilson',
    createdAt: '2025-09-05',
  },
  {
    id: '6',
    name: 'Evening Review Sessions',
    description: 'Quiet, focused study sessions for exam preparation and homework help.',
    members: 4,
    maxMembers: 8,
    isPublic: false,
    tags: ['exam-prep', 'homework-help', 'quiet-study'],
    createdBy: 'John Davis',
    createdAt: '2025-09-10',
  },
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
    const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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

  static async fetchPartners(): Promise<StudyPartner[]> {
    try {
      const res = await fetch(buildApiUrl('/api/v1/partners'), {
        headers: this.authHeaders(),
        credentials: 'include',
      });
      if (res.ok) return await res.json();
    } catch {}
    return FALLBACK_PARTNERS;
  }
}
