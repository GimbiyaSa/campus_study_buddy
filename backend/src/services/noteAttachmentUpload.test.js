/* eslint-disable @typescript-eslint/no-var-requires */
const request = require('supertest');
const express = require('express');
const {
  describe,
  test,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} = require('vitest');

/**
 * File layout assumption:
 *   SUT:   backend/src/services/noteAttachmentUpload.js
 *   TEST:  backend/src/services/noteAttachmentUpload.test.js   (this file)
 *
 * If your layout differs, adjust the relative paths in the vi.mock(...) calls below.
 */

/* --------------------------- Deterministic clock --------------------------- */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-10-02T12:00:00Z'));
});
afterAll(() => vi.useRealTimers());

/* --------------------------- Azure Storage mock --------------------------- */
/**
 * Service does: const mod = require('./azureStorageService');
 * const azureStorage = mod.default || mod.azureStorage;
 *
 * We expose knobs you can flip in tests:
 *   - storageBehavior.failUploadIfName = 'big.bin' → simulate "RequestEntityTooLarge" (413)
 *   - storageBehavior.throwOnDelete = true       → deleteFile throws (router continues)
 *   - storageBehavior.sasPreference = 'sas'|'signed'|'public'|'none' to walk fallbacks
 */
const storageBehavior = {
  failUploadIfName: null,
  throwOnDelete: false,
  sasPreference: 'sas',
};
const storageCalls = { upload: [], del: [], sas: [] };

vi.mock('./azureStorageService', () => {
  const api = {
    async uploadFile(buffer, opts) {
      const name = String(opts?.fileName || '');
      if (storageBehavior.failUploadIfName && name.endsWith(storageBehavior.failUploadIfName)) {
        const err = new Error('RequestEntityTooLarge'); // router maps to 413
        throw err;
      }
      storageCalls.upload.push({ size: buffer?.length, opts });
      return { url: `https://files.example/${encodeURIComponent(name)}` };
    },
    async getFileSASUrl(container, blob, _opts) {
      if (storageBehavior.sasPreference !== 'sas') return undefined;
      storageCalls.sas.push({ container, blob });
      return `https://signed.example/${encodeURIComponent(container)}/${encodeURIComponent(blob)}`;
    },
    async getSignedUrl(container, blob, _opts) {
      if (storageBehavior.sasPreference !== 'signed') return undefined;
      return `https://signed.example/${encodeURIComponent(container)}/${encodeURIComponent(blob)}`;
    },
    async getFileUrl(container, blob) {
      if (storageBehavior.sasPreference !== 'public') return undefined;
      return `https://public.example/${encodeURIComponent(container)}/${encodeURIComponent(blob)}`;
    },
    async deleteFile(container, blob) {
      storageCalls.del.push({ container, blob });
      if (storageBehavior.throwOnDelete) throw new Error('transient delete error');
      return true;
    },
  };
  return { default: api, azureStorage: api };
});

/* ------------------------------ mssql mock ------------------------------ */
// DB + mode knobs (to force readNoteRow null and hit fallback response)
const dbMode = { emptyReadNoteRow: false };

// Tiny in-memory "shared_notes" table
const db = {
  rows: [
    {
      note_id: 101,
      group_id: 7,
      author_id: 'u-1',
      topic_id: 55,
      note_title: 'First',
      note_content: 'Hello',
      attachments: JSON.stringify([
        {
          container: 'user-files',
          blob: 'notes/u-1/101/seed-a.txt',
          filename: 'seed-a.txt',
          size: 3,
          contentType: 'text/plain',
          uploadedAt: '2025-01-01T00:00:00.000Z',
          url: 'https://files.example/seed-a.txt',
        },
      ]),
      visibility: 'group',
      is_active: 1,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-02T00:00:00Z'),
    },
  ],
};
function findNote(id) {
  return db.rows.find((r) => r.note_id === id);
}

