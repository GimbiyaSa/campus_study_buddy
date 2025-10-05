// frontend/src/services/dataService.ts
import { buildApiUrl } from '../utils/url';
import { ErrorHandler } from '../utils/errorHandler';

/* ============================================================================
   TYPES (merged → superset to avoid breaking either side)
============================================================================ */

// Courses (same as incoming, with comments retained)
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

// Study Partner (union of both definitions)
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

  // Connection (merged enum + flags)
  connectionStatus?:
    | 'none'
    | 'pending'
    | 'accepted'
    | 'declined'
    | 'blocked'
    | 'not_connected'
    | 'connected';
  connectionId?: number;
  isPendingSent?: boolean;
  isPendingReceived?: boolean;
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

// Study Session (merged)
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
  /** merged to accept either */
  groupId?: number | string;
  /** you had this in your pages; keep it */
  isGroupOwner?: boolean;
};

// Study Group (merged: keep incoming fields + your additional optional ones)
export type StudyGroup = {
  id: string;
  name: string;
  description?: string;
  course?: string;
  courseCode?: string;
  // incoming used a single numeric count; you used member_count + members[]
  members?: number; // incoming
  member_count?: number; // yours
  maxMembers?: number;
  isPublic: boolean;
  tags?: string[]; // incoming
  createdBy?: string;
  createdAt?: string;
  lastActivity?: string;
  // your additions
  group_type?: 'study' | 'project' | 'exam_prep' | 'discussion';
  session_count?: number;
  isMember?: boolean;
  membersList?: Array<{ userId: string }>;

  /** explicit owner clarity for robust UI checks */
  createdById?: string;
  createdByName?: string;
  isOwner?: boolean;
};

// Notifications
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

/* ============================================================================
   FALLBACKS (keep incoming + compatible with your UI)
============================================================================ */

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
    member_count: 12,
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
    member_count: 8,
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
    member_count: 6,
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
    member_count: 15,
    maxMembers: 20,
    isPublic: true,
    tags: ['design-patterns', 'agile', 'testing'],
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
  // (trimmed, same as incoming list) ...
];

/* ============================================================================
   SERVICE (incoming base + your additions, consolidated)
============================================================================ */

export class DataService {
  /* ----------------- auth + retry (incoming, preserved) ----------------- */
  private static authHeaders(): Headers {
    const h = new Headers();
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
      if (t) {
        h.set('Authorization', `Bearer ${t}`);
        console.log('✅ Authorization header set');
      } else {
        console.warn('⚠️ Token was empty after processing');
      }
    } else {
      console.warn('⚠️ No authentication token found in localStorage');
    }

