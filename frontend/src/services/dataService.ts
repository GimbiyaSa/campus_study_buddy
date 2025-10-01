// frontend/src/services/dataService.ts
import { buildApiUrl } from '../utils/url';

// -------------------- Types --------------------
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
    year: '3rd Year',
    major: 'Computer Science',
    courses: ['CS301', 'CS305', 'MATH204'],
    bio: 'Algorithms + ML',
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
    bio: 'Math collab',
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
    bio: 'Design + DB',
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
    bio: 'Stats/analysis',
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
    bio: 'Web + UI/UX',
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
    bio: 'Systems/arch',
    studyHours: 48,
    rating: 4.8,
    lastActive: '2025-09-17',
  },
];

// -------------------- Service --------------------
export class DataService {
  // --- headers/helpers ---
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
  private static jsonHeaders(): Headers {
    const h = this.authHeaders();
    h.set('Content-Type', 'application/json');
    return h;
  }
  private static devForceFallback(): boolean {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search);
    return q.get('mockSessions') === '1' || localStorage.getItem('mockSessions') === '1';
  }
  private static async request(path: string, init?: RequestInit) {
    const url = buildApiUrl(path);
    return fetch(url, { credentials: 'include', ...init });
  }
  private static toISO(date: string, time: string): string {
    // local → ISO
    return new Date(`${date}T${time}:00`).toISOString();
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
  private static normalizeSession(s: any): StudySession {
    // Try a variety of shapes coming from the backend
    const id = String(s?.id ?? s?.session_id ?? cryptoRandomId());
    const title = s?.title ?? s?.session_title ?? 'Study session';

    // date/time sources
    let date = s?.date;
    let startTime = s?.startTime;
    let endTime = s?.endTime;

    const isoStart = s?.scheduled_start ?? s?.start_time ?? s?.startISO ?? s?.start;
    const isoEnd = s?.scheduled_end ?? s?.end_time ?? s?.endISO ?? s?.end;

    if ((!date || !startTime) && isoStart) {
      const dt = this.fromISO(isoStart);
      date = date || dt.date;
      startTime = startTime || dt.time;
    }
    if (!endTime && isoEnd) {
      const dt = this.fromISO(isoEnd);
      endTime = dt.time;
    }

    // fallback if still missing
    date = date || new Date().toISOString().slice(0, 10);
    startTime = startTime || '09:00';
    endTime = endTime || '10:00';

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
      participants: Number(s?.participants ?? s?.currentParticipants ?? s?.attendee_count ?? 1),
      maxParticipants: s?.maxParticipants ?? s?.max_participants,
      status: s?.status ?? 'upcoming',
      isCreator: !!(s?.isCreator ?? s?.organizer ?? s?.is_owner),
      isAttending: !!(s?.isAttending ?? s?.attending),
      groupId: s?.groupId ?? s?.group_id,
    };
  }

  // -------------------- Auth/User --------------------
  static async getMe(): Promise<{ id: string } | null> {
    try {
      const res = await this.request('/api/v1/users/me', { headers: this.jsonHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const id = data?.user_id ?? data?.id;
      return id ? { id: String(id) } : null;
    } catch {
      return null;
    }
  }

  // -------------------- Courses --------------------
  static async fetchCourses(): Promise<Course[]> {
    try {
      const res = await this.request('/api/v1/courses', { headers: this.authHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return FALLBACK_COURSES;
  }

  // -------------------- Sessions --------------------
  static async fetchSessions(opts?: {
    forceFallback?: boolean;
    fallbackOnEmpty?: boolean;
  }): Promise<StudySession[]> {
    const force = opts?.forceFallback || this.devForceFallback();
    if (force) return FALLBACK_SESSIONS;

    try {
      const res = await this.request('/api/v1/sessions', { headers: this.authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = (data as any[]).map((row) => this.normalizeSession(row));
        if (list.length === 0 && (opts?.fallbackOnEmpty ?? true)) return FALLBACK_SESSIONS;
        return list;
      }
    } catch {}
    return FALLBACK_SESSIONS;
  }

  /** Create a standalone session (or group-linked if groupId provided). */
  static async createSession(
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
  ): Promise<StudySession | null> {
    // Prefer group-scoped endpoint when groupId is present
    if (sessionData.groupId) {
      const payload = {
        title: sessionData.title,
        description: undefined,
        startTime: this.toISO(sessionData.date, sessionData.startTime),
        endTime: this.toISO(sessionData.date, sessionData.endTime),
        location: sessionData.location,
        topics: [],
        type: sessionData.type,
        course: sessionData.course,
        courseCode: sessionData.courseCode,
        maxParticipants: sessionData.maxParticipants,
      };
      try {
        const res = await this.request(
          `/api/v1/groups/${encodeURIComponent(String(sessionData.groupId))}/sessions`,
          { method: 'POST', headers: this.jsonHeaders(), body: JSON.stringify(payload) }
        );
        if (res.ok) {
          const created = await res.json();
          return this.normalizeSession(created);
        }
      } catch {}
      // If group endpoint failed, fall back to global create
    }

    // Generic sessions endpoint; include a liberal payload to match common backends
    const startISO = this.toISO(sessionData.date, sessionData.startTime);
    const endISO = this.toISO(sessionData.date, sessionData.endTime);
    const payload = {
      // "new" style
      title: sessionData.title,
      startTime: startISO,
      endTime: endISO,
      location: sessionData.location,
      type: sessionData.type,
      course: sessionData.course,
      courseCode: sessionData.courseCode,
      maxParticipants: sessionData.maxParticipants,
      groupId: sessionData.groupId,
      // "legacy" style fields some backends use
      session_title: sessionData.title,
      scheduled_start: startISO,
      scheduled_end: endISO,
      session_type: sessionData.type,
      max_participants: sessionData.maxParticipants,
    };

    try {
      const res = await this.request('/api/v1/sessions', {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        return this.normalizeSession(created);
      }
    } catch {}
    return null;
  }

  static async updateSession(
    sessionId: string,
    sessionData: Omit<StudySession, 'id' | 'participants' | 'status' | 'isCreator' | 'isAttending'>
  ): Promise<StudySession | null> {
    const startISO = this.toISO(sessionData.date, sessionData.startTime);
    const endISO = this.toISO(sessionData.date, sessionData.endTime);
    const payload = {
      title: sessionData.title,
      startTime: startISO,
      endTime: endISO,
      location: sessionData.location,
      type: sessionData.type,
      course: sessionData.course,
      courseCode: sessionData.courseCode,
      maxParticipants: sessionData.maxParticipants,
      groupId: sessionData.groupId,
      // legacy mirrors
      session_title: sessionData.title,
      scheduled_start: startISO,
      scheduled_end: endISO,
      session_type: sessionData.type,
      max_participants: sessionData.maxParticipants,
    };

    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PUT',
        headers: this.jsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        return this.normalizeSession(updated);
      }
    } catch {}
    return null;
  }

  static async deleteSession(sessionId: string): Promise<{ ok: boolean; data?: any } | null> {
    try {
      const res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: this.authHeaders(),
      });
      if (res.ok) {
        // some backends return the cancelled row
        let data: any = null;
        try {
          data = await res.json();
        } catch {}
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
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async leaveSession(sessionId: string): Promise<boolean> {
    // Try DELETE first (matches your existing code), then POST fallback
    try {
      let res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/leave`, {
        method: 'DELETE',
        headers: this.authHeaders(),
      });
      if (res.ok) return true;

      res = await this.request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/leave`, {
        method: 'POST',
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // -------------------- Partners --------------------
  static async fetchPartners(): Promise<StudyPartner[]> {
    try {
      const res = await this.request('/api/v1/partners', { headers: this.authHeaders() });
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
      endTime: string; // ISO
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
    if (buf)
      return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
  } catch {}
  return String(Date.now());
}
