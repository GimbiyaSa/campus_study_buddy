const request = require('supertest');

// Mock auth middleware
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'u1', name: 'User One', university: 'UniA' };
    next();
  },
}));

// Provide deterministic id generator and a stub for scheduleSessionReminders used in groupService
global.generateId = () => 'fixed-group-id';
global.scheduleSessionReminders = jest.fn().mockResolvedValue({});

// Mock ServiceBusClient
jest.mock('@azure/service-bus', () => ({
  ServiceBusClient: jest.fn().mockImplementation(() => ({
    createSender: jest.fn().mockReturnValue({
      sendMessages: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({}),
    }),
  })),
}));

// Mock Cosmos DB for groups and sessions
jest.mock('@azure/cosmos', () => {
  const fakeGroups = [
    { id: 'g1', partitionKey: 'UniA', members: [{ userId: 'u1' }], lastActivity: '2020-01-01' },
  ];

  const fakeGroupsItems = {
    query: jest
      .fn()
      .mockReturnValue({ fetchAll: jest.fn().mockResolvedValue({ resources: fakeGroups }) }),
    create: jest.fn().mockImplementation(async (g) => ({ resource: g })),
  };

  const fakeSessionsItems = {
    create: jest.fn().mockImplementation(async (s) => ({ resource: s })),
  };

  const fakeContainer = (name) => ({
    items: name === 'Groups' ? fakeGroupsItems : fakeSessionsItems,
    item: jest.fn().mockImplementation((id, pk) => ({
      read: jest.fn().mockResolvedValue({ resource: fakeGroups.find((g) => g.id === id) }),
      replace: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    })),
  });

  const fakeDatabase = () => ({
    container: jest.fn().mockImplementation((name) => fakeContainer(name)),
    containers: {
      createIfNotExists: jest.fn().mockResolvedValue({ container: fakeContainer('Groups') }),
    },
  });

  const CosmosClient = jest.fn().mockImplementation(() => ({
    database: jest.fn().mockReturnValue(fakeDatabase()),
    databases: { createIfNotExists: jest.fn().mockResolvedValue({ database: fakeDatabase() }) },
  }));

  return { CosmosClient };
});

const appModule = require('../app');
const app = appModule.default || appModule;

describe('Group service', () => {
  test('POST /api/v1/groups creates a group', async () => {
    const res = await request(app)
      .post('/api/v1/groups')
      .send({ name: 'G', description: 'D', subjects: ['s'] });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('name', 'G');
    expect(res.body.createdBy).toBe('u1');
  });

  test('GET /api/v1/groups/my-groups returns user groups', async () => {
    const res = await request(app).get('/api/v1/groups/my-groups');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('id', 'g1');
  });

  test('POST /api/v1/groups/:groupId/sessions returns 201 when member', async () => {
    const res = await request(app)
      .post('/api/v1/groups/g1/sessions')
      .send({ title: 'S', startTime: new Date().toISOString() });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('groupId', 'g1');
  });
});
