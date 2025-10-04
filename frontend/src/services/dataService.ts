// frontend/src/services/dataService.ts
import { buildApiUrl } from '../utils/url';
import { ErrorHandler } from '../utils/errorHandler';

// -------------------- Types --------------------
export type Course = {
  id: string;
  type: 'institution' | 'casual';
  code?: string;
  title: string;
  term?: string;
  description?: string;
  university?: string;

  // Progress & Analytics
  progress?: number;
  totalHours?: number;
  totalTopics?: number;
  completedTopics?: number;
  completedChapters?: number;
  totalChapters?: number;

  // Enrollment
  enrollmentStatus?: 'active' | 'completed' | 'dropped';
  enrolledAt?: string;

  // Study metrics
  weeklyHours?: number;
  monthlyHours?: number;
  averageSessionDuration?: number;
  studyStreak?: number;
  lastStudiedAt?: string;

  // Social context
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

export type StudyPartner = {
  id: string;
  name: string;
  avatar?: string;

  // Academic profile
  university: string;
  course: string;
  yearOfStudy: number;
  bio?: string;

  // Preferences
  studyPreferences?: {
    preferredTimes: string[];
    studyStyle: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
    groupSize: 'small' | 'medium' | 'large';
    environment: 'quiet' | 'collaborative' | 'flexible';
  };

  // Shared context
  sharedCourses: string[];
  sharedTopics: string[];
  compatibilityScore: number;

  // Activity
  studyHours: number;
  weeklyHours: number;
  studyStreak: number;
  activeGroups: number;
  sessionsAttended: number;

  // Social proof
  rating: number;
  reviewCount: number;
  responseRate: number;
  lastActive: string;

  // Connection
  connectionStatus?: 'not_connected' | 'pending' | 'connected' | 'blocked';
  mutualConnections?: number;

  // Match details
  recommendationReason?: string;
  sharedGoals?: string[];
};

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
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  location: string;
  type: 'study' | 'review' | 'project' | 'exam_prep' | 'discussion';
  participants: number;
  maxParticipants?: number;
  status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  isCreator?: boolean;
  isAttending?: boolean;
  isGroupOwner?: boolean;
  groupId?: number | string;
};

export type StudyGroup = {
  id: string;
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
  member_count?: number;
  /** NEW: count of sessions for the group (backend returns sessionCount) */
  session_count?: number;
  /** NEW: whether the current user is a member (backend returns isMember) */
  isMember?: boolean;
};


// ---- Notifications types (for Header, etc.) ----
export type NotificationRow = {
  notification_id?: number;
  id?: number;
  user_id: number | string;
  notification_type: string;
  title: string;
  message: string;
  metadata?: any;
  is_read: boolean;
  created_at: string;
  scheduled_for?: string | null;
  sent_at?: string | null;
};

export type NotificationCounts = {
  total_notifications: number;
  unread_notifications: number;
  unread_reminders: number;
  unread_invites: number;
  unread_matches: number;
};

// -------------------- Demo fallbacks --------------------
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
    description: 'Advanced CS topics',
    course: 'Data Structures & Algorithms',
    courseCode: 'CS301',
    isPublic: true,
    maxMembers: 15,
    member_count: 12,
    createdBy: 'Alex Johnson',
    createdAt: '2025-08-15',
  },
  {
    id: '2',
    name: 'Database Design Masters',
    description: 'Database design, SQL, optimization',
    course: 'Database Systems',
    courseCode: 'CS305',
    isPublic: true,
    maxMembers: 12,
    member_count: 8,
    createdBy: 'Sarah Chen',
    createdAt: '2025-08-20',
  },
  {
    id: '3',
    name: 'Math Study Warriors',
    description: 'Linear algebra, calculus, proofs',
    course: 'Linear Algebra',
    courseCode: 'MATH204',
    isPublic: true,
    maxMembers: 10,
    member_count: 6,
    createdBy: 'Maria Rodriguez',
    createdAt: '2025-08-25',
  },
  {
    id: '4',
    name: 'Software Engineering Pros',
    description: 'Patterns, agile, testing',
    course: 'Software Engineering',
    courseCode: 'CS403',
    isPublic: true,
    maxMembers: 20,
    member_count: 15,
    createdBy: 'David Kim',
    createdAt: '2025-09-01',
  },
];

