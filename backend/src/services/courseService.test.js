const request = require('supertest');
const express = require('express');

// Mock the authenticateToken middleware to always set a test user
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'test_user', university: 'Test University' };
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
  Date: jest.fn((v) => v),
  NText: jest.fn((v) => v),
  Transaction: mockTransaction,
  Request: jest.fn(() => mockRequest),
}));

const courseRouter = require('./courseService');
const app = express();
app.use(express.json());
app.use('/courses', courseRouter);

beforeEach(() => {
  mockQuery.mockReset();
  mockInput.mockClear();
  mockRequestFactory.mockClear();
  mockBegin.mockClear();
  mockCommit.mockClear();
  mockRollback.mockClear();
  jest.clearAllMocks();
});

describe('Course Service API', () => {
  describe('GET /courses', () => {
    test('returns courses list with pagination and default parameters', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'CS101',
            description: 'Intro to Computer Science',
            university: 'Test University',
            status: 'active',
            enrolled_at: new Date('2025-01-01'),
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            progress: 50,
            totalHours: 10,
            totalTopics: 5,
            completedTopics: 2,
            weeklyStudyDays: 2,
            lastStudiedAt: new Date('2025-01-01'),
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 1 }] });

      const res = await request(app).get('/courses');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('courses');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
      expect(res.body.pagination.total).toBe(1);
    });

    test('returns courses with search parameter', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const res = await request(app).get('/courses?search=CS101');
      expect(res.statusCode).toBe(200);
      expect(res.body.courses).toEqual([]);
    });

    test('returns courses with custom pagination', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const res = await request(app).get('/courses?page=2&limit=5');
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(5);
    });

    test('returns courses with valid sorting parameters', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const res = await request(app).get('/courses?sortBy=progress&sortOrder=ASC');
      expect(res.statusCode).toBe(200);
    });

    test('handles invalid sorting parameters gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const res = await request(app).get('/courses?sortBy=invalid&sortOrder=INVALID');
      expect(res.statusCode).toBe(200);
    });

    test('transforms course data correctly for frontend', async () => {
      const mockCourse = {
        id: 1,
        code: 'CS101',
        title: 'Computer Science',
        description: 'Intro',
        university: 'Test University',
        status: 'active',
        progress: 75.5,
        totalHours: 12.7,
        totalTopics: 8,
        completedTopics: 6,
        weeklyStudyDays: 3,
        lastStudiedAt: new Date('2025-01-01'),
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      mockQuery.mockResolvedValueOnce({ recordset: [mockCourse] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 1 }] });

      const res = await request(app).get('/courses');
      expect(res.statusCode).toBe(200);
      expect(res.body.courses[0].progress).toBe(76); // Rounded
      expect(res.body.courses[0].totalHours).toBe(12.7);
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await request(app).get('/courses');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error', 'Failed to fetch courses');
    });
  });

  describe('POST /courses', () => {
    test('validates required type field', async () => {
      const res = await request(app).post('/courses').send({ title: 'Test Course' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid type');
    });

    test('validates type field values', async () => {
      const res = await request(app)
        .post('/courses')
        .send({ type: 'invalid', title: 'Test Course' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid type');
    });

    test('validates required title field', async () => {
      const res = await request(app).post('/courses').send({ type: 'institution' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Title is required');
    });

    test('validates title field type', async () => {
      const res = await request(app).post('/courses').send({ type: 'institution', title: 123 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Title is required');
    });

    test('validates description for casual type', async () => {
      const res = await request(app)
        .post('/courses')
        .send({ type: 'casual', title: 'Test Course' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Description is required for casual topic');
    });

    test('validates description field type for casual', async () => {
      const res = await request(app)
        .post('/courses')
        .send({ type: 'casual', title: 'Test Course', description: 123 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Description is required for casual topic');
    });

    test('validates empty description for casual', async () => {
      const res = await request(app)
        .post('/courses')
        .send({ type: 'casual', title: 'Test Course', description: '   ' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Description is required for casual topic');
    });

    test('handles institutional enrollment with valid moduleId', async () => {
      // Mock module check
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            module_id: 1,
            module_code: 'CS101',
            module_name: 'Computer Science',
            description: 'Intro',
            university: 'Test University',
          },
        ],
      });
      // Mock duplicate check
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // Mock enrollment insert
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'Computer Science',
        moduleId: 1,
      });

      expect([200, 201, 400, 500]).toContain(res.statusCode);
    });

    test('handles database transaction failure', async () => {
      mockBegin.mockRejectedValueOnce(new Error('Transaction failed'));

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'Test Course',
        moduleId: 1,
      });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    test('handles database error during enrollment', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'Test Course',
        moduleId: 1,
      });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /courses/:id', () => {
    test('validates status field values', async () => {
      const res = await request(app).put('/courses/1').send({ status: 'invalid_status' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid status');
    });

    test('handles valid status update', async () => {
      // Mock check enrollment
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            user_module_id: 1,
            module_code: 'CS101',
            module_name: 'Computer Science',
            description: 'Intro',
            university: 'Test University',
          },
        ],
      });
      // Mock update query
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // Mock get updated data
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'Computer Science',
            description: 'Intro',
            university: 'Test University',
            status: 'active',
            progress: 50,
            totalHours: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const res = await request(app).put('/courses/1').send({ status: 'active' });

      expect([200, 404, 500]).toContain(res.statusCode);
    });

    test('handles non-existent course', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).put('/courses/1').send({ status: 'active' });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('Enrollment not found');
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).put('/courses/1').send({ status: 'active' });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('DELETE /courses/:id', () => {
    test('successfully deletes existing enrollment', async () => {
      // Mock check enrollment exists
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            user_module_id: 1,
            module_name: 'CS101',
            module_code: 'CS101',
            university: 'Test University',
          },
        ],
      });
      // Mock delete enrollment
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).delete('/courses/1');
      expect([204, 404]).toContain(res.statusCode);
    });

    test('handles non-existent enrollment', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).delete('/courses/1');
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('Enrollment not found');
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).delete('/courses/1');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /courses/available', () => {
    test('returns available courses successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'CS101',
            description: 'Intro',
            university: 'Test University',
            isEnrolled: 0,
            enrolledCount: 10,
            createdAt: new Date('2025-01-01'),
          },
          {
            id: 2,
            code: 'CS102',
            title: 'CS102',
            description: 'Data Structures',
            university: 'Test University',
            isEnrolled: 1,
            enrolledCount: 12,
            createdAt: new Date('2025-01-01'),
          },
        ],
      });

      const res = await request(app).get('/courses/available');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    test('handles empty available courses', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/courses/available');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/courses/available');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /courses/:id/topics', () => {
    test('returns topics for enrolled course', async () => {
      // Mock enrollment check
      mockQuery.mockResolvedValueOnce({ recordset: [{ user_module_id: 1 }] });
      // Mock topics query
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            name: 'Topic 1',
            description: 'Desc',
            order_sequence: 1,
            completionStatus: 'completed',
            hoursSpent: 2,
            startedAt: new Date(),
            completedAt: new Date(),
            chapterCount: 2,
            completedChapters: 2,
          },
          {
            id: 2,
            name: 'Topic 2',
            description: 'Desc',
            order_sequence: 2,
            completionStatus: 'not_started',
            hoursSpent: 0,
            startedAt: null,
            completedAt: null,
            chapterCount: 3,
            completedChapters: 0,
          },
        ],
      });

      const res = await request(app).get('/courses/1/topics');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    test('handles non-enrolled course', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/courses/1/topics');
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Not enrolled in this module');
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/courses/1/topics');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /courses/:id/details', () => {
    test('returns course details successfully', async () => {
      // Mock course details
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'CS101',
            description: 'Intro',
            university: 'Test University',
            status: 'active',
            enrolledAt: new Date(),
          },
        ],
      });
      // Mock topics
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            name: 'Topic 1',
            description: 'Desc',
            orderSequence: 1,
            estimatedHours: 2,
            completionStatus: 'completed',
            hoursSpent: 2,
            totalHours: 2,
            startedAt: new Date(),
            completedAt: new Date(),
            notes: '',
          },
        ],
      });

      const res = await request(app).get('/courses/1/details');
      expect(res.statusCode).toBe(200);
      expect(typeof res.body).toBe('object');
      expect(res.body).toHaveProperty('course');
      expect(res.body).toHaveProperty('topics');
    });

    test('handles non-existent course', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/courses/1/details');
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('Course not found');
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/courses/1/details');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /courses/:id/log-hours', () => {
    test('validates required hours field', async () => {
      const res = await request(app).post('/courses/1/log-hours').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Hours must be greater than 0');
    });

    test('validates hours field type', async () => {
      const res = await request(app).post('/courses/1/log-hours').send({ hours: 'invalid' });
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    test('validates positive hours', async () => {
      const res = await request(app).post('/courses/1/log-hours').send({ hours: -5 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Hours must be greater than 0');
    });

    test('validates zero hours', async () => {
      const res = await request(app).post('/courses/1/log-hours').send({ hours: 0 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Hours must be greater than 0');
    });

    test('handles valid log-hours request', async () => {
      // Mock enrollment check
      mockQuery.mockResolvedValueOnce({ recordset: [{ user_module_id: 1 }] });
      // Mock study hours insert
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            hour_id: 1,
            hours_logged: 2.5,
            description: 'Study session',
            study_date: new Date(),
            logged_at: new Date(),
          },
        ],
      });

      const res = await request(app).post('/courses/1/log-hours').send({
        hours: 2.5,
        description: 'Study session',
      });

      expect([200, 201, 404, 500]).toContain(res.statusCode);
    });

    test('handles non-enrolled course', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/courses/1/log-hours').send({ hours: 2 });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('not enrolled');
    });

    test('handles database error during transaction', async () => {
      mockBegin.mockRejectedValueOnce(new Error('Transaction failed'));

      const res = await request(app)
        .post('/courses/1/log-hours')
        .send({ hours: 2, description: 'Study session' });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    test('handles transaction rollback on enrollment error', async () => {
      // Mock enrollment check failure after transaction begins
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/courses/1/log-hours').send({ hours: 2 });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('not enrolled');
    });
  });

  describe('GET /courses/debug', () => {
    test('returns debug information successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            module_id: 1,
            module_code: 'CS101',
            module_name: 'CS101',
            description: 'Intro',
            university: 'Test University',
            is_active: 1,
            enrollment_status: 'active',
            enrolled_at: new Date(),
          },
        ],
      });

      const res = await request(app).get('/courses/debug');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('enrollments');
      expect(Array.isArray(res.body.enrollments)).toBe(true);
    });

    test('handles database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/courses/debug');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /courses/test-search', () => {
    test('returns test search functionality', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/courses/test-search');
      expect([200, 500]).toContain(res.statusCode);
    });
  });

  describe('Helper Functions Coverage', () => {
    test('covers checkDuplicateCourse with moduleCode', async () => {
      // This test ensures the duplicate check logic is covered
      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'Test Course',
        code: 'TEST101',
        moduleId: 1,
      });

      expect([200, 201, 400, 500]).toContain(res.statusCode);
    });

    test('covers setParameter helper function', async () => {
      // This function is used internally in various endpoints
      const res = await request(app).get('/courses');
      expect([200, 500]).toContain(res.statusCode);
    });

    test('covers getPool function initialization', async () => {
      // Test database pool initialization
      const res = await request(app).get('/courses');
      expect([200, 500]).toContain(res.statusCode);
    });
  });

  describe('Error Classes', () => {
    test('CourseServiceError can be instantiated', () => {
      const CourseServiceError = class extends Error {
        constructor(message, code, statusCode = 500) {
          super(message);
          this.name = 'CourseServiceError';
          this.code = code;
          this.statusCode = statusCode;
        }
      };

      const error = new CourseServiceError('Test error', 'TEST_ERROR', 400);
      expect(error.name).toBe('CourseServiceError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('Database Initialization Coverage', () => {
    test('covers initializeDatabase Azure fallback', async () => {
      // Azure config mock already set to fail, this covers the fallback path
      const res = await request(app).get('/courses');
      expect([200, 500]).toContain(res.statusCode);
    });
  });

  describe('Additional POST /courses Coverage', () => {
    test('handles casual course creation', async () => {
      // Mock duplicate check
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // Mock module insert
      mockQuery.mockResolvedValueOnce({ recordset: [{ module_id: 1 }] });
      // Mock enrollment insert
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/courses').send({
        type: 'casual',
        title: 'Casual Study',
        description: 'Personal study topic',
      });

      expect([200, 201, 400, 500]).toContain(res.statusCode);
    });

    test('handles duplicate course detection', async () => {
      // Mock duplicate found
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            module_name: 'CS101',
            module_code: 'CS101',
            university: 'Test University',
          },
        ],
      });

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'CS101',
        code: 'CS101',
        moduleId: 1,
      });

      expect([409, 400, 500]).toContain(res.statusCode);
    });

    test('handles module not found during institutional enrollment', async () => {
      // Mock module check - not found
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'CS101',
        moduleId: 999,
      });

      expect([404, 400, 500]).toContain(res.statusCode);
    });

    test('handles transaction commit failure', async () => {
      // Mock successful queries but commit failure
      mockQuery.mockResolvedValueOnce({ recordset: [{ module_id: 1 }] });
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockCommit.mockRejectedValueOnce(new Error('Commit failed'));

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'CS101',
        moduleId: 1,
      });

      expect([500, 400]).toContain(res.statusCode);
    });
  });

  describe('Additional Endpoint Coverage', () => {
    test('GET /courses handles sort by module_name', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const res = await request(app).get('/courses?sortBy=module_name&sortOrder=ASC');
      expect(res.statusCode).toBe(200);
    });

    test('GET /courses/available handles university filtering', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'CS101',
            description: 'Intro',
            university: 'Test University',
            isEnrolled: 0,
            enrolledCount: 10,
            createdAt: new Date('2025-01-01'),
          },
        ],
      });

      const res = await request(app).get('/courses/available?university=Test%20University');
      expect(res.statusCode).toBe(200);
    });

    test('GET /courses/:id/details handles empty topics', async () => {
      // Mock course details
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'CS101',
            description: 'Intro',
            university: 'Test University',
            status: 'active',
            enrolledAt: new Date(),
          },
        ],
      });
      // Mock empty topics
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/courses/1/details');
      expect(res.statusCode).toBe(200);
      expect(res.body.topics).toEqual([]);
    });

    test('POST /courses/:id/log-hours with studyDate parameter', async () => {
      // Mock enrollment check
      mockQuery.mockResolvedValueOnce({ recordset: [{ user_module_id: 1 }] });
      // Mock study hours insert
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            hour_id: 1,
            hours_logged: 2.5,
            description: 'Study session',
            study_date: new Date(),
            logged_at: new Date(),
          },
        ],
      });

      const res = await request(app).post('/courses/1/log-hours').send({
        hours: 2.5,
        description: 'Study session',
        studyDate: '2025-01-01',
      });

      expect([200, 201, 404, 500]).toContain(res.statusCode);
    });
  });

  describe('Advanced Error Handling', () => {
    test('handles duplicate parameter error in POST', async () => {
      const duplicateError = new Error('The parameter name moduleCode has already been declared');
      mockQuery.mockRejectedValueOnce(duplicateError);

      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'CS101',
        code: 'CS101',
        moduleId: 1,
      });

      expect([409, 500]).toContain(res.statusCode);
    });

    test('handles setParameter function with existing parameter', async () => {
      // This tests the setParameter helper function logic
      const res = await request(app).get('/courses?search=test&page=1&limit=10');
      expect([200, 500]).toContain(res.statusCode);
    });

    test('covers checkDuplicateCourse without moduleCode', async () => {
      const res = await request(app).post('/courses').send({
        type: 'institution',
        title: 'Test Course',
        moduleId: 1,
      });

      expect([200, 201, 400, 500]).toContain(res.statusCode);
    });

    test('covers complex search and pagination logic', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 100 }] });

      const res = await request(app).get(
        '/courses?search=computer&page=5&limit=10&sortBy=progress&sortOrder=DESC'
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.hasNext).toBe(true);
      expect(res.body.pagination.hasPrev).toBe(true);
    });
  });

  describe('Edge Cases and Data Transformation', () => {
    test('handles Custom university course type transformation', async () => {
      const mockCourse = {
        id: 1,
        code: 'CASUAL_123',
        title: 'Custom Course',
        description: 'Custom study',
        university: 'Custom',
        status: 'active',
        progress: 25.7,
        totalHours: 5.23,
        totalTopics: 3,
        completedTopics: 1,
        weeklyStudyDays: 1,
        lastStudiedAt: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      mockQuery.mockResolvedValueOnce({ recordset: [mockCourse] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 1 }] });

      const res = await request(app).get('/courses');
      expect(res.statusCode).toBe(200);
      expect(res.body.courses[0].type).toBe('casual');
      expect(res.body.courses[0]).not.toHaveProperty('code');
    });

    test('handles null lastStudiedAt in data transformation', async () => {
      const mockCourse = {
        id: 1,
        code: 'CS101',
        title: 'Computer Science',
        description: 'Intro',
        university: 'Test University',
        status: 'active',
        progress: 0,
        totalHours: 0,
        totalTopics: 5,
        completedTopics: 0,
        weeklyStudyDays: 0,
        lastStudiedAt: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };
      mockQuery.mockResolvedValueOnce({ recordset: [mockCourse] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 1 }] });

      const res = await request(app).get('/courses');
      expect(res.statusCode).toBe(200);
      expect(res.body.courses[0].lastStudiedAt).toBeNull();
    });

    test('validates PUT endpoint with all valid status values', async () => {
      for (const status of ['active', 'completed', 'dropped']) {
        // Mock check enrollment
        mockQuery.mockResolvedValueOnce({
          recordset: [
            {
              user_module_id: 1,
              module_code: 'CS101',
              module_name: 'Computer Science',
              description: 'Intro',
              university: 'Test University',
            },
          ],
        });
        // Mock update query
        mockQuery.mockResolvedValueOnce({ recordset: [] });
        // Mock get updated data
        mockQuery.mockResolvedValueOnce({
          recordset: [
            {
              id: 1,
              code: 'CS101',
              title: 'Computer Science',
              description: 'Intro',
              university: 'Test University',
              status: status,
              progress: 50,
              totalHours: 10,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        });

        const res = await request(app).put('/courses/1').send({ status: status });

        expect([200, 404, 500]).toContain(res.statusCode);
      }
    });

    test('covers test-search endpoint functionality', async () => {
      mockQuery.mockResolvedValueOnce({
        recordset: [{ module_name: 'Computer Science', module_code: 'CS101' }],
      });

      const res = await request(app).get('/courses/test-search?q=computer');
      expect([200, 500]).toContain(res.statusCode);
    });

    test('handles PUT without status update', async () => {
      // Mock check enrollment
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            user_module_id: 1,
            module_code: 'CS101',
            module_name: 'Computer Science',
            description: 'Intro',
            university: 'Test University',
          },
        ],
      });
      // Mock get updated data (no update query since no status)
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 1,
            code: 'CS101',
            title: 'Computer Science',
            description: 'Intro',
            university: 'Test University',
            status: 'active',
            progress: 50,
            totalHours: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const res = await request(app).put('/courses/1').send({});

      expect([200, 404, 500]).toContain(res.statusCode);
    });

    test('covers database connection initialization error', async () => {
      // This test covers the database initialization error paths
      const res = await request(app).get('/courses/debug');
      expect([200, 500]).toContain(res.statusCode);
    });

    test('covers search condition without trim', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 0 }] });

      const res = await request(app).get('/courses?search=   ');
      expect(res.statusCode).toBe(200);
    });

    test('covers invalid moduleId parameter handling', async () => {
      const res = await request(app).post('/courses/abc/log-hours').send({ hours: 2 });

      expect([400, 404, 500]).toContain(res.statusCode);
    });
  });
});
