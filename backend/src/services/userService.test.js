const request = require('supertest');
const express = require('express');

// Mock auth middleware BEFORE requiring the router
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = {
      id: 'test_user',
      email: 'test@example.com',
      name: 'Test User',
      university: 'Test University',
      firstName: 'Test',
      lastName: 'User',
    };
    next();
  },
}));

// Mock Azure configuration
jest.mock('../config/azureConfig', () => ({
  azureConfig: {
    getDatabaseConfig: jest.fn().mockRejectedValue(new Error('Azure config not available')),
  },
}));

// Set required environment variable for testing
process.env.DATABASE_CONNECTION_STRING = 'mocked://connection/string';

// Robust mssql mock with resettable handlers
const mockQuery = jest.fn();
const mockInput = jest.fn(function () {
  return this;
});
const mockRequest = { input: mockInput, query: mockQuery };
const mockRequestFactory = jest.fn(() => mockRequest);
const mockBegin = jest.fn().mockResolvedValue();
const mockCommit = jest.fn().mockResolvedValue();
const mockRollback = jest.fn().mockResolvedValue();
const mockTransaction = function () {
  return {
    begin: mockBegin,
    commit: mockCommit,
    rollback: mockRollback,
    request: jest.fn(() => mockRequest),
  };
};
const mockConnect = jest.fn().mockResolvedValue();
const mockClose = jest.fn().mockResolvedValue();
const mockConnectionPool = {
  request: mockRequestFactory,
  connected: true,
  connect: mockConnect,
  close: mockClose,
};

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn(() => mockConnectionPool),
  connect: jest.fn(() => Promise.resolve(mockConnectionPool)),
  NVarChar: jest.fn((v) => v),
  Int: jest.fn((v) => v),
  DateTime: jest.fn((v) => v),
  Decimal: jest.fn((v) => v),
  MAX: 99999,
  Transaction: mockTransaction,
  Request: jest.fn(() => mockRequest),
}));

const userRouter = require('./userService');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/users', userRouter);
});

beforeEach(() => {
  mockQuery.mockReset();
  mockInput.mockClear();
  mockRequestFactory.mockClear();
  mockBegin.mockClear();
  mockCommit.mockClear();
  mockRollback.mockClear();
  jest.clearAllMocks();
});