vi.mock('mssql', () => {
  const mkRequest = () => {
    const params = {};
    const req = {
      input(name, _type, value) {
        params[name] = value;
        return req;
      },
      async query(sql) {
        // SELECT note_id, attachments (existence + current attachments JSON)
        if (/SELECT\s+note_id,\s*attachments\s+FROM\s+dbo\.shared_notes/i.test(sql)) {
          const id = params.noteId;
          const row = findNote(id);
          return { recordset: row ? [{ note_id: row.note_id, attachments: row.attachments }] : [] };
        }

        // UPDATE attachments (stores JSON string)
        if (/UPDATE\s+dbo\.shared_notes\s+SET\s+attachments\s*=\s*@atts/i.test(sql)) {
          const id = params.noteId;
          const row = findNote(id);
          if (row) {
            row.attachments = params.atts;
            row.updated_at = new Date();
          }
          return { recordset: [] };
        }

        // readNoteRow() full SELECT + joins
        if (
          /FROM\s+dbo\.shared_notes\s+n/i.test(sql) &&
          /WHERE\s+n\.note_id\s*=\s*@noteId/i.test(sql)
        ) {
          if (dbMode.emptyReadNoteRow) return { recordset: [] };
          const id = params.noteId;
          const row = findNote(id);
          if (!row) return { recordset: [] };
          return {
            recordset: [
              {
                ...row,
                is_active: !!row.is_active,
                author_name: 'Ada Lovelace',
                group_name: 'Algorithms',
              },
            ],
          };
        }

        return { recordset: [] };
      },
    };
    return req;
  };

  const pool = { request: mkRequest };
  return {
    connect: vi.fn(async () => pool),
    Int: 'Int',
    NVarChar: 'NVarChar',
    MAX: 'MAX',
  };
});

/* ---------------------- auth middleware mock ---------------------- */
vi.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'u-42' }; // used in blob path/metadata
    next();
  },
}));

/* ---------------------- Ensure env picks conn string ---------------------- */
beforeAll(() => {
  process.env.DATABASE_CONNECTION_STRING = 'mssql://fake-for-tests';
});

/* --------------------------- Express test app --------------------------- */
let app;

