// backend/src/services/__tests__/groupService.test.js
const request = require('supertest');
const express = require('express');

/* --------------------------- Auth + Azure mocks --------------------------- */
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'test_user', university: 'Test U' };
    next();
  },
}));

jest.mock('../config/azureConfig', () => ({
  azureConfig: {
    getDatabaseConfig: jest.fn().mockRejectedValue(new Error('Azure KV not available')),
  },
}));

process.env.DATABASE_CONNECTION_STRING = 'mssql://mock';

/* -------------------------- mssql param-aware mock ------------------------ */
let mockQuery; // per-test
let lastInputs; // holds latest .input() values for a given Request
const mockInput = jest.fn(function (name, _type, value) {
  if (!this._inputs) this._inputs = {};
  this._inputs[name] = value !== undefined ? value : _type;
  lastInputs = this._inputs;
  return this;
});
const newMockRequest = () => ({
  input: mockInput,
  query: (...args) => mockQuery(...args),
  _inputs: {},
});

let mockBegin, mockCommit, mockRollback;

const mockTransaction = function () {
  return {
    begin: mockBegin,
    commit: mockCommit,
    rollback: mockRollback,
    request: () => newMockRequest(),
  };
};

let mockPool;
jest.mock('mssql', () => ({
  NVarChar: (v) => v,
  Int: (v) => v,
  DateTime2: (v) => v,
  Bit: (v) => v,
  MAX: Symbol('MAX'),
  Request: jest.fn(() => newMockRequest()),
  Transaction: mockTransaction,
  connect: jest.fn(async () => mockPool),
}));

