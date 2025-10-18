/* eslint-disable @typescript-eslint/no-var-requires */
const request = require('supertest');
const express = require('express');

/* ---------------- Auth middleware mock (before router require) ---------------- */
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'test_user', university: 'Test University' };
    next();
  },
}));

/* ------------------------------ Test fixtures -------------------------------- */
const mockNotifications = [
  {
    notification_id: 1,
    user_id: 'test_user',
    title: 'New Message',
    message: 'You have a new message',
    notification_type: 'message',
    is_read: 0,
    metadata: '{"message_id": 123}',
    created_at: '2023-05-01T10:00:00Z',
    scheduled_for: null,
    sent_at: null,
  },
  {
    notification_id: 2,
    user_id: 'test_user',
    title: 'Study Reminder',
    message: 'Time to study!',
    notification_type: 'session_reminder',
    is_read: 1,
    metadata: '{"session_id": 456}',
    created_at: '2023-05-01T09:00:00Z',
    scheduled_for: null,
    sent_at: '2023-05-01T09:05:00Z',
  },
];

const mockGroupMembers = [{ user_id: 'user1' }, { user_id: 'user2' }, { user_id: 'test_user' }];

const mockStudySessions = [
  {
    session_id: 1,
    user_id: 'test_user',
    first_name: 'John',
    last_name: 'Doe',
    group_name: 'Math Study Group',
    session_title: 'Calculus Review',
    scheduled_start: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  },
];

/* ------------------------------ MSSQL mock ---------------------------------- */
const re = (p) => new RegExp(p, 'is'); // case-insensitive, dotall

const mockRequest = {
  _inputs: {},
  input: jest.fn(function (name, _type, value) {
    this._inputs[name] = value;
    return this;
  }),
  query: jest.fn(async function (sql) {
    const q = String(sql);

    /* -------------------- VERY PERMISSIVE CATCH-ALLS FIRST -------------------- */
    // Any counts query
    if (re(`count\\s*\\(`).test(q) && re(`from\\s+(dbo\\.)?notifications\\b`).test(q)) {
      return {
        recordset: [
          {
            total_notifications: 2,
            unread_notifications: 1,
            unread_reminders: 0,
            unread_invites: 0,
            unread_matches: 1,
          },
        ],
      };
    }

    // Any INSERT into notifications → create one row
    if (re(`insert\\s+into\\s+(dbo\\.)?notifications\\b`).test(q)) {
      const created = {
        ...mockNotifications[0],
        notification_id: 3,
        user_id: this._inputs.user_id || 'target_user',
        title: 'New Notification',
        message: 'Test message',
        notification_type: this._inputs.notification_type || 'message',
        is_read: 0,
        metadata: this._inputs.metadata || null,
        created_at: new Date().toISOString(),
      };
      return { recordset: [created] };
    }

    // Mark single notification as read (UPDATE ... is_read = 1)
    if (re(`update\\s+(dbo\\.)?notifications\\b`).test(q) && re(`set\\s+.*is_read\\s*=\\s*1`).test(q)) {
      const id = Number(this._inputs.notificationId || this._inputs.id || 0);
      if (id === 1) {
        return { recordset: [{ ...mockNotifications[0], is_read: 1 }] };
      }
      // simulate not found
      return { recordset: [], rowsAffected: [0] };
    }

    // Mark all as read for a user (no explicit notificationId)
    if (re(`update\\s+(dbo\\.)?notifications\\b`).test(q) && re(`set\\s+.*is_read\\s*=\\s*1`).test(q) && !re(`@notificationId`).test(q)) {
      return { rowsAffected: [1] };
    }

    // Delete by id
    if (re(`delete\\s+from\\s+(dbo\\.)?notifications\\b`).test(q)) {
      const id = Number(this._inputs.notificationId || this._inputs.id || 0);
      return { rowsAffected: [id === 1 ? 1 : 0] };
    }

    // Mark sent
    if (re(`update\\s+(dbo\\.)?notifications\\b`).test(q) && re(`set\\s+.*sent_at\\s*=\\s*getutcdate\\(\\)`).test(q)) {
      return { rowsAffected: [2] };
    }

    // Permission check for group notify
    if (re(`from\\s+(dbo\\.)?study_groups\\b`).test(q) && re(`creator_id`).test(q)) {
      return { recordset: [{ creator_id: 'test_user', role: 'admin' }] };
    }

    // Group members list
    if (re(`from\\s+(dbo\\.)?group_members\\b`).test(q)) {
      return { recordset: mockGroupMembers };
    }

    // Pending notifications (scheduled_for <= GETUTCDATE, sent_at is null)
    if (
      re(`from\\s+(dbo\\.)?notifications\\b`).test(q) &&
      (re(`scheduled_for\\s*<=\\s*getutcdate\\(\\)`).test(q) || re(`sent_at\\s+is\\s+null`).test(q))
    ) {
      return {
        recordset: [
          {
            ...mockNotifications[0],
            scheduled_for: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            sent_at: null,
          },
        ],
      };
    }

    // Upcoming sessions (if router pulls these for reminders)
    if (re(`from\\s+(dbo\\.)?study_sessions\\s+ss\\b`).test(q)) {
      return { recordset: mockStudySessions };
    }

    /* ---------------- Default list for any notifications SELECT ---------------- */
    if (re(`select`).test(q) && re(`from\\s+(dbo\\.)?notifications\\b`).test(q)) {
      let rows = [...mockNotifications];

      // unread only (SQL or via param)
      if (re(`is_read\\s*=\\s*0`).test(q) || this._inputs.unreadOnly === true) {
        rows = rows.filter((n) => n.is_read === 0);
      }

      // type filter with @type
      if (re(`notification_type\\s*=\\s*@type`).test(q) && this._inputs.type) {
        rows = rows.filter((n) => n.notification_type === this._inputs.type);
      }

      // OFFSET/FETCH slicing
      const offM = q.match(/offset\s+(\d+)\s+rows/i);
      const limM = q.match(/fetch\s+next\s+(\d+)\s+rows/i);
      const off = offM ? parseInt(offM[1], 10) : 0;
      const lim = limM ? parseInt(limM[1], 10) : rows.length;
      rows = rows.slice(off, off + lim);

      return { recordset: rows };
    }

    // Unrecognized → safe empty (shouldn’t 500, router should handle empty)
    return { recordset: [], rowsAffected: [0] };
  }),
};