beforeEach(async () => {
  app = express();
  app.use(express.json());

  // fresh module graph each test so state doesn't bleed
  vi.resetModules();

  // Re-require SUT under test
  const router = require('./noteAttachmentUpload');
  app.use('/api/v1/notes', router);

  // reset storage call logs + knobs
  storageCalls.upload.length = 0;
  storageCalls.del.length = 0;
  storageCalls.sas.length = 0;
  storageBehavior.failUploadIfName = null;
  storageBehavior.throwOnDelete = false;
  storageBehavior.sasPreference = 'sas';

  // reset DB rows + modes
  db.rows.length = 0;
  db.rows.push({
    note_id: 101,
    group_id: 7,
    author_id: 'u-1',
    topic_id: 55,
    note_title: 'First',
    note_content: 'Hello',
    attachments: JSON.stringify([
      {
        container: 'user-files',
        blob: 'notes/u-1/101/seed-a.txt',
        filename: 'seed-a.txt',
        size: 3,
        contentType: 'text/plain',
        uploadedAt: '2025-01-01T00:00:00.000Z',
        url: 'https://files.example/seed-a.txt',
      },
    ]),
    visibility: 'group',
    is_active: 1,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-02T00:00:00Z'),
  });
  dbMode.emptyReadNoteRow = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ---------------------------------- Tests ---------------------------------- */
describe('noteAttachmentUpload router', () => {
  // ------------------------- POST /:noteId/attachments -------------------------
  test('400 on invalid note id', async () => {
    const res = await request(app)
      .post('/api/v1/notes/NaN/attachments')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test('400 when no files provided', async () => {
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no files/i);
  });

  test('404 when note not found', async () => {
    // wipe table
    db.rows.length = 0;

    const res = await request(app)
      .post('/api/v1/notes/999/attachments')
      .set('Authorization', 'Bearer t')
      .attach('files', Buffer.from('hello world'), {
        filename: 'a.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('201 on successful upload: merges attachments and returns full row', async () => {
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .attach('files', Buffer.from('alpha'), {
        filename: 'alpha.txt',
        contentType: 'text/plain',
      })
      .attach('files', Buffer.from('%PDF-1'), {
        filename: 'paper.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(storageCalls.upload.length).toBe(2);
    expect(res.body).toMatchObject({
      note_id: 101,
      author_name: 'Ada Lovelace',
      group_name: 'Algorithms',
    });

    const row = db.rows.find((r) => r.note_id === 101);
    const merged = JSON.parse(row.attachments);
    const names = merged.map((a) => a.filename).sort();
    expect(names).toEqual(['alpha.txt', 'paper.pdf', 'seed-a.txt'].sort());
  });

  test('POST → 413 when storage signals too-large file', async () => {
    storageBehavior.failUploadIfName = 'big.bin';
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .attach('files', Buffer.alloc(26 * 1024 * 1024, 0x41), {
        filename: 'big.bin',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/file too large/i);
  });

  test('POST merges when existing attachments JSON is malformed and sanitizes name', async () => {
    // corrupt the seed row’s JSON so parse fails → fallback to []
    const row = db.rows.find((r) => r.note_id === 101);
    row.attachments = 'NOT_JSON';

    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .attach('files', Buffer.from('data'), {
        filename: 'weird?.name.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    const last = storageCalls.upload.at(-1);
    // sanitized filename should end with weird_.name.txt
    expect(String(last.opts.fileName)).toMatch(/weird_.name.txt$/);
  });

  test('POST falls back to {attachments, added} when readNoteRow returns null', async () => {
    dbMode.emptyReadNoteRow = true;
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .attach('files', Buffer.from('x'), {
        filename: 'a.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('attachments');
    expect(res.body).toHaveProperty('added', 1);
  });

  // ---------------------------- GET /attachments/url ----------------------------
  test('400 on invalid id, 400 when blob missing', async () => {
    const badId = await request(app)
      .get('/api/v1/notes/NaN/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({ container: 'user-files', blob: 'notes/u-42/101/a.txt' });
    expect(badId.status).toBe(400);

    const missingBlob = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({ container: 'user-files' }); // no blob
    expect(missingBlob.status).toBe(400);
    expect(missingBlob.body.error).toMatch(/blob is required/i);
  });

  test('404 when note not found on URL mint', async () => {
    db.rows.length = 0;
    const res = await request(app)
      .get('/api/v1/notes/777/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/777/paper.pdf'),
      });
    expect(res.status).toBe(404);
  });

  test('GET URL: SAS → signed → public fallbacks; none → 500', async () => {
    // SAS (default)
    let res = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/101/paper.pdf'),
      });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/signed\.example\//);

    // Signed fallback
    storageBehavior.sasPreference = 'signed';
    res = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/101/paper.pdf'),
      });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/signed\.example\//);

    // Public fallback
    storageBehavior.sasPreference = 'public';
    res = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/101/paper.pdf'),
      });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/public\.example\//);

    // None → 500
    storageBehavior.sasPreference = 'none';
    res = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/101/paper.pdf'),
      });
    expect(res.status).toBe(500);
  });

  // --------------------------- DELETE /:noteId/attachments ---------------------------
  test('400 on invalid id, 400 on missing body', async () => {
    const badId = await request(app)
      .delete('/api/v1/notes/NaN/attachments')
      .set('Authorization', 'Bearer t')
      .send({ container: 'user-files', blob: 'notes/u-42/101/a.txt' });
    expect(badId.status).toBe(400);

    const missing = await request(app)
      .delete('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .send({});
    expect(missing.status).toBe(400);
  });

  test('200 on delete: storage delete attempted, DB JSON updated, full row returned', async () => {
    const row = db.rows.find((r) => r.note_id === 101);
    const attachments = JSON.parse(row.attachments);
    const target = attachments[0]; // delete the seed entry

    const res = await request(app)
      .delete('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .send({ container: target.container, blob: target.blob });

    expect(res.status).toBe(200);
    expect(storageCalls.del.length).toBe(1);

    const after = JSON.parse(db.rows.find((r) => r.note_id === 101).attachments);
    expect(after.find((a) => a.blob === target.blob)).toBeUndefined();

    expect(res.body).toMatchObject({
      note_id: 101,
      author_name: 'Ada Lovelace',
      group_name: 'Algorithms',
    });
  });

  test('DELETE continues if storage delete fails and still updates DB', async () => {
    const row = db.rows.find((r) => r.note_id === 101);
    const target = JSON.parse(row.attachments)[0];

    storageBehavior.throwOnDelete = true; // simulate transient failure

    const res = await request(app)
      .delete('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .send({ container: target.container, blob: target.blob });

    expect(res.status).toBe(200); // router continues on delete failure
    const after = JSON.parse(db.rows.find((r) => r.note_id === 101).attachments);
    expect(after.some((a) => a.blob === target.blob)).toBe(false);
  });
});
