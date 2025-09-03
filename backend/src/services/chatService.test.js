const request = require('supertest');

// Mock auth middleware
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'u1', name: 'User One', university: 'UniA' };
    next();
  },
}));

// Mock WebPubSub client
jest.mock('@azure/web-pubsub', () => ({
  WebPubSubServiceClient: jest.fn().mockImplementation(() => ({
    getClientAccessToken: jest.fn().mockResolvedValue({ url: 'wss://fake', token: 'tok' }),
    sendToGroup: jest.fn().mockResolvedValue({}),
  })),
}));

// Mutable flag used by tests to control whether user is a member of group
let groupCount = 1;

// Provide a deterministic id generator used by services
global.generateId = () => 'fixed-id';

// Mock Cosmos DB containers used by chatService
jest.mock('@azure/cosmos', () => {
  // messages in DESCENDING order by timestamp so the service reverse() returns chronological order
  const messages = [
    { id: 'm2', groupId: 'g1', content: 'world', timestamp: '2020-01-01T00:01:00Z' },
    { id: 'm1', groupId: 'g1', content: 'hello', timestamp: '2020-01-01T00:00:00Z' },
  ];

  const fakeItems = {
    query: jest
      .fn()
      .mockReturnValue({ fetchAll: jest.fn().mockResolvedValue({ resources: messages }) }),
    create: jest.fn().mockImplementation(async (m) => ({ resource: m })),
  };

  const fakeGroupsItems = {
    query: jest
      .fn()
      .mockImplementation(() => ({
        fetchAll: jest.fn().mockResolvedValue({ resources: [groupCount] }),
      })),
  };

  const fakeContainer = (name) => ({
    items: name === 'Messages' ? fakeItems : fakeGroupsItems,
  });

  const fakeDatabase = () => ({
    container: jest.fn().mockImplementation((name) => fakeContainer(name)),
    containers: {
      createIfNotExists: jest.fn().mockResolvedValue({ container: fakeContainer('Messages') }),
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

describe('Chat service', () => {
  beforeEach(() => {
    groupCount = 1;
  });
  test('POST /api/v1/chat/negotiate denies access when not a member', async () => {
    groupCount = 0;
    const res = await request(app).post('/api/v1/chat/negotiate').send({ groupId: 'g1' });
    expect(res.statusCode).toBe(403);
  });

  test('POST /api/v1/chat/negotiate returns token when member', async () => {
    const res = await request(app).post('/api/v1/chat/negotiate').send({ groupId: 'g1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body).toHaveProperty('accessToken');
  });

  test('POST /api/v1/chat/groups/:groupId/messages sends and saves message', async () => {
    const res = await request(app).post('/api/v1/chat/groups/g1/messages').send({ content: 'hi' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('content', 'hi');
    expect(res.body).toHaveProperty('userId', 'u1');
  });

  test('GET /api/v1/chat/groups/:groupId/messages returns history in order', async () => {
    const res = await request(app).get('/api/v1/chat/groups/g1/messages');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].content).toBe('hello');
  });
});
