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

// Mock CosmosClient to return a list of partner users
jest.mock('@azure/cosmos', () => {
  const partners = [
    {
      id: 'p1',
      university: 'UniXYZ',
      profile: {
        subjects: ['Math', 'CS'],
        studyPreferences: { studyStyle: 'visual', groupSize: 'small' },
      },
      statistics: { sessionsAttended: 5 },
    },
    {
      id: 'p2',
      university: 'UniXYZ',
      profile: {
        subjects: ['History'],
        studyPreferences: { studyStyle: 'auditory', groupSize: 'medium' },
      },
      statistics: { sessionsAttended: 12 },
    },
  ];

  const fakeItems = {
    query: jest
      .fn()
      .mockReturnValue({ fetchAll: jest.fn().mockResolvedValue({ resources: partners }) }),
  };

  const fakeContainer = () => ({ items: fakeItems });

  const fakeDatabase = () => ({
    containers: { createIfNotExists: jest.fn().mockResolvedValue({ container: fakeContainer() }) },
    container: jest.fn().mockReturnValue(fakeContainer()),
  });

  const CosmosClient = jest.fn().mockImplementation(() => ({
    databases: { createIfNotExists: jest.fn().mockResolvedValue({ database: fakeDatabase() }) },
    database: jest.fn().mockReturnValue(fakeDatabase()),
  }));

  return { CosmosClient };
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