export const FALLBACK_PARTNERS: StudyPartner[] = [
  {
    id: '1',
    name: 'Emma Wilson',
    university: 'University of Cape Town',
    course: 'Computer Science',
    yearOfStudy: 3,
    sharedCourses: ['CS301', 'CS305', 'MATH204'],
    sharedTopics: ['Algorithms', 'Databases'],
    compatibilityScore: 94,
    bio: 'Passionate about algorithms and machine learning. Looking for study partners for advanced CS topics.',
    studyHours: 45,
    weeklyHours: 12,
    studyStreak: 7,
    activeGroups: 3,
    sessionsAttended: 28,
    rating: 4.8,
    reviewCount: 15,
    responseRate: 96,
    lastActive: '2025-09-16',
    recommendationReason: 'Strong overlap in CS courses and similar study goals',
    sharedGoals: ['Master algorithms', 'Excel in databases'],
  },
  {
    id: '2',
    name: 'Marcus Johnson',
    university: 'University of Cape Town',
    course: 'Computer Science',
    yearOfStudy: 2,
    sharedCourses: ['CS201', 'MATH204', 'PHY101'],
    sharedTopics: ['Linear Algebra', 'Physics'],
    compatibilityScore: 87,
    bio: 'Strong in mathematics, enjoy collaborative problem solving and explaining concepts.',
    studyHours: 38,
    weeklyHours: 10,
    studyStreak: 12,
    activeGroups: 2,
    sessionsAttended: 22,
    rating: 4.6,
    reviewCount: 12,
    responseRate: 91,
    lastActive: '2025-09-15',
    recommendationReason: 'Excellent math foundation and collaborative approach',
    sharedGoals: ['Master linear algebra', 'Physics excellence'],
  },
  {
    id: '3',
    name: 'Sophia Chen',
    university: 'University of Cape Town',
    course: 'Software Engineering',
    yearOfStudy: 4,
    sharedCourses: ['CS403', 'CS305', 'CS450'],
    sharedTopics: ['Software Design', 'Databases', 'Architecture'],
    compatibilityScore: 91,
    bio: 'Experienced with software design patterns and database optimization. Happy to mentor others.',
    studyHours: 52,
    weeklyHours: 15,
    studyStreak: 21,
    activeGroups: 4,
    sessionsAttended: 35,
    rating: 4.9,
    reviewCount: 23,
    responseRate: 98,
    lastActive: '2025-09-17',
    recommendationReason: 'Senior student with mentoring experience in your areas',
    sharedGoals: ['Software architecture mastery', 'Database optimization'],
  },
  {
    id: '4',
    name: 'James Rodriguez',
    university: 'University of Cape Town',
    course: 'Data Science',
    yearOfStudy: 3,
    sharedCourses: ['STAT301', 'CS301', 'MATH204'],
    sharedTopics: ['Statistics', 'Algorithms', 'Linear Algebra'],
    compatibilityScore: 89,
    bio: 'Statistics and data analysis enthusiast. Great at breaking down complex problems.',
    studyHours: 41,
    weeklyHours: 11,
    studyStreak: 14,
    activeGroups: 3,
    sessionsAttended: 26,
    rating: 4.7,
    reviewCount: 18,
    responseRate: 93,
    lastActive: '2025-09-14',
    recommendationReason: 'Data science perspective on shared mathematical concepts',
    sharedGoals: ['Statistical mastery', 'Algorithm optimization'],
  },
  {
    id: '5',
    name: 'Aisha Patel',
    university: 'University of Cape Town',
    course: 'Computer Science',
    yearOfStudy: 2,
    sharedCourses: ['CS201', 'CS205', 'MATH204'],
    sharedTopics: ['Web Development', 'UI/UX', 'Linear Algebra'],
    compatibilityScore: 82,
    bio: 'Web development and UI/UX interested. Love working on projects and learning new technologies.',
    studyHours: 33,
    weeklyHours: 9,
    studyStreak: 8,
    activeGroups: 2,
    sessionsAttended: 19,
    rating: 4.5,
    reviewCount: 11,
    responseRate: 88,
    lastActive: '2025-09-16',
    recommendationReason: 'Creative approach to technical subjects',
    sharedGoals: ['Frontend excellence', 'Design thinking'],
  },
  {
    id: '6',
    name: 'Ryan Thompson',
    university: 'University of Cape Town',
    course: 'Computer Engineering',
    yearOfStudy: 4,
    sharedCourses: ['CS403', 'EE301', 'CS450'],
    sharedTopics: ['System Design', 'Hardware', 'Architecture'],
    compatibilityScore: 93,
    bio: 'Hardware-software integration expert. Excellent at system design and architecture discussions.',
    studyHours: 48,
    weeklyHours: 13,
    studyStreak: 18,
    activeGroups: 3,
    sessionsAttended: 31,
    rating: 4.8,
    reviewCount: 20,
    responseRate: 95,
    lastActive: '2025-09-17',
    recommendationReason: 'Systems expertise complements your software studies',
    sharedGoals: ['System architecture', 'Hardware-software integration'],
  },
];

