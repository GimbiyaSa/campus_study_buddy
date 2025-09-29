import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock fetch globally for all tests
beforeEach(() => {
  global.fetch = vi.fn((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();

    // Users
    if (url.includes('/api/v1/users/me')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            user_id: 1,
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            university: 'Test University',
            course: 'Computer Science',
            year_of_study: 2,
            is_active: true,
          }),
      }) as Promise<Response>;
    }
    if (url.includes('/api/v1/users')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              user_id: 1,
              email: 'test@example.com',
              first_name: 'Test',
              last_name: 'User',
              university: 'Test University',
              course: 'Computer Science',
              year_of_study: 2,
              is_active: true,
            },
            {
              user_id: 2,
              email: 'alice@example.com',
              first_name: 'Alice',
              last_name: 'Smith',
              university: 'Test University',
              course: 'Mathematics',
              year_of_study: 3,
              is_active: true,
            },
          ]),
      }) as Promise<Response>;
    }

    // Partners
    if (url.includes('/api/v1/partners')) {
      if (input instanceof Request && input.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Invite sent' }),
        }) as Promise<Response>;
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: '2',
              name: 'Alice Smith',
              major: 'Mathematics',
              overlap: '2 modules',
              tags: ['Morning', 'On-campus'],
              initials: 'AS',
            },
            {
              id: '3',
              name: 'Bob Lee',
              major: 'Physics',
              overlap: '1 module',
              tags: ['Evening'],
              initials: 'BL',
            },
          ]),
      }) as Promise<Response>;
    }

    // Notes (group/shared notes)
    if (url.includes('/api/v1/groups/notes')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              note_id: 1,
              group_id: 1,
              author_id: 1,
              topic_id: 1,
              note_title: 'Binary Tree Traversal Methods',
              note_content:
                'In-order, pre-order, and post-order traversal techniques for binary trees. Key concepts include recursive approaches and iterative implementations using stacks.',
              visibility: 'public',
              is_active: true,
              created_at: '2025-09-19',
              updated_at: '2025-09-19',
              author_name: 'John Doe',
              group_name: 'CS Advanced',
              topic_name: 'Data Structures',
            },
            {
              note_id: 2,
              group_id: 2,
              author_id: 2,
              topic_id: 2,
              note_title: 'Matrix Operations',
              note_content:
                'Fundamental matrix operations including addition, multiplication, and determinant calculation. Important for linear algebra applications.',
              visibility: 'group',
              is_active: true,
              created_at: '2025-09-18',
              updated_at: '2025-09-18',
              author_name: 'Jane Smith',
              group_name: 'Math Warriors',
              topic_name: 'Linear Algebra',
            },
          ]),
      }) as Promise<Response>;
    }

    // Groups
    if (url.includes('/api/v1/groups')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
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
              module_name: 'CS201 - Data Structures',
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
          ]),
      }) as Promise<Response>;
    }

    // Sessions
    if (url.includes('/api/v1/sessions')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
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
            },
          ]),
      }) as Promise<Response>;
    }

    // Courses
    if (url.includes('/api/v1/courses')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'CS101',
              title: 'Intro to Computer Science',
              code: 'CS101',
              progress: 80,
              totalHours: 40,
              weeklyHours: 5,
              lastStudied: '2025-09-20',
            },
            {
              id: 'MATH201',
              title: 'Calculus II',
              code: 'MATH201',
              progress: 60,
              totalHours: 30,
              weeklyHours: 3,
              lastStudied: '2025-09-18',
            },
          ]),
      }) as Promise<Response>;
    }

    // Progress
    if (url.includes('/api/v1/user/progress')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            totalStudyHours: 120,
            weeklyStudyHours: 12,
            coursesCompleted: 3,
            totalCourses: 5,
            weeklyGoal: 15,
            currentStreak: 4,
            longestStreak: 10,
          }),
      }) as Promise<Response>;
    }
    if (url.includes('/api/v1/user/course-progress')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'CS101',
              title: 'Intro to Computer Science',
              progress: 80,
              totalHours: 40,
              weeklyHours: 5,
              lastStudied: '2025-09-20',
            },
          ]),
      }) as Promise<Response>;
    }
    if (url.includes('/api/v1/user/weekly-study-hours')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { day: 'Mon', hours: 2 },
            { day: 'Tue', hours: 3 },
            { day: 'Wed', hours: 2 },
            { day: 'Thu', hours: 1 },
            { day: 'Fri', hours: 2 },
            { day: 'Sat', hours: 1 },
            { day: 'Sun', hours: 1 },
          ]),
      }) as Promise<Response>;
    }

    // Settings/profile
    if (url.includes('/api/v1/user/profile')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Test User',
            email: 'test@example.com',
            avatar: '',
            bio: 'I love studying!',
            institution: 'Test University',
            year: '2',
            major: 'Computer Science',
          }),
      }) as Promise<Response>;
    }
    if (url.includes('/api/v1/user/notifications')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionReminders: true,
            newMessages: true,
            partnerRequests: true,
            groupInvites: true,
            weeklyProgress: true,
            emailNotifications: false,
          }),
      }) as Promise<Response>;
    }
    if (url.includes('/api/v1/user/privacy')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            profileVisibility: 'public',
            groupVisibility: 'private',
          }),
      }) as Promise<Response>;
    }
    if (url.includes('/api/v1/user/preferences')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            studyTimes: ['Morning', 'Evening'],
            preferredModules: ['CS101', 'MATH201'],
          }),
      }) as Promise<Response>;
    }

    if (url.includes('/api/v1/modules')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { module_id: 1, module_code: 'CS101', module_name: 'Intro to Computer Science' },
            { module_id: 2, module_code: 'MATH201', module_name: 'Calculus II' },
          ]),
      }) as Promise<Response>;
    }

    // Default: empty success
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    }) as Promise<Response>;
  }) as any;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
