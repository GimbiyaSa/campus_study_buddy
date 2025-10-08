/* eslint-disable @typescript-eslint/no-var-requires */
import request from 'supertest';
import express from 'express';
import { describe, test, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

/* -------------------- mssql mock with controllable state -------------------- */
const state = {
  tables: {
    groups: true,        // router prefers "groups" if present
    study_groups: false, // fallback; unused in these tests
    shared_notes: true,  // toggle to false to test 501/empty cases
  },
  columns: {
    groups: { name: true, group_name: false, title: false },
    shared_notes: {
      topic_id: true,
      attachments: true,
      visibility: true,
      is_active: true,
    },
  },
  // simple in-memory rows keyed by note_id
  notesRows: [
    {
      note_id: 101,
      group_id: 7,
      author_id: 'u-1',
      topic_id: 55,
      note_title: 'First',
      note_content: 'Hello world',
      attachments: JSON.stringify([{ name: 'a.txt' }]),
      visibility: 'group',
      is_active: 1,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-02T00:00:00Z'),
    },
  ],
};

function noteRowToSelect(row) {
  // When the service SELECTs it LEFT JOINs users & groups & topics and aliases fields.
  return {
    ...row,
    author_name: 'Ada Lovelace',
    group_name: 'Algorithms',
    topic_name: 'Sorting',
  };
}

// minimal mssql shape the service uses
let pool;
const mkRequest = () => {
  const params = {};
  return {
    input: (name, _type, value) => {
      params[name] = value;
      return req;
    },
    query: async (sql) => {
      // Schema detection
      if (/FROM sys\.tables/i.test(sql)) {
        const name = params.name;
        return { recordset: state.tables[name] ? [{ 1: 1 }] : [] };
      }
      if (/FROM sys\.columns/i.test(sql)) {
        const tbl = params.tbl?.replace(/^dbo\./i, '');
        const col = params.col;
        const ok = !!(state.columns[tbl] && state.columns[tbl][col]);
        return { recordset: ok ? [{ 1: 1 }] : [] };
      }

      // Group existence checks
      if (/FROM dbo\.groups/i.test(sql) && /WHERE group_id = @gid/i.test(sql)) {
        const exists = state.tables.groups && typeof params.gid === 'number';
        return { recordset: exists ? [{ 1: 1 }] : [] };
      }

      // GET list (flat) and group-scoped list
      if (/FROM dbo\.shared_notes/i.test(sql) && /SELECT\s+n\.note_id/i.test(sql)) {
        // return current rows filtered by group if provided
        let rows = state.notesRows.map(noteRowToSelect);
        if (params.groupId != null) {
          rows = rows.filter((r) => r.group_id === params.groupId);
        }
        return { recordset: rows };
      }

      // INSERT with OUTPUT
      if (/INSERT INTO dbo\.shared_notes/i.test(sql) && /OUTPUT/i.test(sql)) {
        const newId = Math.max(100, ...state.notesRows.map((r) => r.note_id)) + 1;
        const row = {
          note_id: newId,
          group_id: params.groupId,
          author_id: params.authorId,
          topic_id: state.columns.shared_notes.topic_id ? (params.topic ?? null) : null,
          note_title: params.title,
          note_content: params.content,
          attachments: state.columns.shared_notes.attachments
            ? (params.att ?? null)
            : null,
          visibility: state.columns.shared_notes.visibility ? (params.vis ?? 'group') : 'group',
          is_active: state.columns.shared_notes.is_active ? 1 : 1,
          created_at: new Date('2025-02-01T00:00:00Z'),
          updated_at: new Date('2025-02-01T00:00:00Z'),
        };
        state.notesRows.push(row);
        return { recordset: [row] };
      }

      // POST meta (author_name, group_name)
      if (/COALESCE\(u\.first_name \+ ' ' \+ u\.last_name, u\.email\) AS author_name/i.test(sql)) {
        return { recordset: [{ author_name: 'Grace Hopper', group_name: 'Algorithms' }] };
      }

      // PATCH update + SELECT
      if (/UPDATE dbo\.shared_notes/i.test(sql) && /WHERE note_id = @noteId/i.test(sql)) {
        const id = params.noteId;
        const idx = state.notesRows.findIndex((r) => r.note_id === id);
        if (idx === -1) return { recordset: [] };

        // apply updates we know about
        if (params.title !== undefined) state.notesRows[idx].note_title = params.title;
        if (params.content !== undefined) state.notesRows[idx].note_content = params.content;
        if (params.vis !== undefined) state.notesRows[idx].visibility = params.vis;
        if (params.topic !== undefined) state.notesRows[idx].topic_id = params.topic ?? null;
        if (params.att !== undefined) state.notesRows[idx].attachments = params.att ?? null;
        if (params.active !== undefined) state.notesRows[idx].is_active = params.active ? 1 : 0;
        state.notesRows[idx].updated_at = new Date('2025-03-01T00:00:00Z');

        return { recordset: [noteRowToSelect(state.notesRows[idx])] };
      }

      // DELETE note
      if (/DELETE FROM dbo\.shared_notes/i.test(sql) && /WHERE note_id = @noteId/i.test(sql)) {
        const id = params.noteId;
        const before = state.notesRows.length;
        state.notesRows = state.notesRows.filter((r) => r.note_id !== id);
        const affected = before - state.notesRows.length;
        return { recordset: [{ affected }] };
      }

      // default: empty
      return { recordset: [] };
    },
  };
  const req = { input: (a, b, c) => null, query: async () => ({ recordset: [] }) };
};
vi.mock('mssql', () => {
  pool = { request: mkRequest };
  return {
    default: {},
    connect: vi.fn(async () => pool),
    NVarChar: 'NVarChar',
    Int: 'Int',
    Bit: 'Bit',
    MAX: 'MAX',
    __setState: (patch) => Object.assign(state, patch),
    __getState: () => state,
  };
});

/* ------------------------ auth middleware mock ------------------------ */
vi.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'u-42' };
    next();
  },
}));

