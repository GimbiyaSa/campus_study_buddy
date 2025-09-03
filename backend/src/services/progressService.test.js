const request = require('supertest');

// Mock auth middleware
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'u1', university: 'UniA', name: 'User One' };
    next();
  },
}));

// Mock Cosmos DB for Progress and Users
jest.mock('@azure/cosmos', () => {
  const progressData = [
    { id: 'u1', userId: 'u1', duration: 60, topics: ['a'], date: new Date().toISOString().split('T')[0], timestamp: new Date().toISOString(), subject: 'Math' },
  ];

  const progressItems = {
    create: jest.fn().mockImplementation(async (p) => ({ resource: p })),
    query: jest.fn().mockReturnValue({ fetchAll: jest.fn().mockResolvedValue({ resources: progressData }) }),
  };

  const usersContainerLike = {
    item: jest.fn().mockImplementation(() => ({
      read: jest.fn().mockResolvedValue({ resource: { id: 'u1', statistics: { totalStudyHours: 0, topicsCompleted: 0 } } }),
      replace: jest.fn().mockResolvedValue({}),
    })),
  };

  const fakeContainer = (name) => ({ items: name === 'Progress' ? progressItems : usersContainerLike });

  const fakeDatabase = () => ({
    container: jest.fn().mockImplementation((name) => fakeContainer(name)),
    containers: { createIfNotExists: jest.fn().mockResolvedValue({ container: fakeContainer('Progress') }) },
  });

  const CosmosClient = jest.fn().mockImplementation(() => ({
    database: jest.fn().mockReturnValue(fakeDatabase()),
    databases: { createIfNotExists: jest.fn().mockResolvedValue({ database: fakeDatabase() }) },
  }));

  return { CosmosClient };
});

const appModule = require('../app');
const app = appModule.default || appModule;

describe('Progress service', () => {
  test('POST /api/v1/progress/sessions logs a session and updates user stats', async () => {
    const res = await request(app).post('/api/v1/progress/sessions').send({ subject: 'Math', topics: ['a'], duration: 60 });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('userId', 'u1');
  });

  test('GET /api/v1/progress/analytics returns analytics', async () => {
    const res = await request(app).get('/api/v1/progress/analytics').query({ timeframe: '7d' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('totalSessions');
    expect(res.body).toHaveProperty('dailyBreakdown');
  });
});