// -------------------- Service --------------------
export class DataService {
  // --- headers/helpers ---
  private static authHeaders(): Headers {
    const h = new Headers();
    // Prefer Google token; fall back to generic app token
    const googleToken =
      typeof window !== 'undefined' ? localStorage.getItem('google_id_token') : null;
    const generalToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const raw = googleToken || generalToken;

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
      if (t) {
        h.set('Authorization', `Bearer ${t}`);
      }
    }
    return h;
  }

  // Enhanced fetch with retry logic
  private static async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retries = 2,
    timeout = 5000
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const authHeaders = Object.fromEntries(this.authHeaders().entries());
        const finalHeaders = {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options.headers,
        };

        const response = await fetch(url, {
          ...options,
          headers: finalHeaders,
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) return response;

        // Don't retry 4xx
        if (response.status >= 400 && response.status < 500) {
          throw Object.assign(
            new Error(`Client error: ${response.status} ${response.statusText}`),
            { status: response.status }
          );
        }
        if (i === retries - 1) {
          throw Object.assign(
            new Error(`Server error: ${response.status} ${response.statusText}`),
            { status: response.status }
          );
        }
      } catch (error: any) {
        if (i === retries - 1) throw error;
        await new Promise((r) => setTimeout(r, Math.min(500, Math.pow(2, i) * 200)));
      }
    }
    throw new Error('Should not reach here');
  }

  private static jsonHeaders(): Headers {
    const h = this.authHeaders();
    h.set('Content-Type', 'application/json');
    return h;
  }

  // ⬇️ now consistently uses fetchWithRetry + merged headers
  private static async request(path: string, init: RequestInit = {}) {
    const url = buildApiUrl(path);
    const auth = Object.fromEntries(this.authHeaders().entries());
    const headers = { 'Content-Type': 'application/json', ...auth, ...(init.headers || {}) };
    return this.fetchWithRetry(url, { credentials: 'include', ...init, headers });
  }

  // Use local wall-clock time to avoid unintended UTC shifts
  private static toISO(date: string, time: string): string {
    return `${date}T${time}:00`;
  }
  private static pad2(n: number) {
    return n < 10 ? `0${n}` : String(n);
  }
  private static fromISO(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = this.pad2(d.getMonth() + 1);
    const dd = this.pad2(d.getDate());
    const HH = this.pad2(d.getHours());
    const MM = this.pad2(d.getMinutes());
    return { date: `${yyyy}-${mm}-${dd}`, time: `${HH}:${MM}` };
  }
  private static looksISO(x: unknown): x is string {
    return typeof x === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x);
  }

  // Safe JSON parser that never throws (handles 500/HTML/empty/problem+json)
  private static async safeJson<T = any>(res: Response, fallback: T): Promise<T> {
    try {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('json')) return fallback;
      const text = await res.text();
      if (!text) return fallback;
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }

  private static normalizeSession(s: any): StudySession {
    const id = String(s?.id ?? s?.session_id ?? cryptoRandomId());
    const title = s?.title ?? s?.session_title ?? 'Study session';

    // Accept both HH:mm and ISO for start/end
    let date = s?.date as string | undefined;
    let startTime = s?.startTime as string | undefined; // may be 'HH:mm' OR ISO
    let endTime = s?.endTime as string | undefined; // may be 'HH:mm' OR ISO

    const isoStart =
      s?.scheduled_start ??
      s?.start_time ??
      s?.startISO ??
      s?.start ??
      (this.looksISO(s?.startTime) ? s.startTime : undefined);

    const isoEnd =
      s?.scheduled_end ??
      s?.end_time ??
      s?.endISO ??
      s?.end ??
      (this.looksISO(s?.endTime) ? s.endTime : undefined);

    // If we have ISO, derive date/time
    if ((!date || !startTime || this.looksISO(startTime)) && isoStart) {
      const dt = this.fromISO(isoStart);
      date = date || dt.date;
      startTime = dt.time;
    }
    if (!endTime || this.looksISO(endTime)) {
      if (isoEnd) {
        const dt = this.fromISO(isoEnd);
        endTime = dt.time;
      }
    }

    // Fallback sensible defaults
    date = date || new Date().toISOString().slice(0, 10);
    startTime = startTime && !this.looksISO(startTime) ? startTime : '09:00';
    endTime = endTime && !this.looksISO(endTime) ? endTime : '10:00';

    // Participants: prefer attendees length if present
    const attendeesCount = Array.isArray(s?.attendees) ? s.attendees.length : undefined;
    const participants =
      Number(s?.participants ?? s?.currentParticipants ?? s?.attendee_count ?? attendeesCount ?? 0) ||
      0;

    // Map backend 'scheduled' -> UI 'upcoming'
    let status = s?.status ?? 'upcoming';
    if (status === 'scheduled') status = 'upcoming';

    return {
      id,
      title,
      course: s?.course ?? s?.module_name,
      courseCode: s?.courseCode ?? s?.module_code,
      date,
      startTime,
      endTime,
      location: s?.location ?? 'TBD',
      type: (s?.type ?? s?.session_type ?? 'study') as StudySession['type'],
      participants,
      maxParticipants: Number(s?.maxParticipants ?? s?.max_participants) || undefined,
      status,
      isCreator: !!(s?.isCreator ?? s?.organizer ?? s?.is_owner ?? (s?.createdBy && true)),
      isAttending: !!(s?.isAttending ?? s?.attending),
      isGroupOwner: !!s?.isGroupOwner,
      groupId: s?.groupId ?? s?.group_id,
    };
  }

  // -------------------- Auth/User --------------------
  static async getMe(): Promise<{ id: string } | null> {
    try {
      const res = await this.request('/api/v1/users/me', { method: 'GET' });
      if (!res.ok) return null;
      const data = await this.safeJson<any>(res, null);
      const id = data?.user_id ?? data?.id;
      return id ? { id: String(id) } : null;
    } catch {
      return null;
    }
  }

  // -------------------- Courses --------------------
  static async fetchCourses(options?: CourseFetchOptions): Promise<Course[]> {
    try {
      const params = new URLSearchParams();
      if (options?.page) params.append('page', options.page.toString());
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.search) params.append('search', options.search);
      if (options?.sortBy) params.append('sortBy', options.sortBy);
      if (options?.sortOrder) params.append('sortOrder', options.sortOrder);

      const res = await this.request(`/api/v1/courses${params.toString() ? `?${params}` : ''}`, {
        method: 'GET',
      });
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      }

      const data = await this.safeJson<any>(res, []);
      let courses: Course[] = [];
      if (data?.courses) {
        courses = data.courses;
      } else if (Array.isArray(data)) {
        courses = data;
      } else {
        courses = [];
      }

      return courses;
    } catch (error) {
      throw error;
    }
  }

  static async addCourse(courseData: Omit<Course, 'id' | 'progress'>): Promise<Course> {
    const res = await this.request('/api/v1/courses', {
      method: 'POST',
      body: JSON.stringify(courseData),
    });
    if (!res.ok) {
      throw Object.assign(new Error('Failed to add course'), { status: res.status });
    }
    return this.safeJson<Course>(res, null as any);
  }

  static async removeCourse(courseId: string): Promise<void> {
    const res = await this.request(`/api/v1/courses/${encodeURIComponent(courseId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw Object.assign(new Error('Failed to remove course'), { status: res.status });
    }
  }

  // -------------------- Sessions --------------------
  // overload with optional filters
  static async fetchSessions(opts?: {
    status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
    groupId?: string | number;
    startDate?: string; // ISO or 'YYYY-MM-DD'
    endDate?: string; // ISO or 'YYYY-MM-DD'
    limit?: number;
    offset?: number;
  }): Promise<StudySession[]> {
    try {
      const p = new URLSearchParams();
      if (opts?.status) p.set('status', opts.status);
      if (opts?.groupId != null) p.set('groupId', String(opts.groupId));
      if (opts?.startDate) p.set('startDate', opts.startDate);
      if (opts?.endDate) p.set('endDate', opts.endDate);
      if (opts?.limit != null) p.set('limit', String(opts.limit));
      if (opts?.offset != null) p.set('offset', String(opts.offset));

      const qs = p.toString();
      const res = await this.request(`/api/v1/sessions${qs ? `?${qs}` : ''}`, { method: 'GET' });
      if (!res.ok) return FALLBACK_SESSIONS;
      const data = await this.safeJson<any[]>(res, []);
      return data.map((row) => this.normalizeSession(row));
    } catch {
      return FALLBACK_SESSIONS;
    }
  }

  /** Fetch a single session (full details). */
  static async getSessionById(id: string): Promise<StudySession | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(id)}`, {
        method: 'GET',
      });
      if (!res.ok) return null;
      const data = await this.safeJson<any>(res, null);
      return data ? this.normalizeSession(data) : null;
    } catch {
      return null;
    }
  }

  /** Create a standalone session (or group-linked if groupId provided). */
  static async createSession(
    sessionData: Omit<
      StudySession,
      'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'
    >
  ): Promise<StudySession | null> {
    // keep the group-scoped attempt as-is if you like; if it 404s we fall back

    const startISO = this.toISO(sessionData.date, sessionData.startTime);
    const endISO = this.toISO(sessionData.date, sessionData.endTime);

    const groupIdNum =
      sessionData.groupId != null && !Number.isNaN(Number(sessionData.groupId))
        ? Number(sessionData.groupId)
        : undefined;

    const payload = {
      // convenience extras (harmless)
      title: sessionData.title,
      startTime: startISO,
      endTime: endISO,
      location: sessionData.location,
      type: sessionData.type,
      course: sessionData.course,
      courseCode: sessionData.courseCode,
      groupId: sessionData.groupId,

      // backend contract (snake_case)
      group_id: groupIdNum ?? sessionData.groupId,
      session_title: sessionData.title,
      scheduled_start: startISO,
      scheduled_end: endISO,
      session_type: sessionData.type,
      // ⬇️ removed: max_participants (not a column)
    };

    try {
      const res = await this.request('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await this.safeJson<any>(res, null);
        return created ? this.normalizeSession(created) : null;
      }
    } catch {}
    return null;
  }

  static async startSession(sessionId: string): Promise<StudySession | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/start`, {
        method: 'PUT',
      });
      if (!res.ok) return null;
      // Backend returns a skinny payload; refetch full details
      return await this.getSessionById(sessionId);
    } catch {
      return null;
    }
  }

  static async endSession(sessionId: string): Promise<StudySession | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: 'PUT',
      });
      if (!res.ok) return null;
      return await this.getSessionById(sessionId);
    } catch {
      return null;
    }
  }

  static async cancelSession(sessionId: string): Promise<StudySession | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, {
        method: 'PUT',
      });
      if (!res.ok) return null;
      return await this.getSessionById(sessionId);
    } catch {
      return null;
    }
  }

  static async updateSession(
    sessionId: string,
    sessionData: Omit<
      StudySession,
      'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'
    >
  ): Promise<StudySession | null> {
    const payload: Record<string, any> = {
      title: sessionData.title,
      date: sessionData.date, // YYYY-MM-DD
      startTime: sessionData.startTime, // HH:mm
      endTime: sessionData.endTime, // HH:mm
      location: sessionData.location,
      type: sessionData.type,
      course: sessionData.course,
      courseCode: sessionData.courseCode,
      maxParticipants: sessionData.maxParticipants,
      groupId: sessionData.groupId,
    };

    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await this.safeJson<any>(res, null);
        return updated ? this.normalizeSession(updated) : null;
      }
    } catch {}
    return null;
  }

  static async deleteSession(sessionId: string): Promise<{ ok: boolean; data?: any } | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
    if (res.ok) {
        const data = await this.safeJson<any>(res, null);
        return { ok: true, data };
      }
      return { ok: false };
    } catch {
      return null;
    }
  }

  static async joinSession(sessionId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/join`, {
        method: 'POST',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async leaveSession(sessionId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/leave`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // -------------------- Partners --------------------
  static async searchPartners(params?: {
    subjects?: string[];
    studyStyle?: string;
    groupSize?: string;
    availability?: string[];
    university?: string;
    search?: string;
  }): Promise<StudyPartner[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.subjects?.length) queryParams.append('subjects', params.subjects.join(','));
      if (params?.studyStyle) queryParams.append('studyStyle', params.studyStyle);
      if (params?.groupSize) queryParams.append('groupSize', params.groupSize);
      if (params?.availability?.length)
        queryParams.append('availability', params.availability.join(','));
      if (params?.university) queryParams.append('university', params.university);
      if (params?.search) queryParams.append('search', params.search);

      const res = await this.request(`/api/v1/partners/search?${queryParams.toString()}`, {
        method: 'GET',
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'partners');
        throw appError;
      }
      const data = await this.safeJson<StudyPartner[]>(res, []);
      return data;
    } catch (error) {
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  static async sendBuddyRequest(recipientId: string, message?: string): Promise<void> {
    try {
      const res = await this.request('/api/v1/partners/request', {
        method: 'POST',
        body: JSON.stringify({ recipientId, message }),
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'partners');
        throw appError;
      }
      await this.safeJson<any>(res, null);
    } catch (error) {
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  // -------------------- Groups --------------------
  static async fetchMyGroups(): Promise<any[]> {
    try {
      const res = await this.request('/api/v1/groups/my-groups', { method: 'GET' });
      if (!res.ok) return await this.fetchGroupsRaw();
      return await this.safeJson<any[]>(res, []);
    } catch {
      return await this.fetchGroupsRaw();
    }
  }

  static async fetchGroupsRaw(): Promise<any[]> {
    try {
      const res = await this.request('/api/v1/groups', { method: 'GET' });
      if (res.ok) {
        return await this.safeJson<any[]>(res, []);
      }
    } catch {}
    // Map demo fallback to API-ish shape
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

  // -------------------- Groups --------------------
  static async createGroup(payload: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic?: boolean;
    course?: string;
    courseCode?: string;
    subjects?: string[];
    moduleId?: number | string; // <-- NEW
  }): Promise<any | null> {
    let moduleId: number | string | null = payload.moduleId != null ? payload.moduleId : null;

    // If moduleId not provided, try to infer from latest enrolled course
    if (moduleId == null) {
      try {
        const res = await this.request('/api/v1/courses?limit=1&sortBy=enrolled_at&sortOrder=DESC', {
          method: 'GET',
        });
        if (res.ok) {
          const data = await this.safeJson<any>(res, []);
          const courses = Array.isArray(data?.courses)
            ? data.courses
            : Array.isArray(data)
            ? data
            : [];
          if (courses.length && courses[0]?.id != null) {
            moduleId = courses[0].id;
          }
        }
      } catch {
        // ignore — backend will still try its own fallback
      }
    }

    const body = {
      name: payload.name,
      description: payload.description ?? '',
      maxMembers: payload.maxMembers ?? 10,
      isPublic: payload.isPublic ?? true,
      course: payload.course ?? undefined,
      courseCode: payload.courseCode ?? undefined,
      moduleId: moduleId != null ? Number(moduleId) : undefined, // <-- send when known
      subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
    };

    try {
      const res = await this.request('/api/v1/groups', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await this.safeJson<any>(res, null);
    } catch {
      return null;
    }
  }

  static async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
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
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async leaveGroup(groupId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/leave`, {
        method: 'POST', // backend uses POST /:groupId/leave
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
      endTime: string; // ISO
      location: string;
      topics?: string[];
    }
  ): Promise<StudySession | null> {
    try {
      const body = {
        title: payload.title,
        description: payload.description ?? undefined,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location,
        topics: Array.isArray(payload.topics) ? payload.topics : [],
      };

      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/sessions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        return null;
      }
      const created = await this.safeJson<any>(res, null);
      return created ? this.normalizeSession(created) : null;
    } catch {
      return null;
    }
  }

  // -------------------- Notifications API --------------------
  static async fetchNotifications(opts?: {
    unreadOnly?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<NotificationRow[]> {
    const params = new URLSearchParams();
    if (opts?.unreadOnly) params.set('unreadOnly', 'true');
    if (opts?.type) params.set('type', String(opts.type));
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));

    const res = await this.request(`/api/v1/users/me/notifications?${params.toString()}`, {
      method: 'GET',
    });
    if (!res.ok) return [];
    const rows = await this.safeJson<NotificationRow[]>(res, []);
    return Array.isArray(rows) ? rows : [];
  }

  static async fetchNotificationCounts(): Promise<NotificationCounts | null> {
    try {
      const res = await this.request('/api/v1/notifications/counts', { method: 'GET' });
      if (!res.ok) return null;
      return await this.safeJson<NotificationCounts | null>(res, null);
    } catch {
      return null;
    }
  }

  static async markNotificationRead(notificationId: number): Promise<boolean> {
    const res = await this.request(`/api/v1/users/me/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
    return res.ok;
  }

  static async markAllNotificationsRead(): Promise<boolean> {
    try {
      const res = await this.request('/api/v1/notifications/read-all', { method: 'PUT' });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async deleteNotification(notificationId: number): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/notifications/${notificationId}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async createNotification(payload: {
    user_id: number | string;
    notification_type: string;
    title: string;
    message: string;
    metadata?: any;
    scheduled_for?: string | Date | null;
  }): Promise<NotificationRow | null> {
    const body = {
      ...payload,
      scheduled_for:
        payload.scheduled_for instanceof Date
          ? payload.scheduled_for.toISOString()
          : payload.scheduled_for ?? null,
    };
    try {
      const res = await this.request('/api/v1/notifications', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await this.safeJson<NotificationRow | null>(res, null);
    } catch {
      return null;
    }
  }

  static async notifyGroup(
    groupId: string | number,
    payload: {
      notification_type: string;
      title: string;
      message: string;
      metadata?: any;
    }
  ): Promise<boolean> {
    try {
      const res = await this.request(
        `/api/v1/notifications/group/${encodeURIComponent(String(groupId))}/notify`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  static async fetchPendingNotifications(): Promise<NotificationRow[]> {
    try {
      const res = await this.request('/api/v1/notifications/pending', { method: 'GET' });
      if (!res.ok) return [];
      return await this.safeJson<NotificationRow[]>(res, []);
    } catch {
      return [];
    }
  }

  static async markNotificationsSent(notificationIds: Array<number | string>): Promise<boolean> {
    try {
      const res = await this.request('/api/v1/notifications/mark-sent', {
        method: 'PUT',
        body: JSON.stringify({ notification_ids: notificationIds }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Trigger 24h reminder scheduling for a single session
  static async scheduleSession24hReminders(sessionId: string | number): Promise<boolean> {
    try {
      const res = await this.request(
        `/api/v1/notifications/sessions/${encodeURIComponent(String(sessionId))}/schedule-24h`,
        { method: 'POST' }
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Small helper for ids in normalize fallback
function cryptoRandomId() {
  try {
    // @ts-ignore
    const buf = crypto?.getRandomValues?.(new Uint8Array(8));
    if (buf)
      return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
  } catch {}
  return String(Date.now());
}