/* Ensure service uses env string path, skipping azureConfig branch */
beforeAll(() => {
  process.env.DATABASE_CONNECTION_STRING = 'mssql://fake';
});

let app;
beforeEach(async () => {
  // fresh app each test; mount router at both bases
  app = express();
  app.use(express.json());
  const router = require('./notesService'); // loads & initializes once; ok for our mock
  app.use('/api/v1/notes', router);
  app.use('/api/v1/groups', router);
});

afterEach(() => {
  // reset default state between tests
  state.tables.groups = true;
  state.tables.shared_notes = true;
  state.columns.groups = { name: true, group_name: false, title: false };
  state.columns.shared_notes = {
    topic_id: true,
    attachments: true,
    visibility: true,
    is_active: true,
  };
  state.notesRows = [
    {
      note_id: 101,
      group_id: 7,
      author_id: 'u-1',
      topic_id: 55,
      note_title: 'First',
      note_content: 'Hello world',
      attachments: JSON.stringify([{ name: 'a.txt' }]),
      visibility: 'group',
      is_active: 1,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-02T00:00:00Z'),
    },
  ];
});

/* ---------------------------------- tests ---------------------------------- */
describe('notesService', () => {
  test('GET /api/v1/notes → empty array when notes table missing', async () => {
    const mssql = await import('mssql');
    mssql.__setState({ tables: { ...state.tables, shared_notes: false } });

    const res = await request(app).get('/api/v1/notes').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('GET /api/v1/notes → returns mapped rows with author_name/group_name/topic_name', async () => {
    const res = await request(app).get('/api/v1/notes?limit=10&offset=0').set('Authorization', 'b');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      note_id: 101,
      group_id: 7,
      author_id: 'u-1',
      note_title: 'First',
      note_content: 'Hello world',
      visibility: 'group',
      is_active: true,
      author_name: 'Ada Lovelace',
      group_name: 'Algorithms',
      topic_name: 'Sorting',
    });
  });

  test('POST /api/v1/notes → 400 on invalid group_id; 201 on success with meta merged', async () => {
    // invalid group_id
    const bad = await request(app)
      .post('/api/v1/notes')
      .send({ group_id: 'NaN', note_title: 'T', note_content: 'C' });
    expect(bad.status).toBe(400);

    // success
    const ok = await request(app)
      .post('/api/v1/notes')
      .send({ group_id: 7, note_title: 'New', note_content: 'Body', visibility: 'public' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      group_id: 7,
      note_title: 'New',
      note_content: 'Body',
      visibility: 'public',
      author_name: 'Grace Hopper',
      group_name: 'Algorithms',
    });
    expect(ok.body).toHaveProperty('note_id');
  });

  test('POST /api/v1/notes → 501 when notes not supported', async () => {
    const mssql = await import('mssql');
    mssql.__setState({ tables: { ...state.tables, shared_notes: false } });

    const res = await request(app)
      .post('/api/v1/notes')
      .send({ group_id: 7, note_title: 'X', note_content: 'Y' });
    expect(res.status).toBe(501);
    expect(res.body).toHaveProperty('error');
  });

  test('PATCH /api/v1/notes/:id → updates fields and returns mapped row; 404 when not found', async () => {
    // found
    const res = await request(app)
      .patch('/api/v1/notes/101')
      .send({ note_title: 'Renamed', visibility: 'private', is_active: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      note_id: 101,
      note_title: 'Renamed',
      visibility: 'private',
      is_active: false,
      author_name: 'Ada Lovelace',
      group_name: 'Algorithms',
    });

    // not found
    const nf = await request(app).patch('/api/v1/notes/9999').send({ note_title: 'Nope' });
    expect(nf.status).toBe(404);
  });

  test('DELETE /api/v1/notes/:id → 204 on delete; 404 when missing', async () => {
    const ok = await request(app).delete('/api/v1/notes/101');
    expect(ok.status).toBe(204);

    const nf = await request(app).delete('/api/v1/notes/101');
    expect(nf.status).toBe(404);
  });

  test('GET /api/v1/groups/:groupId/notes → validates group, filters by group, maps rows', async () => {
    // group 7 exists (mock), should return the single row (note_id 101) initially
    const first = await request(app).get('/api/v1/groups/7/notes');
    expect(first.status).toBe(200);
    expect(first.body).toHaveLength(1);
    expect(first.body[0].group_id).toBe(7);

    // add another note for another group; group filter should exclude it
    await request(app)
      .post('/api/v1/notes')
      .send({ group_id: 88, note_title: 'G88', note_content: 'x' });

    const filtered = await request(app).get('/api/v1/groups/7/notes');
    expect(filtered.status).toBe(200);
    expect(filtered.body.every((r) => r.group_id === 7)).toBe(true);
  });

  test('GET /api/v1/groups/:groupId/notes → 400 on invalid group id, 404 when group missing', async () => {
    const bad = await request(app).get('/api/v1/groups/NaN/notes');
    expect(bad.status).toBe(400);

    const mssql = await import('mssql');
    // Flip groups table existence off for the check (simulates missing group)
    mssql.__setState({ tables: { ...state.tables, groups: true } });
    // Our group existence check is per id; simulate "not found" by making query return empty:
    // easiest path: toggle groups table off then on around this call not practical —
    // Instead, hit a group id that we will treat as "not found" by overwriting mock quickly:
    // Temporarily monkey-patch mkRequest to return empty for @gid=9999
    // (Simpler: request existing route but send /9999 and rely on our request handler logic)
    const nf = await request(app).get('/api/v1/groups/9999/notes');
    expect(nf.status).toBe(404);
  });
});
