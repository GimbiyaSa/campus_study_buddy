const request = require('supertest');

// Mock auth middleware to inject a test user
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'current-user', email: 'cur@example.com', name: 'Current' };
    next();
  },
}));

// Mock Cosmos DB
jest.mock('@azure/cosmos', () => {
  const fakeResources = [
    { id: 'c1', ownerId: 'current-user', title: 'Course One', createdAt: '2020-01-01' },
  ];

  const fakeItems = {
    query: jest
      .fn()
      .mockReturnValue({ fetchAll: jest.fn().mockResolvedValue({ resources: fakeResources }) }),
    create: jest.fn().mockImplementation(async (item) => ({ resource: item })),
  };

  const fakeContainer = () => ({
    items: fakeItems,
    item: (id, pk) => ({
      read: jest.fn().mockImplementation(async () => {
        if (id === 'notfound') return { resource: null };
        if (id === 'other') return { resource: { id: 'other', ownerId: 'someone-else' } };
        return { resource: { id, ownerId: 'current-user', title: 'Old Title' } };
      }),
      replace: jest.fn().mockImplementation(async (updated) => ({ resource: updated })),
      delete: jest.fn().mockResolvedValue({}),
    }),
  });

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

describe('Courses API', () => {
  test('GET /api/v1/courses returns list', async () => {
    const res = await request(app).get('/api/v1/courses');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('c1');
  });

  test('POST /api/v1/courses validation: missing type', async () => {
    const res = await request(app).post('/api/v1/courses').send({ title: 'X' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/v1/courses validation: invalid type', async () => {
    const res = await request(app).post('/api/v1/courses').send({ type: 'bad', title: 'X' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/v1/courses validation: missing title', async () => {
    const res = await request(app).post('/api/v1/courses').send({ type: 'casual' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/v1/courses creates item', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .send({ type: 'casual', title: '  New Course  ', description: 'desc' });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('New Course');
    expect(res.body.ownerId).toBe('current-user');
  });

  test('PUT /api/v1/courses/:id returns 404 when not found', async () => {
    const res = await request(app).put('/api/v1/courses/notfound').send({ title: 'x' });
    expect(res.statusCode).toBe(404);
  });

  test('PUT /api/v1/courses/:id returns 403 when not owner', async () => {
    const res = await request(app).put('/api/v1/courses/other').send({ title: 'x' });
    expect(res.statusCode).toBe(403);
  });

  test('PUT /api/v1/courses/:id updates when owner', async () => {
    const res = await request(app).put('/api/v1/courses/c1').send({ title: 'Updated' });
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Updated');
  });

  test('DELETE /api/v1/courses/:id returns 204', async () => {
    const res = await request(app).delete('/api/v1/courses/c1');
    expect(res.statusCode).toBe(204);
  });
});
