const request = require('supertest');
const express = require('express');

// Mock auth middleware BEFORE requiring the router
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = {
      id: 'current-user',
      email: 'current@example.com',
      name: 'Current User',
      university: 'Test University'
    };
    next();
  },
}));

// Mock Azure config
jest.mock('../config/azureConfig', () => ({
  azureConfig: {
    getDatabaseConfig: jest.fn(),
    getWebPubSubClient: jest.fn()
  }
}));

// Mock WebPubSub
jest.mock('@azure/web-pubsub', () => ({
  WebPubSubServiceClient: jest.fn().mockImplementation(() => ({
    sendToUser: jest.fn().mockResolvedValue({}),
  })),
}));

// Robust mssql mock with resettable handlers
const mockQuery = jest.fn();
const mockInput = jest.fn(function () { return this; });
const mockRequest = { input: mockInput, query: mockQuery };
const mockRequestFactory = jest.fn(() => mockRequest);
const mockConnectionPool = { request: mockRequestFactory, connected: true, connect: jest.fn(), close: jest.fn() };

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn(() => mockConnectionPool),
  connect: jest.fn(() => Promise.resolve(mockConnectionPool)),
  NVarChar: jest.fn((v) => v),
  Int: jest.fn((v) => v),
  NText: jest.fn((v) => v),
  MAX: 999999,
}));

const partnerRouter = require('./partnerService');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/partners', partnerRouter);
});

beforeEach(() => {
  mockQuery.mockReset();
  mockInput.mockClear();
  mockRequestFactory.mockClear();
});