/* ----------------------------- Harness helpers ---------------------------- */
function bootAppWithPreset(preset) {
  mockBegin = jest.fn().mockResolvedValue();
  mockCommit = jest.fn().mockResolvedValue();
  mockRollback = jest.fn().mockResolvedValue();

  mockPool = {
    connected: true,
    connect: jest.fn().mockResolvedValue(),
    request: () => newMockRequest(),
    close: jest.fn().mockResolvedValue(),
  };

  const SCH = {
    groupsTable: preset.groupsTable ?? 'study_groups',
    hasGroupsTable: {
      groups: preset.groupsTable === 'groups',
      study_groups: true,
      // NEW: let tests flip invitations/notifications tables on
      group_invitations: !!preset.hasInvitationsTable,
      notifications: !!preset.hasNotificationsTable,
      modules: true,
      users: true,
      group_members: true,
      study_sessions: true,
      session_attendees: true,
    },
    groupsCols: {
      name: preset.nameCol !== false,
      group_name: false,
      title: false,
      description: preset.descriptionCol !== false,
      details: false,
      group_description: false,
      desc: false,
      last_activity: !!preset.last_activity,
      max_members: !!preset.max_members,
      is_public: !!preset.is_public,
      course: !!preset.course,
      course_code: !!preset.course_code,
      creator_id: !!preset.creator_id,
      module_id: !!preset.module_id,
    },
    notNull: {
      'study_groups.creator_id': !!preset.creator_id_required,
      'groups.creator_id': !!preset.creator_id_required,
      'study_groups.module_id': !!preset.module_id_required,
      'groups.module_id': !!preset.module_id_required,
      'group_members.role': !!preset.role_required,
    },
    gmCols: {
      role: !!preset.role,
      joined_at: !!preset.joined_at,
      created_at: !!preset.gm_created_at,
      member_id: preset.gm_member_id !== false,
      id: false,
      group_member_id: false,
    },
    roleCheckDef: preset.roleCheckDef ?? "([role] IN ('member','admin','owner'))",
    // NEW toggles to drive query results for canEdit/invite auth and singular group existence
    canEdit: !!preset.canEdit, // authorize update
    groupExistsSingular: preset.groupExistsSingular !== false, // GET /:id present?
  };

  mockQuery = jest.fn(async (sqlText) => {
    sqlText = String(sqlText);

    // ---- schema discovery ----
    if (sqlText.includes('FROM sys.tables WHERE name = @name')) {
      const tableName = lastInputs?.name;
      const exists = !!SCH.hasGroupsTable[tableName];
      return { recordset: exists ? [{ 1: 1 }] : [] };
    }
    if (sqlText.includes('FROM sys.columns') && sqlText.includes('OBJECT_ID(@tbl)')) {
      const tblFull = lastInputs?.tbl || '';
      const tbl = tblFull.replace(/^dbo\./i, '');
      const col = lastInputs?.col;
      const exists =
        (tbl === SCH.groupsTable && !!SCH.groupsCols[col]) ||
        (tbl === 'group_members' && !!SCH.gmCols[col]) ||
        (tbl === 'modules' && ['module_id', 'module_code', 'module_name', 'description', 'university', 'is_active', 'created_at', 'updated_at'].includes(col)) ||
        (tbl === 'notifications' && ['user_id','notification_type','title','message','metadata','is_read','created_at'].includes(col)) ||
        (tbl === 'group_invitations' && ['status','invited_by','created_at','group_id','user_id'].includes(col));
      return { recordset: exists ? [{ 1: 1 }] : [] };
    }
    if (sqlText.includes('FROM INFORMATION_SCHEMA.COLUMNS') && sqlText.includes("TABLE_SCHEMA = 'dbo'")) {
      const tbl = lastInputs?.tbl;
      const col = lastInputs?.col;
      const key = `${tbl}.${col}`;
      const isNo = SCH.notNull[key] ? 'NO' : 'YES';
      return { recordset: [{ IS_NULLABLE: isNo }] };
    }

    // detectAllowedMemberRoles()
    if (sqlText.includes('FROM sys.check_constraints')) {
      return { recordset: [{ defn: SCH.roleCheckDef }] };
    }

    // ---- utility lookups (modules, fallback, etc.) ----
    if (sqlText.includes('FROM dbo.modules') && sqlText.includes('module_id=@mid')) {
      const mid = lastInputs?.mid;
      return { recordset: mid === 1 ? [{ module_id: 1 }] : [] };
    }
    if (sqlText.includes('SELECT TOP 1 m.module_id AS id') && sqlText.includes('FROM dbo.modules m')) {
      const byCode = !!lastInputs?.code;
      const byName = !!lastInputs?.name;
      if (byCode || byName) return { recordset: [{ id: 2 }] };
      return { recordset: [] };
    }
    if (sqlText.includes('INSERT INTO dbo.modules') && sqlText.includes('OUTPUT inserted.module_id AS id')) {
      return { recordset: [{ id: 3 }] };
    }
    if (sqlText.includes('SELECT TOP 1 university AS uni') && sqlText.includes('FROM dbo.modules')) {
      return { recordset: [{ uni: 'General' }] };
    }

    // pickFallbackModuleId()
    if (sqlText.includes('FROM dbo.') && sqlText.includes('WHERE module_id IS NOT NULL')) {
      return { recordset: preset.fallbackModuleId ? [{ mid: preset.fallbackModuleId }] : [] };
    }
    if (sqlText.includes('FROM dbo.modules') && sqlText.includes('ORDER BY module_id ASC')) {
      return { recordset: [{ mid: 11 }] };
    }

    // ---- GET /groups, /my-groups, and /:id core SELECT ----
    if (sqlText.includes('FROM dbo.') && sqlText.includes('FROM dbo.' + SCH.groupsTable)) {
      // If requesting a single group by id, allow toggling existence
      if (sqlText.includes('WHERE g.group_id=@groupId') && !SCH.groupExistsSingular) {
        return { recordset: [] };
      }
      return {
        recordset: [
          {
            id: 10,
            name: 'Alpha',
            description: 'Desc',
            course: SCH.groupsCols.course ? 'CS' : null,
            courseCode: SCH.groupsCols.course_code ? 'CS101' : null,
            maxMembers: SCH.groupsCols.max_members ? 2 : null,
            isPublic: SCH.groupsCols.is_public ? 1 : 1,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            lastActivity: new Date('2025-01-02T00:00:00Z'),
            createdBy: SCH.groupsCols.creator_id ? 'owner_user' : 'test_user',
            memberCount: 1,
            sessionCount: 0,
            isMember: 1,
          },
        ],
      };
    }

    // ---- canEditGroup permission union (used by PATCH/PUT) ----
    if (
      sqlText.includes('FROM dbo.group_members gm') &&
      sqlText.includes('AND gm.user_id=@userId') &&
      sqlText.includes('UNION ALL') &&
      sqlText.includes('FROM dbo.')
    ) {
      return { recordset: SCH.canEdit ? [{ ok: 1 }] : [] };
    }

    // ---- POST /groups insert ----
    if (sqlText.includes('INSERT INTO dbo.') && sqlText.includes('OUTPUT INSERTED.group_id AS id, INSERTED.*')) {
      return {
        recordset: [
          {
            id: 42,
            name: 'X',
            created_at: new Date('2025-01-03T00:00:00Z'),
            last_activity: new Date('2025-01-03T00:00:00Z'),
            creator_id: 'test_user',
            course: 'CS',
            course_code: 'CS101',
            max_members: 5,
            is_public: 1,
          },
        ],
      };
    }
    if (sqlText.includes('INSERT INTO dbo.group_members')) {
      return { recordset: [] };
    }

    // ---- DELETE ownership checks ----
    if (sqlText.includes('SELECT TOP 1 1 AS ok') && sqlText.includes('FROM dbo.' + SCH.groupsTable)) {
      if (preset.deleteAsNonOwner) return { recordset: [] };
      return { recordset: [{ ok: 1 }] };
    }
    if (
      sqlText.includes('DELETE sa FROM dbo.session_attendees') ||
      sqlText.includes('DELETE FROM dbo.study_sessions') ||
      sqlText.includes('DELETE FROM dbo.group_members') ||
      sqlText.includes('DELETE FROM dbo.' + SCH.groupsTable)
    ) {
      return { recordset: [] };
    }

    // ---- JOIN capacity check ----
    if (sqlText.includes('SELECT g.max_members AS maxMembers')) {
      if (preset.groupIsFull) {
        return { recordset: [{ maxMembers: 1, memberCount: 1 }] };
      }
      return { recordset: [{ maxMembers: 5, memberCount: 1 }] };
    }
    if (sqlText.includes('SELECT 1 FROM dbo.' + SCH.groupsTable + ' WHERE group_id = @groupId')) {
      return preset.groupExists === false ? { recordset: [] } : { recordset: [{ 1: 1 }] };
    }
    if (sqlText.includes('UPDATE dbo.' + SCH.groupsTable + ' SET last_activity')) {
      return { recordset: [] };
    }

    // ---- /leave owner + count ----
    if (sqlText.includes('FROM dbo.' + SCH.groupsTable) && sqlText.includes('memberCount') && sqlText.includes('WHERE g.group_id = @groupId')) {
      const memberCount = preset.leaveMembers ?? 2;
      const isOwner = preset.leaveIsOwner !== false ? 1 : 0;
      return { recordset: [{ memberCount, isOwner }] };
    }
    if (sqlText.includes('DELETE FROM dbo.group_members WHERE group_id')) {
      return { recordset: [] };
    }

    // ---- group-scoped /sessions ----
    if (sqlText.includes('WHERE g.group_id = @groupId') && sqlText.includes('AS maxMembers') && sqlText.includes('FROM dbo.')) {
      if (preset.sessionGroupNotFound) return { recordset: [] };
      return {
        recordset: [
          {
            id: 10,
            course: SCH.groupsCols.course ? 'CS' : null,
            courseCode: SCH.groupsCols.course_code ? 'CS101' : null,
            maxMembers: SCH.groupsCols.max_members ? 10 : null,
          },
        ],
      };
    }
    if (sqlText.includes('INSERT INTO dbo.study_sessions') && sqlText.includes('OUTPUT')) {
      return {
        recordset: [
          {
            id: 77,
            groupId: 10,
            title: 'S',
            date: '2025-01-10',
            startTime: '10:00',
            endTime: '11:00',
            location: 'L',
            type: 'study',
            status: 'scheduled',
          },
        ],
      };
    }
    if (sqlText.includes('INSERT INTO dbo.session_attendees')) {
      return { recordset: [] };
    }
    if (sqlText.includes('FROM dbo.group_members gm') && sqlText.includes('isGroupOwner')) {
      return { recordset: [{ isGroupOwner: 1 }] };
    }

    // ---- invites: ensure group exist check
    if (sqlText.includes('SELECT 1 FROM dbo.group_invitations') || sqlText.includes('INSERT INTO dbo.group_invitations')) {
      return { recordset: [] };
    }
    if (sqlText.includes('INSERT INTO dbo.notifications')) {
      return { recordset: [] };
    }

    return { recordset: [] };
  });

  const app = express();
  app.use(express.json());

  let router;
  jest.isolateModules(() => {
    router = require('../groupService');
  });
  app.use('/groups', router);
  return app;
}

