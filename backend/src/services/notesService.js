// backend/src/services/notesService.js
// Code-side hardening: detect columns/table variants; avoid referencing missing cols.

class NotesServiceError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'NotesServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

let pool;

// detected schema cache
const schema = {
  tables: {
    groups: 'study_groups', // will switch to "groups" if it exists
    notes: 'shared_notes',
  },
  groupCols: {
    nameCol: null, // one of: name | group_name | title
  },
  notesCols: {
    topic_id: false,
    attachments: false,
    visibility: false,
    is_active: false,
    created_at: true, // assumed
    updated_at: true, // assumed
  },
};

async function initializeDatabase() {
  try {
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
    } catch {
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found');
      }
    }
    await detectSchema();
  } catch (err) {
    console.error('❌ Notes DB init failed:', err);
    throw err;
  }
}
initializeDatabase();

async function getPool() {
  if (!pool) await initializeDatabase();
  return pool;
}

async function hasTable(name) {
  const { recordset } = await pool
    .request()
    .input('name', sql.NVarChar(128), name)
    .query(`SELECT 1 FROM sys.tables WHERE name = @name`);
  return recordset.length > 0;
}

async function hasColumn(table, col) {
  const { recordset } = await pool
    .request()
    .input('tbl', sql.NVarChar(256), `dbo.${table}`)
    .input('col', sql.NVarChar(128), col).query(`
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID(@tbl) AND name = @col
    `);
  return recordset.length > 0;
}

async function firstExistingColumn(table, candidates) {
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await hasColumn(table, c)) return c;
  }
  return null;
}

async function detectSchema() {
  if (await hasTable('groups')) schema.tables.groups = 'groups';
  else if (await hasTable('study_groups')) schema.tables.groups = 'study_groups';

  if (await hasTable('shared_notes')) schema.tables.notes = 'shared_notes';

  const g = schema.tables.groups;
  const n = schema.tables.notes;

  schema.groupCols.nameCol = await firstExistingColumn(g, ['name', 'group_name', 'title']);

  schema.notesCols.topic_id = await hasColumn(n, 'topic_id');
  schema.notesCols.attachments = await hasColumn(n, 'attachments');
  schema.notesCols.visibility = await hasColumn(n, 'visibility');
  schema.notesCols.is_active = await hasColumn(n, 'is_active');
}

const tbl = (name) => `dbo.${schema.tables[name]}`;

// helpers
function notesOrderBy(alias = 'n') {
  return `ORDER BY ${alias}.updated_at DESC, ${alias}.created_at DESC`;
}

/* --------------------------------- Routes --------------------------------- */
/* ------------------------------ Flat endpoints ----------------------------- */

