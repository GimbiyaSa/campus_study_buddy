const request = require('supertest');

// Import app after basic environment is set
const appModule = require('../app');
const app = appModule.default || appModule;

describe('Health endpoint', () => {
  test('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('timestamp');
  });
});
