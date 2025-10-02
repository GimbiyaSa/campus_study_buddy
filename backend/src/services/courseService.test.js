const request = require('supertest');
const express = require('express');
const courseRouter = require('./courseService');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  // Mock user for authentication
  req.user = { id: 'test_user', university: 'Test University' };
  next();
});
app.use('/courses', courseRouter);

describe('Course Service API', () => {
  test('GET /courses returns courses list and pagination', async () => {
    const res = await request(app).get('/courses');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('courses');
    expect(res.body).toHaveProperty('pagination');
  });

  test('POST /courses with missing title returns 400', async () => {
    const res = await request(app)
      .post('/courses')
      .send({ type: 'institution' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /courses with invalid type returns 400', async () => {
    const res = await request(app)
      .post('/courses')
      .send({ type: 'invalid', title: 'Test Course' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // Add more tests for PUT, DELETE, and edge cases as needed
});
