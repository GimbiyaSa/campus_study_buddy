// backend/src/services/sessionService.js
const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');
const { notifySessionCancelled } = require('./notificationService');
const { logicAppsService } = require('./logicAppsService');

const router = express.Router();

/* ---------------- DB pool bootstrapping (matches Course service style) ---------------- */

let pool;

// Try Azure config first, then env connection string
async function initializeDatabase() {
  try {
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
    } catch (azureErr) {
      // Fallback to env var
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found');
      }
    }
  } catch (err) {
    console.error('❌ Database connection failed (sessions):', err);
    throw err;
  }
}

// Kick off connection now (same pattern your Course service uses)
initializeDatabase();

// Always return a ready pool
async function getPool() {
  if (!pool) {
    await initializeDatabase();
  }
  return pool;
}

/* ---------- helpers ---------- */
function mapStatus(dbStatus) {
  switch (dbStatus) {
    case 'scheduled':
      return 'upcoming';
    case 'in_progress':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'upcoming';
  }
}
function hhmm(expr) {
  return `LEFT(CONVERT(VARCHAR(8), ${expr}, 108), 5)`;
} // HH:mm
function ymd(expr) {
  return `CONVERT(VARCHAR(10), ${expr}, 23)`;
} // yyyy-mm-dd

// --- replace your current bumpStatuses with this ---
async function bumpStatuses() {
  try {
    const poolInstance = await getPool().catch(() => null);
    if (!poolInstance || typeof poolInstance.request !== 'function') {
      // Pool not ready; quietly skip
      return;
    }

    // scheduled -> in_progress
    await poolInstance.request().query(`
      UPDATE study_sessions
      SET status='in_progress',
          actual_start = COALESCE(actual_start, GETUTCDATE()),
          updated_at=GETUTCDATE()
      WHERE status='scheduled'
        AND scheduled_start <= GETUTCDATE()
        AND scheduled_end   >  GETUTCDATE()
    `);

    // scheduled|in_progress -> completed
    await poolInstance.request().query(`
      UPDATE study_sessions
      SET status='completed',
          actual_end = COALESCE(actual_end, GETUTCDATE()),
          updated_at=GETUTCDATE()
      WHERE status IN ('scheduled','in_progress')
        AND scheduled_end <= GETUTCDATE()
    `);
  } catch (e) {
    // Don’t block the request if this maintenance step fails
    console.warn('bumpStatuses skipped:', e?.message || e);
  }
}