    return h;
  }

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

        console.log('📡 Final request headers:', finalHeaders);

        const response = await fetch(url, {
          ...options,
          headers: finalHeaders,
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) return response;

        if (response.status >= 400 && response.status < 500) {
          throw Object.assign(new Error(`Client error: ${response.status} ${response.statusText}`), {
            status: response.status,
          });
        }
        if (i === retries - 1) {
          throw Object.assign(new Error(`Server error: ${response.status} ${response.statusText}`), {
            status: response.status,
          });
        }
      } catch (error: any) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`Request timeout after ${timeout}ms for ${url}`);
        }
        if (i === retries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, Math.pow(2, i) * 200)));
      }
    }
    throw new Error('Should not reach here');
  }

  /* ----------------- your convenience wrappers (added) ----------------- */
  private static async request(path: string, init: RequestInit = {}) {
    const url = buildApiUrl(path);
    const auth = Object.fromEntries(this.authHeaders().entries());
    const headers = { 'Content-Type': 'application/json', ...auth, ...(init.headers || {}) };
    // IMPORTANT: avoid 304 empty bodies; always fetch fresh
    return this.fetchWithRetry(url, { credentials: 'include', cache: 'no-store', ...init, headers });
  }

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

  // Local time helpers
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

  /* ----------------- OWNER LOGIC HELPERS (NEW) ----------------- */

  /** cache of groups you own (persists across refresh) */
  private static readonly OWNER_CACHE_KEY = 'sb_owner_group_ids';
  private static loadOwnerCache(): Record<string, true> {
    try {
      const raw = localStorage.getItem(this.OWNER_CACHE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }
  private static saveOwnerCache(map: Record<string, true>) {
    try {
      localStorage.setItem(this.OWNER_CACHE_KEY, JSON.stringify(map));
    } catch {}
  }
  private static rememberGroupOwner(groupId: string | number) {
    const key = String(groupId);
    const map = this.loadOwnerCache();
    if (!map[key]) {
      map[key] = true as const;
      this.saveOwnerCache(map);
    }
  }
  private static forgetGroupOwner(groupId: string | number) {
    const key = String(groupId);
    const map = this.loadOwnerCache();
    if (map[key]) {
      delete map[key];
      this.saveOwnerCache(map);
    }
  }

  /** NEW: cache current user id so we can compute isOwner on the client */
  private static _meId: string | null | undefined; // undefined = not fetched yet
  private static async getMeIdCached(): Promise<string | null> {
    if (this._meId !== undefined) return this._meId;
    const me = await this.getMe();
    this._meId = me?.id ?? null;
    return this._meId;
  }

  private static isLikelyId(x: any): boolean {
    if (x == null) return false;
    const s = String(x);
    return /^\d+$/.test(s) || /^[0-9a-fA-F-]{8,}$/.test(s); // digits or uuid-ish
  }
  private static extractOwner(g: any): { ownerId?: string; ownerName?: string } {
    const ownerId =
      g?.createdById ??
      g?.created_by ??
      g?.creator_id ??
      g?.owner_id ??
      g?.ownerId ??
      (this.isLikelyId(g?.createdBy) ? g.createdBy : undefined);

    const ownerName =
      g?.creator_name ??
      g?.createdByName ??
      g?.owner_name ??
      (!this.isLikelyId(g?.createdBy) ? g?.createdBy : undefined);

    return {
      ownerId: ownerId != null ? String(ownerId) : undefined,
      ownerName: ownerName != null ? String(ownerName) : undefined,
    };
  }

  private static computeIsOwner(
    g: any,
    meId: string | null
  ): { isOwner: boolean; createdById?: string; createdByName?: string } {
    if (typeof g?.isOwner === 'boolean') {
      const extracted = this.extractOwner(g);
      return { isOwner: g.isOwner, createdById: extracted.ownerId, createdByName: extracted.ownerName };
    }

    const { ownerId, ownerName } = this.extractOwner(g);
    if (meId && ownerId && String(ownerId) === String(meId)) {
      return { isOwner: true, createdById: ownerId, createdByName: ownerName };
    }

    const ms: any[] =
      (Array.isArray(g?.membersList) && g.membersList) ||
      (Array.isArray(g?.members) && g.members) ||
      [];

    if (meId && ms.length) {
      const mine = ms.find(
        (m) =>
          String(m?.userId ?? m?.id ?? m?.user_id ?? '') === String(meId)
      );
      if (mine) {
        const role = String(mine.role ?? mine.member_role ?? '').toLowerCase();
        if (role === 'owner') return { isOwner: true, createdById: ownerId, createdByName: ownerName };
      }
    }

    return { isOwner: false, createdById: ownerId, createdByName: ownerName };
  }

  /** NEW: combine compute + owner cache */
  private static annotateOwnership(g: any, meId: string | null): any {
    const { isOwner, createdById, createdByName } = this.computeIsOwner(g, meId);
    const cache = this.loadOwnerCache();
    const id = String(g?.id ?? g?.group_id ?? '');
    const cachedOwner = !!(id && cache[id]);

    const finalIsOwner = isOwner || cachedOwner;
    if (finalIsOwner && id) this.rememberGroupOwner(id); // keep cache warm

    return { ...g, isOwner: finalIsOwner, createdById, createdByName };
  }

  /* ----------------- normalizers (your robust mapping) ----------------- */
  private static normalizeSession(s: any): StudySession {
    const id = String(s?.id ?? s?.session_id ?? cryptoRandomId());
    const title = s?.title ?? s?.session_title ?? 'Study session';

    let date = s?.date as string | undefined;
    let startTime = s?.startTime as string | undefined;
    let endTime = s?.endTime as string | undefined;

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

    date = date || new Date().toISOString().slice(0, 10);
    startTime = startTime && !this.looksISO(startTime) ? startTime : '09:00';
    endTime = endTime && !this.looksISO(endTime) ? endTime : '10:00';

    const attendeesCount = Array.isArray(s?.attendees) ? s.attendees.length : undefined;
    const participants =
      Number(
        s?.participants ?? s?.currentParticipants ?? s?.attendee_count ?? attendeesCount ?? 0
      ) || 0;

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

  /* ----------------- Auth/User ----------------- */
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

  /* ----------------- Courses (incoming preserved) ----------------- */
  static async fetchCourses(options?: CourseFetchOptions): Promise<Course[]> {
    try {
      const params = new URLSearchParams();
      if (options?.page) params.append('page', options.page.toString());
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.search) params.append('search', options.search);
      if (options?.sortBy) params.append('sortBy', options.sortBy);
      if (options?.sortOrder) params.append('sortOrder', options.sortOrder);

      const url = buildApiUrl(`/api/v1/courses${params.toString() ? `?${params.toString()}` : ''}`);
      console.log('🎓 Fetching courses from:', url);
      console.log('🔑 Auth headers:', this.authHeaders());

      const res = await this.fetchWithRetry(url);
      console.log('📡 Response status:', res.status, res.statusText);

      const data = await res.json();
      console.log('📦 Response data:', data);

      let courses: Course[] = [];
      if (data.courses) {
        courses = data.courses;
      } else if (Array.isArray(data)) {
        courses = data;
      } else {
        console.warn('⚠️ Unexpected response format:', data);
        courses = [];
      }

      console.log('✅ Courses processed successfully:', courses.length, 'courses');
      return courses;
    } catch (error) {
      console.error('❌ fetchCourses error details:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  static async addCourse(courseData: Omit<Course, 'id' | 'progress'>): Promise<Course> {
    const url = buildApiUrl('/api/v1/courses');
    console.log('➕ Adding course:', courseData);

    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      body: JSON.stringify(courseData),
    });

    const newCourse = await res.json();
    console.log('✅ Course added:', newCourse);
    return newCourse;
  }

  static async removeCourse(courseId: string): Promise<void> {
    const url = buildApiUrl(`/api/v1/courses/${courseId}`);
    console.log('🗑️ Removing course:', courseId);

    await this.fetchWithRetry(url, {
      method: 'DELETE',
    });

    console.log('✅ Course removed:', courseId);
  }

  /* ----------------- Sessions (merged: richer API, keeps no-arg fetch) ----------------- */
  static async fetchSessions(opts?: {
    status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
    groupId?: string | number;
    startDate?: string; // ISO or 'YYYY-MM-DD'
    endDate?: string; // ISO or 'YYYY-MM-DD'
    limit?: number;
    offset?: number;
  }): Promise<StudySession[]> {
    try {
      if (!opts) {
        // preserve incoming simple fetch behaviour
        const res = await this.fetchWithRetry(buildApiUrl('/api/v1/sessions'));
        const data = await res.json();
        return (data as any[]).map((s) => this.normalizeSession({ ...s, id: String(s.id) }));
      }

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
    } catch (error) {
      console.error('❌ fetchSessions error:', error);
      return FALLBACK_SESSIONS;
    }
  }

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

  static async createSession(
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
  ): Promise<StudySession | null> {
    const startISO = this.toISO(sessionData.date, sessionData.startTime);
    const endISO = this.toISO(sessionData.date, sessionData.endTime);

    const groupIdNum =
      sessionData.groupId != null && !Number.isNaN(Number(sessionData.groupId))
        ? Number(sessionData.groupId)
        : undefined;

    const payload = {
      // convenience + camel
      title: sessionData.title,
      startTime: startISO,
      endTime: endISO,
      location: sessionData.location,
      type: sessionData.type,
      course: sessionData.course,
      courseCode: sessionData.courseCode,
      groupId: sessionData.groupId,
      // backend snake_case
      group_id: groupIdNum ?? sessionData.groupId,
      session_title: sessionData.title,
      scheduled_start: startISO,
      scheduled_end: endISO,
      session_type: sessionData.type,
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

  static async updateSession(
    sessionId: string,
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
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

  static async startSession(sessionId: string): Promise<StudySession | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/start`, {
        method: 'PUT',
      });
      if (!res.ok) return null;
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

  /* ----------------- Partners (incoming preserved) ----------------- */
  static async fetchPartners(): Promise<StudyPartner[]> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/partners'));
      const data = await res.json();
      console.log('👥 Study partners loaded successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ fetchPartners error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

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

      const url = buildApiUrl(`/api/v1/partners/search?${queryParams.toString()}`);
      const res = await this.fetchWithRetry(url);
      const data = await res.json();
      console.log('🔍 Partner search results:', data);
      return data;
    } catch (error) {
      console.error('❌ searchPartners error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  static async sendBuddyRequest(recipientId: string, message?: string): Promise<void> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/partners/request'), {
        method: 'POST',
        body: JSON.stringify({ recipientId, message }),
      });
      const data = await res.json();
      console.log('🤝 Buddy request sent:', data);
      return data;
    } catch (error) {
      console.error('❌ sendBuddyRequest error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  static async acceptPartnerRequest(requestId: number): Promise<void> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/partners/accept/${requestId}`), {
        method: 'POST',
      });
      const data = await res.json();
      console.log('✅ Partner request accepted:', data);
      return data;
    } catch (error) {
      console.error('❌ acceptPartnerRequest error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  static async rejectPartnerRequest(requestId: number): Promise<void> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/partners/reject/${requestId}`), {
        method: 'POST',
      });
      const data = await res.json();
      console.log('✅ Partner request rejected:', data);
      return data;
    } catch (error) {
      console.error('❌ rejectPartnerRequest error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  /* ----------------- Groups (incoming + your richer endpoints) ----------------- */
  static async fetchGroups(): Promise<StudyGroup[]> {
    try {
      const meId = await this.getMeIdCached();
      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/groups'), { cache: 'no-store' });
      const raw = await res.json();

      const mapped = (raw as any[]).map((g) => {
        const enriched = this.annotateOwnership(g, meId);
        const { createdById, createdByName } = enriched;
        return {
          id: String(g.id ?? g.group_id),
          name: g.name ?? g.group_name,
          description: g.description ?? '',
          course: g.course ?? g.module_name,
          courseCode: g.courseCode ?? g.module_code,
          members: g.members ?? g.member_count,
          member_count: g.member_count ?? g.members,
          maxMembers: g.maxMembers ?? g.max_members,
          isPublic: !!(g.isPublic ?? g.is_public ?? true),
          tags: g.tags ?? [],
          createdBy: createdById ?? (g.createdBy ?? g.creator_name),
          createdById,
          createdByName,
          createdAt: g.createdAt ?? g.created_at,
          lastActivity: g.lastActivity ?? g.updated_at ?? g.created_at,
          group_type: g.group_type,
          session_count: g.session_count ?? g.sessionCount,
          isMember: g.isMember,
          membersList: Array.isArray(g.membersList)
            ? g.membersList
            : Array.isArray(g.members)
            ? g.members
            : undefined,
          isOwner: !!enriched.isOwner,
        } as StudyGroup;
      });

      return mapped;
    } catch (error) {
      console.error('❌ fetchGroups error:', error);
      return FALLBACK_GROUPS.map((g) => ({ ...g, isOwner: false }));
    }
  }

  // your helper to fetch "my groups" with graceful fallback
  static async fetchMyGroups(): Promise<any[]> {
    try {
      const meId = await this.getMeIdCached();
      const res = await this.request('/api/v1/groups/my-groups', { method: 'GET' });
      const rows = res.ok ? await this.safeJson<any[]>(res, []) : await this.fetchGroupsRaw();
      // Annotate with owner flag from server hints + cache
      return (rows || []).map((g) => this.annotateOwnership(g, meId));
    } catch {
      const fallback = await this.fetchGroupsRaw();
      return fallback;
    }
  }

  static async fetchGroupsRaw(): Promise<any[]> {
    try {
      const meId = await this.getMeIdCached();
      const res = await this.request('/api/v1/groups', { method: 'GET' });
      if (res.ok) {
        const data = await this.safeJson<any[]>(res, []);
        return (data || []).map((g) => this.annotateOwnership(g, meId));
      }
    } catch {}
    // map fallback to api-ish shape
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
      members: g.members ?? g.member_count,
      member_count: g.member_count ?? g.members,
      membersList: Array.from({ length: g.member_count ?? g.members ?? 0 }, (_, i) => ({
        userId: String(i + 1),
      })),
      isOwner: false,
      createdById: undefined,
      createdByName: g.createdBy,
    }));
  }

  static async createGroup(payload: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic?: boolean;
    subjects?: string[];
    moduleId?: number | string;
  }): Promise<any | null> {
    let moduleId: number | string | null = payload.moduleId != null ? payload.moduleId : null;

    if (moduleId == null) {
      try {
        const res = await this.request(
          '/api/v1/courses?limit=1&sortBy=enrolled_at&sortOrder=DESC',
          { method: 'GET' }
        );
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
      } catch {}
    }

    const body = {
      name: payload.name,
      description: payload.description ?? '',
      maxMembers: payload.maxMembers ?? 10,
      isPublic: payload.isPublic ?? true,
      moduleId: moduleId != null ? Number(moduleId) : undefined,
      subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
    };

    try {
      const res = await this.request('/api/v1/groups', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const created = await this.safeJson<any>(res, null);

      // mark ownership in cache so refresh still shows Owner
      if (created?.id != null) this.rememberGroupOwner(String(created.id));

      const meId = await this.getMeIdCached();
      const enriched = this.annotateOwnership(created, meId);
      return { ...enriched, isOwner: true };
    } catch {
      return null;
    }
  }

  static async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
      });
      if (res.ok) this.forgetGroupOwner(groupId);
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
      // joining doesn't imply ownership
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
      if (res.ok) this.forgetGroupOwner(groupId); // if you leave, you’re not the owner in UI
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

  /** Quick schedule under a group */
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

      if (!res.ok) return null;
      const created = await this.safeJson<any>(res, null);
      return created ? this.normalizeSession(created) : null;
    } catch {
      return null;
    }
  }

  /* ---------- richer group details & editing (owner-only on server) ---------- */

  static async getGroup(groupId: string): Promise<any | null> {
    try {
      const meId = await this.getMeIdCached();
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
        method: 'GET',
      });
      if (!res.ok) return null;
      const data = await this.safeJson<any>(res, null);
      if (!data) return null;

      const enriched = this.annotateOwnership(data, meId);
      return enriched;
    } catch {
      return null;
    }
  }

  static async getGroupMembers(
    groupId: string
  ): Promise<Array<{ userId: string; name?: string; role?: string }> | []> {
    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'GET',
      });
      if (!res.ok) return [];
      const raw = await this.safeJson<any>(res, []);
      // normalize to { userId, name?, role? }
      const rows = Array.isArray(raw?.members) ? raw.members : Array.isArray(raw) ? raw : [];
      return rows.map((m: any) => ({
        userId: String(m?.userId ?? m?.id ?? m?.user_id ?? ''),
        name: m?.name ?? m?.display_name ?? m?.full_name,
        role: m?.role ?? m?.member_role,
      }));
    } catch {
      return [];
    }
  }

  static async updateGroup(
    groupId: string,
    updates: Partial<{ name: string; description: string; maxMembers: number; isPublic: boolean }>
  ): Promise<any | null> {
    // Map both camelCase and snake_case to be tolerant with backend
    const body: Record<string, any> = {};
    if (updates.name != null) body.name = updates.name;
    if (updates.description != null) body.description = updates.description;
    if (updates.maxMembers != null) {
      body.maxMembers = updates.maxMembers;
      body.max_members = updates.maxMembers;
    }
    if (typeof updates.isPublic === 'boolean') {
      body.isPublic = updates.isPublic;
      body.is_public = updates.isPublic;
    }

    try {
      const res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
        method: 'PATCH', // use PATCH for partial updates; switch to PUT if your API requires
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;

      const updated = await this.safeJson<any>(res, null);
      if (!updated) return null;

      const meId = await this.getMeIdCached();
      const enriched = this.annotateOwnership(updated, meId);
      return enriched;
    } catch {
      return null;
    }
  }

  /* ----------------- Notifications (your additions) ----------------- */
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
    payload: { notification_type: string; title: string; message: string; metadata?: any }
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

  /* ----------------- Study progress/topics (incoming preserved) ----------------- */
  static async setTopicGoal(
    topicId: number,
    goal: { hoursGoal: number; targetCompletionDate?: string; personalNotes?: string }
  ): Promise<any> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/progress/topics/${topicId}/goal`), {
        method: 'PUT',
        body: JSON.stringify(goal),
      });
      const data = await res.json();
      console.log('🎯 Study goal set:', data);
      return data;
    } catch (error) {
      console.error('❌ setTopicGoal error:', error);
      const appError = ErrorHandler.handleApiError(error, 'progress');
      throw appError;
    }
  }

  static async logStudyHours(
    topicId: number,
    log: { hours: number; description?: string; studyDate?: string; reflections?: string }
  ): Promise<any> {
    try {
      console.log('📝 Logging study hours:', { topicId, log });
      const res = await this.fetchWithRetry(
        buildApiUrl(`/api/v1/progress/topics/${topicId}/log-hours`),
        {
          method: 'POST',
          body: JSON.stringify(log),
        }
      );
      const data = await res.json();
      console.log('📝 Study hours logged successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ logStudyHours error:', error);
      const appError = ErrorHandler.handleApiError(error, 'progress');
      throw appError;
    }
  }

  static async markTopicComplete(topicId: number): Promise<any> {
    try {
      console.log('✅ Marking topic as complete:', { topicId });
      const res = await this.fetchWithRetry(
        buildApiUrl(`/api/v1/progress/topics/${topicId}/complete`),
        {
          method: 'PUT',
        }
      );
      const data = await res.json();
      console.log('✅ Topic marked complete successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ markTopicComplete error:', error);
      const appError = ErrorHandler.handleApiError(error, 'progress');
      throw appError;
    }
  }

  static async fetchTopicProgress(topicId: number): Promise<any> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/progress/topics/${topicId}`));
      const data = await res.json();
      console.log('📊 Topic progress loaded:', data);
      return data;
    } catch (error) {
      console.error('❌ fetchTopicProgress error:', error);
      const appError = ErrorHandler.handleApiError(error, 'progress');
      throw appError;
    }
  }

  static async fetchModuleTopics(moduleId: number): Promise<any[]> {
    try {
      console.log('📚 Fetching module topics for moduleId:', moduleId);
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/courses/${moduleId}/topics`));
      const data = await res.json();
      console.log('📚 Module topics loaded successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ fetchModuleTopics error:', error);
      const appError = ErrorHandler.handleApiError(error, 'courses');
      throw appError;
    }
  }

  static async addTopic(
    moduleId: number,
    topic: { topic_name: string; description?: string; order_sequence?: number }
  ): Promise<any> {
    try {
      console.log('➕ Adding topic to module:', { moduleId, topic });
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/modules/${moduleId}/topics`), {
        method: 'POST',
        body: JSON.stringify(topic),
      });
      const data = await res.json();
      console.log('✅ Topic added successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ addTopic error:', error);
      const appError = ErrorHandler.handleApiError(error, 'courses');
      throw appError;
    }
  }
}

/* ============================================================================
   SMALL UTIL
============================================================================ */
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
