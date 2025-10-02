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
  connectionStatus?: 'none' | 'pending' | 'accepted' | 'declined' | 'blocked';
  connectionId?: number;
  isPendingSent?: boolean;
  isPendingReceived?: boolean;
  mutualConnections?: number;
  
  // Study match details
  recommendationReason?: string;
  sharedGoals?: string[];
}

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

// -------- Demo fallback data (keeping for sessions, groups, partners) --------
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
    sharedGoals: ['Master algorithms', 'Excel in databases']
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
    sharedGoals: ['Master linear algebra', 'Physics excellence']
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
    sharedGoals: ['Software architecture mastery', 'Database optimization']
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
    sharedGoals: ['Statistical mastery', 'Algorithm optimization']
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
    sharedGoals: ['Frontend excellence', 'Design thinking']
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
    sharedGoals: ['System architecture', 'Hardware-software integration']
  },
];

// -------- Enhanced Service with Retry Logic --------
export class DataService {
  private static authHeaders(): Headers {
    const h = new Headers();
    // Check for both 'google_id_token' (Google Auth) and 'token' (fallback)
    const googleToken = typeof window !== 'undefined' ? localStorage.getItem('google_id_token') : null;
    const generalToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const raw = googleToken || generalToken;
    
    console.log('🔍 Auth token check:', {
      googleToken: googleToken ? `${googleToken.substring(0, 20)}...` : null,
      generalToken: generalToken ? `${generalToken.substring(0, 20)}...` : null,
      selectedToken: raw ? `${raw.substring(0, 20)}...` : null
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

  // Enhanced fetch with retry logic
  private static async fetchWithRetry(
    url: string, 
    options: RequestInit = {}, 
    retries = 2,  // Reduced retries for faster response
    timeout = 5000  // 5 second timeout
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        // Create abort controller for timeout
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
          throw new Error(`Client error: ${response.status} ${response.statusText}`);
        }
        
        if (i === retries - 1) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`Request timeout after ${timeout}ms for ${url}`);
        }
        if (i === retries - 1) throw error;
        // Reduced backoff for faster response
        await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.pow(2, i) * 200)));
      }
    }
    throw new Error('Should not reach here');
  }

  // Enhanced course fetching with expert error handling
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

      // Handle both paginated and non-paginated responses
      let courses: Course[] = [];
      if (data.courses) {
        courses = data.courses; // Paginated response
      } else if (Array.isArray(data)) {
        courses = data; // Direct array response (backwards compatibility)
      } else {
        console.warn('⚠️ Unexpected response format:', data);
        courses = []; // Default to empty array for unexpected formats
      }

      console.log('✅ Courses processed successfully:', courses.length, 'courses');
      return courses;
    } catch (error) {
      console.error('❌ fetchCourses error details:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw the error so the component can handle it
      throw error;
    }
  }

  // Add a new course with optimistic updates support
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

  // Remove a course
  static async removeCourse(courseId: string): Promise<void> {
    const url = buildApiUrl(`/api/v1/courses/${courseId}`);
    console.log('🗑️ Removing course:', courseId);
    
    await this.fetchWithRetry(url, {
      method: 'DELETE',
    });
    
    console.log('✅ Course removed:', courseId);
  }

  static async fetchSessions(): Promise<StudySession[]> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/sessions'));
      const data = await res.json();
      return (data as any[]).map((s) => ({
        ...s,
        isAttending: !!s.isAttending,
        id: String(s.id),
      }));
    } catch (error) {
      console.error('❌ fetchSessions error:', error);
      // Keep fallback for sessions (not in your focus list)
      return FALLBACK_SESSIONS;
    }
  }

  static async fetchGroups(): Promise<StudyGroup[]> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl('/api/v1/groups'));
      return await res.json();
    } catch (error) {
      console.error('❌ fetchGroups error:', error);
      // Keep fallback for groups (not in your focus list)
      return FALLBACK_GROUPS;
    }
  }

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
      if (params?.university) {
        queryParams.append('university', params.university);
      }
      if (params?.search) {
        queryParams.append('search', params.search);
      }

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
        body: JSON.stringify({ recipientId, message })
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
        method: 'POST'
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
        method: 'POST'
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

  // Study Goal and Progress APIs
  static async setTopicGoal(topicId: number, goal: {
    hoursGoal: number;
    targetCompletionDate?: string;
    personalNotes?: string;
  }): Promise<any> {
    try {
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/progress/topics/${topicId}/goal`), {
        method: 'PUT',
        body: JSON.stringify(goal)
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

  static async logStudyHours(topicId: number, log: {
    hours: number;
    description?: string;
    studyDate?: string;
    reflections?: string;
  }): Promise<any> {
    try {
      console.log('📝 Logging study hours:', { topicId, log });
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/progress/topics/${topicId}/log-hours`), {
        method: 'POST',
        body: JSON.stringify(log)
      });
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
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/progress/topics/${topicId}/complete`), {
        method: 'PUT'
      });
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

  static async addTopic(moduleId: number, topic: {
    topic_name: string;
    description?: string;
    order_sequence?: number;
  }): Promise<any> {
    try {
      console.log('➕ Adding topic to module:', { moduleId, topic });
      const res = await this.fetchWithRetry(buildApiUrl(`/api/v1/modules/${moduleId}/topics`), {
        method: 'POST',
        body: JSON.stringify(topic)
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
