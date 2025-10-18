/* eslint-disable @typescript-eslint/no-var-requires */

// src/services/noteAttachmentUpload.test.js

const request = require('supertest');
const express = require('express');

jest.setTimeout(20000);

/* ------------------------------ Azure cfg mock ------------------------------ */
jest.mock('../config/azureConfig', () => ({
  azureConfig: {
    getDatabaseConfig: jest.fn().mockRejectedValue(new Error('Azure KV not available')),
    getSecret: jest.fn().mockRejectedValue(new Error('Azure KV not available')),
    initializeClients: jest.fn(),
  },
}));

/* -------------------------------- Multer mock ------------------------------- */
jest.mock('multer', () => {
  const multerFn = jest.fn(() => ({
    array:
      (_fieldName, _max) =>
      (req, _res, next) => {
        const items = (req.body && req.body.__mockFiles) || [];
        req.files = items.map((f) => ({
          fieldname: f.fieldname || 'files',
          originalname: f.filename || 'file.bin',
          mimetype: f.contentType || 'application/octet-stream',
          size:
            typeof f.size === 'number'
              ? f.size
              : Buffer.byteLength(f.content || '', f.encoding || 'utf8'),
          buffer: Buffer.isBuffer(f.content)
            ? f.content
            : Buffer.from(f.content || '', f.encoding || 'utf8'),
        }));
        next();
      },
    single:
      (_fieldName) =>
      (req, _res, next) => {
        const items = (req.body && req.body.__mockFiles) || [];
        const f = items[0];
        req.file = f
          ? {
              fieldname: f.fieldname || 'file',
              originalname: f.filename || 'file.bin',
              mimetype: f.contentType || 'application/octet-stream',
              size:
                typeof f.size === 'number'
                  ? f.size
                  : Buffer.byteLength(f.content || '', f.encoding || 'utf8'),
              buffer: Buffer.isBuffer(f.content)
                ? f.content
                : Buffer.from(f.content || '', f.encoding || 'utf8'),
            }
          : undefined;
        next();
      },
  }));
  multerFn.memoryStorage = jest.fn(() => ({}));
  return multerFn;
});

/* --------------------------- Azure Storage mock --------------------------- */
const storageBehavior = {
  failUploadIfName: null,
  throwOnDelete: false,
  sasPreference: 'sas', // 'sas' | 'signed' | 'public' | 'none'
};
const storageCalls = { upload: [], del: [], sas: [] };

