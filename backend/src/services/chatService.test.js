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

// Mock Azure SQL database for chat service
jest.mock('mssql', () => {
  // messages in DESCENDING order by timestamp so the service reverse() returns chronological order
  const messages = [
    { id: 'm2', group_id: 'g1', content: 'world', timestamp: '2020-01-01T00:01:00Z' },
    { id: 'm1', group_id: 'g1', content: 'hello', timestamp: '2020-01-01T00:00:00Z' },
  ];

  const mockRequest = {
    query: jest.fn().mockImplementation((query) => {
      if (query.includes('SELECT COUNT')) {
        return Promise.resolve({ recordset: [{ count: groupCount }] });
      }
      if (query.includes('INSERT INTO messages')) {
        return Promise.resolve({ recordset: [{ id: 'fixed-id' }] });
      }
      return Promise.resolve({ recordset: messages });
    }),
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
