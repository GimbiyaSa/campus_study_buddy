// backend/src/services/groupService.js
// Code-side hardening: detect columns/table variants; avoid referencing missing cols.

class GroupServiceError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'GroupServiceError';
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
    groups: 'study_groups',          // will switch to "groups" if it exists
    group_members: 'group_members',
    study_sessions: 'study_sessions',
    session_attendees: 'session_attendees',
  },
  groupsCols: {
    // dynamic picks (actual column names or null)
    nameCol: null,           // one of: name | group_name | title
    descriptionCol: null,    // one of: description | details | group_description | desc
    created_at: true,        // assumed
    last_activity: false,
    max_members: false,
    is_public: false,
    course: false,
    course_code: false,
    creator_id: false,
    creator_id_required: false,
    module_id: false,
    module_id_required: false,
  },
  membersCols: {
    role: false,
    joined_at: false,
    created_at: false,
    idCol: null, // one of: member_id | id | group_member_id
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

async function hasTable(name) {
  const { recordset } = await pool.request()
    .input('name', sql.NVarChar(128), name)
    .query(`SELECT 1 FROM sys.tables WHERE name = @name`);
  return recordset.length > 0;
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
  // pick groups table
  if (await hasTable('groups')) schema.tables.groups = 'groups';
  else if (await hasTable('study_groups')) schema.tables.groups = 'study_groups';

  const g = schema.tables.groups;

  // groups: pick name/description columns
  schema.groupsCols.nameCol = await firstExistingColumn(g, ['name', 'group_name', 'title']);
  schema.groupsCols.descriptionCol = await firstExistingColumn(g, ['description', 'details', 'group_description', 'desc']);
  schema.groupsCols.last_activity = await hasColumn(g, 'last_activity');
  schema.groupsCols.max_members = await hasColumn(g, 'max_members');
  schema.groupsCols.is_public = await hasColumn(g, 'is_public');
  schema.groupsCols.course = await hasColumn(g, 'course');
  schema.groupsCols.course_code = await hasColumn(g, 'course_code');
  schema.groupsCols.creator_id = await hasColumn(g, 'creator_id');
  schema.groupsCols.creator_id_required = schema.groupsCols.creator_id
    ? (await columnIsNotNullable(g, 'creator_id'))
    : false;
  schema.groupsCols.module_id = await hasColumn(g, 'module_id');
  schema.groupsCols.module_id_required = schema.groupsCols.module_id
    ? (await columnIsNotNullable(g, 'module_id'))
    : false;

  // group_members
  schema.membersCols.role = await hasColumn('group_members', 'role');
  schema.membersCols.joined_at = await hasColumn('group_members', 'joined_at');
  schema.membersCols.created_at = await hasColumn('group_members', 'created_at');
  schema.membersCols.idCol = await firstExistingColumn('group_members', ['member_id', 'id', 'group_member_id']);

  console.log('📐 groups table:', g);
  console.log('📐 groups cols:', schema.groupsCols);
  console.log('📐 group_members cols:', schema.membersCols);
}

const tbl = (name) => `dbo.${schema.tables[name]}`;

// helper: pick an ORDER BY column for membership chronology
function memberOrderExpr(alias = 'gm') {
  if (schema.membersCols.joined_at) return `${alias}.joined_at ASC`;
  if (schema.membersCols.created_at) return `${alias}.created_at ASC`;
  if (schema.membersCols.idCol) return `${alias}.${schema.membersCols.idCol} ASC`;
  return `${alias}.user_id ASC`;
}

// helper: ORDER BY for groups activity
function groupsOrderBy(alias = 'g') {
  if (schema.groupsCols.last_activity) return `ORDER BY ${alias}.last_activity DESC, ${alias}.created_at DESC`;
  return `ORDER BY ${alias}.created_at DESC`;
}

// Utility: pick a fallback module_id from existing rows if needed
async function pickFallbackModuleId() {
  const g = schema.tables.groups;
  if (!schema.groupsCols.module_id) return null;
  const r = await pool.request().query(`
    SELECT TOP 1 module_id AS mid
    FROM dbo.${g}
    WHERE module_id IS NOT NULL
    ORDER BY group_id ASC
  `);
  return r.recordset.length ? r.recordset[0].mid : null;
}

/* NEW: Detect allowed role literals from CHECK constraints */
async function detectAllowedRoleValues() {
  try {
    const q = await pool.request().query(`
      SELECT cc.definition
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('dbo.group_members')
        AND cc.definition LIKE '%role%'
    `);
    const defs = (q.recordset || []).map(r => String(r.definition || ''));
    const values = new Set();
    const re = /'([^']+)'/g;
    for (const d of defs) {
      let m;
      while ((m = re.exec(d)) !== null) values.add(m[1]);
    }
    return Array.from(values);
  } catch {
    return [];
  }
}

