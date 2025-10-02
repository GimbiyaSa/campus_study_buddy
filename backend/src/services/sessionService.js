// backend/src/services/sessionService.js
// Harden for missing created_by/max_participants/location/description, and missing joined_at on session_attendees.

class SessionServiceError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'SessionServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

let pool;

const schema = {
  tables: {
    study_sessions: 'study_sessions',
    session_attendees: 'session_attendees',
    group_members: 'group_members',
  },
  sessionsCols: {
    created_by: false,
    max_participants: false,
    session_type: false,
    status: false,
    location: false,
    description: false,
  },
  attendeesCols: {
    joined_at: false,
    created_at: false,
    idCol: null, // one of: attendee_id | id | session_attendee_id
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
    console.error('❌ Database init failed:', err);
    throw err;
  }
}
initializeDatabase();

async function getPool() {
  if (!pool) await initializeDatabase();
  return pool;
}

async function hasColumn(table, col) {
  const { recordset } = await pool.request()
    .input('tbl', sql.NVarChar(256), `dbo.${table}`)
    .input('col', sql.NVarChar(128), col)
    .query(`
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
  // study_sessions
  schema.sessionsCols.created_by = await hasColumn('study_sessions', 'created_by');
  schema.sessionsCols.max_participants = await hasColumn('study_sessions', 'max_participants');
  schema.sessionsCols.session_type = await hasColumn('study_sessions', 'session_type');
  schema.sessionsCols.status = await hasColumn('study_sessions', 'status');
  schema.sessionsCols.location = await hasColumn('study_sessions', 'location');
  schema.sessionsCols.description = await hasColumn('study_sessions', 'description');

  // session_attendees
  schema.attendeesCols.joined_at = await hasColumn('session_attendees', 'joined_at');
  schema.attendeesCols.created_at = await hasColumn('session_attendees', 'created_at');
  schema.attendeesCols.idCol = await firstExistingColumn('session_attendees', ['attendee_id', 'id', 'session_attendee_id']);

  console.log('📐 study_sessions cols:', schema.sessionsCols);
  console.log('📐 session_attendees cols:', schema.attendeesCols);
}

// helper: expression to get session creator id
function ownerExpr(alias = 's') {
  if (schema.sessionsCols.created_by) return `${alias}.created_by`;
  // derive from earliest attendee by available chronology
  const sa = 'sa2';
  if (schema.attendeesCols.joined_at) {
    return `(SELECT TOP 1 ${sa}.user_id FROM dbo.session_attendees ${sa} WHERE ${sa}.session_id = ${alias}.session_id ORDER BY ${sa}.joined_at ASC)`;
  }
  if (schema.attendeesCols.created_at) {
    return `(SELECT TOP 1 ${sa}.user_id FROM dbo.session_attendees ${sa} WHERE ${sa}.session_id = ${alias}.session_id ORDER BY ${sa}.created_at ASC)`;
  }
  if (schema.attendeesCols.idCol) {
    return `(SELECT TOP 1 ${sa}.user_id FROM dbo.session_attendees ${sa} WHERE ${sa}.session_id = ${alias}.session_id ORDER BY ${sa}.${schema.attendeesCols.idCol} ASC)`;
  }
  // fallback: arbitrary
  return `(SELECT TOP 1 ${sa}.user_id FROM dbo.session_attendees ${sa} WHERE ${sa}.session_id = ${alias}.session_id)`;
}

function attendeesChronoInsertCols() {
  if (schema.attendeesCols.joined_at) return { col: 'joined_at', val: 'SYSUTCDATETIME()' };
  if (schema.attendeesCols.created_at) return { col: 'created_at', val: 'SYSUTCDATETIME()' };
  return null;
}

function mapSessionRow(row, userId) {
  const attendees = Number(row.attendee_count || 0);
  return {
    id: String(row.id),
    title: row.session_title || row.title,
    session_title: row.session_title || row.title,
    description: row.description,
    startTime: row.scheduled_start,
    endTime: row.scheduled_end,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    date: row.scheduled_start,
    location: row.location || 'TBD',
    status: row.status || 'upcoming',
    session_type: row.session_type || 'study',
    type: row.session_type || 'study',
    max_participants: row.max_participants ?? null,
    maxParticipants: row.max_participants ?? null,
    attendees,
    attendee_count: attendees,
    participants: attendees,
    group_id: row.group_id ?? null,
    groupId: row.group_id ?? null,
    is_owner: row.created_by === userId ? 1 : 0,
    isCreator: row.created_by === userId,
    attending: row.attending === 1 || row.created_by === userId ? 1 : 0,
    isAttending: row.attending === 1 || row.created_by === userId,
    course: row.course || row.module_name || null,
    courseCode: row.course_code || row.module_code || null,
    created_by: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- GET /sessions ----------
router.get('/', authenticateToken, async (req, res) => {
  try {
    await getPool();

    const r = pool.request();
    r.input('userId', sql.NVarChar(255), req.user.id);

    const sc = schema.sessionsCols;

    const selectPieces = [
      's.session_id AS id',
      's.session_title',
      sc.description ? 's.description' : 'NULL AS description',
      's.scheduled_start',
      's.scheduled_end',
      sc.location ? 's.location' : 'NULL AS location',
      sc.status ? 's.status' : `'upcoming' AS status`,
      sc.session_type ? 's.session_type' : `'study' AS session_type`,
      sc.max_participants ? 's.max_participants' : 'NULL AS max_participants',
      's.group_id',
      's.created_at',
      's.updated_at',
      `${ownerExpr('s')} AS created_by`,
      `(SELECT COUNT(*) FROM dbo.session_attendees sa WHERE sa.session_id = s.session_id) AS attendee_count`,
      `CASE
         WHEN EXISTS (SELECT 1 FROM dbo.session_attendees sa WHERE sa.session_id = s.session_id AND sa.user_id = @userId)
              OR ${ownerExpr('s')} = @userId
         THEN 1 ELSE 0 END AS attending`,
    ];

    const q = `
      SELECT
        ${selectPieces.join(',\n        ')}
      FROM dbo.study_sessions s
      WHERE
        EXISTS (SELECT 1 FROM dbo.session_attendees sa WHERE sa.session_id = s.session_id AND sa.user_id = @userId)
        OR (${ownerExpr('s')} = @userId)
        OR EXISTS (SELECT 1 FROM dbo.group_members gm WHERE gm.group_id = s.group_id AND gm.user_id = @userId)
      ORDER BY s.scheduled_start DESC, s.created_at DESC;
    `;

    const { recordset } = await r.query(q);
    res.json(recordset.map((row) => mapSessionRow(row, req.user.id)));
  } catch (err) {
    console.error('GET /sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ---------- POST /sessions ----------
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      session_title,
      description,
      startTime,
      endTime,
      location,
      type,
      session_type,
      maxParticipants,
      max_participants,
      groupId,
      group_id,
    } = req.body;

    const finalTitle = (session_title || title || '').trim();
    const finalType = (session_type || type || (schema.sessionsCols.session_type ? 'study' : null));
    const finalMax = Number(max_participants ?? maxParticipants);
    const hasMax = schema.sessionsCols.max_participants && !Number.isNaN(finalMax);
    const groupIdNum = group_id ?? groupId ?? null;

    if (!finalTitle || !startTime || !endTime) {
      return res.status(400).json({ error: 'title, startTime, endTime are required' });
    }

    await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    // if group scoped, require membership
    if (groupIdNum != null) {
      const chk = new sql.Request(tx);
      chk.input('gid', sql.Int, Number(groupIdNum));
      chk.input('uid', sql.NVarChar(255), req.user.id);
      const m = await chk.query(`SELECT 1 FROM dbo.group_members WHERE group_id = @gid AND user_id = @uid`);
      if (!m.recordset.length) {
        await tx.rollback();
        return res.status(403).json({ error: 'Not a member of this group' });
      }
    }

    // build INSERT
    const cols = ['session_title', 'scheduled_start', 'scheduled_end', 'created_at'];
    const vals = ['@title', '@start', '@end', 'SYSUTCDATETIME()'];
    const sc = schema.sessionsCols;

    if (sc.description) { cols.push('description'); vals.push('@description'); }
    if (sc.location) { cols.push('location'); vals.push('@location'); }
    if (groupIdNum != null) { cols.push('group_id'); vals.push('@groupId'); }
    if (sc.status) { cols.push('status'); vals.push(`'upcoming'`); }
    if (sc.session_type && finalType) { cols.push('session_type'); vals.push('@stype'); }
    if (sc.max_participants && hasMax) { cols.push('max_participants'); vals.push('@max'); }
    if (sc.created_by) { cols.push('created_by'); vals.push('@createdBy'); }

    const r = new sql.Request(tx);
    if (groupIdNum != null) r.input('groupId', sql.Int, Number(groupIdNum));
    r.input('title', sql.NVarChar(255), finalTitle);
    r.input('start', sql.DateTime2, new Date(startTime));
    r.input('end', sql.DateTime2, new Date(endTime));
    if (sc.description) r.input('description', sql.NVarChar(sql.MAX), description ?? null);
    if (sc.location) r.input('location', sql.NVarChar(255), location ?? null);
    if (sc.session_type && finalType) r.input('stype', sql.NVarChar(50), finalType);
    if (sc.max_participants && hasMax) r.input('max', sql.Int, finalMax);
    if (sc.created_by) r.input('createdBy', sql.NVarChar(255), req.user.id);

    const ins = await r.query(`
      INSERT INTO dbo.study_sessions (${cols.join(', ')})
      OUTPUT INSERTED.session_id AS id, INSERTED.*
      VALUES (${vals.join(', ')});
    `);

    const created = ins.recordset[0];

    // add creator as attendee
    const r2 = new sql.Request(tx);
    r2.input('sid', sql.Int, created.id);
    r2.input('uid', sql.NVarChar(255), req.user.id);

    const chrono = attendeesChronoInsertCols();
    const aCols = ['session_id', 'user_id'];
    const aVals = ['@sid', '@uid'];
    if (chrono) { aCols.push(chrono.col); aVals.push(chrono.val); }

    await r2.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.session_attendees WHERE session_id = @sid AND user_id = @uid)
      BEGIN
        INSERT INTO dbo.session_attendees (${aCols.join(', ')})
        VALUES (${aVals.join(', ')});
      END
    `);

    await tx.commit();

    const row = {
      id: created.id,
      session_title: created.session_title,
      description: sc.description ? created.description : (description ?? null),
      scheduled_start: created.scheduled_start,
      scheduled_end: created.scheduled_end,
      location: sc.location ? created.location : (location ?? null),
      status: sc.status ? created.status : 'upcoming',
      session_type: sc.session_type ? created.session_type : (finalType || 'study'),
      max_participants: sc.max_participants ? created.max_participants : null,
      group_id: created.group_id ?? groupIdNum ?? null,
      created_by: sc.created_by ? created.created_by : req.user.id,
      created_at: created.created_at,
      updated_at: created.updated_at,
      attendee_count: 1,
      attending: 1,
    };

    res.status(201).json(mapSessionRow(row, req.user.id));
  } catch (err) {
    console.error('POST /sessions error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ---------- PUT /sessions/:id (owner only) ----------
router.put('/:id', authenticateToken, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (Number.isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  try {
    await getPool();

    // verify ownership
    const c = await pool.request()
      .input('sid', sql.Int, sessionId)
      .input('uid', sql.NVarChar(255), req.user.id)
      .query(`
        SELECT 1
        FROM dbo.study_sessions s
        WHERE s.session_id = @sid AND (${ownerExpr('s')} = @uid)
      `);
    if (!c.recordset.length) {
      return res.status(403).json({ error: 'Only the creator can update this session' });
    }

    const {
      title, session_title, description, location,
      startTime, endTime,
      type, session_type, maxParticipants, max_participants,
    } = req.body;

    const sc = schema.sessionsCols;
    const r = pool.request().input('sid', sql.Int, sessionId);
    const sets = [];

    if (title || session_title) { r.input('title', sql.NVarChar(255), (session_title || title).trim()); sets.push('session_title = @title'); }
    if (sc.description && description !== undefined) { r.input('desc', sql.NVarChar(sql.MAX), description ?? null); sets.push('description = @desc'); }
    if (sc.location && location !== undefined) { r.input('loc', sql.NVarChar(255), location ?? null); sets.push('location = @loc'); }
    if (sc.session_type && (type || session_type)) { r.input('stype', sql.NVarChar(50), session_type || type); sets.push('session_type = @stype'); }
    if (sc.max_participants && (max_participants != null || maxParticipants != null)) { r.input('max', sql.Int, Number(max_participants ?? maxParticipants)); sets.push('max_participants = @max'); }
    if (startTime) { r.input('st', sql.DateTime2, new Date(startTime)); sets.push('scheduled_start = @st'); }
    if (endTime)   { r.input('et', sql.DateTime2, new Date(endTime));   sets.push('scheduled_end = @et'); }

    if (!sets.length) return res.status(400).json({ error: 'No fields to update or columns not supported' });

    const { recordset } = await r.query(`
      UPDATE dbo.study_sessions
      SET ${sets.join(', ')}, updated_at = SYSUTCDATETIME()
      WHERE session_id = @sid;

      SELECT
        s.session_id AS id,
        s.session_title,
        ${sc.description ? 's.description' : 'NULL AS description'},
        s.scheduled_start,
        s.scheduled_end,
        ${sc.location ? 's.location' : 'NULL AS location'},
        ${sc.status ? 's.status' : `'upcoming' AS status`},
        ${sc.session_type ? 's.session_type' : `'study' AS session_type`},
        ${sc.max_participants ? 's.max_participants' : 'NULL AS max_participants'},
        s.group_id,
        s.created_at,
        s.updated_at,
        ${ownerExpr('s')} AS created_by,
        (SELECT COUNT(*) FROM dbo.session_attendees sa WHERE sa.session_id = s.session_id) AS attendee_count,
        CASE
          WHEN EXISTS (SELECT 1 FROM dbo.session_attendees sa WHERE sa.session_id = s.session_id AND sa.user_id = @uid)
               OR ${ownerExpr('s')} = @uid
          THEN 1 ELSE 0 END AS attending
      FROM dbo.study_sessions s WHERE s.session_id = @sid;
    `);

    res.json(mapSessionRow(recordset[0], req.user.id));
  } catch (err) {
    console.error('PUT /sessions/:id error:', err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// ---------- DELETE /sessions/:id (owner only) ----------
router.delete('/:id', authenticateToken, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (Number.isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const c = new sql.Request(tx);
    c.input('sid', sql.Int, sessionId);
    c.input('uid', sql.NVarChar(255), req.user.id);
    const chk = await c.query(`
      SELECT 1
      FROM dbo.study_sessions s
      WHERE s.session_id = @sid AND (${ownerExpr('s')} = @uid)
    `);
    if (!chk.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the creator can delete this session' });
    }

    const r = new sql.Request(tx);
    r.input('sid', sql.Int, sessionId);
    await r.query(`
      DELETE FROM dbo.session_attendees WHERE session_id = @sid;
      DELETE FROM dbo.study_sessions WHERE session_id = @sid;
    `);

    await tx.commit();
    res.status(204).end();
  } catch (err) {
    await tx.rollback();
    console.error('DELETE /sessions/:id error:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ---------- POST /sessions/:id/join ----------
router.post('/:id/join', authenticateToken, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (Number.isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  try {
    await getPool();

    const r = pool.request();
    r.input('sid', sql.Int, sessionId);
    r.input('uid', sql.NVarChar(255), req.user.id);

    // capacity check only if max_participants exists
    if (schema.sessionsCols.max_participants) {
      const cap = await r.query(`
        SELECT s.max_participants AS maxP,
               (SELECT COUNT(*) FROM dbo.session_attendees sa WHERE sa.session_id = s.session_id) AS cnt
        FROM dbo.study_sessions s WHERE s.session_id = @sid
      `);
      if (!cap.recordset.length) return res.status(404).json({ error: 'Session not found' });
      const { maxP, cnt } = cap.recordset[0];
      if (maxP && cnt >= maxP) return res.status(409).json({ error: 'Session is full' });
    } else {
      const exists = await r.query(`SELECT 1 FROM dbo.study_sessions WHERE session_id = @sid`);
      if (!exists.recordset.length) return res.status(404).json({ error: 'Session not found' });
    }

    const chrono = attendeesChronoInsertCols();
    const aCols = ['session_id', 'user_id'];
    const aVals = ['@sid', '@uid'];
    if (chrono) { aCols.push(chrono.col); aVals.push(chrono.val); }

    await r.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.session_attendees WHERE session_id = @sid AND user_id = @uid)
      BEGIN
        INSERT INTO dbo.session_attendees (${aCols.join(', ')})
        VALUES (${aVals.join(', ')});
      END
    `);

    res.status(204).end();
  } catch (err) {
    console.error('POST /sessions/:id/join error:', err);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// ---------- DELETE /sessions/:id/leave ----------
router.delete('/:id/leave', authenticateToken, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (Number.isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  try {
    await getPool();

    const r = pool.request();
    r.input('sid', sql.Int, sessionId);
    r.input('uid', sql.NVarChar(255), req.user.id);

    await r.query(`DELETE FROM dbo.session_attendees WHERE session_id = @sid AND user_id = @uid;`);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /sessions/:id/leave error:', err);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

module.exports = router;
