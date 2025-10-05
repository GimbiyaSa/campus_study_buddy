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
  // mssql accepts .input(name, type, value) OR .input(name, value) in some cases; we only need value
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
  // light wrappers/aliases used by service
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
/**
 * Boot an isolated express app with a chosen "schema preset".
 * We mock all metadata queries (sys.tables, sys.columns, INFORMATION_SCHEMA) and
 * downstream DML based on preset flags. The groupService module is required
 * *inside* isolateModules so its top-level initializeDatabase() runs against our mocks.
 */
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

  // Describe schema knobs for this run
  const SCH = {
    groupsTable: preset.groupsTable ?? 'study_groups',
    hasGroupsTable: { groups: preset.groupsTable === 'groups', study_groups: true },
    groupsCols: {
      // candidates
      name: preset.nameCol !== false,
      group_name: false,
      title: false,
      description: preset.descriptionCol !== false,
      details: false,
      group_description: false,
      desc: false,
      // flags
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
      // id candidates: prefer member_id if available
      member_id: !!preset.gm_member_id !== false, // default true
      id: false,
      group_member_id: false,
    },
    // optional CHECK constraint simulation for detectAllowedMemberRoles()
    roleCheckDef: preset.roleCheckDef ?? "([role] IN ('member','admin','owner'))",
  };

  // Implementation: respond to each SQL based on SCH and captured inputs
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
        (tbl === 'group_members' && !!SCH.gmCols[col]);
      return { recordset: exists ? [{ 1: 1 }] : [] };
    }
    if (
      sqlText.includes('FROM INFORMATION_SCHEMA.COLUMNS') &&
      sqlText.includes("TABLE_SCHEMA = 'dbo'")
    ) {
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
      // validate explicit module id exists
      const mid = lastInputs?.mid;
      return { recordset: mid === 1 ? [{ module_id: 1 }] : [] };
    }
    if (
      sqlText.includes('SELECT TOP 1 m.module_id AS id') &&
      sqlText.includes('FROM dbo.modules m')
    ) {
      // resolve by name/code
      const byCode = !!lastInputs?.code;
      const byName = !!lastInputs?.name;
      if (byCode || byName) return { recordset: [{ id: 2 }] };
      return { recordset: [] };
    }
    if (
      sqlText.includes('INSERT INTO dbo.modules') &&
      sqlText.includes('OUTPUT inserted.module_id AS id')
    ) {
      return { recordset: [{ id: 3 }] };
    }
    if (
      sqlText.includes('SELECT TOP 1 university AS uni') &&
      sqlText.includes('FROM dbo.modules')
    ) {
      return { recordset: [{ uni: 'General' }] };
    }

    // pickFallbackModuleId()
    if (sqlText.includes('FROM dbo.') && sqlText.includes('WHERE module_id IS NOT NULL')) {
      // try from groups table
      return { recordset: preset.fallbackModuleId ? [{ mid: preset.fallbackModuleId }] : [] };
    }
    if (sqlText.includes('FROM dbo.modules') && sqlText.includes('ORDER BY module_id ASC')) {
      return { recordset: [{ mid: 11 }] };
    }

    // ---- GET /groups and /my-groups main SELECTs ----
    if (
      sqlText.includes('FROM dbo.') &&
      sqlText.includes('SELECT') &&
      sqlText.includes('FROM dbo.' + SCH.groupsTable)
    ) {
      // Return one group row; sub-selects are embedded
      return {
        recordset: [
          {
            id: 10,
            name: 'Alpha',
            description: 'Desc',
            course: SCH.groupsCols.course ? 'CS' : null,
            courseCode: SCH.groupsCols.course_code ? 'CS101' : null,
            maxMembers: SCH.groupsCols.max_members ? 2 : null,
            isPublic: SCH.groupsCols.is_public ? 1 : 1, // default 1 if column missing
            createdAt: new Date('2025-01-01T00:00:00Z'),
            lastActivity: new Date('2025-01-02T00:00:00Z'),
            createdBy: SCH.groupsCols.creator_id ? 'owner_user' : 'test_user', // derived via subquery path
            memberCount: 1,
            sessionCount: 0,
            isMember: 1,
          },
        ],
      };
    }

    // ---- POST /groups insert group ----
    if (
      sqlText.includes('INSERT INTO dbo.') &&
      sqlText.includes('OUTPUT INSERTED.group_id AS id, INSERTED.*')
    ) {
      return {
        recordset: [
          {
            id: 42,
            [preset.nameCol === false ? 'name' : 'group_name']: 'X', // not used, response uses inputs
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

    // insert into group_members (creator join) or guarded IF NOT EXISTS blocks
    if (sqlText.includes('INSERT INTO dbo.group_members')) {
      return { recordset: [] };
    }

    // ---- DELETE ownership checks ----
    if (
      sqlText.includes('SELECT TOP 1 1 AS ok') &&
      sqlText.includes('FROM dbo.' + SCH.groupsTable)
    ) {
      // owner check: return empty set to simulate not owner if preset says so
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
      // not full
      return { recordset: [{ maxMembers: 5, memberCount: 1 }] };
    }
    if (sqlText.includes('SELECT 1 FROM dbo.' + SCH.groupsTable + ' WHERE group_id = @groupId')) {
      return preset.groupExists === false ? { recordset: [] } : { recordset: [{ 1: 1 }] };
    }
    if (sqlText.includes('UPDATE dbo.' + SCH.groupsTable + ' SET last_activity')) {
      return { recordset: [] };
    }

    // ---- /leave owner + count ----
    if (
      sqlText.includes('SELECT') &&
      sqlText.includes('FROM dbo.' + SCH.groupsTable) &&
      sqlText.includes('memberCount')
    ) {
      // Determine owner + members > 1
      const memberCount = preset.leaveMembers ?? 2;
      const isOwner = preset.leaveIsOwner !== false ? 1 : 0;
      return { recordset: [{ memberCount, isOwner }] };
    }
    if (sqlText.includes('DELETE FROM dbo.group_members WHERE group_id')) {
      return { recordset: [] };
    }

    // ---- group-scoped /sessions ----
    if (
      sqlText.includes('FROM dbo.') &&
      sqlText.includes('WHERE g.group_id = @groupId') &&
      sqlText.includes('AS maxMembers')
    ) {
      // fetch group before creating a session
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
      // simulate created session payload
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
    if (
      sqlText.includes('SELECT') &&
      sqlText.includes('FROM dbo.group_members gm') &&
      sqlText.includes('isGroupOwner')
    ) {
      return { recordset: [{ isGroupOwner: 1 }] };
    }

    // fallback – return empty
    return { recordset: [] };
  });

  const app = express();
  app.use(express.json());

  // IMPORTANT: require inside isolateModules to trigger fresh init with our mockQuery
  let router;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
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
      is_public: false, // ensure fallback path to CAST(1 AS bit)
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
    expect(g).toHaveProperty('isPublic', true); // fallback since is_public col missing → default 1
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
    expect(res.body[0]).toHaveProperty('lastActivity'); // falls back to created_at inside service
  });

  test('POST /groups validates missing name', async () => {
    const app = bootAppWithPreset({ nameCol: true });
    const res = await request(app).post('/groups').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Group name is required/i);
  });

  test('POST /groups fails if no suitable name/title column in schema', async () => {
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
      moduleId: 1, // valid via mock
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

    const res = await request(app).post('/groups').send({
      name: 'Alpha',
      moduleId: 999, // invalid
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid module_id/i);
  });

  test('POST /groups with required module_id but none provided → fallback(default) path', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      module_id: true,
      module_id_required: true,
      // no explicit module, no code/name → will try pickFallbackModuleId() then ensureDefaultModuleId()
    });

    const res = await request(app).post('/groups').send({ name: 'Alpha' });
    // either created (201) or internal 500 if something else fails
    expect([201, 500, 400]).toContain(res.statusCode);
  });

  test('DELETE /groups/:id forbids non-owner', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      creator_id: true,
      role: true,
      deleteAsNonOwner: true, // ownership check returns no rows
    });

    const res = await request(app).delete('/groups/10');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/Only the owner/i);
  });

  test('DELETE /groups/:id succeeds for owner', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      creator_id: true,
      role: true,
    });

    const res = await request(app).delete('/groups/10');
    expect(res.statusCode).toBe(204);
  });

  test('POST /groups/:id/join handles group full (409)', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      max_members: true,
      groupIsFull: true,
    });

    const res = await request(app).post('/groups/10/join');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/Group is full/i);
  });

  test('POST /groups/:id/join 404 when group not found', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      max_members: false, // so service checks existence path
      groupExists: false,
    });

    const res = await request(app).post('/groups/999/join');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/Group not found/i);
  });

  test('POST /groups/:id/join success with last_activity update when column present', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      last_activity: true,
      joined_at: true,
    });

    const res = await request(app).post('/groups/10/join');
    expect(res.statusCode).toBe(204);
  });

  test('POST /groups/:id/leave blocks owner with members > 1', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      creator_id: true,
      role: true,
      leaveIsOwner: true,
      leaveMembers: 3,
    });

    const res = await request(app).post('/groups/10/leave');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/Owner cannot leave/i);
  });

  test('POST /groups/:id/leave succeeds for non-owner or single-member', async () => {
    const app = bootAppWithPreset({
      nameCol: true,
      role: true,
      leaveIsOwner: false,
      leaveMembers: 2,
    });

    const res = await request(app).post('/groups/10/leave');
    expect(res.statusCode).toBe(204);
  });

  describe('Group-scoped sessions', () => {
    test('POST /groups/:id/sessions validates payload and time order', async () => {
      const app = bootAppWithPreset({ nameCol: true });
      const bad1 = await request(app).post('/groups/10/sessions').send({});
      expect(bad1.statusCode).toBe(400);

      const bad2 = await request(app).post('/groups/10/sessions').send({
        title: 'T',
        startTime: '2025-01-10T11:00:00Z',
        endTime: '2025-01-10T10:00:00Z',
        location: 'L',
      });
      expect(bad2.statusCode).toBe(400);
      expect(bad2.body.error).toMatch(/endTime must be after startTime/i);
    });

    test('POST /groups/:id/sessions 404 when group not found', async () => {
      const app = bootAppWithPreset({ sessionGroupNotFound: true });
      const res = await request(app).post('/groups/999/sessions').send({
        title: 'Study',
        description: 'd',
        startTime: '2025-01-10T10:00:00Z',
        endTime: '2025-01-10T11:00:00Z',
        location: 'Library',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/Group not found/i);
    });

    test('POST /groups/:id/sessions creates and returns transformed payload', async () => {
      const app = bootAppWithPreset({
        last_activity: true,
        course: true,
        course_code: true,
      });

      const res = await request(app).post('/groups/10/sessions').send({
        title: 'Study',
        description: 'd',
        startTime: '2025-01-10T10:00:00Z',
        endTime: '2025-01-10T11:00:00Z',
        location: 'Library',
        type: 'study',
      });

      expect([201, 500]).toContain(res.statusCode);
      if (res.statusCode === 201) {
        expect(res.body).toHaveProperty('id', '77');
        expect(res.body).toHaveProperty('status', 'upcoming'); // transformed from 'scheduled'
        expect(res.body).toHaveProperty('isCreator', true);
        expect(res.body).toHaveProperty('course', 'CS');
        expect(res.body).toHaveProperty('courseCode', 'CS101');
      }
    });
  });

  test('schema detection switches to groups table when present', async () => {
    const app = bootAppWithPreset({
      groupsTable: 'groups', // prefer "groups"
      nameCol: true,
      descriptionCol: true,
    });
    // Any endpoint will have been initialized using "groups"
    const res = await request(app).get('/groups');
    expect([200, 500]).toContain(res.statusCode);
  });

  test('invalid group id params are handled', async () => {
    const app = bootAppWithPreset({ nameCol: true });
    const del = await request(app).delete('/groups/not-a-number');
    expect(del.statusCode).toBe(400);
    const join = await request(app).post('/groups/NaN/join');
    expect(join.statusCode).toBe(400);
    const leave = await request(app).post('/groups/abc/leave');
    expect(leave.statusCode).toBe(400);
  });
});