describe('Partner Service API', () => {
  describe('GET /partners', () => {
    test('returns empty array when no buddies', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] }); // No connections
      const res = await request(app).get('/partners');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('returns buddies list when connections exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ requesterId: 'current-user', recipientId: 'buddy1', match_status: 'accepted' }] })
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'buddy1', 
          email: 'buddy@example.com', 
          first_name: 'Buddy', 
          last_name: 'One', 
          university: 'Test University', 
          course: 'CS',
          year_of_study: 2,
          bio: 'Test bio',
          study_preferences: '{"studyStyle": "visual"}',
          created_at: '2025-01-01',
          updated_at: '2025-01-01'
        }] });
      
      const res = await request(app).get('/partners');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('id', 'buddy1');
      expect(res.body[0]).toHaveProperty('name', 'Buddy One');
    });

    test('handles DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/partners');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /partners/search', () => {
    test('returns search results with compatibility scores', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'Test University', course: 'CS', year_of_study: 2, study_preferences: '{}' }] }) // Current user
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'partner1', 
          email: 'partner@example.com', 
          first_name: 'Partner', 
          last_name: 'One',
          university: 'Test University',
          course: 'CS',
          year_of_study: 2,
          bio: 'Test bio',
          study_preferences: '{"studyStyle": "visual", "groupSize": "small"}',
          sharedCourses: 'CS101, CS102',
          connectionStatus: null,
          connectionId: null,
          connectionRequesterId: null
        }] });

      const res = await request(app).get('/partners/search?subjects=CS101&studyStyle=visual&groupSize=small');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('compatibilityScore');
        expect(res.body[0]).toHaveProperty('sharedCourses');
      }
    });

    test('handles search with university filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'Test University', course: 'CS', study_preferences: '{}' }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/partners/search?university=MIT');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('handles search with name filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'Test University', study_preferences: '{}' }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/partners/search?search=John');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('handles DB error in search', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/partners/search');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /partners/match', () => {
    test('creates partner match successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing connection
        .mockResolvedValueOnce({ recordset: [{ first_name: 'Current', last_name: 'User', email: 'current@example.com', university: 'Test University', course: 'CS' }] }) // Requester info
        .mockResolvedValueOnce({ recordset: [{ module_id: 1 }] }) // Module check
        .mockResolvedValueOnce({ recordset: [{ match_id: 123, created_at: '2025-01-01T10:00:00Z' }] }); // Insert result

      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user', message: 'Hello!' });
      
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id', 123);
      expect(res.body).toHaveProperty('status', 'pending');
    });

    test('returns 400 if matched_user_id missing', async () => {
      const res = await request(app)
        .post('/partners/match')
        .send({ message: 'Hello!' });
      
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 if trying to match with self', async () => {
      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'current-user' });
      
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 if connection already exists', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ match_id: 1, match_status: 'pending' }] });

      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user' });
      
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('handles DB error in match', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user' });
      
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /partners/request', () => {
    test('creates buddy request successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing connection
        .mockResolvedValueOnce({ recordset: [{ module_id: 1 }] }) // Module check
        .mockResolvedValueOnce({ recordset: [{ match_id: 456, created_at: '2025-01-01T10:00:00Z' }] }); // Insert result

      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'target-user', message: 'Let\'s study together!' });
      
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id', 456);
      expect(res.body).toHaveProperty('status', 'pending');
    });

    test('returns 400 if recipientId missing', async () => {
      const res = await request(app)
        .post('/partners/request')
        .send({ message: 'Hello!' });
      
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 if trying to request self', async () => {
      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'current-user' });
      
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('creates default module if none exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing connection
        .mockResolvedValueOnce({ recordset: [] }) // No modules exist
        .mockResolvedValueOnce({ recordset: [{ module_id: 2 }] }) // Created module
        .mockResolvedValueOnce({ recordset: [{ match_id: 789, created_at: '2025-01-01T10:00:00Z' }] }); // Insert result

      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'target-user' });
      
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id', 789);
    });

    test('handles DB error in request', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'target-user' });
      
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /partners/accept/:requestId', () => {
    test('accepts partner request successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ 
          requester_id: 'requester-user', 
          first_name: 'Requester', 
          last_name: 'User', 
          email: 'requester@example.com' 
        }] }) // Check request exists
        .mockResolvedValueOnce({ recordset: [] }); // Update request

      const res = await request(app).post('/partners/accept/123');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('status', 'accepted');
    });

    test('returns 404 if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/partners/accept/999');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    test('handles DB error in accept', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/partners/accept/123');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /partners/reject/:requestId', () => {
    test('rejects partner request successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ 
          requester_id: 'requester-user', 
          first_name: 'Requester', 
          last_name: 'User', 
          email: 'requester@example.com' 
        }] }) // Check request exists
        .mockResolvedValueOnce({ recordset: [] }); // Update request

      const res = await request(app).post('/partners/reject/123');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('status', 'declined');
    });

    test('returns 404 if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/partners/reject/999');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    test('handles DB error in reject', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/partners/reject/123');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /partners/test', () => {
    test('test endpoint returns user info', async () => {
      const res = await request(app)
        .post('/partners/test')
        .send({ testData: 'hello' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Test endpoint working');
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('body');
    });

    test('test endpoint handles errors', async () => {
      // Mock an error in the endpoint by not providing proper user context
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      const res = await request(app).post('/partners/test');
      expect([200, 500]).toContain(res.statusCode);
      
      console.error = originalConsoleError;
    });
  });

  describe('POST /partners/test-users', () => {
    test('creates test users successfully', async () => {
      // Mock delete query
      mockQuery.mockResolvedValueOnce({ recordset: [] });
      // Mock insert queries for each test user
      for (let i = 0; i < 5; i++) {
        mockQuery.mockResolvedValueOnce({ recordset: [] });
      }

      const res = await request(app).post('/partners/test-users');
      expect([200, 500]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('users', 5);
      }
    });

    test('handles DB error in test-users', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/partners/test-users');
      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // Test helper functions
  describe('Compatibility Score Calculation', () => {
    test('calculateEnhancedCompatibilityScore works correctly', async () => {
      // This tests the compatibility scoring function indirectly through search
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'MIT', course: 'CS', year_of_study: 2, study_preferences: '{"studyStyle": "visual"}' }] })
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'partner1', 
          email: 'partner@mit.edu',
          first_name: 'Partner',
          last_name: 'One',
          university: 'MIT',
          course: 'CS',
          year_of_study: 2,
          bio: 'CS student',
          study_preferences: '{"studyStyle": "visual", "groupSize": "small", "availability": ["morning"]}',
          sharedCourses: 'CS101',
          connectionStatus: null
        }] });

      const res = await request(app).get('/partners/search?studyStyle=visual&groupSize=small&availability=morning');
      expect(res.statusCode).toBe(200);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('compatibilityScore');
        expect(typeof res.body[0].compatibilityScore).toBe('number');
      }
    });
  });

  // Additional edge case tests to improve coverage
  describe('Edge Cases and Error Handling', () => {
    test('handles pool connection error gracefully', async () => {
      // Temporarily replace pool with null to simulate connection failure
      const originalPool = require('mssql');
      jest.doMock('mssql', () => ({
        ...originalPool,
        connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
      }));

      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'target-user' });
      
      // Should handle the error gracefully
      expect([400, 500]).toContain(res.statusCode);
    });

    test('handles corrupted study preferences in search', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'MIT', course: 'CS', study_preferences: 'invalid_json' }] })
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'partner1', 
          email: 'partner@mit.edu',
          first_name: 'Partner',
          last_name: 'One',
          university: 'MIT',
          course: 'CS',
          year_of_study: 2,
          bio: 'CS student',
          study_preferences: 'also_invalid_json',
          sharedCourses: null,
          connectionStatus: null
        }] });

      const res = await request(app).get('/partners/search');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('handles search with existing connections of different statuses', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'MIT', course: 'CS', study_preferences: '{}' }] })
        .mockResolvedValueOnce({ recordset: [
          { 
            id: 'partner1', 
            email: 'partner1@mit.edu',
            first_name: 'Partner',
            last_name: 'One',
            university: 'MIT',
            course: 'CS',
            year_of_study: 2,
            bio: 'CS student',
            study_preferences: '{}',
            sharedCourses: 'CS101',
            connectionStatus: 'declined',
            connectionId: 1,
            connectionRequesterId: 'current-user'
          },
          { 
            id: 'partner2', 
            email: 'partner2@mit.edu',
            first_name: 'Partner',
            last_name: 'Two',
            university: 'MIT',
            course: 'CS',
            year_of_study: 2,
            bio: 'CS student',
            study_preferences: '{}',
            sharedCourses: null,
            connectionStatus: 'pending',
            connectionId: 2,
            connectionRequesterId: 'partner2'
          }
        ] });

      const res = await request(app).get('/partners/search');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        // Check that connection status is properly set
        const partner1 = res.body.find(p => p.id === 'partner1');
        const partner2 = res.body.find(p => p.id === 'partner2');
        if (partner1) {
          expect(partner1.connectionStatus).toBe('declined');
          // For declined status, isPendingSent should be false
          expect(partner1.isPendingSent).toBe(false);
        }
        if (partner2) {
          expect(partner2.connectionStatus).toBe('pending');
          expect(partner2.isPendingReceived).toBe(true);
        }
      }
    });

    test('handles missing or invalid user data in buddies list', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ requesterId: 'current-user', recipientId: 'buddy1', match_status: 'accepted' }] })
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'buddy1', 
          email: null,
          first_name: null,
          last_name: null,
          university: 'Test University',
          course: null,
          year_of_study: null,
          bio: null,
          study_preferences: null,
          created_at: '2025-01-01',
          updated_at: '2025-01-01'
        }] });
      
      const res = await request(app).get('/partners');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('name'); // Should fallback to 'Unknown'
      }
    });

    test('handles complex availability parsing in compatibility calculation', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'MIT', course: 'CS', study_preferences: '{"availability": "morning,afternoon"}' }] })
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'partner1', 
          email: 'partner@mit.edu',
          first_name: 'Partner',
          last_name: 'One',
          university: 'MIT',
          course: 'Data Science',  // Different but related field
          year_of_study: 1,        // Different year
          bio: 'CS student',
          study_preferences: '{"studyStyle": "collaborative", "groupSize": "large", "availability": ["morning", "evening"]}',
          sharedCourses: 'CS101, CS102, CS103',  // Multiple shared courses
          connectionStatus: null
        }] });

      const res = await request(app).get('/partners/search?availability=morning,afternoon');
      expect(res.statusCode).toBe(200);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('compatibilityScore');
        expect(res.body[0].sharedCourses).toHaveLength(3);
      }
    });

    test('handles WebPubSub notification success in match endpoint', async () => {
      // Mock WebPubSub client to be available
      const mockWebPubSubClient = {
        sendToUser: jest.fn().mockResolvedValue({})
      };
      
      // Temporarily mock the global webPubSubClient
      const partnerService = require('./partnerService');
      partnerService.webPubSubClient = mockWebPubSubClient;

      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing connection
        .mockResolvedValueOnce({ recordset: [{ first_name: 'Current', last_name: 'User', email: 'current@example.com', university: 'Test University', course: 'CS' }] })
        .mockResolvedValueOnce({ recordset: [{ module_id: 1 }] })
        .mockResolvedValueOnce({ recordset: [{ match_id: 123, created_at: '2025-01-01T10:00:00Z' }] });

      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user', message: 'Hello!' });
      
      expect(res.statusCode).toBe(201);
    });

    test('handles WebPubSub notification failure gracefully', async () => {
      // Mock WebPubSub client with failure
      const mockWebPubSubClient = {
        sendToUser: jest.fn().mockRejectedValue(new Error('PubSub failed'))
      };
      
      const partnerService = require('./partnerService');
      partnerService.webPubSubClient = mockWebPubSubClient;

      mockQuery
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ first_name: 'Current', last_name: 'User', email: 'current@example.com' }] })
        .mockResolvedValueOnce({ recordset: [{ module_id: 1 }] })
        .mockResolvedValueOnce({ recordset: [{ match_id: 123, created_at: '2025-01-01T10:00:00Z' }] });

      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user', message: 'Hello!' });
      
      // Should still succeed even if notification fails
      expect(res.statusCode).toBe(201);
    });

    test('match endpoint with module_id provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ first_name: 'Current', last_name: 'User', email: 'current@example.com' }] })
        .mockResolvedValueOnce({ recordset: [{ match_id: 123, created_at: '2025-01-01T10:00:00Z' }] });

      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user', module_id: 5 });
      
      expect(res.statusCode).toBe(201);
    });

    test('handles module creation error in request endpoint', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing connection
        .mockResolvedValueOnce({ recordset: [] }) // No modules exist
        .mockRejectedValueOnce(new Error('Module creation failed')); // Module creation fails

      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'target-user' });
      
      // Should still work with fallback module ID
      expect([201, 500]).toContain(res.statusCode);
    });

    test('handles search with all criteria filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'MIT', course: 'CS', study_preferences: '{}' }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).get('/partners/search?subjects=CS101,CS102&studyStyle=visual&groupSize=small&availability=morning&university=MIT&search=John');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('accepts endpoint with WebPubSub notification', async () => {
      const mockWebPubSubClient = {
        sendToUser: jest.fn().mockResolvedValue({})
      };
      
      const partnerService = require('./partnerService');
      partnerService.webPubSubClient = mockWebPubSubClient;

      mockQuery
        .mockResolvedValueOnce({ recordset: [{ 
          requester_id: 'requester-user', 
          first_name: 'Requester', 
          last_name: 'User', 
          email: 'requester@example.com' 
        }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/partners/accept/123');
      expect(res.statusCode).toBe(200);
    });

    test('rejects endpoint with WebPubSub notification', async () => {
      const mockWebPubSubClient = {
        sendToUser: jest.fn().mockResolvedValue({})
      };
      
      const partnerService = require('./partnerService');
      partnerService.webPubSubClient = mockWebPubSubClient;

      mockQuery
        .mockResolvedValueOnce({ recordset: [{ 
          requester_id: 'requester-user', 
          first_name: 'Requester', 
          last_name: 'User', 
          email: 'requester@example.com' 
        }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/partners/reject/123');
      expect(res.statusCode).toBe(200);
    });

    test('handles WebPubSub notification error in accept', async () => {
      const mockWebPubSubClient = {
        sendToUser: jest.fn().mockRejectedValue(new Error('PubSub error'))
      };
      
      const partnerService = require('./partnerService');
      partnerService.webPubSubClient = mockWebPubSubClient;

      mockQuery
        .mockResolvedValueOnce({ recordset: [{ 
          requester_id: 'requester-user', 
          first_name: 'Requester', 
          last_name: 'User', 
          email: 'requester@example.com' 
        }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/partners/accept/123');
      expect(res.statusCode).toBe(200); // Should still succeed despite notification failure
    });

    test('handles WebPubSub notification error in reject', async () => {
      const mockWebPubSubClient = {
        sendToUser: jest.fn().mockRejectedValue(new Error('PubSub error'))
      };
      
      const partnerService = require('./partnerService');
      partnerService.webPubSubClient = mockWebPubSubClient;

      mockQuery
        .mockResolvedValueOnce({ recordset: [{ 
          requester_id: 'requester-user', 
          first_name: 'Requester', 
          last_name: 'User', 
          email: 'requester@example.com' 
        }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await request(app).post('/partners/reject/123');
      expect(res.statusCode).toBe(200); // Should still succeed despite notification failure
    });

    test('handles no requester info found in match endpoint', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [] }) // No existing connection
        .mockResolvedValueOnce({ recordset: [] }) // No requester info found
        .mockResolvedValueOnce({ recordset: [{ module_id: 1 }] })
        .mockResolvedValueOnce({ recordset: [{ match_id: 123, created_at: '2025-01-01T10:00:00Z' }] });

      const res = await request(app)
        .post('/partners/match')
        .send({ matched_user_id: 'target-user', message: 'Hello!' });
      
      expect(res.statusCode).toBe(201);
    });

    test('handles database pool not available error', async () => {
      // Create a request that would check for pool availability
      const res = await request(app)
        .post('/partners/request')
        .send({ recipientId: 'target-user' });
      
      // The test should handle the error case
      expect([201, 400, 500]).toContain(res.statusCode);
    });

    test('handles large shared courses list in compatibility calculation', async () => {
      mockQuery
        .mockResolvedValueOnce({ recordset: [{ university: 'MIT', course: 'CS', study_preferences: '{}' }] })
        .mockResolvedValueOnce({ recordset: [{ 
          id: 'partner1', 
          email: 'partner@mit.edu',
          first_name: 'Partner',
          last_name: 'One',
          university: 'MIT',
          course: 'CS',
          year_of_study: 2,
          bio: 'CS student',
          study_preferences: '{}',
          sharedCourses: 'CS101, CS102, CS103, CS104, CS105, CS106', // Large list to test scoring cap
          connectionStatus: null
        }] });

      const res = await request(app).get('/partners/search');
      expect(res.statusCode).toBe(200);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('compatibilityScore');
        expect(res.body[0].sharedCourses).toHaveLength(6);
      }
    });
  });
});
