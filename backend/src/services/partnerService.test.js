const request = require('supertest');

jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = {
      id: 'current-user',
      email: 'cur@example.com',
      name: 'Current',
      university: 'UniXYZ',
      course: 'Computer Science',
    };
    next();
  },
}));

// Mock Azure SQL database for partner service
jest.mock('mssql', () => {
  const partners = [
    {
      id: 'p1',
      university: 'UniXYZ',
      subjects: 'Math,CS',
      study_style: 'visual',
      group_size: 'small',
      sessions_attended: 5,
    },
    {
      id: 'p2',
      university: 'UniXYZ',
      subjects: 'History',
      study_style: 'auditory',
      group_size: 'medium',
      sessions_attended: 12,
    },
  ];

  const mockRequest = {
    query: jest.fn().mockResolvedValue({ recordset: partners }),
  };

  const mockConnectionPool = {
    request: jest.fn().mockReturnValue(mockRequest),
    connected: true,
    connect: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue({}),
  };

  return {
    ConnectionPool: jest.fn().mockImplementation(() => mockConnectionPool),
    connect: jest.fn().mockResolvedValue(mockConnectionPool),
  };
});

const appModule = require('../app');
const app = appModule.default || appModule;

describe('Partner search', () => {
  test('GET /api/v1/partners/search returns scored partners', async () => {
    const res = await request(app).get('/api/v1/partners/search').query({ subjects: 'CS' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('compatibilityScore');
  });
});