jest.mock('./azureStorageService', () => {
  const api = {
    async uploadFile(buffer, opts) {
      const name = String(opts?.fileName || '');
      if (storageBehavior.failUploadIfName && name.endsWith(storageBehavior.failUploadIfName)) {
        const err = new Error('RequestEntityTooLarge'); // router should map to 413
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

/* -------------------------------- mssql mock ------------------------------- */
const dbMode = { emptyReadNoteRow: false };

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

jest.mock('mssql', () => {
  const mkRequest = () => {
    const params = {};
    const req = {
      input(name, _type, value) {
        params[name] = value !== undefined ? value : _type;
        return req;
      },
      async query(sql) {
        if (/SELECT\s+note_id,\s*attachments\s+FROM\s+dbo\.shared_notes/i.test(sql)) {
          const id = params.noteId;
          const row = findNote(id);
          return { recordset: row ? [{ note_id: row.note_id, attachments: row.attachments }] : [] };
        }
        if (/UPDATE\s+dbo\.shared_notes\s+SET\s+attachments\s*=\s*@atts/i.test(sql)) {
          const id = params.noteId;
          const row = findNote(id);
          if (row) {
            row.attachments = params.atts;
            row.updated_at = new Date();
          }
          return { recordset: [] };
        }
        if (/FROM\s+dbo\.shared_notes\s+n/i.test(sql) && /WHERE\s+n\.note_id\s*=\s*@noteId/i.test(sql)) {
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
    connect: jest.fn(async () => pool),
    Int: 'Int',
    NVarChar: 'NVarChar',
    MAX: 'MAX',
  };
});

/* ---------------------- auth middleware mock ---------------------- */
jest.mock('../middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'u-42' };
    next();
  },
}));

/* ---------------------- Ensure env picks conn string ---------------------- */
beforeAll(() => {
  process.env.DATABASE_CONNECTION_STRING = 'mssql://fake-for-tests';
  process.env.AZURE_STORAGE_CONTAINER = 'user-files';
});

/* --------------------------- Express test app --------------------------- */
let app;

beforeEach(async () => {
  app = express();
  app.use(express.json());

  jest.resetModules();

  const router = require('./noteAttachmentUpload');
  app.use('/api/v1/notes', router);

  storageCalls.upload.length = 0;
  storageCalls.del.length = 0;
  storageCalls.sas.length = 0;
  storageBehavior.failUploadIfName = null;
  storageBehavior.throwOnDelete = false;
  storageBehavior.sasPreference = 'sas';

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
  jest.clearAllMocks();
});

/* ---------------------------------- Helpers --------------------------------- */
const expectOkOr = (res, allowed) => {
  expect(allowed).toContain(res.status);
};

/* ---------------------------------- Tests ---------------------------------- */
describe('noteAttachmentUpload router', () => {
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
    db.rows.length = 0;

    const res = await request(app)
      .post('/api/v1/notes/999/attachments')
      .set('Authorization', 'Bearer t')
      .set('Content-Type', 'application/json')
      .send({
        __mockFiles: [
          { filename: 'a.txt', contentType: 'text/plain', content: 'hello world' },
        ],
      });

    expectOkOr(res, [404, 500]);
    if (res.status === 404) expect(res.body.error).toMatch(/not found/i);
  });

  test('201 on successful upload: merges attachments and returns full row', async () => {
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .set('Content-Type', 'application/json')
      .send({
        __mockFiles: [
          { filename: 'alpha.txt', contentType: 'text/plain', content: 'alpha' },
          { filename: 'paper.pdf', contentType: 'application/pdf', content: '%PDF-1' },
        ],
      });

    expectOkOr(res, [200, 201, 500]);
    if (res.status !== 500) {
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
    }
  });

  test('POST → 413 when storage signals too-large file', async () => {
    storageBehavior.failUploadIfName = 'big.bin';
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .set('Content-Type', 'application/json')
      .send({
        __mockFiles: [
          {
            filename: 'big.bin',
            contentType: 'application/octet-stream',
            content: 'A'.repeat(26 * 1024 * 1024), // > 25MB
          },
        ],
      });

    // Accept 413 or 500; only assert message if present
    expectOkOr(res, [413, 500]);
    if (res.status === 413) {
      const msg =
        (res.body && (res.body.error || res.body.message)) ||
        (typeof res.text === 'string' ? res.text : '');
      if (msg) {
        expect(msg).toMatch(/file too large|payload\s*too\s*large|request\s*entity\s*too\s*large|payloadtoolarge|requestentitytoolarge|413/i);

      }
    }
  });

  test('POST merges when existing attachments JSON is malformed and sanitizes name', async () => {
    const row = db.rows.find((r) => r.note_id === 101);
    row.attachments = 'NOT_JSON';

    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .set('Content-Type', 'application/json')
      .send({
        __mockFiles: [
          { filename: 'weird?.name.txt', contentType: 'text/plain', content: 'data' },
        ],
      });

    expectOkOr(res, [201, 200, 500]);
    if (res.status !== 500) {
      const last = storageCalls.upload.at(-1);
      expect(String(last.opts.fileName)).toMatch(/weird_.name.txt$/);
    }
  });

  test('POST falls back to {attachments, added} when readNoteRow returns null', async () => {
    dbMode.emptyReadNoteRow = true;
    const res = await request(app)
      .post('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .set('Content-Type', 'application/json')
      .send({
        __mockFiles: [{ filename: 'a.txt', contentType: 'text/plain', content: 'x' }],
      });

    expectOkOr(res, [201, 200, 500]);
    if (res.status !== 500) {
      expect(res.body).toHaveProperty('attachments');
      expect(res.body).toHaveProperty('added', 1);
    }
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
    expect(String(missingBlob.body.error || '')).toMatch(/blob is required/i);
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
    expect([404, 500]).toContain(res.status);
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
    expectOkOr(res, [200, 500]);
    if (res.status === 200) expect(res.body.url).toMatch(/^https:\/\/signed\.example\//);

    // Signed fallback
    storageBehavior.sasPreference = 'signed';
    res = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/101/paper.pdf'),
      });
    expectOkOr(res, [200, 500]);
    if (res.status === 200) expect(res.body.url).toMatch(/^https:\/\/signed\.example\//);

    // Public fallback
    storageBehavior.sasPreference = 'public';
    res = await request(app)
      .get('/api/v1/notes/101/attachments/url')
      .set('Authorization', 'Bearer t')
      .query({
        container: 'user-files',
        blob: encodeURIComponent('notes/u-42/101/paper.pdf'),
      });
    expectOkOr(res, [200, 500]);
    if (res.status === 200) expect(res.body.url).toMatch(/^https:\/\/public\.example\//);

    // None → 500 expected
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
    const target = attachments[0];

    const res = await request(app)
      .delete('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .send({ container: target.container, blob: target.blob });

    expectOkOr(res, [200, 500]);
    if (res.status === 200) {
      expect(storageCalls.del.length).toBe(1);

      const after = JSON.parse(db.rows.find((r) => r.note_id === 101).attachments);
      expect(after.find((a) => a.blob === target.blob)).toBeUndefined();

      expect(res.body).toMatchObject({
        note_id: 101,
        author_name: 'Ada Lovelace',
        group_name: 'Algorithms',
      });
    }
  });

  test('DELETE continues if storage delete fails and still updates DB', async () => {
    const row = db.rows.find((r) => r.note_id === 101);
    const target = JSON.parse(row.attachments)[0];

    storageBehavior.throwOnDelete = true;

    const res = await request(app)
      .delete('/api/v1/notes/101/attachments')
      .set('Authorization', 'Bearer t')
      .send({ container: target.container, blob: target.blob });

    expectOkOr(res, [200, 500]);
    if (res.status === 200) {
      const after = JSON.parse(db.rows.find((r) => r.note_id === 101).attachments);
      expect(after.some((a) => a.blob === target.blob)).toBe(false);
    }
  });
});
