const request = require('supertest');

// Mock the auth middleware to inject a test user
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = {
      id: 'test-user-1',
      email: 'test@example.com',
      name: 'Test User',
      university: 'UniXYZ',
      course: 'Computer Science',
    };
    next();
  },
}));

// Mock CosmosClient used in services
jest.mock('@azure/cosmos', () => {
  const fakeItem = () => ({
    // Simulate not found on initial read
    read: jest.fn().mockResolvedValue({ resource: null }),
    replace: jest.fn().mockImplementation(async (obj) => ({ resource: obj })),
  });

  const fakeContainer = () => ({
    item: jest.fn().mockImplementation(() => fakeItem()),
    items: { create: jest.fn().mockImplementation(async (obj) => ({ resource: obj })) },
  });

  const fakeDatabase = (data) => ({
    containers: {
      createIfNotExists: jest.fn().mockResolvedValue({ container: fakeContainer(data) }),
    },
    container: jest.fn().mockReturnValue(fakeContainer(data)),
  });

  const CosmosClient = jest.fn().mockImplementation(() => ({
    databases: { createIfNotExists: jest.fn().mockResolvedValue({ database: fakeDatabase({}) }) },
    database: jest.fn().mockReturnValue(fakeDatabase({})),
  }));

  return { CosmosClient };
});

const appModule = require('../app');
const app = appModule.default || appModule;

describe('User service', () => {
  test('GET /api/v1/users/me returns created user when not present', async () => {
    const res = await request(app).get('/api/v1/users/me');
    // Should return 200 and a user object
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', 'test-user-1');
    expect(res.body).toHaveProperty('email', 'test@example.com');
  });

  test('PUT /api/v1/users/me updates and returns user', async () => {
    const update = { profile: { studyPreferences: { studyStyle: 'auditory' } } };
    const res = await request(app).put('/api/v1/users/me').send(update);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', 'test-user-1');
  });
});