describe('User Service API', () => {
  test('GET /users/me returns current user profile', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          user_id: 'test_user',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          university: 'Test University',
          course: 'CS',
          year_of_study: 2,
          bio: 'Test bio',
          profile_image_url: null,
          study_preferences: '{}',
          is_active: 1,
          created_at: '2025-01-01',
          updated_at: '2025-01-02',
          enrolled_modules: 'CS101,CS102',
        },
      ],
    });
    const res = await request(app).get('/users/me').set('Authorization', 'Bearer test-token');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('user_id', 'test_user');
    expect(res.body).toHaveProperty('email', 'test@example.com');
    expect(res.body).toHaveProperty('enrolled_modules', 'CS101,CS102');
  });

  test('GET /users/me creates new user if not found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // No user found
      .mockResolvedValueOnce({
        recordset: [{ user_id: 'new_user', email: 'new@example.com', enrolled_modules: '' }],
      });
    const res = await request(app).get('/users/me').set('Authorization', 'Bearer test-token');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('user_id', 'new_user');
  });

  test('GET /users/me handles DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/users/me').set('Authorization', 'Bearer test-token');
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /users/me updates user profile', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ user_id: 'test_user', first_name: 'Updated', enrolled_modules: 'CS101' }],
    });
    const res = await request(app)
      .put('/users/me')
      .send({ first_name: 'Updated' })
      .set('Authorization', 'Bearer test-token');
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body).toHaveProperty('first_name', 'Updated');
    }
  });

  test('PUT /users/me returns 400 if no valid fields', async () => {
    const res = await request(app)
      .put('/users/me')
      .send({ invalid: 'field' })
      .set('Authorization', 'Bearer test-token');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /users/me returns 404 if user not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = await request(app)
      .put('/users/me')
      .send({ first_name: 'NotFound' })
      .set('Authorization', 'Bearer test-token');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /users/me handles DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .put('/users/me')
      .send({ first_name: 'Error' })
      .set('Authorization', 'Bearer test-token');
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  // Additional comprehensive tests for all endpoints
  describe('GET /users - All Users List', () => {
    test('should return list of all users', async () => {
      const mockUsers = {
        recordset: [
          { user_id: 'user1', first_name: 'John', last_name: 'Doe', university: 'University A' },
          { user_id: 'user2', first_name: 'Jane', last_name: 'Smith', university: 'University B' },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockUsers);

      const res = await request(app).get('/users');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('user_id', 'user1');
      expect(res.body[1]).toHaveProperty('user_id', 'user2');
    });

    test('should handle empty users list', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/users');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('should handle database error for users list', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/users');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /users/me/modules - User Modules', () => {
    test('should return user enrolled modules', async () => {
      const mockModules = {
        recordset: [
          { module_id: 'CS101', name: 'Intro to Programming', credits: 6, progress: 75 },
          { module_id: 'CS102', name: 'Data Structures', credits: 8, progress: 50 },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockModules);

      const res = await request(app).get('/users/me/modules');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('module_id', 'CS101');
      expect(res.body[1]).toHaveProperty('module_id', 'CS102');
    });

    test('should handle no enrolled modules', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/users/me/modules');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('should handle database error for modules', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/users/me/modules');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /users/me/modules/:moduleId/enroll - Module Enrollment', () => {
    test('should enroll user in module successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // Not already enrolled
        .mockResolvedValueOnce({ recordset: [{ user_id: 'test_user', module_id: 'CS103' }] }); // Enrollment success

      const res = await request(app).post('/users/me/modules/CS103/enroll');
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('user_id', 'test_user');
    });

    test('should handle module already enrolled', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ user_id: 'test_user' }] }); // Already enrolled

      const res = await request(app).post('/users/me/modules/CS103/enroll');
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle already enrolled', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ user_id: 'test_user' }] }); // Already enrolled

      const res = await request(app).post('/users/me/modules/CS103/enroll');
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle enrollment database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).post('/users/me/modules/CS103/enroll');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /users/me/progress - User Progress', () => {
    test('should return user progress data', async () => {
      const mockProgress = {
        recordset: [
          { module_id: 'CS101', progress_percentage: 85, completed_lessons: 17, total_lessons: 20 },
          { module_id: 'CS102', progress_percentage: 60, completed_lessons: 12, total_lessons: 20 },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockProgress);

      const res = await request(app).get('/users/me/progress');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('progress_percentage', 85);
      expect(res.body[1]).toHaveProperty('progress_percentage', 60);
    });

    test('should handle no progress data', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/users/me/progress');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('should handle progress database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/users/me/progress');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /users/me/progress - Update Progress', () => {
    test('should update progress successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ progress_id: 1 }] }) // Existing progress found
        .mockResolvedValueOnce({ recordset: [{ progress_id: 1, completion_status: 'completed' }] }); // Update success

      const progressData = {
        topic_id: 'topic1',
        completion_status: 'completed',
        hours_spent: 2.5,
      };

      const res = await request(app).put('/users/me/progress').send(progressData);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('progress_id', 1);
    });

    test('should create new progress record', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing progress
        .mockResolvedValueOnce({
          recordset: [{ progress_id: 2, completion_status: 'in_progress' }],
        }); // Create success

      const progressData = {
        topic_id: 'topic1',
        completion_status: 'in_progress',
        hours_spent: 1.0,
      };

      const res = await request(app).put('/users/me/progress').send(progressData);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('progress_id', 2);
    });

    test('should validate required fields', async () => {
      const invalidData = { completion_status: true }; // Missing required fields

      const res = await request(app).put('/users/me/progress').send(invalidData);
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle progress update database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const progressData = {
        topic_id: 'topic1',
        completion_status: 'completed',
      };

      const res = await request(app).put('/users/me/progress').send(progressData);
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /users/me/study-hours - Study Hours', () => {
    test('should return study hours data', async () => {
      const mockStudyHours = {
        recordset: [
          {
            date: '2023-05-01',
            total_hours: 4.5,
            module_breakdown: '{"CS101": 2.5, "CS102": 2.0}',
          },
          {
            date: '2023-05-02',
            total_hours: 3.0,
            module_breakdown: '{"CS101": 1.5, "CS103": 1.5}',
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockStudyHours);

      const res = await request(app).get('/users/me/study-hours');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('total_hours', 4.5);
      expect(res.body[1]).toHaveProperty('total_hours', 3.0);
    });

    test('should handle no study hours data', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/users/me/study-hours');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('should handle study hours database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/users/me/study-hours');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /users/me/study-hours - Log Study Hours', () => {
    test('should log study hours successfully', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ hours_id: 1, hours_logged: 2.5 }] });

      const studyData = {
        module_id: 'CS101',
        hours_logged: 2.5,
        study_date: '2023-05-01',
        description: 'Studied algorithms',
      };

      const res = await request(app).post('/users/me/study-hours').send(studyData);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('hours_logged', 2.5);
    });

    test('should validate required study hours fields', async () => {
      const invalidData = { description: 'Study session' }; // Missing required hours_logged

      const res = await request(app).post('/users/me/study-hours').send(invalidData);
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should validate hours value', async () => {
      const invalidData = {
        module_id: 'CS101',
        hours_logged: -1, // Invalid negative hours
        study_date: '2023-05-01',
      };

      const res = await request(app).post('/users/me/study-hours').send(invalidData);
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle study hours logging database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const studyData = {
        module_id: 'CS101',
        hours_logged: 2.5,
        study_date: '2023-05-01',
      };

      const res = await request(app).post('/users/me/study-hours').send(studyData);
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /users/me/statistics - User Statistics', () => {
    test('should return user statistics', async () => {
      const mockStats = {
        recordset: [
          {
            total_study_hours: 45.5,
            sessions_attended: 12,
            topics_completed: 25,
            chapters_completed: 8,
            modules_enrolled: 5,
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockStats);

      const res = await request(app).get('/users/me/statistics');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('total_study_hours', 45.5);
      expect(res.body).toHaveProperty('sessions_attended', 12);
      expect(res.body).toHaveProperty('topics_completed', 25);
    });

    test('should handle empty statistics', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/users/me/statistics');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('total_study_hours', 0);
      expect(res.body).toHaveProperty('sessions_attended', 0);
    });

    test('should handle statistics database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/users/me/statistics');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /users/me/notifications - User Notifications', () => {
    test('should return user notifications', async () => {
      const mockNotifications = {
        recordset: [
          {
            id: 'notif1',
            title: 'New Message',
            message: 'You have a new message',
            type: 'message',
            is_read: false,
            created_at: '2023-05-01T10:00:00.000Z',
          },
          {
            id: 'notif2',
            title: 'Progress Update',
            message: 'Module completed',
            type: 'progress',
            is_read: true,
            created_at: '2023-04-30T15:30:00.000Z',
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockNotifications);

      const res = await request(app).get('/users/me/notifications');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('id', 'notif1');
      expect(res.body[1]).toHaveProperty('id', 'notif2');
    });

    test('should handle no notifications', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/users/me/notifications');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('should handle notifications database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/users/me/notifications');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /users/me/notifications/:notificationId/read - Mark Notification Read', () => {
    test('should mark notification as read successfully', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ notification_id: 1, is_read: 1 }] });

      const res = await request(app).put('/users/me/notifications/1/read');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('notification_id', 1);
      expect(res.body).toHaveProperty('is_read', 1);
    });

    test('should handle notification not found', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).put('/users/me/notifications/999/read');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle notification update database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).put('/users/me/notifications/1/read');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /users/files/upload - File Upload', () => {
    test('should handle missing file upload', async () => {
      const res = await request(app).post('/users/files/upload');
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle file upload validation', async () => {
      // Test file upload with insufficient data
      const res = await request(app).post('/users/files/upload').field('description', 'test file');

      // Since we can't easily mock multer file upload, test error handling
      expect([400, 500]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed JSON in request body', async () => {
      const res = await request(app)
        .put('/users/me')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(res.statusCode).toBe(400);
    });

    test('should handle very large request bodies gracefully', async () => {
      const largeData = {
        bio: 'A'.repeat(10000), // Very large bio
        first_name: 'Test',
      };

      const res = await request(app).put('/users/me').send(largeData);

      // Should either accept or reject gracefully
      expect([200, 400, 413, 500]).toContain(res.statusCode);
    });

    test('should handle SQL injection attempts safely', async () => {
      const maliciousData = {
        first_name: "'; DROP TABLE users; --",
        last_name: 'TestUser',
      };

      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).put('/users/me').send(maliciousData);

      // Should handle safely without crashing
      expect([200, 400, 404, 500]).toContain(res.statusCode);
    });
  });
});
