// backend/src/services/sessionService.js
// Harden for missing created_by/max_participants/location/description, group_id NOT NULL, and joined_at;
// auto-provision group handles module_id if required (accepts moduleId/module_id from request).

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
    groups: 'study_groups',
  },
  sessionsCols: {
    created_by: false,
    max_participants: false,
    session_type: false,
    status: false,
    location: false,
    description: false,
    group_id: true,
    group_id_required: false,
  },
  attendeesCols: {
    joined_at: false,
    created_at: false,
    idCol: null,
  },
  groupsCols: {
    tableName: 'study_groups',
    nameCol: null,
    descriptionCol: null,
    creator_id: false,
    creator_id_required: false,
    is_public: false,
    module_id: false,
    module_id_required: false,
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

async function columnIsNotNullable(table, col) {
  const { recordset } = await pool.request()
    .input('tbl', sql.NVarChar(256), table)
    .input('col', sql.NVarChar(128), col)
    .query(`
      SELECT IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = @tbl
        AND COLUMN_NAME = @col
    `);
  if (!recordset.length) return false;
  return String(recordset[0].IS_NULLABLE).toUpperCase() === 'NO';
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
  schema.sessionsCols.group_id = await hasColumn('study_sessions', 'group_id');
  schema.sessionsCols.group_id_required = schema.sessionsCols.group_id
    ? (await columnIsNotNullable('study_sessions', 'group_id'))
    : false;

  // session_attendees
  schema.attendeesCols.joined_at = await hasColumn('session_attendees', 'joined_at');
  schema.attendeesCols.created_at = await hasColumn('session_attendees', 'created_at');
  schema.attendeesCols.idCol = await firstExistingColumn('session_attendees', ['attendee_id', 'id', 'session_attendee_id']);

  // groups (for auto-provision)
  const groupsTable = (await hasColumn('groups', 'group_id')) ? 'groups' : 'study_groups';
  schema.tables.groups = groupsTable;
  schema.groupsCols.tableName = groupsTable;
  schema.groupsCols.nameCol = await firstExistingColumn(groupsTable, ['name', 'group_name', 'title']);
  schema.groupsCols.descriptionCol = await firstExistingColumn(groupsTable, ['description', 'details', 'group_description', 'desc']);
  schema.groupsCols.creator_id = await hasColumn(groupsTable, 'creator_id');
  schema.groupsCols.creator_id_required = schema.groupsCols.creator_id
    ? (await columnIsNotNullable(groupsTable, 'creator_id'))
    : false;
  schema.groupsCols.is_public = await hasColumn(groupsTable, 'is_public');
  schema.groupsCols.module_id = await hasColumn(groupsTable, 'module_id');
  schema.groupsCols.module_id_required = schema.groupsCols.module_id
    ? (await columnIsNotNullable(groupsTable, 'module_id'))
    : false;

  console.log('📐 study_sessions cols:', schema.sessionsCols);
  console.log('📐 session_attendees cols:', schema.attendeesCols);
  console.log('📐 groups cols for session provisioning:', schema.groupsCols);
}

// helper: expression to get session creator id
function ownerExpr(alias = 's') {
  if (schema.sessionsCols.created_by) return `${alias}.created_by`;
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

// Fallback module_id selector (reuse any existing valid FK in groups)
async function pickFallbackModuleId(tx) {
  if (!schema.groupsCols.module_id) return null;
  const gTable = schema.groupsCols.tableName;
  const r = await new sql.Request(tx).query(`
    SELECT TOP 1 module_id AS mid
    FROM dbo.${gTable}
    WHERE module_id IS NOT NULL
    ORDER BY group_id ASC
  `);
  return r.recordset.length ? r.recordset[0].mid : null;
}

// Ensure a per-user personal group exists when sessions require a group_id
// Accept optional moduleIdOverride to satisfy NOT NULL module_id schemas.
async function ensurePersonalGroupForUser(tx, userId, moduleIdOverride = null) {
  const gTable = schema.groupsCols.tableName;
  const nameCol = schema.groupsCols.nameCol || 'group_name';
  const personalName = `Personal study sessions`;

  // Try to find by creator_id (if present) OR by name + membership
  const rFind = new sql.Request(tx);
  rFind.input('uid', sql.NVarChar(255), userId);
  rFind.input('pname', sql.NVarChar(255), personalName);

  const byCreatorSql = schema.groupsCols.creator_id
    ? `SELECT TOP 1 g.group_id AS id FROM dbo.${gTable} g WHERE g.${nameCol} = @pname AND g.creator_id = @uid`
    : `SELECT TOP 1 g.group_id AS id FROM dbo.${gTable} g
         JOIN dbo.group_members gm ON gm.group_id = g.group_id AND gm.user_id = @uid
       WHERE g.${nameCol} = @pname`;

  let existing = await rFind.query(byCreatorSql);
  if (existing.recordset.length) return existing.recordset[0].id;

  // Need a module_id if schema requires it
  let moduleIdForPersonal = null;
  if (schema.groupsCols.module_id && schema.groupsCols.module_id_required) {
    if (moduleIdOverride != null) {
      moduleIdForPersonal = Number(moduleIdOverride);
    } else {
      moduleIdForPersonal = await pickFallbackModuleId(tx);
    }
    if (moduleIdForPersonal == null) {
      throw new SessionServiceError(
        'module_id is required by groups schema and no fallback could be determined',
        'MODULE_ID_REQUIRED',
        400
      );
    }
  }

  // Create if not found
  const rIns = new sql.Request(tx);
  rIns.input('pname', sql.NVarChar(255), personalName);
  rIns.input('uid', sql.NVarChar(255), userId);
  if (moduleIdForPersonal != null) rIns.input('mid', sql.Int, Number(moduleIdForPersonal));

  const cols = [nameCol, 'created_at'];
  const vals = ['@pname', 'SYSUTCDATETIME()'];
  if (schema.groupsCols.is_public) { cols.push('is_public'); vals.push('0'); }
  if (schema.groupsCols.creator_id) { cols.push('creator_id'); vals.push('@uid'); }
  if (schema.groupsCols.module_id && moduleIdForPersonal != null) { cols.push('module_id'); vals.push('@mid'); }

  const ins = await rIns.query(`
    INSERT INTO dbo.${gTable} (${cols.join(', ')})
    OUTPUT INSERTED.group_id AS id
    VALUES (${vals.join(', ')});
  `);
  const newId = ins.recordset[0].id;

  // Add user as member/owner
  const rMem = new sql.Request(tx);
  rMem.input('gid', sql.Int, newId);
  rMem.input('uid', sql.NVarChar(255), userId);

  const gmCols = ['group_id', 'user_id'];
  const gmVals = ['@gid', '@uid'];
  const gmHasJoined = await hasColumn('group_members', 'joined_at');
  const gmHasCreated = await hasColumn('group_members', 'created_at');
  if (gmHasJoined) { gmCols.push('joined_at'); gmVals.push('SYSUTCDATETIME()'); }
  else if (gmHasCreated) { gmCols.push('created_at'); gmVals.push('SYSUTCDATETIME()'); }
  const gmHasRole = await hasColumn('group_members', 'role');
  if (gmHasRole) { gmCols.push('role'); gmVals.push(`'owner'`); }

  await rMem.query(`
    INSERT INTO dbo.group_members (${gmCols.join(', ')})
    VALUES (${gmVals.join(', ')});
  `);

  return newId;
}

/* ---------- GET / (list) ---------- */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { groupId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const pool = getPool();
    await bumpStatuses(pool); // keep statuses fresh on read

    const request = pool.request();
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));
    request.input('userId', sql.Int, parseInt(req.user.id, 10));

    let whereClause = 'WHERE 1=1';
    if (groupId) {
      request.input('groupId', sql.Int, groupId);
      whereClause += ' AND ss.group_id = @groupId';
    }
    if (status) {
      request.input('status', sql.NVarChar(50), status);
      whereClause += ` AND ss.status IN (
        CASE WHEN @status='upcoming' THEN 'scheduled'
             WHEN @status='ongoing'  THEN 'in_progress'
             ELSE @status END
      )`;
    }
    if (startDate) {
      request.input('startDate', sql.DateTime2, startDate);
      whereClause += ' AND ss.scheduled_start >= @startDate';
    }
    if (endDate) {
      request.input('endDate', sql.DateTime2, endDate);
      whereClause += ' AND ss.scheduled_start <= @endDate';
    }

    const q = await request.query(`
      SELECT
        ss.session_id AS id,
        ss.group_id   AS groupId,
        ss.session_title AS title,
        ${ymd('ss.scheduled_start')} AS date,
        ${hhmm('ss.scheduled_start')} AS startTime,
        ${hhmm('ss.scheduled_end')}   AS endTime,
        ss.location,
        ss.session_type AS [type],
        ISNULL(ss.max_participants, 10) AS maxParticipants,
        SUM(CASE WHEN sa.attendance_status='attending' THEN 1 ELSE 0 END) AS participants,
        MAX(CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END) AS isCreator,
        MAX(CASE WHEN my_sa.user_id IS NULL THEN 0 ELSE 1 END) AS isAttending,
        MAX(CASE WHEN go.user_id IS NULL THEN 0 ELSE 1 END) AS isGroupOwner,
        CASE 
          WHEN ss.status='scheduled' THEN 'upcoming'
          WHEN ss.status='in_progress' THEN 'ongoing'
          ELSE ss.status
        END AS status,
        m.module_name AS course,
        m.module_code AS courseCode
      FROM study_sessions ss
      JOIN study_groups sg ON ss.group_id = sg.group_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN session_attendees sa    ON ss.session_id = sa.session_id
      LEFT JOIN session_attendees my_sa ON ss.session_id = my_sa.session_id 
        AND my_sa.user_id = @userId 
        AND my_sa.attendance_status = 'attending'
      LEFT JOIN group_members go ON go.group_id = ss.group_id
        AND go.user_id = @userId
        AND go.role IN ('owner','admin')
      ${whereClause}
      GROUP BY 
        ss.session_id, ss.group_id, ss.session_title, ss.scheduled_start, ss.scheduled_end, ss.location,
        ss.session_type, ss.max_participants, ss.organizer_id, ss.status,
        m.module_name, m.module_code
      ORDER BY ss.scheduled_start ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json(
      q.recordset.map((r) => ({
        ...r,
        id: String(r.id),
        status: mapStatus(r.status),
        isCreator: !!r.isCreator,
        isAttending: !!r.isAttending,
        isGroupOwner: !!r.isGroupOwner,
      }))
    );
  } catch (error) {
    console.error('Error fetching study sessions:', error);
    res.status(500).json({ error: 'Failed to fetch study sessions' });
  }
});

/* ---------- GET /:sessionId ---------- */
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    await bumpStatuses(pool);

    const request = pool.request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, parseInt(req.user.id, 10));

    const q = await request.query(`
      SELECT 
        ss.session_id AS id,
        ss.group_id   AS groupId,
        ss.session_title AS title,
        ${ymd('ss.scheduled_start')} AS date,
        ${hhmm('ss.scheduled_start')} AS startTime,
        ${hhmm('ss.scheduled_end')}   AS endTime,
        ss.location,
        ss.session_type AS [type],
        ISNULL(ss.max_participants, 10) AS maxParticipants,
        SUM(CASE WHEN sa.attendance_status='attending' THEN 1 ELSE 0 END) AS participants,
        MAX(CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END) AS isCreator,
        MAX(CASE WHEN my_sa.user_id IS NULL THEN 0 ELSE 1 END) AS isAttending,
        MAX(CASE WHEN go.user_id IS NULL THEN 0 ELSE 1 END) AS isGroupOwner,
        CASE 
          WHEN ss.status='scheduled' THEN 'upcoming'
          WHEN ss.status='in_progress' THEN 'ongoing'
          ELSE ss.status
        END AS status,
        m.module_name AS course,
        m.module_code AS courseCode
      FROM study_sessions ss
      JOIN study_groups sg ON ss.group_id = sg.group_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN session_attendees sa    ON ss.session_id = sa.session_id
      LEFT JOIN session_attendees my_sa ON ss.session_id = my_sa.session_id 
        AND my_sa.user_id = @userId
        AND my_sa.attendance_status = 'attending'
      LEFT JOIN group_members go ON go.group_id = ss.group_id
        AND go.user_id = @userId
        AND go.role IN ('owner','admin')
      WHERE ss.session_id = @sessionId
      GROUP BY 
        ss.session_id, ss.group_id, ss.session_title, ss.scheduled_start, ss.scheduled_end, ss.location,
        ss.session_type, ss.max_participants, ss.organizer_id, ss.status,
        m.module_name, m.module_code
    `);

    if (!q.recordset.length) return res.status(404).json({ error: 'Study session not found' });

    const row = q.recordset[0];
    res.json({
      ...row,
      id: String(row.id),
      status: mapStatus(row.status),
      isCreator: !!row.isCreator,
      isAttending: !!row.isAttending,
      isGroupOwner: !!row.isGroupOwner,
    });
  } catch (error) {
    console.error('Error fetching study session:', error);
    res.status(500).json({ error: 'Failed to fetch study session' });
  }
});

/* ---------- POST / (create) ---------- */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      group_id,
      session_title,
      description,
      scheduled_start,
      scheduled_end,
      location,
      session_type,
      maxParticipants,
      max_participants,
      groupId,
      group_id,
      moduleId,        // NEW: allow client to pass module for auto-provisioned group
      module_id,       // NEW: snake_case alias
    } = req.body;

    const finalTitle = (session_title || title || '').trim();
    const finalType = (session_type || type || (schema.sessionsCols.session_type ? 'study' : null));
    const finalMax = Number(max_participants ?? maxParticipants);
    const hasMax = schema.sessionsCols.max_participants && !Number.isNaN(finalMax);
    let groupIdNum = group_id ?? groupId ?? null;
    const moduleIdOverride = module_id ?? moduleId ?? null; // NEW

    if (!finalTitle || !startTime || !endTime) {
      return res.status(400).json({ error: 'title, startTime, endTime are required' });
    }

    await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    // If DB requires group_id but client didn't send it, create/reuse a personal group.
    // If module_id is required on groups, we use moduleIdOverride if provided.
    if (schema.sessionsCols.group_id && schema.sessionsCols.group_id_required && groupIdNum == null) {
      groupIdNum = await ensurePersonalGroupForUser(tx, req.user.id, moduleIdOverride);
    }

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
    if (sc.group_id && groupIdNum != null) { cols.push('group_id'); vals.push('@groupId'); }
    else if (sc.group_id && sc.group_id_required && groupIdNum == null) {
      await tx.rollback();
      return res.status(400).json({ error: 'groupId is required by server schema' });
    }
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

    res.json({ ok: true });
  } catch (error) {
    console.error('Error leaving session:', error);
    res.status(500).json({ error: 'Failed to leave session' });
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

    const q = await request.query(`
      UPDATE study_sessions
      SET ${sets.join(', ')}, updated_at=GETUTCDATE()
      OUTPUT 
        inserted.session_id AS id,
        inserted.group_id   AS groupId,
        inserted.session_title AS title,
        ${ymd('inserted.scheduled_start')} AS date,
        ${hhmm('inserted.scheduled_start')} AS startTime,
        ${hhmm('inserted.scheduled_end')}   AS endTime,
        inserted.location,
        inserted.session_type AS [type],
        ISNULL(inserted.max_participants, 10) AS maxParticipants,
        (SELECT COUNT(*) FROM session_attendees sa WHERE sa.session_id=inserted.session_id AND sa.attendance_status='attending') AS participants,
        CASE 
          WHEN inserted.status='scheduled' THEN 'upcoming'
          WHEN inserted.status='in_progress' THEN 'ongoing'
          ELSE inserted.status
        END AS status
      WHERE session_id=@sessionId
    `);

    const row = q.recordset[0];
    res.json({
      ...row,
      id: String(row.id),
      status: mapStatus(row.status),
      isCreator: true,
      isAttending: true,
    });
  } catch (error) {
    console.error('Error updating study session:', error);
    res.status(500).json({ error: 'Failed to update study session' });
  }
});

/* ---------- PUT /:sessionId/start ---------- */
router.put('/:sessionId/start', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(36), req.user.id);

    const org = await request.query(
      `SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`
    );
    if (!org.recordset.length)
      return res.status(403).json({ error: 'Only the session organizer can start the session' });
    if (org.recordset[0].status !== 'scheduled')
      return res.status(400).json({ error: 'Session is not in scheduled status' });

    const q = await request.query(`
      UPDATE study_sessions 
      SET status='in_progress', actual_start=GETUTCDATE(), updated_at=GETUTCDATE()
      OUTPUT inserted.*
      WHERE session_id=@sessionId
    `);

    res.json(q.recordset[0]);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

/* ---------- PUT /:sessionId/end ---------- */
router.put('/:sessionId/end', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(36), req.user.id);

    const org = await request.query(
      `SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`
    );
    if (!org.recordset.length)
      return res.status(403).json({ error: 'Only the session organizer can end the session' });
    if (org.recordset[0].status !== 'in_progress')
      return res.status(400).json({ error: 'Session is not currently in progress' });

    const q = await request.query(`
      UPDATE study_sessions 
      SET status='completed', actual_end=GETUTCDATE(), updated_at=GETUTCDATE()
      OUTPUT inserted.*
      WHERE session_id=@sessionId
    `);

    await request.query(`
      UPDATE session_attendees 
      SET attendance_status='attended'
      WHERE session_id=@sessionId AND attendance_status='attending'
    `);

    res.json(q.recordset[0]);
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/* ---------- PUT /:sessionId/cancel (organizer) ---------- */
router.put('/:sessionId/cancel', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(36), req.user.id);

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

/* ---------- DELETE /:sessionId (soft cancel) ---------- */
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  try {
    // Same as cancel to ensure "Cancelled" counts are reflected
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(36), req.user.id);

    const org = await request.query(
      `SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`
    );
    if (!org.recordset.length)
      return res
        .status(403)
        .json({ error: 'Only the session organizer can delete (cancel) the session' });

    const q = await request.query(`
      UPDATE study_sessions SET status='cancelled', updated_at=GETUTCDATE()
      OUTPUT inserted.session_id AS id,
             inserted.group_id   AS groupId,
             inserted.session_title AS title,
             ${ymd('inserted.scheduled_start')} AS date,
             ${hhmm('inserted.scheduled_start')} AS startTime,
             ${hhmm('inserted.scheduled_end')}   AS endTime,
             inserted.location,
             inserted.session_type AS [type],
             ISNULL(inserted.max_participants, 10) AS maxParticipants,
             (SELECT COUNT(*) FROM session_attendees sa WHERE sa.session_id=inserted.session_id AND sa.attendance_status='attending') AS participants,
             inserted.status AS status
      WHERE session_id=@sessionId
    `);

    const row = q.recordset[0];
    res.json({ ...row, id: String(row.id), status: mapStatus(row.status) });
  } catch (error) {
    console.error('Error deleting (cancelling) session:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

module.exports = router;
