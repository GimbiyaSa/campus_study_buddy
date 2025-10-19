// frontend/src/services/dataService.ts
import { buildApiUrl } from '../utils/url';
import { ErrorHandler } from '../utils/errorHandler';
import { eventBus } from '../utils/eventBus';

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
  sharedCourses: string[]; // For suggested partners: courses with similarity match
  allCourses?: string[]; // For all other partners and buddies: ALL their courses
  sharedTopics: string[];
  sharedTopicsCount?: number; // Number of shared topics for deeper matching
  courseMatchPercent?: number; // Percentage of course overlap (0-100)
  hasMatchedCourses?: boolean; // Backend flag: true if has at least 1 matched course (for filtering suggestions)
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
  connectionStatus?: 'none' | 'pending' | 'accepted' | 'declined' | 'blocked';
  connectionId?: number;
  isPendingSent?: boolean;
  isPendingReceived?: boolean;
  mutualConnections?: number;

  // Study match details
  recommendationReason?: string;
  sharedGoals?: string[];
  matchReasons?: string[];
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
  isPublic: boolean; // display-only; backend has no column, keep optional semantics in UI
  tags?: string[]; // display-only; backend has no column
  createdBy?: string;
  createdAt?: string;
  lastActivity?: string;
  // your additions
  group_type?: 'study' | 'project' | 'exam_prep' | 'discussion';
  session_count?: number;
  isMember?: boolean;
  isInvited?: boolean;
  membersList?: Array<{ userId: string; role?: string }>;

  /** explicit owner clarity for robust UI checks */
  createdById?: string;
  createdByName?: string;
  isOwner?: boolean;
};