/* Prefer an "owner-ish" role if allowed; else fall back to first allowed */
function pickOwnerishRole(allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return null;
  const prefs = ['owner', 'admin', 'leader', 'creator'];
  for (const p of prefs) if (allowed.includes(p)) return p;
  return allowed[0];
}

// ---------- GET /groups ----------
router.get('/', authenticateToken, async (req, res) => {
  try {
    await getPool();
    const r = pool.request();
    r.input('userId', sql.NVarChar(255), req.user.id);

    const g = schema.tables.groups;
    const gc = schema.groupsCols;

    const createdByExpr = gc.creator_id
      ? `g.creator_id`
      : `(
        SELECT TOP 1 gm_owner.user_id
        FROM dbo.group_members gm_owner
        WHERE gm_owner.group_id = g.group_id
          ${schema.membersCols.role ? `AND gm_owner.role = 'owner'` : ''}
        ORDER BY ${memberOrderExpr('gm_owner')}
      )`;

    const selectPieces = [
      'g.group_id AS id',
      gc.nameCol ? `g.${gc.nameCol} AS name` : `NULL AS name`,
      gc.descriptionCol ? `g.${gc.descriptionCol} AS description` : `NULL AS description`,
      gc.course ? 'g.course' : 'NULL AS course',
      gc.course_code ? 'g.course_code AS courseCode' : 'NULL AS courseCode',
      gc.max_members ? 'g.max_members AS maxMembers' : 'NULL AS maxMembers',
      gc.is_public ? 'g.is_public AS isPublic' : 'CAST(1 AS bit) AS isPublic',
      'g.created_at AS createdAt',
      gc.last_activity ? 'g.last_activity AS lastActivity' : 'g.created_at AS lastActivity',
      `${createdByExpr} AS createdBy`,
      `(SELECT COUNT(*) FROM dbo.group_members gm WHERE gm.group_id = g.group_id) AS memberCount`,
      `(SELECT COUNT(*) FROM dbo.study_sessions s WHERE s.group_id = g.group_id) AS sessionCount`,
      `CASE WHEN EXISTS (
         SELECT 1 FROM dbo.group_members gm2 WHERE gm2.group_id = g.group_id AND gm2.user_id = @userId
       ) THEN 1 ELSE 0 END AS isMember`,
    ];

    const q = `
      SELECT
        ${selectPieces.join(',\n        ')}
      FROM dbo.${g} g
      ${groupsOrderBy('g')};
    `;

    const { recordset } = await r.query(q);

    res.json(recordset.map((x) => ({
      id: String(x.id),
      name: x.name,
      description: x.description,
      course: x.course ?? null,
      courseCode: x.courseCode ?? null,
      maxMembers: x.maxMembers ?? null,
      isPublic: !!x.isPublic,
      createdBy: x.createdBy ?? null,
      createdAt: x.createdAt,
      lastActivity: x.lastActivity,
      member_count: x.memberCount,
      session_count: x.sessionCount,
      isMember: !!x.isMember,
    })));
  } catch (err) {
    console.error('GET /groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// ---------- GET /groups/my-groups ----------
router.get('/my-groups', authenticateToken, async (req, res) => {
  try {
    await getPool();

    const r = pool.request();
    r.input('userId', sql.NVarChar(255), req.user.id);

    const g = schema.tables.groups;
    const gc = schema.groupsCols;

    const selectPieces = [
      'g.group_id AS id',
      gc.nameCol ? `g.${gc.nameCol} AS name` : `NULL AS name`,
      gc.descriptionCol ? `g.${gc.descriptionCol} AS description` : `NULL AS description`,
      gc.course ? 'g.course' : 'NULL AS course',
      gc.course_code ? 'g.course_code AS courseCode' : 'NULL AS courseCode',
      gc.max_members ? 'g.max_members AS maxMembers' : 'NULL AS maxMembers',
      gc.is_public ? 'g.is_public AS isPublic' : 'CAST(1 AS bit) AS isPublic',
      'g.created_at AS createdAt',
      gc.last_activity ? 'g.last_activity AS lastActivity' : 'g.created_at AS lastActivity',
    ];

    const q = `
      SELECT
        ${selectPieces.join(',\n        ')}
      FROM dbo.${g} g
      JOIN dbo.group_members gm ON gm.group_id = g.group_id
      WHERE gm.user_id = @userId
      ${groupsOrderBy('g')};
    `;

    const { recordset } = await r.query(q);

    res.json(recordset.map((x) => ({
      id: String(x.id),
      name: x.name,
      description: x.description,
      course: x.course ?? null,
      courseCode: x.courseCode ?? null,
      maxMembers: x.maxMembers ?? null,
      isPublic: !!x.isPublic,
      createdAt: x.createdAt,
      lastActivity: x.lastActivity,
    })));
  } catch (err) {
    console.error('GET /groups/my-groups error:', err);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

// ---------- POST /groups (create) ----------
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, maxMembers = 10, isPublic = true, course, courseCode, moduleId, module_id } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Group name is required' });
  }

  await getPool();

  const g = schema.tables.groups;
  const gc = schema.groupsCols;

  if (!gc.nameCol) {
    return res.status(500).json({ error: 'Server cannot find a suitable name/title column on groups table' });
  }

  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    let finalModuleId = module_id ?? moduleId ?? null;
    if (gc.module_id && finalModuleId == null && gc.module_id_required) {
      finalModuleId = await pickFallbackModuleId();
      if (finalModuleId == null) {
        await tx.rollback();
        return res.status(400).json({ error: 'module_id is required by schema and no fallback could be determined' });
      }
    }

    const cols = [gc.nameCol, 'created_at'];
    const vals = ['@name', 'SYSUTCDATETIME()'];

    if (gc.descriptionCol) { cols.push(gc.descriptionCol); vals.push('@description'); }
    if (gc.max_members)    { cols.push('max_members');    vals.push('@maxMembers'); }
    if (gc.is_public)      { cols.push('is_public');      vals.push('@isPublic'); }
    if (gc.course)         { cols.push('course');         vals.push('@course'); }
    if (gc.course_code)    { cols.push('course_code');    vals.push('@courseCode'); }
    if (gc.last_activity)  { cols.push('last_activity');  vals.push('SYSUTCDATETIME()'); }
    if (gc.creator_id)     { cols.push('creator_id');     vals.push('@creatorId'); }
    if (gc.module_id && finalModuleId != null) { cols.push('module_id'); vals.push('@moduleId'); }

    const r = new sql.Request(tx);
    r.input('name', sql.NVarChar(255), name.trim());
    r.input('description', sql.NVarChar(sql.MAX), description ?? null);
    r.input('maxMembers', sql.Int, Number(maxMembers) || 10);
    r.input('isPublic', sql.Bit, isPublic ? 1 : 0);
    r.input('course', sql.NVarChar(255), course ?? null);
    r.input('courseCode', sql.NVarChar(50), courseCode ?? null);
    if (gc.creator_id) r.input('creatorId', sql.NVarChar(255), req.user.id);
    if (gc.module_id && finalModuleId != null) r.input('moduleId', sql.Int, Number(finalModuleId));

    const ins = await r.query(`
      INSERT INTO dbo.${g} (${cols.join(', ')})
      OUTPUT INSERTED.group_id AS id, INSERTED.*
      VALUES (${vals.join(', ')});
    `);

    const created = ins.recordset[0];

    // add creator as member (prefer role column if present)
    const r2 = new sql.Request(tx);
    r2.input('groupId', sql.Int, created.id);
    r2.input('userId', sql.NVarChar(255), req.user.id);

    const mmCols = ['group_id', 'user_id'];
    const mmVals = ['@groupId', '@userId'];
    if (schema.membersCols.joined_at) { mmCols.push('joined_at'); mmVals.push('SYSUTCDATETIME()'); }
    else if (schema.membersCols.created_at) { mmCols.push('created_at'); mmVals.push('SYSUTCDATETIME()'); }

    if (schema.membersCols.role) {
      // Detect allowed role values from CHECK constraint and pick a safe one
      const allowed = await detectAllowedRoleValues();
      const roleVal = pickOwnerishRole(allowed) || null;
      if (roleVal) {
        r2.input('roleVal', sql.NVarChar(64), roleVal);
        mmCols.push('role');
        mmVals.push('@roleVal');
      }
      // If no roleVal could be determined, skip the column entirely
      // (assumes column is nullable or has a default that satisfies constraint)
    }

    await r2.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.group_members WHERE group_id = @groupId AND user_id = @userId)
      BEGIN
        INSERT INTO dbo.group_members (${mmCols.join(', ')})
        VALUES (${mmVals.join(', ')});
      END
    `);

    await tx.commit();

    res.status(201).json({
      id: String(created.id),
      name,
      description: gc.descriptionCol ? created[gc.descriptionCol] : description ?? null,
      course: gc.course ? created.course : null,
      courseCode: gc.course_code ? created.course_code : null,
      maxMembers: gc.max_members ? created.max_members : null,
      isPublic: gc.is_public ? !!created.is_public : true,
      createdBy: gc.creator_id ? created.creator_id : req.user.id,
      createdAt: created.created_at,
      lastActivity: gc.last_activity ? created.last_activity : created.created_at,
    });
  } catch (err) {
    await tx.rollback();
    console.error('POST /groups error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// ---------- DELETE /groups/:groupId ----------
router.delete('/:groupId', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.groupId);
  if (Number.isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  await getPool();

  const g = schema.tables.groups;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    // verify ownership via creator_id if present, else group_members
    const c = new sql.Request(tx);
    c.input('groupId', sql.Int, groupId);
    c.input('userId', sql.NVarChar(255), req.user.id);
    const own = await c.query(`
      SELECT TOP 1 1 AS ok
      FROM dbo.${g} gx
      WHERE gx.group_id = @groupId
        ${schema.groupsCols.creator_id ? 'AND gx.creator_id = @userId' : 'AND 1=0'}
      UNION ALL
      SELECT TOP 1 1
      FROM dbo.group_members gm
      WHERE gm.group_id = @groupId
        ${schema.membersCols.role ? 'AND gm.role = \'owner\'' : ''}
        AND gm.user_id = @userId
    `);
    if (!own.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the owner can delete this group' });
    }

    // cascade deletes
    const r1 = new sql.Request(tx);
    r1.input('groupId', sql.Int, groupId);
    await r1.query(`
      DELETE sa FROM dbo.session_attendees sa
      JOIN dbo.study_sessions s ON s.session_id = sa.session_id
      WHERE s.group_id = @groupId;

      DELETE FROM dbo.study_sessions WHERE group_id = @groupId;
      DELETE FROM dbo.group_members WHERE group_id = @groupId;
      DELETE FROM dbo.${g} WHERE group_id = @groupId;
    `);

    await tx.commit();
    res.status(204).end();
  } catch (err) {
    await tx.rollback();
    console.error('DELETE /groups/:groupId error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ---------- POST /groups/:groupId/join ----------
router.post('/:groupId/join', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.groupId);
  if (Number.isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  try {
    await getPool();

    const r = pool.request();
    r.input('groupId', sql.Int, groupId);
    r.input('userId', sql.NVarChar(255), req.user.id);

    const g = schema.tables.groups;
    const gc = schema.groupsCols;

    // capacity check only if max_members exists
    if (gc.max_members) {
      const cap = await r.query(`
        SELECT g.max_members AS maxMembers,
               (SELECT COUNT(*) FROM dbo.group_members gm WHERE gm.group_id = g.group_id) AS memberCount
        FROM dbo.${g} g WHERE g.group_id = @groupId
      `);
      if (!cap.recordset.length) return res.status(404).json({ error: 'Group not found' });
      const { maxMembers, memberCount } = cap.recordset[0];
      if (maxMembers && memberCount >= maxMembers) {
        return res.status(409).json({ error: 'Group is full' });
      }
    } else {
      const exists = await r.query(`SELECT 1 FROM dbo.${g} WHERE group_id = @groupId`);
      if (!exists.recordset.length) return res.status(404).json({ error: 'Group not found' });
    }

    // upsert membership
    const mmCols = ['group_id', 'user_id'];
    const mmVals = ['@groupId', '@userId'];
    if (schema.membersCols.joined_at) { mmCols.push('joined_at'); mmVals.push('SYSUTCDATETIME()'); }
    else if (schema.membersCols.created_at) { mmCols.push('created_at'); mmVals.push('SYSUTCDATETIME()'); }

    await r.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.group_members WHERE group_id = @groupId AND user_id = @userId)
      BEGIN
        INSERT INTO dbo.group_members (${mmCols.join(', ')})
        VALUES (${mmVals.join(', ')});
      END;

      ${gc.last_activity ? `UPDATE dbo.${g} SET last_activity = SYSUTCDATETIME() WHERE group_id = @groupId;` : ''}
    `);

    res.status(204).end();
  } catch (err) {
    console.error('POST /groups/:groupId/join error:', err);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// ---------- POST /groups/:groupId/leave ----------
router.post('/:groupId/leave', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.groupId);
  if (Number.isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  try {
    await getPool();

    const r = pool.request();
    r.input('groupId', sql.Int, groupId);
    r.input('userId', sql.NVarChar(255), req.user.id);

    // prevent owner from leaving if others exist
    const own = await r.query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.group_members gm WHERE gm.group_id = g.group_id) AS memberCount,
        CASE WHEN ${
          schema.groupsCols.creator_id
            ? 'g.creator_id = @userId'
            : `EXISTS (SELECT 1 FROM dbo.group_members gm2
                       WHERE gm2.group_id = g.group_id AND gm2.user_id = @userId
                       ${schema.membersCols.role ? `AND gm2.role = 'owner'` : ''})`
        } THEN 1 ELSE 0 END AS isOwner
      FROM ${tbl('groups')} g WHERE g.group_id = @groupId
    `);
    if (!own.recordset.length) return res.status(404).json({ error: 'Group not found' });
    const { isOwner, memberCount } = own.recordset[0];
    if (isOwner && memberCount > 1) {
      return res.status(403).json({ error: 'Owner cannot leave while group has members. Transfer ownership or delete the group.' });
    }

    await r.query(`
      DELETE FROM dbo.group_members WHERE group_id = @groupId AND user_id = @userId;
      ${schema.groupsCols.last_activity
        ? `UPDATE ${tbl('groups')} SET last_activity = SYSUTCDATETIME() WHERE group_id = @groupId;`
        : ''}
    `);

    res.status(204).end();
  } catch (err) {
    console.error('POST /groups/:groupId/leave error:', err);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

module.exports = router;