// ---------- GET /notes ----------
// Query params: groupId?, visibility?, search?, limit?, offset?
router.get('/', authenticateToken, async (req, res) => {
  try {
    await getPool();

    if (!(await hasTable(schema.tables.notes))) {
      return res.json([]);
    }

    const { groupId, visibility, search, limit, offset } = req.query;
    const lim = Number(limit) > 0 ? Math.min(Number(limit), 100) : 50;
    const off = Number(offset) > 0 ? Number(offset) : 0;

    const r = pool.request();
    if (groupId != null) r.input('groupId', sql.Int, Number(groupId));
    if (visibility && schema.notesCols.visibility)
      r.input('vis', sql.NVarChar(50), String(visibility));
    if (search) r.input('q', sql.NVarChar(4000), `%${String(search).toLowerCase()}%`);
    r.input('lim', sql.Int, lim);
    r.input('off', sql.Int, off);

    const whereParts = [];
    if (groupId != null) whereParts.push(`n.group_id = @groupId`);
    if (schema.notesCols.is_active) whereParts.push(`n.is_active = 1`);
    if (visibility && schema.notesCols.visibility) whereParts.push(`n.visibility = @vis`);
    if (search) {
      whereParts.push(`(
        LOWER(n.note_title)   LIKE @q OR
        LOWER(n.note_content) LIKE @q OR
        LOWER(u.first_name + ' ' + u.last_name) LIKE @q
      )`);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const q = `
      SELECT
        n.note_id,
        n.group_id,
        n.author_id,
        ${schema.notesCols.topic_id ? 'n.topic_id' : 'NULL AS topic_id'},
        n.note_title,
        n.note_content,
        ${schema.notesCols.attachments ? 'n.attachments' : 'NULL AS attachments'},
        ${
          schema.notesCols.visibility
            ? 'n.visibility'
            : "CAST('group' AS NVARCHAR(50)) AS visibility"
        },
        ${schema.notesCols.is_active ? 'n.is_active' : 'CAST(1 AS bit) AS is_active'},
        n.created_at,
        n.updated_at,
        COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
        ${schema.groupCols.nameCol ? `g.${schema.groupCols.nameCol}` : 'NULL'} AS group_name,
        ${schema.notesCols.topic_id ? 't.topic_name' : 'NULL'} AS topic_name
      FROM ${tbl('notes')} n
      LEFT JOIN ${tbl('groups')} g ON g.group_id = n.group_id
      LEFT JOIN dbo.users u ON u.user_id = n.author_id
      ${schema.notesCols.topic_id ? 'LEFT JOIN dbo.topics t ON t.topic_id = n.topic_id' : ''}
      ${whereClause}
      ${notesOrderBy('n')}
      OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY
    `;

    const { recordset } = await r.query(q);
    res.json(
      recordset.map((row) => ({
        note_id: row.note_id,
        group_id: row.group_id,
        author_id: row.author_id,
        topic_id: row.topic_id,
        note_title: row.note_title,
        note_content: row.note_content,
        attachments: row.attachments,
        visibility: row.visibility,
        is_active: !!row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author_name: row.author_name || null,
        group_name: row.group_name || null,
        topic_name: row.topic_name || null,
      }))
    );
  } catch (err) {
    console.error('GET /notes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.get('/:noteId', authenticateToken, async (req, res) => {
  try {
    await getPool();
    if (!(await hasTable(schema.tables.notes))) {
      return res.status(404).json({ error: 'Notes not supported' });
    }

    const noteId = Number(req.params.noteId);
    if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note id' });

    const r = pool.request();
    r.input('noteId', sql.Int, noteId);

    const q = `
      SELECT
        n.note_id,
        n.group_id,
        n.author_id,
        ${schema.notesCols.topic_id ? 'n.topic_id' : 'NULL AS topic_id'},
        n.note_title,
        n.note_content,
        ${schema.notesCols.attachments ? 'n.attachments' : 'NULL AS attachments'},
        ${schema.notesCols.visibility ? 'n.visibility' : "CAST('group' AS NVARCHAR(50)) AS visibility"},
        ${schema.notesCols.is_active ? 'n.is_active' : 'CAST(1 AS bit) AS is_active'},
        n.created_at,
        n.updated_at,
        COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
        ${schema.groupCols.nameCol ? `g.${schema.groupCols.nameCol}` : 'NULL'} AS group_name,
        ${schema.notesCols.topic_id ? 't.topic_name' : 'NULL'} AS topic_name
      FROM ${tbl('notes')} n
      LEFT JOIN ${tbl('groups')} g ON g.group_id = n.group_id
      LEFT JOIN dbo.users u ON u.user_id = n.author_id
      ${schema.notesCols.topic_id ? 'LEFT JOIN dbo.topics t ON t.topic_id = n.topic_id' : ''}
      WHERE n.note_id = @noteId
    `;

    const { recordset } = await r.query(q);
    if (!recordset.length) return res.status(404).json({ error: 'Note not found' });

    const row = recordset[0];
    res.json({
      note_id: row.note_id,
      group_id: row.group_id,
      author_id: row.author_id,
      topic_id: row.topic_id,
      note_title: row.note_title,
      note_content: row.note_content,
      attachments: row.attachments,
      visibility: row.visibility,
      is_active: !!row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: row.author_name || null,
      group_name: row.group_name || null,
      topic_name: row.topic_name || null,
    });
  } catch (err) {
    console.error('GET /notes/:noteId error:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});


// ---------- POST /notes ----------
router.post('/', authenticateToken, async (req, res) => {
  try {
    await getPool();

    if (!(await hasTable(schema.tables.notes))) {
      return res.status(501).json({ error: 'Notes not supported on this deployment' });
    }

    const { group_id, note_title, note_content } = req.body;
    let { visibility = 'group', topic_id = null, attachments = null } = req.body;

    const groupIdNum = Number(group_id);
    if (Number.isNaN(groupIdNum))
      return res.status(400).json({ error: 'Valid group_id is required' });
    if (!note_title || !note_content) {
      return res.status(400).json({ error: 'note_title and note_content are required' });
    }

    const gq = await pool
      .request()
      .input('gid', sql.Int, groupIdNum)
      .query(`SELECT 1 FROM ${tbl('groups')} WHERE group_id = @gid`);
    if (!gq.recordset.length) return res.status(404).json({ error: 'Group not found' });

    const r = pool.request();
    r.input('groupId', sql.Int, groupIdNum);
    r.input('authorId', sql.NVarChar(255), req.user.id);
    r.input('title', sql.NVarChar(255), String(note_title).trim());
    r.input('content', sql.NVarChar(sql.MAX), String(note_content));
    if (schema.notesCols.visibility) r.input('vis', sql.NVarChar(50), String(visibility));
    if (schema.notesCols.topic_id)
      r.input('topic', sql.Int, topic_id == null ? null : Number(topic_id));
    if (schema.notesCols.attachments)
      r.input(
        'att',
        sql.NVarChar(sql.MAX),
        attachments == null ? null : JSON.stringify(attachments)
      );

    const cols = [
      'group_id',
      'author_id',
      'note_title',
      'note_content',
      'created_at',
      'updated_at',
    ];
    const vals = [
      '@groupId',
      '@authorId',
      '@title',
      '@content',
      'SYSUTCDATETIME()',
      'SYSUTCDATETIME()',
    ];
    if (schema.notesCols.visibility) {
      cols.push('visibility');
      vals.push('@vis');
    }
    if (schema.notesCols.topic_id) {
      cols.push('topic_id');
      vals.push('@topic');
    }
    if (schema.notesCols.attachments) {
      cols.push('attachments');
      vals.push('@att');
    }
    if (schema.notesCols.is_active) {
      cols.push('is_active');
      vals.push('1');
    }

    const ins = await r.query(`
      INSERT INTO ${tbl('notes')} (${cols.join(', ')})
      OUTPUT
        inserted.note_id,
        inserted.group_id,
        inserted.author_id,
        ${schema.notesCols.topic_id ? 'inserted.topic_id' : 'NULL AS topic_id'},
        inserted.note_title,
        inserted.note_content,
        ${schema.notesCols.attachments ? 'inserted.attachments' : 'NULL AS attachments'},
        ${
          schema.notesCols.visibility
            ? 'inserted.visibility'
            : "CAST('group' AS NVARCHAR(50)) AS visibility"
        },
        ${schema.notesCols.is_active ? 'inserted.is_active' : 'CAST(1 AS bit) AS is_active'},
        inserted.created_at,
        inserted.updated_at
      VALUES (${vals.join(', ')});
    `);

    const row = ins.recordset[0];

    const meta = await pool
      .request()
      .input('aid', sql.NVarChar(255), row.author_id)
      .input('gid', sql.Int, row.group_id).query(`
        SELECT
          COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
          ${schema.groupCols.nameCol ? `g.${schema.groupCols.nameCol}` : 'NULL'} AS group_name
        FROM dbo.users u CROSS JOIN ${tbl('groups')} g
        WHERE u.user_id = @aid AND g.group_id = @gid
      `);

    const author_name = meta.recordset[0]?.author_name || null;
    const group_name = meta.recordset[0]?.group_name || null;

    res.status(201).json({
      ...row,
      author_name,
      group_name,
      topic_name: null,
    });
  } catch (err) {
    console.error('POST /notes error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// ---------- PATCH /notes/:noteId ----------
router.patch('/:noteId', authenticateToken, async (req, res) => {
  try {
    await getPool();

    if (!(await hasTable(schema.tables.notes))) {
      return res.status(501).json({ error: 'Notes not supported on this deployment' });
    }

    const noteId = Number(req.params.noteId);
    if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note id' });

    const { note_title, note_content, visibility, topic_id, attachments, is_active } = req.body;

    const sets = [];
    const r = pool.request();
    r.input('noteId', sql.Int, noteId);

    if (note_title != null) {
      sets.push('note_title = @title');
      r.input('title', sql.NVarChar(255), String(note_title).trim());
    }
    if (note_content != null) {
      sets.push('note_content = @content');
      r.input('content', sql.NVarChar(sql.MAX), String(note_content));
    }
    if (schema.notesCols.visibility && visibility != null) {
      sets.push('visibility = @vis');
      r.input('vis', sql.NVarChar(50), String(visibility));
    }
    if (schema.notesCols.topic_id && topic_id !== undefined) {
      sets.push('topic_id = @topic');
      r.input('topic', sql.Int, topic_id == null ? null : Number(topic_id));
    }
    if (schema.notesCols.attachments && attachments !== undefined) {
      sets.push('attachments = @att');
      r.input(
        'att',
        sql.NVarChar(sql.MAX),
        attachments == null ? null : JSON.stringify(attachments)
      );
    }
    if (schema.notesCols.is_active && is_active !== undefined) {
      sets.push('is_active = @active');
      r.input('active', sql.Bit, !!is_active ? 1 : 0);
    }

    sets.push('updated_at = SYSUTCDATETIME()');
    if (!sets.length) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const up = await r.query(`
      UPDATE ${tbl('notes')}
      SET ${sets.join(', ')}
      WHERE note_id = @noteId;
      SELECT
        n.note_id,
        n.group_id,
        n.author_id,
        ${schema.notesCols.topic_id ? 'n.topic_id' : 'NULL AS topic_id'},
        n.note_title,
        n.note_content,
        ${schema.notesCols.attachments ? 'n.attachments' : 'NULL AS attachments'},
        ${
          schema.notesCols.visibility
            ? 'n.visibility'
            : "CAST('group' AS NVARCHAR(50)) AS visibility"
        },
        ${schema.notesCols.is_active ? 'n.is_active' : 'CAST(1 AS bit) AS is_active'},
        n.created_at,
        n.updated_at,
        COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
        ${schema.groupCols.nameCol ? `g.${schema.groupCols.nameCol}` : 'NULL'} AS group_name,
        ${schema.notesCols.topic_id ? 't.topic_name' : 'NULL'} AS topic_name
      FROM ${tbl('notes')} n
      LEFT JOIN ${tbl('groups')} g ON g.group_id = n.group_id
      LEFT JOIN dbo.users u ON u.user_id = n.author_id
      ${schema.notesCols.topic_id ? 'LEFT JOIN dbo.topics t ON t.topic_id = n.topic_id' : ''}
      WHERE n.note_id = @noteId
    `);

    if (!up.recordset.length) return res.status(404).json({ error: 'Note not found' });

    const row = up.recordset[0];
    res.json({
      note_id: row.note_id,
      group_id: row.group_id,
      author_id: row.author_id,
      topic_id: row.topic_id,
      note_title: row.note_title,
      note_content: row.note_content,
      attachments: row.attachments,
      visibility: row.visibility,
      is_active: !!row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: row.author_name || null,
      group_name: row.group_name || null,
      topic_name: row.topic_name || null,
    });
  } catch (err) {
    console.error('PATCH /notes/:noteId error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// ---------- DELETE /notes/:noteId ----------
router.delete('/:noteId', authenticateToken, async (req, res) => {
  try {
    await getPool();

    if (!(await hasTable(schema.tables.notes))) {
      return res.status(501).json({ error: 'Notes not supported on this deployment' });
    }

    const noteId = Number(req.params.noteId);
    if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note id' });

    const r = pool.request();
    r.input('noteId', sql.Int, noteId);

    const del = await r.query(`
      DELETE FROM ${tbl('notes')} WHERE note_id = @noteId;
      SELECT @@ROWCOUNT AS affected;
    `);

    const affected = del.recordset[0]?.affected || 0;
    if (!affected) return res.status(404).json({ error: 'Note not found' });

    res.status(204).end();
  } catch (err) {
    console.error('DELETE /notes/:noteId error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

/* --------------------------- Group-scoped routes --------------------------- */
// Mount this router at /api/v1/groups as well to activate these.

router.get('/:groupId/notes', authenticateToken, async (req, res) => {
  try {
    await getPool();

    if (!(await hasTable(schema.tables.notes))) {
      return res.json([]);
    }

    const groupId = Number(req.params.groupId);
    if (Number.isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const { visibility, search, limit, offset } = req.query;
    const lim = Number(limit) > 0 ? Math.min(Number(limit), 100) : 50;
    const off = Number(offset) > 0 ? Number(offset) : 0;

    const gq = await pool
      .request()
      .input('gid', sql.Int, groupId)
      .query(`SELECT 1 FROM ${tbl('groups')} WHERE group_id = @gid`);
    if (!gq.recordset.length) return res.status(404).json({ error: 'Group not found' });

    const r = pool.request();
    r.input('groupId', sql.Int, groupId);
    if (visibility && schema.notesCols.visibility)
      r.input('vis', sql.NVarChar(50), String(visibility));
    if (search) r.input('q', sql.NVarChar(4000), `%${String(search).toLowerCase()}%`);
    r.input('lim', sql.Int, lim);
    r.input('off', sql.Int, off);

    const whereParts = ['n.group_id = @groupId'];
    if (schema.notesCols.is_active) whereParts.push('n.is_active = 1');
    if (visibility && schema.notesCols.visibility) whereParts.push('n.visibility = @vis');
    if (search) {
      whereParts.push(`(
        LOWER(n.note_title)   LIKE @q OR
        LOWER(n.note_content) LIKE @q OR
        LOWER(u.first_name + ' ' + u.last_name) LIKE @q
      )`);
    }

    const q = `
      SELECT
        n.note_id,
        n.group_id,
        n.author_id,
        ${schema.notesCols.topic_id ? 'n.topic_id' : 'NULL AS topic_id'},
        n.note_title,
        n.note_content,
        ${schema.notesCols.attachments ? 'n.attachments' : 'NULL AS attachments'},
        ${
          schema.notesCols.visibility
            ? 'n.visibility'
            : "CAST('group' AS NVARCHAR(50)) AS visibility"
        },
        ${schema.notesCols.is_active ? 'n.is_active' : 'CAST(1 AS bit) AS is_active'},
        n.created_at,
        n.updated_at,
        COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
        ${schema.groupCols.nameCol ? `g.${schema.groupCols.nameCol}` : 'NULL'} AS group_name,
        ${schema.notesCols.topic_id ? 't.topic_name' : 'NULL'} AS topic_name
      FROM ${tbl('notes')} n
      LEFT JOIN ${tbl('groups')} g ON g.group_id = n.group_id
      LEFT JOIN dbo.users u ON u.user_id = n.author_id
      ${schema.notesCols.topic_id ? 'LEFT JOIN dbo.topics t ON t.topic_id = n.topic_id' : ''}
      WHERE ${whereParts.join(' AND ')}
      ${notesOrderBy('n')}
      OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY
    `;

    const { recordset } = await r.query(q);
    res.json(
      recordset.map((row) => ({
        note_id: row.note_id,
        group_id: row.group_id,
        author_id: row.author_id,
        topic_id: row.topic_id,
        note_title: row.note_title,
        note_content: row.note_content,
        attachments: row.attachments,
        visibility: row.visibility,
        is_active: !!row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author_name: row.author_name || null,
        group_name: row.group_name || null,
        topic_name: row.topic_name || null,
      }))
    );
  } catch (err) {
    console.error('GET /groups/:groupId/notes (via notesService) error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/:groupId/notes', authenticateToken, async (req, res) => {
  try {
    await getPool();

    if (!(await hasTable(schema.tables.notes))) {
      return res.status(501).json({ error: 'Notes not supported on this deployment' });
    }

    const groupId = Number(req.params.groupId);
    if (Number.isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const { note_title, note_content } = req.body;
    let { visibility = 'group', topic_id = null, attachments = null } = req.body;

    if (!note_title || !note_content) {
      return res.status(400).json({ error: 'note_title and note_content are required' });
    }

    const gq = await pool
      .request()
      .input('gid', sql.Int, groupId)
      .query(`SELECT 1 FROM ${tbl('groups')} WHERE group_id = @gid`);
    if (!gq.recordset.length) return res.status(404).json({ error: 'Group not found' });

    const r = pool.request();
    r.input('groupId', sql.Int, groupId);
    r.input('authorId', sql.NVarChar(255), req.user.id);
    r.input('title', sql.NVarChar(255), String(note_title).trim());
    r.input('content', sql.NVarChar(sql.MAX), String(note_content));
    if (schema.notesCols.visibility) r.input('vis', sql.NVarChar(50), String(visibility));
    if (schema.notesCols.topic_id)
      r.input('topic', sql.Int, topic_id == null ? null : Number(topic_id));
    if (schema.notesCols.attachments)
      r.input(
        'att',
        sql.NVarChar(sql.MAX),
        attachments == null ? null : JSON.stringify(attachments)
      );

    const cols = [
      'group_id',
      'author_id',
      'note_title',
      'note_content',
      'created_at',
      'updated_at',
    ];
    const vals = [
      '@groupId',
      '@authorId',
      '@title',
      '@content',
      'SYSUTCDATETIME()',
      'SYSUTCDATETIME()',
    ];
    if (schema.notesCols.visibility) {
      cols.push('visibility');
      vals.push('@vis');
    }
    if (schema.notesCols.topic_id) {
      cols.push('topic_id');
      vals.push('@topic');
    }
    if (schema.notesCols.attachments) {
      cols.push('attachments');
      vals.push('@att');
    }
    if (schema.notesCols.is_active) {
      cols.push('is_active');
      vals.push('1');
    }

    const ins = await r.query(`
      INSERT INTO ${tbl('notes')} (${cols.join(', ')})
      OUTPUT
        inserted.note_id,
        inserted.group_id,
        inserted.author_id,
        ${schema.notesCols.topic_id ? 'inserted.topic_id' : 'NULL AS topic_id'},
        inserted.note_title,
        inserted.note_content,
        ${schema.notesCols.attachments ? 'inserted.attachments' : 'NULL AS attachments'},
        ${
          schema.notesCols.visibility
            ? 'inserted.visibility'
            : "CAST('group' AS NVARCHAR(50)) AS visibility"
        },
        ${schema.notesCols.is_active ? 'inserted.is_active' : 'CAST(1 AS bit) AS is_active'},
        inserted.created_at,
        inserted.updated_at
      VALUES (${vals.join(', ')});  
    `);

    const row = ins.recordset[0];

    const meta = await pool
      .request()
      .input('aid', sql.NVarChar(255), row.author_id)
      .input('gid', sql.Int, row.group_id).query(`
        SELECT
          COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
          ${schema.groupCols.nameCol ? `g.${schema.groupCols.nameCol}` : 'NULL'} AS group_name
        FROM dbo.users u CROSS JOIN ${tbl('groups')} g
        WHERE u.user_id = @aid AND g.group_id = @gid
      `);

    const author_name = meta.recordset[0]?.author_name || null;
    const group_name = meta.recordset[0]?.group_name || null;

    res.status(201).json({
      ...row,
      author_name,
      group_name,
      topic_name: null,
    });
  } catch (err) {
    console.error('POST /groups/:groupId/notes (via notesService) error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

module.exports = router;