// Shared Notes (DB-aligned)
export type SharedNote = {
  note_id: number;
  group_id: number;
  author_id: string;
  topic_id?: number | null;
  note_title: string;
  note_content: string;
  attachments?: any; // JSON
  visibility: 'group' | 'public' | 'private';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // optional joined labels
  author_name?: string;
  group_name?: string;
  topic_name?: string;
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

// --- Profile shapes the page expects (optional: keep inline if you prefer)
export type UserProfile = {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  university?: string;
  course?: string;
  year_of_study?: number | null;
  bio?: string | null;
  profile_image_url?: string | null;
  study_preferences?: any | null; // { preferredTimes, studyStyle, groupSize, ... }
};

/* ============================================================================
   FALLBACKS (keep incoming + compatible with your UI)
============================================================================ */

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
    retries = 2, // Reduced retries for faster response
    timeout = 5000 // 5 second timeout
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

        if (response.ok) {
          return response;
        }

        // Don't retry for client errors (4xx), only server errors (5xx)
        if (response.status >= 400 && response.status < 500) {
          throw Object.assign(
            new Error(`Client error: ${response.status} ${response.statusText}`),
            {
              status: response.status,
            }
          );
        }
        if (i === retries - 1) {
          throw Object.assign(
            new Error(`Server error: ${response.status} ${response.statusText}`),
            {
              status: response.status,
            }
          );
        }
      } catch (error: any) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`Request timeout after ${timeout}ms for ${url}`);
        }
        if (i === retries - 1) throw error;
        // Reduced backoff for faster response
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, Math.pow(2, i) * 200)));
      }
    }
    throw new Error('Should not reach here');
  }

  // ⬇️ now consistently uses fetchWithRetry + merged headers
  private static async request(path: string, init: RequestInit = {}) {
    const url = buildApiUrl(path);
    const auth = Object.fromEntries(this.authHeaders().entries());
    const headers = { 'Content-Type': 'application/json', ...auth, ...(init.headers || {}) };
    // IMPORTANT: avoid 304 empty bodies; always fetch fresh
    return this.fetchWithRetry(url, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
      headers,
    });
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
      return {
        isOwner: g.isOwner,
        createdById: extracted.ownerId,
        createdByName: extracted.ownerName,
      };
    }

    // prefer server-provided creator id/name; DB uses creator_id
    const ownerId =
      g?.createdById ??
      g?.creator_id ??
      g?.owner_id ??
      (this.isLikelyId(g?.createdBy) ? g.createdBy : undefined);
    const ownerName =
      g?.creator_name ??
      g?.createdByName ??
      (!this.isLikelyId(g?.createdBy) ? g?.createdBy : undefined);

    if (meId && ownerId && String(ownerId) === String(meId)) {
      return { isOwner: true, createdById: String(ownerId), createdByName: ownerName };
    }

    // membership-based: elevated admins exist, but owner == creator_id
    const ms: any[] =
      (Array.isArray(g?.membersList) && g.membersList) ||
      (Array.isArray(g?.members) && g.members) ||
      [];

    if (meId && ms.length) {
      const mine = ms.find((m) => String(m?.userId ?? m?.id ?? m?.user_id ?? '') === String(meId));
      if (mine) {
        const role = String(mine.role ?? mine.member_role ?? '').toLowerCase();
        if (role === 'admin') {
          return {
            isOwner: false,
            createdById: ownerId ? String(ownerId) : undefined,
            createdByName: ownerName,
          };
        }
      }
    }

    return {
      isOwner: false,
      createdById: ownerId ? String(ownerId) : undefined,
      createdByName: ownerName,
    };
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
    if (status === 'in_progress') status = 'ongoing';

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

  /** Full current-user profile from backend */
  static async getUserProfile(): Promise<UserProfile | null> {
    try {
      const res = await this.request('/api/v1/users/me', { method: 'GET' });
      if (!res.ok) return null;
      return this.safeJson<UserProfile | null>(res, null);
    } catch {
      return null;
    }
  }

  /** Update current-user profile (partial patch) */
  static async updateUserProfile(
    patch: Partial<UserProfile> & { study_preferences?: any }
  ): Promise<UserProfile | null> {
    try {
      const res = await this.request('/api/v1/users/me', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      if (!res.ok) return null;
      return this.safeJson<UserProfile | null>(res, null);
    } catch {
      return null;
    }
  }

  /** Upload a profile image, returns the URL (and you can follow up with PUT /me if needed) */
  static async uploadProfileImage(file: File): Promise<string | null> {
    try {
      const url = buildApiUrl('/api/v1/users/files/upload');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('uploadType', 'profile-image');

      // IMPORTANT: do not set Content-Type for FormData; only send auth
      const auth = Object.fromEntries(this.authHeaders().entries());
      const res = await fetch(url, {
        method: 'POST',
        headers: auth,
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.file?.url ?? null;
    } catch {
      return null;
    }
  }

  // inside class DataService, e.g. after uploadProfileImage()
  /** Backend → UI mapping for the profile page */
  static mapUserToStudentProfile(u: UserProfile): {
    fullName: string;
    email: string;
    studentId: string;
    bio: string;
    availableForStudyPartners: boolean;
    notifyReminders: boolean;
    avatarUrl?: string;
  } {
    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return {
      fullName: fullName || u.email,
      email: u.email,
      studentId: u.user_id,
      bio: (u.bio ?? '') as string,
      availableForStudyPartners: true,
      notifyReminders: true,
      avatarUrl: u.profile_image_url ?? undefined,
    };
  }

  /** UI form → backend update payload */
  static mapFormToUserUpdate(form: {
    fullName: string;
    email: string;
    studentId: string;
    bio: string;
    availableForStudyPartners: boolean;
    notifyReminders: boolean;
    avatarUrl?: string;
  }): Partial<UserProfile> {
    // split name safely
    const parts = (form.fullName || '').trim().split(/\s+/);
    const first = parts.shift() ?? '';
    const last = parts.join(' ') || null;

    return {
      // email/user_id are not updated here; server owns them
      first_name: first || undefined,
      last_name: last || undefined,
      bio: form.bio ?? null,
      profile_image_url: form.avatarUrl ?? undefined,
      // keep prefs in a single JSON column if you want
      study_preferences: {
        preferredTimes: [],
        studyStyle: 'visual',
        groupSize: 'medium',
        // you can add availableForStudyPartners/notifyReminders here if you’ll read them back
        availableForStudyPartners: !!form.availableForStudyPartners,
        notifyReminders: !!form.notifyReminders,
      },
    };
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

      console.log('🎓 Fetching courses with params:', Object.fromEntries(params));

      let res = await this.request(
        `/api/v1/courses${params.toString() ? `?${params.toString()}` : ''}`,
        {
          method: 'GET',
        }
      );

      console.log('📡 Response status:', res.status, res.statusText);

      if (!res.ok) {
        const modulesUrl = buildApiUrl(
          `/api/v1/modules${params.toString() ? `?${params.toString()}` : ''}`
        );
        res = await this.fetchWithRetry(modulesUrl);
      }

      const data = await this.safeJson<any>(res, []);
      console.log('📦 Raw response data:', data);

      let courses: Course[] = [];
      if (data.courses) {
        courses = data.courses;
        console.log('✅ Using data.courses:', courses.length, 'courses');
      } else if (Array.isArray(data)) {
        courses = data;
        console.log('✅ Using data as array:', courses.length, 'courses');
      } else {
        console.log('⚠️ No courses found in response structure');
        courses = [];
      }

      console.log('🎓 Final courses to return:', courses);
      return courses;
    } catch (error) {
      console.error('❌ fetchCourses error details:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Re-throw the error so the component can handle it
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

    // Emit events to refresh all course-related components
    eventBus.emitMany(['courses:invalidate', 'courses:created'], {
      type: 'create',
      courseId: newCourse.id,
      timestamp: Date.now(),
    });

    return newCourse;
  }

  static async removeCourse(courseId: string): Promise<void> {
    const url = buildApiUrl(`/api/v1/courses/${courseId}`);
    console.log('🗑️ Removing course:', courseId);

    await this.fetchWithRetry(url, {
      method: 'DELETE',
    });

    console.log('✅ Course removed:', courseId);

    // Emit events to refresh all course-related components
    eventBus.emitMany(['courses:invalidate', 'courses:deleted'], {
      type: 'delete',
      courseId,
      timestamp: Date.now(),
    });
  }

  /* ----------------- Sessions (merged: richer API, keeps no-arg fetch) ----------------- */
  static async fetchSessions(opts?: {
    status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
    groupId?: string | number;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<StudySession[]> {
    try {
      if (!opts) {
        // preserve simple fetch behaviour, but no hardcoded fallback
        const res = await this.fetchWithRetry(buildApiUrl('/api/v1/sessions'));
        if (!res.ok) return [];
        const data = await res.json();
        return (Array.isArray(data) ? data : []).map((s) =>
          this.normalizeSession({ ...s, id: String((s as any).id ?? (s as any).session_id) })
        );
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
      if (!res.ok) return [];
      const data = await this.safeJson<any[]>(res, []);
      return (Array.isArray(data) ? data : []).map((row) => this.normalizeSession(row));
    } catch (error) {
      console.error('❌ fetchSessions error:', error);
      return [];
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

      if (params?.subjects?.length) {
        queryParams.append('subjects', params.subjects.join(','));
      }
      if (params?.studyStyle) {
        queryParams.append('studyStyle', params.studyStyle);
      }
      if (params?.groupSize) {
        queryParams.append('groupSize', params.groupSize);
      }
      if (params?.availability?.length) {
        queryParams.append('availability', params.availability.join(','));
      }
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
    // Ensure a return in all code paths (should never reach here, but for type safety)
    return [];
  }

  static async sendBuddyRequest(recipientId: string, message?: string): Promise<void> {
    try {
      console.log('🤝 Sending buddy request:', { recipientId, message, hasMessage: !!message });

      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/partners/request'), {
        method: 'POST',
        body: JSON.stringify({ recipientId, message }),
      });

      if (!res.ok) {
        // Get detailed error from response
        let errorDetails;
        try {
          errorDetails = await res.json();
        } catch {
          errorDetails = { error: `HTTP ${res.status}: ${res.statusText}` };
        }
        console.error('❌ sendBuddyRequest HTTP error:', {
          status: res.status,
          statusText: res.statusText,
          errorDetails,
          recipientId,
        });
        throw new Error(errorDetails.error || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      console.log('🤝 Buddy request sent successfully:', data);

      // Emit events to refresh buddy lists and notifications
      eventBus.emitMany(
        ['buddies:request-sent', 'buddies:invalidate', 'notifications:invalidate'],
        {
          type: 'action',
          buddyId: recipientId,
          timestamp: Date.now(),
        }
      );

      return data;
    } catch (error) {
      console.error('❌ sendBuddyRequest error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  /* static async acceptPartnerRequest(requestId: number): Promise<void> {
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
  } */

  static async acceptPartnerRequest(requestId: number): Promise<void> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/partners/accept/${requestId}`), {
        method: 'POST',
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'partners');
        throw appError;
      }
      await this.safeJson<any>(res, null);
      console.log('✅ Partner request accepted');

      // Emit events to refresh buddy lists and notifications
      eventBus.emitMany(
        ['buddies:request-accepted', 'buddies:invalidate', 'notifications:invalidate'],
        {
          type: 'action',
          metadata: { requestId },
          timestamp: Date.now(),
        }
      );
    } catch (error) {
      console.error('❌ acceptPartnerRequest error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  static async getPendingInvitations(): Promise<any[]> {
    try {
      console.log('🔍 Fetching pending invitations from API...');
      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/partners/pending-invitations'));
      const data = await this.safeJson<any[]>(res, []);
      console.log('✅ Pending invitations fetched:', data.length, data);
      return data;
    } catch (error) {
      console.error('❌ getPendingInvitations error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  static async rejectPartnerRequest(requestId: number): Promise<void> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/partners/reject/${requestId}`), {
        method: 'POST',
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'partners');
        throw appError;
      }
      await this.safeJson<any>(res, null);
      console.log('✅ Partner request rejected');

      // Emit events to refresh buddy lists and notifications
      eventBus.emitMany(
        ['buddies:request-rejected', 'buddies:invalidate', 'notifications:invalidate'],
        {
          type: 'action',
          metadata: { requestId },
          timestamp: Date.now(),
        }
      );
    } catch (error) {
      console.error('❌ rejectPartnerRequest error:', error);
      const appError = ErrorHandler.handleApiError(error, 'partners');
      throw appError;
    }
  }

  // -------------------- Groups --------------------
  static async fetchMyGroups(): Promise<any[]> {
    try {
      const meId = await this.getMeIdCached();
      const res = await this.request('/api/v1/groups/my-groups', { method: 'GET' });
      const rows = res.ok ? await this.safeJson<any[]>(res, []) : await this.fetchGroupsRaw();
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
      if (!res.ok) return [];
      const data = await this.safeJson<any[]>(res, []);
      return (data || []).map((g) => this.annotateOwnership(g, meId));
    } catch {
      return [];
    }
  }

  /** List my group invitations (recipient side) */
  static async getMyGroupInvites(
    status: 'pending' | 'accepted' | 'declined' | 'expired' = 'pending'
  ): Promise<
    Array<{
      group_id: number;
      group_name?: string;
      invited_by?: string;
      status: string;
      created_at?: string;
    }>
  > {
    // Try a few likely endpoints; all are optional and fail-soft
    const candidates = [
      `/api/v1/groups/invitations?status=${encodeURIComponent(status)}`,
      `/api/v1/users/me/group-invitations?status=${encodeURIComponent(status)}`,
    ];
    for (const path of candidates) {
      try {
        const res = await this.request(path, { method: 'GET' });
        if (!res.ok) continue;
        const rows = await this.safeJson<any[]>(res, []);
        if (Array.isArray(rows)) return rows;
      } catch {}
    }
    // Fallback: infer from notifications (less precise; no per-invite status)
    try {
      const notes = await this.fetchNotifications({ type: 'group_invite' });
      return (notes || [])
        .map((n) => {
          const gid = n?.metadata?.group_id;
          return gid
            ? {
                group_id: Number(gid),
                group_name: n?.title,
                status: 'pending',
                created_at: n?.created_at,
              }
            : null;
        })
        .filter(Boolean) as any[];
    } catch {
      return [];
    }
  }

  /** Owner/admin: list pending invites for a specific group */
  static async getGroupPendingInvites(groupId: string | number): Promise<
    Array<{
      user_id: string;
      status: 'pending' | 'accepted' | 'declined' | 'expired';
      invited_by?: string;
      created_at?: string;
    }>
  > {
    const gid = encodeURIComponent(String(groupId));
    const paths = [
      `/api/v1/groups/${gid}/invitations?status=pending`,
      `/api/v1/groups/${gid}/invites?status=pending`,
    ];
    for (const p of paths) {
      try {
        const res = await this.request(p, { method: 'GET' });
        if (!res.ok) continue;
        const rows = await this.safeJson<any[]>(res, []);
        if (Array.isArray(rows))
          return rows.map((r) => ({
            user_id: String(r.user_id ?? r.uid ?? r.id),
            status: (r.status ?? 'pending') as any,
            invited_by: r.invited_by ?? r.inviter_id ?? undefined,
            created_at: r.created_at ?? undefined,
          }));
      } catch {}
    }
    return [];
  }

  static async acceptGroupInvite(groupId: string | number): Promise<boolean> {
    const gid = encodeURIComponent(String(groupId));
    const paths = [
      `/api/v1/groups/${gid}/invitations/accept`,
      `/api/v1/groups/${gid}/accept-invite`,
      `/api/v1/groups/invitations/${gid}/accept`, // id-as-invitation id fallback
    ];
    for (const p of paths) {
      try {
        const res = await this.request(p, { method: 'POST' });
        if (res.ok) return true;
      } catch {}
    }
    // final fallback: try joining directly (for public groups)
    try {
      return await this.joinGroup(String(groupId));
    } catch {
      return false;
    }
  }

  static async declineGroupInvite(groupId: string | number): Promise<boolean> {
    const gid = encodeURIComponent(String(groupId));
    const paths = [
      `/api/v1/groups/${gid}/invitations/decline`,
      `/api/v1/groups/${gid}/decline-invite`,
      `/api/v1/groups/invitations/${gid}/decline`,
    ];
    for (const p of paths) {
      try {
        const res = await this.request(p, { method: 'POST' });
        if (res.ok) return true;
      } catch {}
    }
    return false;
  }

  static async createGroup(payload: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPublic?: boolean; // display-only, not sent
    subjects?: string[];
    moduleId?: number | string;
    group_type?: 'study' | 'project' | 'exam_prep' | 'discussion';
    group_goals?: any;
  }): Promise<any | null> {
    let moduleId: number | string | null = payload.moduleId != null ? payload.moduleId : null;

    if (moduleId == null) {
      try {
        // try courses first
        let res = await this.request('/api/v1/courses?limit=1&sortBy=enrolled_at&sortOrder=DESC', {
          method: 'GET',
        });
        if (!res.ok) {
          // fallback to modules
          res = await this.request('/api/v1/modules?limit=1', { method: 'GET' });
        }
        if (res.ok) {
          const data = await this.safeJson<any>(res, []);
          const rows = Array.isArray(data?.courses)
            ? data.courses
            : Array.isArray(data)
            ? data
            : [];
          if (rows.length && rows[0]?.id != null) moduleId = rows[0].id;
          if (rows.length && rows[0]?.module_id != null) moduleId = rows[0].module_id;
        }
      } catch {}
    }

    const body: Record<string, any> = {
      name: payload.name,
      description: payload.description ?? '',
      maxMembers: payload.maxMembers ?? 10,
      // isPublic intentionally omitted (no DB column)
      moduleId: moduleId != null ? Number(moduleId) : undefined,
      subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
      group_type: payload.group_type,
      group_goals: payload.group_goals,
    };

    try {
      const res = await this.request('/api/v1/groups', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const created = await this.safeJson<any>(res, null);

      if (created?.id != null || created?.group_id != null) {
        this.rememberGroupOwner(String(created.id ?? created.group_id));
      }

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
      if (res.ok) this.forgetGroupOwner(groupId);
      return res.ok;
    } catch {
      return false;
    }
  }

  static async inviteToGroup(groupId: string, inviteUserIds: string[]): Promise<boolean> {
    try {
      // primary path (common pattern)
      let res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/invite`, {
        method: 'POST',
        body: JSON.stringify({ inviteUserIds }),
      });
      if (res.ok) return true;

      // alt 1
      res = await this.request(`/api/v1/groups/${encodeURIComponent(groupId)}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: inviteUserIds }),
      });
      if (res.ok) return true;

      // alt 2 (flat)
      res = await this.request(`/api/v1/groups/invite`, {
        method: 'POST',
        body: JSON.stringify({ groupId, inviteUserIds }),
      });
      if (res.ok) return true;
    } catch {}

    // fallback: create notifications per user (DB has notifications; no invites table)
    try {
      await Promise.all(
        inviteUserIds.map((uid) =>
          this.createNotification({
            user_id: uid,
            notification_type: 'group_invite',
            title: 'Group invitation',
            message: 'You have been invited to join a study group.',
            metadata: { group_id: groupId },
            scheduled_for: null,
          })
        )
      );
      return true;
    } catch {}
    return false;
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
  ): Promise<Array<{ userId: string; name: string; role?: string }>> {
    try {
      console.log('🔍 getGroupMembers called with groupId:', groupId);
      const url = `/api/v1/groups/${encodeURIComponent(groupId)}/members`;
      console.log('🔍 Full URL:', url);

      const res = await this.request(url, {
        method: 'GET',
      });

      console.log('🔍 Response status:', res.status, res.statusText);

      if (!res.ok) {
        console.error('❌ getGroupMembers failed:', res.status, res.statusText);
        return [];
      }

      const raw = await this.safeJson<any>(res, []);
      console.log('🔍 Raw response:', raw);

      const rows = Array.isArray(raw?.members) ? raw.members : Array.isArray(raw) ? raw : [];
      console.log('🔍 Parsed rows:', rows);

      return rows.map((m: any, i: number) => ({
        userId: String(m?.userId ?? m?.id ?? m?.user_id ?? i),
        name:
          m?.name ??
          m?.display_name ??
          m?.full_name ??
          m?.username ??
          m?.email ??
          String(m?.userId ?? m?.id ?? `User ${i + 1}`),
        role: m?.role ?? m?.member_role ?? undefined,
      }));
    } catch (error) {
      console.error('❌ getGroupMembers exception:', error);
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
    // do NOT send isPublic; backend has no column

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

  /* ----------------- Notes (new: DB-aligned) ----------------- */

  static async fetchNotes(opts?: {
    groupId?: string | number;
    visibility?: 'group' | 'public' | 'private';
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<SharedNote[]> {
    try {
      // Prefer group-scoped endpoint if groupId provided
      if (opts?.groupId != null) {
        const p = new URLSearchParams();
        if (opts.visibility) p.set('visibility', opts.visibility);
        if (opts.search) p.set('search', opts.search);
        if (opts.limit != null) p.set('limit', String(opts.limit));
        if (opts.offset != null) p.set('offset', String(opts.offset));

        let res = await this.request(
          `/api/v1/groups/${encodeURIComponent(String(opts.groupId))}/notes${
            p.toString() ? `?${p.toString()}` : ''
          }`,
          { method: 'GET' }
        );
        if (!res.ok) {
          // fallback to flat endpoint with groupId
          res = await this.request(
            `/api/v1/notes?groupId=${encodeURIComponent(String(opts.groupId))}`,
            { method: 'GET' }
          );
        }
        if (!res.ok) return [];
        const rows = await this.safeJson<SharedNote[]>(res, []);
        return Array.isArray(rows) ? rows : [];
      }

      // No groupId → try flat collection
      const p = new URLSearchParams();
      if (opts?.visibility) p.set('visibility', opts.visibility);
      if (opts?.search) p.set('search', opts.search);
      if (opts?.limit != null) p.set('limit', String(opts.limit));
      if (opts?.offset != null) p.set('offset', String(opts.offset));

      let res = await this.request(`/api/v1/notes${p.toString() ? `?${p.toString()}` : ''}`, {
        method: 'GET',
      });
      if (!res.ok) {
        // attempt alternate path
        res = await this.request(`/api/v1/shared-notes${p.toString() ? `?${p.toString()}` : ''}`, {
          method: 'GET',
        });
      }
      if (!res.ok) return [];
      const rows = await this.safeJson<SharedNote[]>(res, []);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  static async createNote(
    groupId: string | number,
    payload: {
      note_title: string;
      note_content: string;
      visibility?: 'group' | 'public' | 'private';
      topic_id?: number | null;
      attachments?: any;
    }
  ): Promise<SharedNote | null> {
    const body = {
      group_id: Number(groupId),
      note_title: payload.note_title,
      note_content: payload.note_content,
      visibility: payload.visibility ?? 'group',
      topic_id: payload.topic_id ?? null,
      attachments: payload.attachments ?? null,
    };

    try {
      // group-scoped create preferred
      let res = await this.request(`/api/v1/groups/${encodeURIComponent(String(groupId))}/notes`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // flat create
        res = await this.request(`/api/v1/notes`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) return null;
      const created = await this.safeJson<SharedNote | null>(res, null);

      // Emit events to refresh all related components
      if (created) {
        eventBus.emitMany(['notes:created', 'notes:invalidate'], {
          type: 'create',
          topicId: created.topic_id || undefined,
          metadata: { noteId: created.note_id },
          timestamp: Date.now(),
        });
      }

      return created;
    } catch {
      return null;
    }
  }

  static async updateNote(
    noteId: number | string,
    updates: Partial<{
      note_title: string;
      note_content: string;
      visibility: 'group' | 'public' | 'private';
      topic_id: number | null;
      attachments: any;
      is_active: boolean;
    }>
  ): Promise<SharedNote | null> {
    try {
      let res = await this.request(`/api/v1/notes/${encodeURIComponent(String(noteId))}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        // alt path
        res = await this.request(`/api/v1/shared-notes/${encodeURIComponent(String(noteId))}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      }
      if (!res.ok) return null;
      const updated = await this.safeJson<SharedNote | null>(res, null);

      // Emit events to refresh all related components
      if (updated) {
        eventBus.emitMany(['notes:updated', 'notes:invalidate'], {
          type: 'update',
          topicId: updated.topic_id || undefined,
          metadata: { noteId: updated.note_id },
          timestamp: Date.now(),
        });
      }

      return updated;
    } catch {
      return null;
    }
  }

  static async deleteNote(noteId: number | string): Promise<boolean> {
    try {
      let res = await this.request(`/api/v1/notes/${encodeURIComponent(String(noteId))}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        res = await this.request(`/api/v1/shared-notes/${encodeURIComponent(String(noteId))}`, {
          method: 'DELETE',
        });
      }

      const success = res.ok;

      // Emit events to refresh all related components
      if (success) {
        eventBus.emitMany(['notes:deleted', 'notes:invalidate'], {
          type: 'delete',
          metadata: { noteId },
          timestamp: Date.now(),
        });
      }

      return success;
    } catch {
      return false;
    }
  }

  // ---------- Notes: attachments upload/download ----------

  /**
   * Upload one or more files to a note. Expects backend route:
   * POST /api/v1/notes/:noteId/attachments (multer form field name: "files")
   * Returns the updated note (with attachments JSON).
   */
  static async uploadNoteAttachments(
    noteId: number | string,
    files: File[]
  ): Promise<SharedNote | null> {
    if (!files?.length) return this.getNoteById(noteId);

    const url = buildApiUrl(`/api/v1/notes/${encodeURIComponent(String(noteId))}/attachments`);
    const fd = new FormData();
    for (const f of files) fd.append('files', f);

    // Auth header only (do NOT set Content-Type for FormData)
    const auth = Object.fromEntries(this.authHeaders().entries());

    const res = await fetch(url, {
      method: 'POST',
      headers: auth,
      body: fd,
      credentials: 'include',
    });

    if (!res.ok) return null;
    return this.safeJson<SharedNote | null>(res, null);
  }

  /** Optionally delete a single attachment record + blob on the server. */
  static async deleteNoteAttachment(params: {
    noteId: number | string;
    container: string;
    blob: string;
  }): Promise<boolean> {
    const url = buildApiUrl(
      `/api/v1/notes/${encodeURIComponent(String(params.noteId))}/attachments`
    );
    const res = await this.fetchWithRetry(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(this.authHeaders().entries()),
      },
      body: JSON.stringify({ container: params.container, blob: params.blob }),
    });
    return res.ok;
  }

  /**
   * Get a short-lived download URL when the stored attachment object has no `url`.
   * Expects backend route:
   * GET /api/v1/notes/:noteId/attachments/url?container=...&blob=...
   */
  static async getNoteAttachmentUrl(
    noteId: number | string,
    container: string,
    blob: string
  ): Promise<string | null> {
    try {
      const qs = new URLSearchParams({ container, blob });
      const res = await this.request(
        `/api/v1/notes/${encodeURIComponent(String(noteId))}/attachments/url?${qs.toString()}`,
        { method: 'GET' }
      );
      if (!res.ok) return null;
      const data = await this.safeJson<{ url?: string }>(res, {});
      return data?.url ?? null;
    } catch {
      return null;
    }
  }

  /** Convenience to fetch a single note if needed */
  static async getNoteById(noteId: number | string): Promise<SharedNote | null> {
    try {
      const res = await this.request(`/api/v1/notes/${encodeURIComponent(String(noteId))}`, {
        method: 'GET',
      });
      if (!res.ok) return null;
      return this.safeJson<SharedNote | null>(res, null);
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

  // -------------------- Study Goal and Progress APIs --------------------
  // Study Goal and Progress APIs
  static async setTopicGoal(
    topicId: number,
    goal: {
      hoursGoal: number;
      targetCompletionDate?: string;
      personalNotes?: string;
    }
  ): Promise<any> {
    try {
      const res = await this.fetchWithRetry(
        buildApiUrl(`/api/v1/progress/topics/${topicId}/goal`),
        {
          method: 'PUT',
          body: JSON.stringify(goal),
        }
      );
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
    log: {
      hours: number;
      description?: string;
      studyDate?: string;
      reflections?: string;
    }
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

      // Emit events to refresh all related components
      eventBus.emitMany(
        ['hours:logged', 'topics:invalidate', 'courses:invalidate', 'progress:updated'],
        {
          type: 'progress_update',
          topicId,
          metadata: { hours: log.hours },
          timestamp: Date.now(),
        }
      );

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

      // Emit events to refresh all related components
      eventBus.emitMany(
        ['topics:completed', 'topics:invalidate', 'courses:invalidate', 'progress:updated'],
        {
          type: 'progress_update',
          topicId,
          timestamp: Date.now(),
        }
      );

      return data;
    } catch (error) {
      console.error('❌ markTopicComplete error:', error);
      const appError = ErrorHandler.handleApiError(error, 'progress');
      throw appError;
    }
  }

  static async fetchTopicProgress(topicId: number): Promise<any> {
    try {
      const res = await this.request(`/api/v1/progress/topics/${topicId}`, {
        method: 'GET',
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'progress');
        throw appError;
      }
      const data = await this.safeJson<any>(res, null);
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
      const res = await this.request(`/api/v1/courses/${moduleId}/topics`, {
        method: 'GET',
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'courses');
        throw appError;
      }
      const data = await this.safeJson<any[]>(res, []);
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
    topic: {
      topic_name: string;
      description?: string;
      order_sequence?: number;
    }
  ): Promise<any> {
    try {
      console.log('➕ Adding topic to module:', { moduleId, topic });
      const res = await this.request(`/api/v1/modules/${moduleId}/topics`, {
        method: 'POST',
        body: JSON.stringify(topic),
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'courses');
        throw appError;
      }
      const data = await this.safeJson<any>(res, null);
      console.log('✅ Topic added successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ addTopic error:', error);
      const appError = ErrorHandler.handleApiError(error, 'courses');
      throw appError;
    }
  }

  static async logCourseStudyHours(
    courseId: string,
    log: {
      hours: number;
      description?: string;
      studyDate?: string;
    }
  ): Promise<any> {
    try {
      console.log('📝 Logging course study hours:', { courseId, log });
      const res = await this.request(`/api/v1/courses/${courseId}/log-hours`, {
        method: 'POST',
        body: JSON.stringify(log),
      });
      if (!res.ok) {
        const appError = ErrorHandler.handleApiError({ status: res.status }, 'courses');
        throw appError;
      }
      const data = await this.safeJson<any>(res, null);
      console.log('📝 Course study hours logged successfully:', data);

      // Emit events to refresh all related components
      eventBus.emitMany(['hours:logged', 'courses:invalidate', 'progress:updated'], {
        type: 'progress_update',
        courseId,
        metadata: { hours: log.hours },
        timestamp: Date.now(),
      });

      return data;
    } catch (error) {
      console.error('❌ logCourseStudyHours error:', error);
      const appError = ErrorHandler.handleApiError(error, 'courses');
      throw appError;
    }
  }

  /* ----------------- Group Chat ----------------- */

  /**
   * Fetch message history for a group chat
   */
  static async fetchGroupMessages(
    groupId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (options.before) params.set('before', options.before);

      const url = `/api/v1/chat/groups/${encodeURIComponent(groupId)}/messages${
        params.toString() ? `?${params}` : ''
      }`;

      const res = await this.request(url, { method: 'GET' });

      if (!res.ok) {
        console.error('Failed to fetch group messages:', res.status);
        return [];
      }

      const messages = await this.safeJson<any[]>(res, []);
      return Array.isArray(messages) ? messages : [];
    } catch (error) {
      console.error('❌ fetchGroupMessages error:', error);
      return [];
    }
  }

  /**
   * Send a message to a group chat
   */
  static async sendGroupMessage(
    groupId: string,
    content: string,
    type: string = 'text'
  ): Promise<any | null> {
    try {
      const res = await this.request(
        `/api/v1/chat/groups/${encodeURIComponent(groupId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content, type }),
        }
      );

      if (!res.ok) {
        console.error('Failed to send group message:', res.status);
        return null;
      }

      return await this.safeJson<any>(res, null);
    } catch (error) {
      console.error('❌ sendGroupMessage error:', error);
      return null;
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