/* ---------- GET / (list) ---------- */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { groupId, status, startDate, endDate, scope, limit = 50, offset = 0 } = req.query;

    const pool = await getPool();
    await bumpStatuses(); // keep statuses fresh on read

    const request = pool.request();
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));
    request.input('userId', sql.NVarChar(255), req.user.id);

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

    // Visibility: by default, only sessions I organize, I’m attending, or my group's sessions
    if (!scope || String(scope).toLowerCase() === 'mine') {
      whereClause += `  AND ( 
        ss.organizer_id = @userId
        OR my_sa.user_id IS NOT NULL
        OR gm.user_id IS NOT NULL
      )`;
    }

    const q = await request.query(`
      SELECT
        ss.session_id AS id,
        ss.group_id   AS groupId,
        ss.session_title AS title,
        ${ymd('ss.scheduled_start')} AS startISO,
        ${hhmm('ss.scheduled_start')} AS startISO,
        ${hhmm('ss.scheduled_end')}   AS endISO,
        ss.location,
        ss.session_type AS [type],
        sg.max_members AS maxParticipants,
        ISNULL(SUM(CASE WHEN sa.attendance_status='attending' THEN 1 ELSE 0 END), 0) AS participants,
        MAX(CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END) AS isCreator,
        MAX(CASE WHEN my_sa.user_id IS NULL THEN 0 ELSE 1 END) AS isAttending,
        MAX(CASE
          WHEN sg.creator_id = @userId THEN 1
          WHEN go.user_id IS NOT NULL THEN 1
          ELSE 0
        END) AS isGroupOwner,
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
      AND go.role IN ('admin','moderator')
      /* NEW: any active membership signals visibility */
      LEFT JOIN group_members gm ON gm.group_id = ss.group_id
      AND gm.user_id = @userId
      AND gm.status = 'active'
      ${whereClause}
      GROUP BY 
        ss.session_id, ss.group_id, ss.session_title, ss.scheduled_start, ss.scheduled_end, ss.location,
        ss.session_type, ss.organizer_id, ss.status,
        m.module_name, m.module_code, sg.max_members
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
    const pool = await getPool();
    await bumpStatuses();

    const request = pool.request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(255), req.user.id);

    const q = await request.query(`
      SELECT 
        ss.session_id AS id,
        ss.group_id   AS groupId,
        ss.session_title AS title,
        ${ymd('ss.scheduled_start')} AS startISO,
        ${hhmm('ss.scheduled_start')} AS startISO,
        ${hhmm('ss.scheduled_end')}   AS endISO,
        ss.location,
        ss.session_type AS [type],
        sg.max_members AS maxParticipants,
        ISNULL(SUM(CASE WHEN sa.attendance_status='attending' THEN 1 ELSE 0 END), 0) AS participants,
        MAX(CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END) AS isCreator,
        MAX(CASE WHEN my_sa.user_id IS NULL THEN 0 ELSE 1 END) AS isAttending,
        MAX(CASE
          WHEN sg.creator_id = @userId THEN 1
          WHEN go.user_id IS NOT NULL THEN 1
          ELSE 0
        END) AS isGroupOwner,
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
        AND go.role IN ('admin','moderator')
      WHERE ss.session_id = @sessionId
      GROUP BY 
        ss.session_id, ss.group_id, ss.session_title, ss.scheduled_start, ss.scheduled_end, ss.location,
        ss.session_type, ss.organizer_id, ss.status,
        m.module_name, m.module_code, sg.max_members
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
/* NOTE: create keeps OUTPUT on INSERT because your trigger is AFTER UPDATE only.
   If you ever add INSERT triggers to study_sessions, convert this to the same pattern as updates. */
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
    } = req.body;

    if (!session_title || !scheduled_start || !scheduled_end) {
      return res
        .status(400)
        .json({ error: 'session_title, scheduled_start and scheduled_end are required' });
    }
    if (new Date(scheduled_start) >= new Date(scheduled_end)) {
      return res.status(400).json({ error: 'scheduled_end must be after scheduled_start' });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('organizerId', sql.NVarChar(255), req.user.id);
    request.input('sessionTitle', sql.NVarChar(255), session_title);
    request.input('description', sql.NText, description || null);
    request.input('scheduledStart', sql.DateTime2, scheduled_start);
    request.input('scheduledEnd', sql.DateTime2, scheduled_end);
    request.input('location', sql.NVarChar(500), location || null);
    request.input('sessionType', sql.NVarChar(50), session_type || 'study');

    if (group_id) {
      request.input('groupId', sql.Int, group_id);
    } else {
      const g = await request.query(`
        SELECT TOP 1 gm.group_id
        FROM group_members gm
        WHERE gm.user_id=@organizerId AND gm.status='active'
        ORDER BY gm.joined_at DESC
      `);
      if (!g.recordset.length)
        return res.status(400).json({ error: 'No active group found for user. Provide group_id.' });
      request.input('groupId', sql.Int, g.recordset[0].group_id);
    }

    const result = await request.query(`
      INSERT INTO study_sessions
        (group_id, organizer_id, session_title, description, scheduled_start, scheduled_end, location, session_type, status, created_at, updated_at)
      OUTPUT inserted.session_id AS id,
             inserted.group_id   AS groupId,
             inserted.session_title AS title,
             ${ymd('inserted.scheduled_start')} AS date,
             ${hhmm('inserted.scheduled_start')} AS startTime,
             ${hhmm('inserted.scheduled_end')}   AS endTime,
             inserted.location,
             inserted.session_type AS [type],
             inserted.status AS status
      VALUES (@groupId, @organizerId, @sessionTitle, @description, @scheduledStart, @scheduledEnd, @location, @sessionType, 'scheduled', GETUTCDATE(), GETUTCDATE())
    `);

    const created = result.recordset[0];

    // Auto-RSVP organizer
    const attendReq = pool.request();
    attendReq.input('sessionId', sql.Int, created.id);
    attendReq.input('userId', sql.NVarChar(255), req.user.id);
    await attendReq.query(`
      IF NOT EXISTS (SELECT 1 FROM session_attendees WHERE session_id=@sessionId AND user_id=@userId)
      INSERT INTO session_attendees (session_id, user_id, attendance_status, responded_at)
      VALUES (@sessionId, @userId, 'attending', GETUTCDATE())
    `);

    // Fetch maxParticipants from group
    const mpRes = await pool
      .request()
      .input('groupId', sql.Int, created.groupId)
      .query(`SELECT max_members AS maxParticipants FROM study_groups WHERE group_id=@groupId`);

    // Is this user a group owner/admin (creator OR admin/moderator)?
    const ownerRes = await pool
      .request()
      .input('groupId', sql.Int, created.groupId)
      .input('userId', sql.NVarChar(255), req.user.id)
      .query(
        `
        SELECT 1 AS ok
        WHERE EXISTS (SELECT 1 FROM study_groups WHERE group_id=@groupId AND creator_id=@userId)
           OR EXISTS (SELECT 1 FROM group_members WHERE group_id=@groupId AND user_id=@userId AND role IN ('admin','moderator'))
        `
      );

    // Create calendar event via Logic App (non-blocking)
    try {
      // Get organizer's email for calendar event
      const userRes = await pool
        .request()
        .input('userId', sql.NVarChar(255), req.user.id)
        .query('SELECT email FROM users WHERE user_id = @userId');
      
      if (userRes.recordset.length > 0) {
        const organizerEmail = userRes.recordset[0].email;
        
        // Create calendar event (async, don't wait)
        logicAppsService.createCalendarEvent({
          userEmail: organizerEmail,
          title: `📚 ${session_title}`,
          description: description || `Study session organized via Campus Study Buddy`,
          startTime: scheduled_start,
          endTime: scheduled_end,
          location: location || 'Online',
          attendees: [] // Will be populated when others join
        }).catch(err => {
          console.error('⚠️ Failed to create calendar event:', err.message);
        });
      }
    } catch (err) {
      console.error('⚠️ Calendar event creation failed:', err.message);
      // Don't fail the session creation if calendar fails
    }

    res.status(201).json({
      ...created,
      id: String(created.id),
      maxParticipants: mpRes.recordset[0]?.maxParticipants ?? 10,
      participants: 1, // organizer
      isCreator: true,
      isAttending: true,
      isGroupOwner: !!ownerRes.recordset.length,
      status: mapStatus(created.status),
    });
  } catch (error) {
    console.error('Error creating study session:', error);
    res.status(500).json({ error: 'Failed to create study session' });
  }
});