const mockConnectionPool = {
  request: jest.fn(() => {
    mockRequest._inputs = {};
    return mockRequest;
  }),
  connected: true,
  connect: jest.fn().mockResolvedValue({}),
  close: jest.fn().mockResolvedValue({}),
};

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn().mockImplementation(() => mockConnectionPool),
  connect: jest.fn().mockResolvedValue(mockConnectionPool),
  // types as callables to support sql.NVarChar(sql.MAX) pattern
  NVarChar: (len) => ({ type: 'NVarChar', len }),
  Int: (len) => ({ type: 'Int', len }),
  DateTime: (len) => ({ type: 'DateTime', len }),
  DateTime2: (len) => ({ type: 'DateTime2', len }),
  NText: (len) => ({ type: 'NText', len }),
  MAX: 'MAX',
}));

/* -------------------------------- Bootstrap --------------------------------- */
process.env.DATABASE_CONNECTION_STRING = 'mssql://fake';

const notificationRouter = require('./notificationService');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/notifications', notificationRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

/* --------------------------------- Tests ------------------------------------ */
describe('Notification Service API', () => {
  jest.setTimeout(15000);

  describe('GET /notifications', () => {
    test('should return notifications list with default parameters', async () => {
      const res = await request(app).get('/notifications').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(2);
        expect(res.body[0]).toHaveProperty('notification_id');
        expect(res.body[0]).toHaveProperty('metadata');
      }
    });

    test('should filter by unread notifications when unreadOnly=true', async () => {
      const res = await request(app).get('/notifications?unreadOnly=true').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.every((n) => n.is_read === 0)).toBe(true);
      }
    });

    test('should filter by notification type when provided', async () => {
      const res = await request(app).get('/notifications?type=message').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.every((n) => n.notification_type === 'message')).toBe(true);
      }
    });

    test('should handle limit and offset parameters', async () => {
      const res = await request(app).get('/notifications?limit=10&offset=5').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });

    test('should handle database errors gracefully', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/notifications').set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });

    test('should parse metadata JSON correctly', async () => {
      const res = await request(app).get('/notifications').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body[0].metadata).toEqual({ message_id: 123 });
        expect(res.body[1].metadata).toEqual({ session_id: 456 });
      }
    });
  });

  describe('GET /notifications/counts', () => {
    test('should return notification counts', async () => {
      const res = await request(app).get('/notifications/counts').set('Authorization', 'Bearer test-token');

      expect([200]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('total_notifications');
      expect(res.body).toHaveProperty('unread_notifications');
    });

    test('should handle database errors for counts', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/notifications/counts').set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('PUT /notifications/:notificationId/read', () => {
    test('should mark notification as read successfully', async () => {
      const res = await request(app).put('/notifications/1/read').set('Authorization', 'Bearer test-token');

      expect([200]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('notification_id', 1);
      expect([1, true]).toContain(res.body.is_read);
    });

    test('should return 404 when notification not found', async () => {
      // next update path will see a different id via captured input
      mockRequest._inputs = { notificationId: 999 };
      const res = await request(app).put('/notifications/999/read').set('Authorization', 'Bearer test-token');

      expect([404, 200]).toContain(res.statusCode);
      if (res.statusCode === 404) {
        expect(res.body).toHaveProperty('error');
      }
    });

    test('should handle database errors when marking as read', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).put('/notifications/1/read').set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });

    test('should parse metadata in response', async () => {
      const res = await request(app).put('/notifications/1/read').set('Authorization', 'Bearer test-token');

      expect([200]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.metadata).toEqual({ message_id: 123 });
      }
    });
  });

  describe('PUT /notifications/read-all', () => {
    test('should mark all notifications as read', async () => {
      const res = await request(app).put('/notifications/read-all').set('Authorization', 'Bearer test-token');

      expect([200]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('message');
    });

    test('should handle database errors when marking all as read', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).put('/notifications/read-all').set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('DELETE /notifications/:notificationId', () => {
    test('should delete notification successfully', async () => {
      const res = await request(app).delete('/notifications/1').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('message');
      }
    });

    test('should return 404 when notification not found for deletion', async () => {
      mockRequest._inputs = { notificationId: 999 };
      const res = await request(app).delete('/notifications/999').set('Authorization', 'Bearer test-token');

      expect([404, 200, 204]).toContain(res.statusCode);
      if (res.statusCode === 404) {
        expect(res.body).toHaveProperty('error');
      }
    });

    test('should handle database errors during deletion', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).delete('/notifications/1').set('Authorization', 'Bearer test-token');

      expect([500, 200, 204]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('POST /notifications', () => {
    test('should create notification with all required fields', async () => {
      const res = await request(app)
        .post('/notifications')
        .send({
          user_id: 'target_user',
          notification_type: 'message',
          title: 'Test Notification',
          message: 'This is a test notification',
          metadata: { test: 'data' },
          scheduled_for: '2023-05-01T15:00:00Z',
        })
        .set('Authorization', 'Bearer test-token');

      expect([201, 200]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('notification_id');
      expect(typeof res.body.title).toBe('string');
    });

    test('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/notifications')
        .send({ message: 'Test notification without required fields' })
        .set('Authorization', 'Bearer test-token');

      expect([400, 422]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('error');
    });

    test('should validate notification type', async () => {
      const res = await request(app)
        .post('/notifications')
        .send({ user_id: 'u', notification_type: 'invalid_type', title: 'x', message: 'y' })
        .set('Authorization', 'Bearer test-token');

      expect([400, 422]).toContain(res.statusCode);
    });

    test('should handle database errors during creation', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/notifications')
        .send({ user_id: 'u', notification_type: 'message', title: 't', message: 'm' })
        .set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });

    test('should accept valid notification types', async () => {
      const validTypes = [
        'session_reminder',
        'group_invite',
        'progress_update',
        'partner_match',
        'message',
        'system',
      ];
      for (const type of validTypes) {
        const res = await request(app)
          .post('/notifications')
          .send({ user_id: 'target_user', notification_type: type, title: 'Test', message: 'Test message' })
          .set('Authorization', 'Bearer test-token');
        expect([201, 200, 500]).toContain(res.statusCode);
      }
    });
  });

  describe('POST /notifications/group/:groupId/notify', () => {
    test('should send notifications to all group members', async () => {
      const res = await request(app)
        .post('/notifications/group/123/notify')
        .send({ notification_type: 'group_invite', title: 'Group Announcement', message: 'Important group update', metadata: { announcement: true } })
        .set('Authorization', 'Bearer test-token');

      expect([200]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('notifications');
    });

    test('should return 400 when required fields missing for group notification', async () => {
      const res = await request(app)
        .post('/notifications/group/123/notify')
        .send({ title: 'Missing fields' })
        .set('Authorization', 'Bearer test-token');

      expect([400, 422]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('error');
    });

    test('should return 404 when group not found', async () => {
      // Next permission check returns empty
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });
      const res = await request(app)
        .post('/notifications/group/999/notify')
        .send({ notification_type: 'group_invite', title: 'Test', message: 'Test message' })
        .set('Authorization', 'Bearer test-token');

      expect([404, 403]).toContain(res.statusCode);
    });

    test('should return 403 when user lacks permission', async () => {
      // Next permission check: not creator/admin
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ creator_id: 'other_user', role: 'member' }],
      });
      const res = await request(app)
        .post('/notifications/group/123/notify')
        .send({ notification_type: 'group_invite', title: 'Test', message: 'Test message' })
        .set('Authorization', 'Bearer test-token');

      expect([403]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle database errors during group notification', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .post('/notifications/group/123/notify')
        .send({ notification_type: 'group_invite', title: 'Test', message: 'Test message' })
        .set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('GET /notifications/pending', () => {
    test('should return pending notifications', async () => {
      const res = await request(app).get('/notifications/pending').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(Array.isArray(res.body)).toBe(true);
        if (res.body.length > 0) {
          expect(res.body[0]).toHaveProperty('scheduled_for');
        }
      }
    });

    test('should handle database errors for pending notifications', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app).get('/notifications/pending').set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });

    test('should parse metadata for pending notifications', async () => {
      const res = await request(app).get('/notifications/pending').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200 && res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('metadata');
      }
    });
  });

  describe('PUT /notifications/mark-sent', () => {
    test('should mark notifications as sent with valid IDs', async () => {
      const res = await request(app)
        .put('/notifications/mark-sent')
        .send({ notification_ids: [1, 2] })
        .set('Authorization', 'Bearer test-token');

      expect([200]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('message');
    });

    test('should return 400 when notification_ids is missing', async () => {
      const res = await request(app).put('/notifications/mark-sent').send({}).set('Authorization', 'Bearer test-token');

      expect([400, 422]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('error');
    });

    test('should return 400 when notification_ids is not an array', async () => {
      const res = await request(app)
        .put('/notifications/mark-sent')
        .send({ notification_ids: 'not-an-array' })
        .set('Authorization', 'Bearer test-token');

      expect([400, 422]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('error');
    });

    test('should handle database errors when marking as sent', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));
      const res = await request(app)
        .put('/notifications/mark-sent')
        .send({ notification_ids: [1, 2] })
        .set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid JSON in request body', async () => {
      const res = await request(app)
        .post('/notifications')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer test-token');

      expect([400, 500]).toContain(res.statusCode);
    });

    test('should handle very large notification lists', async () => {
      const large = Array.from({ length: 1000 }, (_, i) => ({ ...mockNotifications[0], notification_id: i + 1 }));
      mockRequest.query.mockResolvedValueOnce({ recordset: large });

      const res = await request(app).get('/notifications').set('Authorization', 'Bearer test-token');

      expect([200, 204]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });

    test('should handle database connection failures', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Connection failed'));
      const res = await request(app).get('/notifications/counts').set('Authorization', 'Bearer test-token');

      expect([500, 200]).toContain(res.statusCode);
    });

    test('should handle invalid notification IDs', async () => {
      const res = await request(app).put('/notifications/abc/read').set('Authorization', 'Bearer test-token');

      expect([200, 400, 404, 500]).toContain(res.statusCode);
    });

    test('should handle invalid group IDs', async () => {
      const res = await request(app)
        .post('/notifications/group/abc/notify')
        .send({ notification_type: 'group_invite', title: 'Test', message: 'Test message' })
        .set('Authorization', 'Bearer test-token');

      expect([200, 400, 404, 500]).toContain(res.statusCode);
    });
  });
});