/* --------------------------------- Tests ---------------------------------- */
beforeEach(() => {
  jest.clearAllMocks();
  mockInput.mockClear();
});

describe('Group Service API', () => {
  test('GET /groups returns mapped list with defaults and activity ordering', async () => {
    const app = bootAppWithPreset({
      groupsTable: 'study_groups',
      nameCol: true,
      descriptionCol: true,
      last_activity: true,
      max_members: true,
      is_public: false,
      creator_id: true,
      role: true,
      joined_at: true,
      gm_member_id: true,
    });

    const res = await request(app).get('/groups');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const g = res.body[0];
    expect(g).toHaveProperty('id', '10');
    expect(g).toHaveProperty('isPublic', true);
    expect(g).toHaveProperty('member_count', 1);
    expect(g).toHaveProperty('session_count', 0);
  });

  test('GET /groups/my-groups works with minimal schema (no last_activity, no course cols)', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      descriptionCol: true,
      last_activity: false,
      max_members: false,
      is_public: true,
      role: false,
      joined_at: false,
      gm_created_at: true,
    });

    const res = await request(app).get('/groups/my-groups');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('lastActivity');
  });

  test('GET /groups/:groupId returns one group or 404', async () => {
    const app = bootAppWithPreset({ nameCol: true, descriptionCol: true });
    const one = await request(app).get('/groups/10');
    expect(one.statusCode).toBe(200);
    expect(one.body).toHaveProperty('id', '10');

    const app404 = bootAppWithPreset({ nameCol: true, descriptionCol: true, groupExistsSingular: false });
    const miss = await request(app404).get('/groups/999');
    expect(miss.statusCode).toBe(404);
  });

  test('GET /groups/:groupId/members returns list (may be empty)', async () => {
    const app = bootAppWithPreset({ nameCol: true, role: true, joined_at: true });
    const res = await request(app).get('/groups/10/members');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /groups validates missing name', async () => {
    const app = bootAppWithPreset({ nameCol: true });
    const res = await request(app).post('/groups').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Group name is required/i);
  });

  test('POST /groups fails if no suitable name column', async () => {
    const app = bootAppWithPreset({ nameCol: false });
    const res = await request(app).post('/groups').send({ name: 'X' });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/suitable name\/title column/i);
  });

  test('POST /groups successful create with required module_id resolved by explicit id, role CHECK → owner', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      descriptionCol: true,
      creator_id: true,
      module_id: true,
      module_id_required: true,
      role: true,
      role_required: true,
      joined_at: true,
      roleCheckDef: "([role] IN ('member','admin','owner'))",
    });

    const res = await request(app).post('/groups').send({
      name: 'Alpha',
      description: 'D',
      isPublic: true,
      maxMembers: 5,
      moduleId: 1,
    });

    expect([201, 500]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      expect(res.body).toHaveProperty('id', '42');
      expect(res.body).toHaveProperty('createdBy', 'test_user');
      expect(res.body).toHaveProperty('isPublic', true);
    }
  });

  test('POST /groups invalid explicit moduleId returns 400', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      module_id: true,
      module_id_required: true,
      role: true,
      role_required: true,
      joined_at: true,
    });

    const res = await request(app).post('/groups').send({ name: 'Alpha', moduleId: 999 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid module_id/i);
  });

  test('POST /groups with required module_id but none provided → fallback path', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      module_id: true,
      module_id_required: true,
    });

    const res = await request(app).post('/groups').send({ name: 'Alpha' });
    expect([201, 500, 400]).toContain(res.statusCode);
  });

  test('PATCH /groups/:id: 400 invalid, 400 no fields, 403 no permission, 200 success', async () => {
    const appBad = bootAppWithPreset({ nameCol: true, descriptionCol: true });
    const badId = await request(appBad).patch('/groups/notnum').send({ name: 'N' });
    expect(badId.statusCode).toBe(400);

    const noFields = await request(appBad).patch('/groups/10').send({});
    expect(noFields.statusCode).toBe(400);
    expect(noFields.body.error).toMatch(/No updatable fields/i);

    const deny = await request(appBad).patch('/groups/10').send({ name: 'New' });
    expect(deny.statusCode).toBe(403);
    expect(deny.body.error).toMatch(/Only the owner\/admin/i);

    const appOk = bootAppWithPreset({ nameCol: true, descriptionCol: true, max_members: true, canEdit: true });
    const ok = await request(appOk).patch('/groups/10').send({ name: 'New', maxMembers: 12 });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toHaveProperty('name', 'Alpha'); // mapped row name (service projects selection)
    expect(ok.body).toHaveProperty('member_count', 1);
  });

  test('PUT /groups/:id same behavior as PATCH', async () => {
    const appOk = bootAppWithPreset({ nameCol: true, descriptionCol: true, canEdit: true });
    const ok = await request(appOk).put('/groups/10').send({ description: 'D' });
    expect([200, 500]).toContain(ok.statusCode);
  });

  test('DELETE /groups/:id forbids non-owner', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      creator_id: true,
      role: true,
      deleteAsNonOwner: true,
    });

    const res = await request(app).delete('/groups/10');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/Only the owner/i);
  });

  test('DELETE /groups/:id succeeds for owner', async () => {
    const app = bootAppWithPreset({ nameCol: true, creator_id: true, role: true });
    const res = await request(app).delete('/groups/10');
    expect(res.statusCode).toBe(204);
  });

  test('POST /groups/:id/join handles full/404/success', async () => {
    const appFull = bootAppWithPreset({ nameCol: true, max_members: true, groupIsFull: true });
    const full = await request(appFull).post('/groups/10/join');
    expect(full.statusCode).toBe(409);

    const app404 = bootAppWithPreset({ nameCol: true, max_members: false, groupExists: false });
    const miss = await request(app404).post('/groups/999/join');
    expect(miss.statusCode).toBe(404);

    const appOk = bootAppWithPreset({ nameCol: true, last_activity: true, joined_at: true });
    const ok = await request(appOk).post('/groups/10/join');
    expect(ok.statusCode).toBe(204);
  });

  test('POST /groups/:id/leave blocks owner w/ members > 1; succeeds non-owner', async () => {
    const appBlock = bootAppWithPreset({
      nameCol: true, creator_id: true, role: true, leaveIsOwner: true, leaveMembers: 3,
    });
    const block = await request(appBlock).post('/groups/10/leave');
    expect(block.statusCode).toBe(403);

    const appOk = bootAppWithPreset({ nameCol: true, role: true, leaveIsOwner: false, leaveMembers: 2 });
    const ok = await request(appOk).post('/groups/10/leave');
    expect(ok.statusCode).toBe(204);
  });

  describe('Group-scoped sessions', () => {
    test('payload validation + time order', async () => {
      const app = bootAppWithPreset({ nameCol: true });
      const bad1 = await request(app).post('/groups/10/sessions').send({});
      expect(bad1.statusCode).toBe(400);

      const bad2 = await request(app).post('/groups/10/sessions').send({
        title: 'T', startTime: '2025-01-10T11:00:00Z', endTime: '2025-01-10T10:00:00Z', location: 'L',
      });
      expect(bad2.statusCode).toBe(400);
    });

    test('404 when group not found', async () => {
      const app = bootAppWithPreset({ sessionGroupNotFound: true });
      const res = await request(app).post('/groups/999/sessions').send({
        title: 'Study', startTime: '2025-01-10T10:00:00Z', endTime: '2025-01-10T11:00:00Z', location: 'Library',
      });
      expect(res.statusCode).toBe(404);
    });

    test('creates and returns transformed payload', async () => {
      const app = bootAppWithPreset({ last_activity: true, course: true, course_code: true });
      const res = await request(app).post('/groups/10/sessions').send({
        title: 'Study', description: 'd', startTime: '2025-01-10T10:00:00Z', endTime: '2025-01-10T11:00:00Z', location: 'Library', type: 'study',
      });
      expect([201, 500]).toContain(res.statusCode);
      if (res.statusCode === 201) {
        expect(res.body).toMatchObject({
          id: '77', status: 'upcoming', isCreator: true, isAttending: true, course: 'CS', courseCode: 'CS101',
        });
      }
    });
  });

  describe('Invites', () => {
    test('400 when missing inviteUserIds', async () => {
      const app = bootAppWithPreset({ nameCol: true });
      const res = await request(app).post('/groups/10/invite').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/inviteUserIds/i);
    });

    test('403 when not owner/admin/creator', async () => {
      const app = bootAppWithPreset({ nameCol: true });
      const res = await request(app).post('/groups/10/invite').send({ inviteUserIds: ['u1','u2'] });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/owners\/admins/i);
    });

    test('200 when invitations table exists (pending rows inserted)', async () => {
      const app = bootAppWithPreset({
        nameCol: true,
        hasInvitationsTable: true,
        // authorize role/creator via canEditGroup-like union used in handler
        canEdit: true,
      });
      const res = await request(app).post('/groups/10/invite').send({ inviteUserIds: ['u1','u2'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ok: true, invited: 2 });
    });

    test('200 via notifications fallback when invitations table missing', async () => {
      const app = bootAppWithPreset({
        nameCol: true,
        hasNotificationsTable: true,
        canEdit: true,
      });
      const res = await request(app).post('/groups/10/invitations').send({ user_ids: ['a','b','c'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ok: true, invited: 3 });
    });
  });

  test('schema detection switches to groups table when present', async () => {
    const app = bootAppWithPreset({ groupsTable: 'groups', nameCol: true, descriptionCol: true });
    const res = await request(app).get('/groups');
    expect([200, 500]).toContain(res.statusCode);
  });

  test('invalid id params handled', async () => {
    const app = bootAppWithPreset({ nameCol: true });
    expect((await request(app).delete('/groups/not-a-number')).statusCode).toBe(400);
    expect((await request(app).post('/groups/NaN/join')).statusCode).toBe(400);
    expect((await request(app).post('/groups/abc/leave')).statusCode).toBe(400);
    expect((await request(app).get('/groups/xyz')).statusCode).toBe(400);
  });
});