/* ---------- POST /:sessionId/join (Attend) ---------- */
router.post('/:sessionId/join', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(255), req.user.id);

    // Guard: session exists & not cancelled
    const s = await request.query(`SELECT status FROM study_sessions WHERE session_id=@sessionId`);
    if (!s.recordset.length) return res.status(404).json({ error: 'Session not found' });
    if (s.recordset[0].status === 'cancelled')
      return res.status(400).json({ error: 'Session is cancelled' });

    // Upsert attendance as "attending"
    const existing = await request.query(`
      SELECT attendance_id FROM session_attendees WHERE session_id=@sessionId AND user_id=@userId
    `);
    if (existing.recordset.length) {
      request.input('attendanceId', sql.Int, existing.recordset[0].attendance_id);
      await request.query(`
        UPDATE session_attendees
        SET attendance_status='attending', responded_at=GETUTCDATE()
        WHERE attendance_id=@attendanceId
      `);
    } else {
      await request.query(`
        INSERT INTO session_attendees (session_id, user_id, attendance_status, responded_at)
        VALUES (@sessionId, @userId, 'attending', GETUTCDATE())
      `);
    }

    // Add user to calendar event (non-blocking)
    try {
      // Get user's email and session details for calendar
      const userRes = await pool
        .request()
        .input('userId', sql.NVarChar(255), req.user.id)
        .query('SELECT email FROM users WHERE user_id = @userId');
      
      const sessionRes = await pool
        .request()
        .input('sessionId', sql.Int, req.params.sessionId)
        .query(`
          SELECT session_title, description, scheduled_start, scheduled_end, location
          FROM study_sessions 
          WHERE session_id = @sessionId
        `);
      
      if (userRes.recordset.length > 0 && sessionRes.recordset.length > 0) {
        const userEmail = userRes.recordset[0].email;
        const session = sessionRes.recordset[0];
        
        // Create calendar event for the new participant (async, don't wait)
        logicAppsService.createCalendarEvent({
          userEmail: userEmail,
          title: `📚 ${session.session_title}`,
          description: session.description || `Study session via Campus Study Buddy`,
          startTime: session.scheduled_start,
          endTime: session.scheduled_end,
          location: session.location || 'Online',
          attendees: []
        }).catch(err => {
          console.error('⚠️ Failed to create calendar event for participant:', err.message);
        });
      }
    } catch (err) {
      console.error('⚠️ Calendar event creation failed:', err.message);
      // Don't fail the join if calendar fails
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

/* ---------- DELETE /:sessionId/leave (Unattend) ---------- */
router.delete('/:sessionId/leave', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.NVarChar(255), req.user.id);

    // Organizer cannot leave
    const org = await request.query(
      `SELECT organizer_id FROM study_sessions WHERE session_id=@sessionId`
    );
    if (!org.recordset.length) return res.status(404).json({ error: 'Session not found' });
    if (org.recordset[0].organizer_id === req.user.id) {
      return res.status(400).json({ error: 'Organizer cannot leave their own session' });
    }

    await request.query(`
      DELETE FROM session_attendees WHERE session_id=@sessionId AND user_id=@userId
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error leaving session:', error);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

/* ---------- PUT /:sessionId (update, organizer only) ---------- */
router.put('/:sessionId', authenticateToken, async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const reqTx = new sql.Request(tx);
    reqTx.input('sessionId', sql.Int, req.params.sessionId);
    reqTx.input('userId', sql.NVarChar(255), req.user.id);

    const org = await reqTx.query(`
      SELECT organizer_id, status, group_id 
      FROM study_sessions 
      WHERE session_id=@sessionId AND organizer_id=@userId
    `);
    if (!org.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the session organizer can update the session' });
    }
    if (org.recordset[0].status === 'completed') {
      await tx.rollback();
      return res.status(400).json({ error: 'Cannot update a completed session' });
    }

    const { title, date, startTime, endTime, location, type, description } = req.body;
    const sets = [];
    if (title !== undefined) {
      sets.push('session_title=@sessionTitle');
      reqTx.input('sessionTitle', sql.NVarChar(255), title);
    }
    if (location !== undefined) {
      sets.push('location=@location');
      reqTx.input('location', sql.NVarChar(500), location || null);
    }
    if (type !== undefined) {
      sets.push('session_type=@sessionType');
      reqTx.input('sessionType', sql.NVarChar(50), type);
    }
    if (description !== undefined) {
      sets.push('description=@description');
      reqTx.input('description', sql.NText, description || null);
    }

    if (date !== undefined && startTime !== undefined) {
      const startIso = new Date(`${date}T${startTime}:00`);
      sets.push('scheduled_start=@scheduledStart');
      reqTx.input('scheduledStart', sql.DateTime2, startIso);
    }
    if (date !== undefined && endTime !== undefined) {
      const endIso = new Date(`${date}T${endTime}:00`);
      sets.push('scheduled_end=@scheduledEnd');
      reqTx.input('scheduledEnd', sql.DateTime2, endIso);
    }

    if (!sets.length) {
      await tx.rollback();
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await reqTx.query(`
      UPDATE study_sessions
      SET ${sets.join(', ')}, updated_at=GETUTCDATE()
      WHERE session_id=@sessionId
    `);

    // Read back AFTER trigger runs
    const read = await new sql.Request(tx)
      .input('sessionId', sql.Int, req.params.sessionId)
      .input('userId', sql.NVarChar(255), req.user.id).query(`
        SELECT
          ss.session_id AS id,
          ss.group_id   AS groupId,
          ss.session_title AS title,
          ${ymd('ss.scheduled_start')} AS startISO,
          ${hhmm('ss.scheduled_start')} AS startISO,
          ${hhmm('ss.scheduled_end')}   AS endISO,
          ss.location,
          ss.session_type AS [type],
          ss.status AS status
        FROM study_sessions ss
        WHERE ss.session_id=@sessionId
      `);

    const row = read.recordset[0];

    // Fetch maxParticipants + participants with separate requests inside the tx
    const mpRes = await new sql.Request(tx)
      .input('groupId', sql.Int, row.groupId)
      .query(`SELECT max_members AS maxParticipants FROM study_groups WHERE group_id=@groupId`);

    const partRes = await new sql.Request(tx)
      .input('sessionId', sql.Int, row.id)
      .query(
        `SELECT COUNT(*) AS participants FROM session_attendees WHERE session_id=@sessionId AND attendance_status='attending'`
      );

    await tx.commit();

    res.json({
      ...row,
      id: String(row.id),
      maxParticipants: mpRes.recordset[0]?.maxParticipants ?? 10,
      participants: partRes.recordset[0]?.participants ?? 0,
      status: mapStatus(row.status),
      isCreator: true,
      isAttending: true,
    });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    console.error('Error updating study session:', error);
    res.status(500).json({ error: 'Failed to update study session' });
  }
});

/* ---------- PUT /:sessionId/start ---------- */
router.put('/:sessionId/start', authenticateToken, async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const reqTx = new sql.Request(tx);
    reqTx.input('sessionId', sql.Int, req.params.sessionId);
    reqTx.input('userId', sql.NVarChar(255), req.user.id);

    const org = await reqTx.query(`
      SELECT organizer_id, status, group_id 
      FROM study_sessions 
      WHERE session_id=@sessionId AND organizer_id=@userId
    `);
    if (!org.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the session organizer can start the session' });
    }
    if (org.recordset[0].status !== 'scheduled') {
      await tx.rollback();
      return res.status(400).json({ error: 'Session is not in scheduled status' });
    }

    await reqTx.query(`
      UPDATE study_sessions 
      SET status='in_progress', actual_start=GETUTCDATE(), updated_at=GETUTCDATE()
      WHERE session_id=@sessionId
    `);

    const read = await new sql.Request(tx)
      .input('sessionId', sql.Int, req.params.sessionId)
      .query(
        `SELECT session_id AS id, group_id AS groupId, status FROM study_sessions WHERE session_id=@sessionId`
      );

    const row = read.recordset[0];

    const mpRes = await new sql.Request(tx)
      .input('groupId', sql.Int, row.groupId)
      .query(`SELECT max_members AS maxParticipants FROM study_groups WHERE group_id=@groupId`);

    await tx.commit();

    res.json({
      id: String(row.id),
      groupId: row.groupId,
      status: mapStatus(row.status),
      maxParticipants: mpRes.recordset[0]?.maxParticipants ?? 10,
    });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

/* ---------- PUT /:sessionId/end ---------- */
router.put('/:sessionId/end', authenticateToken, async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const reqTx = new sql.Request(tx);
    reqTx.input('sessionId', sql.Int, req.params.sessionId);
    reqTx.input('userId', sql.NVarChar(255), req.user.id);

    const org = await reqTx.query(`
      SELECT organizer_id, status, group_id 
      FROM study_sessions 
      WHERE session_id=@sessionId AND organizer_id=@userId
    `);
    if (!org.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the session organizer can end the session' });
    }
    if (org.recordset[0].status !== 'in_progress') {
      await tx.rollback();
      return res.status(400).json({ error: 'Session is not currently in progress' });
    }

    await reqTx.query(`
      UPDATE study_sessions 
      SET status='completed', actual_end=GETUTCDATE(), updated_at=GETUTCDATE()
      WHERE session_id=@sessionId
    `);

    await new sql.Request(tx).input('sessionId', sql.Int, req.params.sessionId).query(`
        UPDATE session_attendees 
        SET attendance_status='attended'
        WHERE session_id=@sessionId AND attendance_status='attending'
      `);

    const read = await new sql.Request(tx)
      .input('sessionId', sql.Int, req.params.sessionId)
      .query(
        `SELECT session_id AS id, group_id AS groupId, status FROM study_sessions WHERE session_id=@sessionId`
      );

    const row = read.recordset[0];

    const mpRes = await new sql.Request(tx)
      .input('groupId', sql.Int, row.groupId)
      .query(`SELECT max_members AS maxParticipants FROM study_groups WHERE group_id=@groupId`);

    await tx.commit();

    res.json({
      id: String(row.id),
      groupId: row.groupId,
      status: mapStatus(row.status),
      maxParticipants: mpRes.recordset[0]?.maxParticipants ?? 10,
    });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/* ---------- PUT /:sessionId/cancel (organizer) ---------- */
router.put('/:sessionId/cancel', authenticateToken, async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const reqTx = new sql.Request(tx);
    reqTx.input('sessionId', sql.Int, req.params.sessionId);
    reqTx.input('userId', sql.NVarChar(255), req.user.id);

    const org = await reqTx.query(`
      SELECT organizer_id, status, group_id 
      FROM study_sessions 
      WHERE session_id=@sessionId AND organizer_id=@userId
    `);
    if (!org.recordset.length) {
      await tx.rollback();
      return res.status(403).json({ error: 'Only the session organizer can cancel the session' });
    }
    if (org.recordset[0].status === 'completed') {
      await tx.rollback();
      return res.status(400).json({ error: 'Cannot cancel a completed session' });
    }

    await reqTx.query(`
      UPDATE study_sessions 
      SET status='cancelled', updated_at=GETUTCDATE()
      WHERE session_id=@sessionId
    `);

    // Read back AFTER trigger runs, selecting the same projection as before
    const read = await new sql.Request(tx).input('sessionId', sql.Int, req.params.sessionId).query(`
        SELECT 
          ss.session_id AS id,
          ss.group_id   AS groupId,
          ss.session_title AS title,
          ${ymd('ss.scheduled_start')} AS date,
          ${hhmm('ss.scheduled_start')} AS startTime,
          ${hhmm('ss.scheduled_end')}   AS endTime,
          ss.location,
          ss.session_type AS [type],
          ss.status AS status
        FROM study_sessions ss
        WHERE ss.session_id=@sessionId
      `);

    const row = read.recordset[0];

    const mpRes = await new sql.Request(tx)
      .input('groupId', sql.Int, row.groupId)
      .query(`SELECT max_members AS maxParticipants FROM study_groups WHERE group_id=@groupId`);

    const partRes = await new sql.Request(tx)
      .input('sessionId', sql.Int, row.id)
      .query(
        `SELECT COUNT(*) AS participants FROM session_attendees WHERE session_id=@sessionId AND attendance_status='attending'`
      );

    await tx.commit();

    // send notifications to all attendees (system + metadata.kind='session_cancelled')
    notifySessionCancelled(Number(req.params.sessionId), req.user.id).catch((e) =>
      console.warn('notifySessionCancelled failed:', e)
    );

    res.json({
      ...row,
      id: String(row.id),
      maxParticipants: mpRes.recordset[0]?.maxParticipants ?? 10,
      participants: partRes.recordset[0]?.participants ?? 0,
      status: mapStatus(row.status),
    });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    console.error('Error cancelling session:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

/* ---------- DELETE /:sessionId (soft cancel) ---------- */
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    const reqTx = new sql.Request(tx);
    reqTx.input('sessionId', sql.Int, req.params.sessionId);
    reqTx.input('userId', sql.NVarChar(255), req.user.id);

    const org = await reqTx.query(`
      SELECT organizer_id, status, group_id 
      FROM study_sessions 
      WHERE session_id=@sessionId AND organizer_id=@userId
    `);
    if (!org.recordset.length) {
      await tx.rollback();
      return res
        .status(403)
        .json({ error: 'Only the session organizer can delete (cancel) the session' });
    }

    // Align with "cancel" semantics (soft cancel)
    await reqTx.query(`
      UPDATE study_sessions 
      SET status='cancelled', updated_at=GETUTCDATE()
      WHERE session_id=@sessionId
    `);

    const read = await new sql.Request(tx).input('sessionId', sql.Int, req.params.sessionId).query(`
        SELECT 
          ss.session_id AS id,
          ss.group_id   AS groupId,
          ss.session_title AS title,
          ${ymd('ss.scheduled_start')} AS date,
          ${hhmm('ss.scheduled_start')} AS startTime,
          ${hhmm('ss.scheduled_end')}   AS endTime,
          ss.location,
          ss.session_type AS [type],
          ss.status AS status
        FROM study_sessions ss
        WHERE ss.session_id=@sessionId
      `);

    const row = read.recordset[0];

    const mpRes = await new sql.Request(tx)
      .input('groupId', sql.Int, row.groupId)
      .query(`SELECT max_members AS maxParticipants FROM study_groups WHERE group_id=@groupId`);

    const partRes = await new sql.Request(tx)
      .input('sessionId', sql.Int, row.id)
      .query(
        `SELECT COUNT(*) AS participants FROM session_attendees WHERE session_id=@sessionId AND attendance_status='attending'`
      );

    await tx.commit();

    // notify attendees about cancellation
    notifySessionCancelled(Number(req.params.sessionId), req.user.id).catch((e) =>
      console.warn('notifySessionCancelled failed:', e)
    );

    res.json({
      ...row,
      id: String(row.id),
      maxParticipants: mpRes.recordset[0]?.maxParticipants ?? 10,
      participants: partRes.recordset[0]?.participants ?? 0,
      status: mapStatus(row.status),
    });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    console.error('Error deleting (cancelling) session:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

module.exports = router;
