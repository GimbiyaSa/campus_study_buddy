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
    groups: 'study_groups', // will switch to "groups" if it exists
    group_members: 'group_members',
    study_sessions: 'study_sessions',
    session_attendees: 'session_attendees',
  },
  groupsCols: {
    nameCol: null, // one of: name | group_name | title
    descriptionCol: null, // one of: description | details | group_description | desc
    created_at: true, // assumed
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
    role_required: false, // NEW: detect NOT NULL
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

async function columnIsNotNullable(table, col) {
  const { recordset } = await pool
    .request()
    .input('tbl', sql.NVarChar(256), table)
    .input('col', sql.NVarChar(128), col).query(`
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
  if (await hasTable('groups')) schema.tables.groups = 'groups';
  else if (await hasTable('study_groups')) schema.tables.groups = 'study_groups';

  const g = schema.tables.groups;

  schema.groupsCols.nameCol = await firstExistingColumn(g, ['name', 'group_name', 'title']);
  schema.groupsCols.descriptionCol = await firstExistingColumn(g, [
    'description',
    'details',
    'group_description',
    'desc',
  ]);
  schema.groupsCols.last_activity = await hasColumn(g, 'last_activity');
  schema.groupsCols.max_members = await hasColumn(g, 'max_members');
  schema.groupsCols.is_public = await hasColumn(g, 'is_public');
  schema.groupsCols.course = await hasColumn(g, 'course');
  schema.groupsCols.course_code = await hasColumn(g, 'course_code');
  schema.groupsCols.creator_id = await hasColumn(g, 'creator_id');
  schema.groupsCols.creator_id_required = schema.groupsCols.creator_id
    ? await columnIsNotNullable(g, 'creator_id')
    : false;
  schema.groupsCols.module_id = await hasColumn(g, 'module_id');
  schema.groupsCols.module_id_required = schema.groupsCols.module_id
    ? await columnIsNotNullable(g, 'module_id')
    : false;

  // group_members
  schema.membersCols.role = await hasColumn('group_members', 'role');
  schema.membersCols.role_required = schema.membersCols.role
    ? await columnIsNotNullable('group_members', 'role')
    : false;
  schema.membersCols.joined_at = await hasColumn('group_members', 'joined_at');
  schema.membersCols.created_at = await hasColumn('group_members', 'created_at');
  schema.membersCols.idCol = await firstExistingColumn('group_members', [
    'member_id',
    'id',
    'group_member_id',
  ]);

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
  if (schema.groupsCols.last_activity)
    return `ORDER BY ${alias}.last_activity DESC, ${alias}.created_at DESC`;
  return `ORDER BY ${alias}.created_at DESC`;
}

// Utility: pick a fallback module_id from existing rows if needed
async function pickFallbackModuleId() {
  const g = schema.tables.groups;
  if (!schema.groupsCols.module_id) return null;

  const r1 = await pool.request().query(`
    SELECT TOP 1 module_id AS mid
    FROM dbo.${g}
    WHERE module_id IS NOT NULL
    ORDER BY group_id ASC
  `);
  if (r1.recordset.length) return r1.recordset[0].mid;

  if (await hasTable('modules')) {
    const r2 = await pool.request().query(`
      SELECT TOP 1 module_id AS mid
      FROM dbo.modules
      ORDER BY module_id ASC
    `);
    if (r2.recordset.length) return r2.recordset[0].mid;
  }

  return null;
}

/* --------------------------- modules helper bits --------------------------- */
async function modulesHasCol(col) {
  return hasColumn('modules', col);
}
async function modulesColRequired(col) {
  return columnIsNotNullable('modules', col);
}

/* Create/ensure a default module and return its id (runs inside the caller tx) */
async function ensureDefaultModuleId(tx) {
  if (process.env.DEFAULT_MODULE_ID) {
    const r = new sql.Request(tx);
    r.input('mid', sql.Int, Number(process.env.DEFAULT_MODULE_ID));
    const ok = await r.query(`SELECT module_id FROM dbo.modules WHERE module_id=@mid`);
    if (ok.recordset.length) return Number(ok.recordset[0].module_id);
  }

  const defCode = process.env.DEFAULT_MODULE_CODE || 'GEN-DEFAULT';
  const defName = process.env.DEFAULT_MODULE_NAME || 'General';
  const defUniEnv = process.env.DEFAULT_MODULE_UNIVERSITY || null;

  {
    const r = new sql.Request(tx);
    r.input('code', sql.NVarChar(50), defCode);
    r.input('name', sql.NVarChar(255), defName);
    const hit = await r.query(`
      SELECT TOP 1 module_id AS id
      FROM dbo.modules
      WHERE LOWER(module_code)=LOWER(@code) OR LOWER(module_name)=LOWER(@name)
      ORDER BY module_id ASC
    `);
    if (hit.recordset.length) return Number(hit.recordset[0].id);
  }

  const hasUni = await modulesHasCol('university');
  const uniRequired = hasUni ? await modulesColRequired('university') : false;

  let uniToUse = defUniEnv;
  if (uniRequired && !uniToUse) {
    const uq = await new sql.Request(tx).query(`
      SELECT TOP 1 university AS uni
      FROM dbo.modules
      WHERE university IS NOT NULL
      ORDER BY module_id ASC
    `);
    uniToUse = uq.recordset[0]?.uni || 'General';
  }

  const hasIsActive = await modulesHasCol('is_active');
  const hasCreatedAt = await modulesHasCol('created_at');
  const hasUpdatedAt = await modulesHasCol('updated_at');

  const r = new sql.Request(tx);
  r.input('code', sql.NVarChar(50), defCode);
  r.input('name', sql.NVarChar(255), defName);
  r.input('desc', sql.NVarChar(sql.MAX), 'Default module');
  if (hasUni && uniToUse) r.input('uni', sql.NVarChar(255), uniToUse);

  const cols = ['module_code', 'module_name', 'description'];
  const vals = ['@code', '@name', '@desc'];
  if (hasUni && uniToUse) {
    cols.push('university');
    vals.push('@uni');
  }
  if (hasIsActive) {
    cols.push('is_active');
    vals.push('1');
  }
  if (hasCreatedAt) {
    cols.push('created_at');
    vals.push('SYSUTCDATETIME()');
  }
  if (hasUpdatedAt) {
    cols.push('updated_at');
    vals.push('SYSUTCDATETIME()');
  }

  const ins = await r.query(`
    INSERT INTO dbo.modules (${cols.join(', ')})
    OUTPUT inserted.module_id AS id
    VALUES (${vals.join(', ')})
  `);
  return ins.recordset[0]?.id ? Number(ins.recordset[0].id) : null;
}

/* Resolve / create a modules.module_id for group creation */
async function resolveModuleIdForGroupCreate({
  tx,
  moduleId,
  module_id,
  course,
  courseCode,
  university,
}) {
  const explicit = module_id ?? moduleId;

  if (explicit != null) {
    const r = new sql.Request(tx);
    r.input('mid', sql.Int, Number(explicit));
    const found = await r.query(
      `SELECT module_id FROM dbo.modules WHERE module_id=@mid AND (is_active = 1 OR is_active IS NULL)`
    );
    return found.recordset.length ? Number(found.recordset[0].module_id) : null;
  }

  const code = courseCode ? String(courseCode).trim() : '';
  const name = course ? String(course).trim() : '';
  if (!code && !name) return null;

  {
    const r = new sql.Request(tx);
    if (code) r.input('code', sql.NVarChar(50), code);
    if (name) r.input('name', sql.NVarChar(255), name);
    if (university) r.input('uni', sql.NVarChar(255), university);

    const whereParts = [`(m.is_active = 1 OR m.is_active IS NULL)`];
    if (code) whereParts.push(`LOWER(m.module_code) = LOWER(@code)`);
    if (name) whereParts.push(`LOWER(m.module_name) = LOWER(@name)`);
    if (university) whereParts.push(`m.university = @uni`);

    const q = `
      SELECT TOP 1 m.module_id AS id
      FROM dbo.modules m
      WHERE ${whereParts.join(' AND ')}
      ORDER BY m.module_code ASC
    `;
    const hit = await r.query(q);
    if (hit.recordset.length) return Number(hit.recordset[0].id);
  }

  const hasUni = await modulesHasCol('university');
  const uniRequired = hasUni ? await modulesColRequired('university') : false;
  let uniToUse = university || null;

  if (uniRequired && !uniToUse) {
    const uniQ = await new sql.Request(tx).query(`
      SELECT TOP 1 university AS uni
      FROM dbo.modules
      WHERE university IS NOT NULL
      ORDER BY module_id ASC
    `);
    uniToUse = uniQ.recordset[0]?.uni || 'General';
  }

  const hasIsActive = await modulesHasCol('is_active');
  const hasCreatedAt = await modulesHasCol('created_at');
  const hasUpdatedAt = await modulesHasCol('updated_at');

  const r = new sql.Request(tx);
  if (code) r.input('code', sql.NVarChar(50), code);
  if (name) r.input('name', sql.NVarChar(255), name);
  if (hasUni && uniToUse) r.input('uni', sql.NVarChar(255), uniToUse);
  r.input('desc', sql.NVarChar(sql.MAX), null);

  const cols = [];
  const vals = [];

  if (code) {
    cols.push('module_code');
    vals.push('@code');
  }
  if (name) {
    cols.push('module_name');
    vals.push('@name');
  }
  cols.push('description');
  vals.push('@desc');
  if (hasUni && uniToUse) {
    cols.push('university');
    vals.push('@uni');
  }
  if (hasIsActive) {
    cols.push('is_active');
    vals.push('1');
  }
  if (hasCreatedAt) {
    cols.push('created_at');
    vals.push('SYSUTCDATETIME()');
  }
  if (hasUpdatedAt) {
    cols.push('updated_at');
    vals.push('SYSUTCDATETIME()');
  }

  const nonTrivial = cols.some((c) => c === 'module_code' || c === 'module_name');
  if (!nonTrivial) return null;

  const ins = await r.query(`
    INSERT INTO dbo.modules (${cols.join(', ')})
    OUTPUT inserted.module_id AS id
    VALUES (${vals.join(', ')})
  `);
  return ins.recordset[0]?.id ? Number(ins.recordset[0].id) : null;
}

/* -------------------------- role helper (NEW) -------------------------- */
async function detectAllowedMemberRoles() {
  if (!schema.membersCols.role) return [];
  const q = `
    SELECT cc.definition AS defn
    FROM sys.check_constraints cc
    JOIN sys.objects o ON o.object_id = cc.parent_object_id
    WHERE o.name = 'group_members'
  `;
  const { recordset } = await pool.request().query(q);
  const defs = (recordset || []).map((r) => String(r.defn || ''));

  const roles = new Set();
  for (const d of defs) {
    const m = d.match(/role[^\)]*IN\s*\(([^)]+)\)/i);
    if (m && m[1]) {
      m[1]
        .split(',')
        .map((s) => s.replace(/['"\s]/g, ''))
        .filter(Boolean)
        .forEach((x) => roles.add(x.toLowerCase()));
    }
  }
  return Array.from(roles);
}

function pickCreatorRole(allowed = []) {
  const pref = ['owner', 'admin', 'leader', 'moderator', 'creator', 'organizer', 'member'];
  for (const p of pref) if (allowed.includes(p)) return p;
  return allowed[0] || null;
}

/* --------------------------------- Routes --------------------------------- */

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

    res.json(
      recordset.map((x) => ({
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
      }))
    );
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
      gc.course_code ? 'g.course_code' : 'NULL AS courseCode',
      gc.max_members ? 'g.max_members AS maxMembers' : 'NULL AS maxMembers',
      gc.is_public ? 'g.is_public AS isPublic' : 'CAST(1 AS bit) AS isPublic',
      'g.created_at AS createdAt',
      gc.last_activity ? 'g.last_activity AS lastActivity' : 'g.created_at AS lastActivity',
      gc.creator_id ? 'g.creator_id AS createdBy' : 'NULL AS createdBy',
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

    res.json(
      recordset.map((x) => ({
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
      }))
    );
  } catch (err) {
    console.error('GET /groups/my-groups error:', err);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

// ---------- GET /groups/:groupId/members ----------
router.get('/:groupId/members', authenticateToken, async (req, res) => {
  await getPool();
  const groupId = Number(req.params.groupId);
  if (Number.isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

  const q = await pool.request().input('groupId', sql.Int, groupId).query(`
      SELECT 
        gm.user_id AS userId,
        ${schema.membersCols.role ? 'gm.role' : 'NULL'} AS role,
        COALESCE(u.first_name + ' ' + u.last_name, u.email) AS name
      FROM dbo.group_members gm
      LEFT JOIN dbo.users u ON u.user_id = gm.user_id
      WHERE gm.group_id = @groupId
      ORDER BY ${memberOrderExpr('gm')}
    `);

  res.json(q.recordset);
});

// ---------- POST /groups (create) ----------
router.post('/', authenticateToken, async (req, res) => {
  const {
    name,
    description,
    maxMembers = 10,
    isPublic = true,
    course,
    courseCode,
    moduleId,
    module_id,
    university,
  } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Group name is required' });
  }

  await getPool();

  const g = schema.tables.groups;
  const gc = schema.groupsCols;

  if (!gc.nameCol) {
    return res
      .status(500)
      .json({ error: 'Server cannot find a suitable name/title column on groups table' });
  }

  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const explicitProvided = module_id != null || moduleId != null;
    let finalModuleId = null;

    if (gc.module_id) {
      finalModuleId = await resolveModuleIdForGroupCreate({
        tx,
        moduleId,
        module_id,
        course,
        courseCode,
        university,
      });

      if (explicitProvided && finalModuleId == null) {
        await tx.rollback();
        return res.status(400).json({ error: 'Invalid module_id (module not found)' });
      }

      if (finalModuleId == null && gc.module_id_required) {
        finalModuleId = await pickFallbackModuleId();
        if (finalModuleId == null) finalModuleId = await ensureDefaultModuleId(tx);
        if (finalModuleId == null) {
          await tx.rollback();
          return res.status(400).json({
            error: 'module_id is required by schema and no fallback could be determined',
          });
        }
      }
    }

    const cols = [gc.nameCol, 'created_at'];
    const vals = ['@name', 'SYSUTCDATETIME()'];

    if (gc.descriptionCol) { cols.push(gc.descriptionCol); vals.push('@description'); }
    if (gc.max_members)   { cols.push('max_members');      vals.push('@maxMembers'); }
    if (gc.is_public)     { cols.push('is_public');        vals.push('@isPublic'); }
    if (gc.course)        { cols.push('course');           vals.push('@course'); }
    if (gc.course_code)   { cols.push('course_code');      vals.push('@courseCode'); }
    if (gc.last_activity) { cols.push('last_activity');    vals.push('SYSUTCDATETIME()'); }
    if (gc.creator_id)    { cols.push('creator_id');       vals.push('@creatorId'); }
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

    const r2 = new sql.Request(tx);
    r2.input('groupId', sql.Int, created.id);
    r2.input('userId', sql.NVarChar(255), req.user.id);

    const mmCols = ['group_id', 'user_id'];
    const mmVals = ['@groupId', '@userId'];
    if (schema.membersCols.joined_at) { mmCols.push('joined_at'); mmVals.push('SYSUTCDATETIME()'); }
    else if (schema.membersCols.created_at) { mmCols.push('created_at'); mmVals.push('SYSUTCDATETIME()'); }

    if (schema.membersCols.role) {
      const allowed = await detectAllowedMemberRoles();
      const chosen = pickCreatorRole(allowed);
      if (schema.membersCols.role_required || chosen) {
        const roleToUse = chosen || 'member';
        mmCols.push('role');
        mmVals.push('@creatorRole');
        r2.input('creatorRole', sql.NVarChar(50), roleToUse);
      }
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
      description: schema.groupsCols.descriptionCol
        ? created[schema.groupsCols.descriptionCol]
        : description ?? null,
      course: gc.course ? created.course : null,
      courseCode: gc.course_code ? created.course_code : null,
      maxMembers: gc.max_members ? created.max_members : null,
      isPublic: gc.is_public ? !!created.is_public : true,
      createdBy: gc.creator_id ? created.creator_id : req.user.id,
      createdAt: created.created_at,
      lastActivity: gc.last_activity ? created.last_activity : created.created_at,
    });
  } catch (err) {
    try { await tx.rollback(); } catch {}
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
        ${schema.membersCols.role ? "AND gm.role = 'owner'" : ''}
        AND gm.user_id = @userId
    `);
    if (!own.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the owner can delete this group' });
    }

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
    try { await tx.rollback(); } catch {}
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

    const mmCols = ['group_id', 'user_id'];
    const mmVals = ['@groupId', '@userId'];
    if (schema.membersCols.joined_at) {
      mmCols.push('joined_at'); mmVals.push('SYSUTCDATETIME()');
    } else if (schema.membersCols.created_at) {
      mmCols.push('created_at'); mmVals.push('SYSUTCDATETIME()');
    }

    await r.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.group_members WHERE group_id = @groupId AND user_id = @userId)
      BEGIN
        INSERT INTO dbo.group_members (${mmCols.join(', ')})
        VALUES (${mmVals.join(', ')});
      END;

      ${
        gc.last_activity
          ? `UPDATE dbo.${g} SET last_activity = SYSUTCDATETIME() WHERE group_id = @groupId;`
          : ''
      }
    `);

    res.status(204).end();
  } catch (err) {
    console.error('POST /groups/:groupId/join error:', err);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// ---------- (Group-scoped) POST /groups/:groupId/sessions ----------
router.post('/:groupId/sessions', authenticateToken, async (req, res) => {
  try {
    await getPool();

    const groupId = Number(req.params.groupId);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }

    const { title, description, startTime, endTime, location, type } = req.body;

    if (!title || !startTime || !endTime || !location) {
      return res
        .status(400)
        .json({ error: 'title, startTime, endTime, and location are required' });
    }
    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({ error: 'endTime must be after startTime' });
    }

    const gq = await pool.request().input('groupId', sql.Int, groupId).query(`
        SELECT 
          g.group_id AS id,
          ${schema.groupsCols.course ? 'g.course' : 'NULL'} AS course,
          ${schema.groupsCols.course_code ? 'g.course_code' : 'NULL'} AS courseCode,
          ${schema.groupsCols.max_members ? 'g.max_members' : 'NULL'} AS maxMembers
        FROM ${tbl('groups')} g
        WHERE g.group_id = @groupId
      `);

    if (!gq.recordset.length) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const grow = gq.recordset[0];

    const tx = new sql.Transaction(pool);
    await tx.begin();

    const r = new sql.Request(tx);
    r.input('groupId', sql.Int, groupId);
    r.input('organizerId', sql.NVarChar(255), req.user.id);
    r.input('sessionTitle', sql.NVarChar(255), String(title).trim());
    r.input('description', sql.NVarChar(sql.MAX), description ?? null);
    r.input('scheduledStart', sql.DateTime2, new Date(startTime));
    r.input('scheduledEnd', sql.DateTime2, new Date(endTime));
    r.input('location', sql.NVarChar(500), String(location).trim());
    r.input('sessionType', sql.NVarChar(50), (type || 'study').toString());

    const ins = await r.query(`
      INSERT INTO dbo.study_sessions
        (group_id, organizer_id, session_title, description, scheduled_start, scheduled_end, location, session_type, status, created_at, updated_at)
      OUTPUT 
        inserted.session_id AS id,
        inserted.group_id   AS groupId,
        inserted.session_title AS title,
        CONVERT(VARCHAR(10), inserted.scheduled_start, 23) AS date,
        LEFT(CONVERT(VARCHAR(8), inserted.scheduled_start, 108), 5) AS startTime,
        LEFT(CONVERT(VARCHAR(8), inserted.scheduled_end, 108), 5)   AS endTime,
        inserted.location,
        inserted.session_type AS [type],
        inserted.status AS status
      VALUES (@groupId, @organizerId, @sessionTitle, @description, @scheduledStart, @scheduledEnd, @location, @sessionType, 'scheduled', SYSUTCDATETIME(), SYSUTCDATETIME())
    `);

    const created = ins.recordset[0];

    const rsvp = new sql.Request(tx);
    rsvp.input('sessionId', sql.Int, created.id);
    rsvp.input('userId', sql.NVarChar(255), req.user.id);
    await rsvp.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.session_attendees WHERE session_id=@sessionId AND user_id=@userId)
      BEGIN
        INSERT INTO dbo.session_attendees (session_id, user_id, attendance_status, responded_at)
        VALUES (@sessionId, @userId, 'attending', SYSUTCDATETIME());
      END
    `);

    if (schema.groupsCols.last_activity) {
      await new sql.Request(tx)
        .input('groupId', sql.Int, groupId)
        .query(
          `UPDATE ${tbl('groups')} SET last_activity = SYSUTCDATETIME() WHERE group_id=@groupId`
        );
    }

    await tx.commit();

    const flags = await pool
      .request()
      .input('groupId', sql.Int, created.groupId)
      .input('userId', sql.NVarChar(255), req.user.id).query(`
        SELECT 
          CASE
            WHEN EXISTS (
              SELECT 1 FROM dbo.group_members gm
              WHERE gm.group_id=@groupId AND gm.user_id=@userId
              ${schema.membersCols.role ? `AND gm.role IN ('owner','admin','moderator')` : ''}
            ) THEN 1 ELSE 0
          END AS isGroupOwner
      `);

    const isGroupOwner = !!flags.recordset[0]?.isGroupOwner;

    res.status(201).json({
      ...created,
      id: String(created.id),
      status: created.status === 'scheduled' ? 'upcoming' : created.status,
      participants: 1,
      maxParticipants: grow.maxMembers ?? null,
      isCreator: true,
      isAttending: true,
      isGroupOwner,
      course: grow.course ?? null,
      courseCode: grow.courseCode ?? null,
    });
  } catch (err) {
    try {
      if (err && err.transaction && err.transaction._aborted !== true) {
        await err.transaction.rollback();
      }
    } catch {}
    console.error('POST /groups/:groupId/sessions error:', err);
    res.status(500).json({ error: 'Failed to create session for group' });
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
      return res.status(403).json({
        error:
          'Owner cannot leave while group has members. Transfer ownership or delete the group.',
      });
    }

    await r.query(`
      DELETE FROM dbo.group_members WHERE group_id = @groupId AND user_id = @userId;
      ${
        schema.groupsCols.last_activity
          ? `UPDATE ${tbl('groups')} SET last_activity = SYSUTCDATETIME() WHERE group_id = @groupId;`
          : ''
      }
    `);

    res.status(204).end();
  } catch (err) {
    console.error('POST /groups/:groupId/leave error:', err);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

module.exports = router;
