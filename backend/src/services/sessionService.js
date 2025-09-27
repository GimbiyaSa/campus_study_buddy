const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get database pool (assuming it's initialized in userService.js)
const getPool = () => {
  return sql.globalPool || require('./userService').pool;
};

/* ---------- helpers ---------- */
function mapStatus(dbStatus) {
  switch (dbStatus) {
    case 'scheduled': return 'upcoming';
    case 'in_progress': return 'ongoing';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
    default: return 'upcoming';
  }
}

function hhmm(expr) {
  // 108 = hh:mm:ss; we then take LEFT(5)
  return `LEFT(CONVERT(VARCHAR(8), ${expr}, 108), 5)`;
}

function ymd(expr) {
  // 23 = yyyy-mm-dd
  return `CONVERT(VARCHAR(10), ${expr}, 23)`;
}


/* ---------- GET / (list) ---------- */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { groupId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const pool = getPool();
    const request = pool.request();
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));
    request.input('userId', sql.Int, req.user.id);

    let whereClause = 'WHERE 1=1';

    if (groupId) {
      request.input('groupId', sql.Int, groupId);
      whereClause += ' AND ss.group_id = @groupId';
    }
    if (status) {
      request.input('status', sql.NVarChar(50), status);
      // status arrives as FE status; map to DB statuses
      whereClause += ` AND ss.status IN (
        CASE 
          WHEN @status='upcoming' THEN 'scheduled'
          WHEN @status='ongoing' THEN 'in_progress'
          ELSE @status
        END
      )`;
    }
    if (startDate) { request.input('startDate', sql.DateTime2, startDate); whereClause += ' AND ss.scheduled_start >= @startDate'; }
    if (endDate)   { request.input('endDate',   sql.DateTime2, endDate);   whereClause += ' AND ss.scheduled_start <= @endDate'; }

    const result = await request.query(`
      SELECT
        ss.session_id AS id,
        ss.session_title AS title,
        ${ymd('ss.scheduled_start')} AS date,
        ${hhmm('ss.scheduled_start')} AS startTime,
        ${hhmm('ss.scheduled_end')}   AS endTime,
        ss.location,
        ss.session_type AS [type],
        ISNULL(ss.max_participants, 10) AS maxParticipants,
        -- participants = confirmed attendees or all attendees?
        COUNT(sa.user_id) AS participants,
        CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END AS isCreator,
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
      LEFT JOIN session_attendees sa ON ss.session_id = sa.session_id
      ${whereClause}
      GROUP BY 
        ss.session_id, ss.session_title, ss.scheduled_start, ss.scheduled_end, ss.location,
        ss.session_type, ss.max_participants, ss.organizer_id, ss.status,
        m.module_name, m.module_code
      ORDER BY ss.scheduled_start ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json(result.recordset.map(r => ({
      ...r,
      status: mapStatus(r.status)
    })));
  } catch (error) {
    console.error('Error fetching study sessions:', error);
    res.status(500).json({ error: 'Failed to fetch study sessions' });
  }
});

/* ---------- GET /:sessionId ---------- */
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    const result = await request.query(`
      SELECT 
        ss.session_id AS id,
        ss.session_title AS title,
        ${ymd('ss.scheduled_start')} AS date,
        ${hhmm('ss.scheduled_start')} AS startTime,
        ${hhmm('ss.scheduled_end')}   AS endTime,
        ss.location,
        ss.session_type AS [type],
        ISNULL(ss.max_participants, 10) AS maxParticipants,
        COUNT(sa.user_id) AS participants,
        CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END AS isCreator,
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
      LEFT JOIN session_attendees sa ON ss.session_id = sa.session_id
      WHERE ss.session_id = @sessionId
      GROUP BY 
        ss.session_id, ss.session_title, ss.scheduled_start, ss.scheduled_end, ss.location,
        ss.session_type, ss.max_participants, ss.organizer_id, ss.status,
        m.module_name, m.module_code
    `);

    if (!result.recordset.length) return res.status(404).json({ error: 'Study session not found' });

    const row = result.recordset[0];
    res.json({ ...row, status: mapStatus(row.status) });
  } catch (error) {
    console.error('Error fetching study session:', error);
    res.status(500).json({ error: 'Failed to fetch study session' });
  }
});

/* ---------- POST / (create) ---------- */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      group_id,              // optional; if missing, pick user's active group
      session_title,         // FE will send from 'title'
      description,
      scheduled_start,       // ISO string or Date
      scheduled_end,         // ISO string or Date
      location,
      session_type           // 'study' | ...
    } = req.body;

    if (!session_title || !scheduled_start || !scheduled_end || !location) {
      return res.status(400).json({ error: 'session_title, scheduled_start, scheduled_end, location are required' });
    }
    if (new Date(scheduled_start) >= new Date(scheduled_end)) {
      return res.status(400).json({ error: 'scheduled_end must be after scheduled_start' });
    }

    const request = getPool().request();
    request.input('organizerId', sql.Int, req.user.id);
    request.input('sessionTitle', sql.NVarChar(255), session_title);
    request.input('description', sql.NText, description || null);
    request.input('scheduledStart', sql.DateTime2, scheduled_start);
    request.input('scheduledEnd', sql.DateTime2, scheduled_end);
    request.input('location', sql.NVarChar(500), location);
    request.input('sessionType', sql.NVarChar(50), session_type || 'study');

    // resolve groupId: use provided or pick user's most recent active group
    if (group_id) {
      request.input('groupId', sql.Int, group_id);
    } else {
      const g = await request.query(`
        SELECT TOP 1 gm.group_id 
        FROM group_members gm 
        WHERE gm.user_id=@organizerId AND gm.status='active'
        ORDER BY gm.joined_at DESC
      `);
      if (!g.recordset.length) return res.status(400).json({ error: 'No active group found for user. Provide group_id.' });
      request.input('groupId', sql.Int, g.recordset[0].group_id);
    }

    const result = await request.query(`
      INSERT INTO study_sessions
        (group_id, organizer_id, session_title, description, scheduled_start, scheduled_end, location, session_type, status, created_at, updated_at)
      OUTPUT inserted.session_id AS id,
             inserted.session_title AS title,
             ${ymd('inserted.scheduled_start')} AS date,
             ${hhmm('inserted.scheduled_start')} AS startTime,
             ${hhmm('inserted.scheduled_end')}   AS endTime,
             inserted.location,
             inserted.session_type AS [type],
             ISNULL(inserted.max_participants, 10) AS maxParticipants,
             0 AS participants,
             CASE WHEN inserted.status='scheduled' THEN 'upcoming' WHEN inserted.status='in_progress' THEN 'ongoing' ELSE inserted.status END AS status
      VALUES (@groupId, @organizerId, @sessionTitle, @description, @scheduledStart, @scheduledEnd, @location, @sessionType, 'scheduled', GETUTCDATE(), GETUTCDATE())
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error creating study session:', error);
    res.status(500).json({ error: 'Failed to create study session' });
  }
});

/* ---------- POST /:sessionId/join (upsert attendance) ---------- */
router.post('/:sessionId/join', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // ensure user is member of the group hosting the session
    const g = await request.query(`
      SELECT ss.group_id
      FROM study_sessions ss
      LEFT JOIN group_members gm ON gm.group_id = ss.group_id AND gm.user_id=@userId AND gm.status='active'
      WHERE ss.session_id=@sessionId
    `);
    if (!g.recordset.length) return res.status(404).json({ error: 'Session not found' });

    // upsert attendance as "attending"
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

    res.json({ ok: true });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

/* ---------- PUT /:sessionId (update) ---------- */
router.put('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // only organizer can update
    const org = await request.query(`
      SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId
    `);
    if (!org.recordset.length) return res.status(403).json({ error: 'Only the session organizer can update the session' });
    if (org.recordset[0].status === 'completed') return res.status(400).json({ error: 'Cannot update a completed session' });

    const { title, date, startTime, endTime, location, type, description } = req.body;

    const sets = [];
    if (title !== undefined) { sets.push('session_title=@sessionTitle'); request.input('sessionTitle', sql.NVarChar(255), title); }
    if (location !== undefined) { sets.push('location=@location'); request.input('location', sql.NVarChar(500), location); }
    if (type !== undefined) { sets.push('session_type=@sessionType'); request.input('sessionType', sql.NVarChar(50), type); }
    if (description !== undefined) { sets.push('description=@description'); request.input('description', sql.NText, description || null); }

    if (date !== undefined && startTime !== undefined) {
      const startIso = new Date(`${date}T${startTime}:00`);
      sets.push('scheduled_start=@scheduledStart');
      request.input('scheduledStart', sql.DateTime2, startIso);
    }
    if (date !== undefined && endTime !== undefined) {
      const endIso = new Date(`${date}T${endTime}:00`);
      sets.push('scheduled_end=@scheduledEnd');
      request.input('scheduledEnd', sql.DateTime2, endIso);
    }

    if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

    const updated = await request.query(`
      UPDATE study_sessions
      SET ${sets.join(', ')}, updated_at=GETUTCDATE()
      OUTPUT 
        inserted.session_id AS id,
        inserted.session_title AS title,
        ${ymd('inserted.scheduled_start')} AS date,
        ${hhmm('inserted.scheduled_start')} AS startTime,
        ${hhmm('inserted.scheduled_end')}   AS endTime,
        inserted.location,
        inserted.session_type AS [type],
        ISNULL(inserted.max_participants, 10) AS maxParticipants,
        (SELECT COUNT(*) FROM session_attendees sa WHERE sa.session_id=inserted.session_id) AS participants,
        CASE 
          WHEN inserted.status='scheduled' THEN 'upcoming'
          WHEN inserted.status='in_progress' THEN 'ongoing'
          ELSE inserted.status
        END AS status
      WHERE session_id=@sessionId
    `);

    res.json(updated.recordset[0]);
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
    request.input('userId', sql.Int, req.user.id);

    const org = await request.query(`SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`);
    if (!org.recordset.length) return res.status(403).json({ error: 'Only the session organizer can start the session' });
    if (org.recordset[0].status !== 'scheduled') return res.status(400).json({ error: 'Session is not in scheduled status' });

    const result = await request.query(`
      UPDATE study_sessions 
      SET status='in_progress', actual_start=GETUTCDATE(), updated_at=GETUTCDATE()
      OUTPUT inserted.*
      WHERE session_id=@sessionId
    `);

    res.json(result.recordset[0]);
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
    request.input('userId', sql.Int, req.user.id);

    const org = await request.query(`SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`);
    if (!org.recordset.length) return res.status(403).json({ error: 'Only the session organizer can end the session' });
    if (org.recordset[0].status !== 'in_progress') return res.status(400).json({ error: 'Session is not currently in progress' });

    const result = await request.query(`
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

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/* ---------- PUT /:sessionId/cancel ---------- */
router.put('/:sessionId/cancel', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    const org = await request.query(`SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`);
    if (!org.recordset.length) return res.status(403).json({ error: 'Only the session organizer can cancel the session' });
    if (org.recordset[0].status === 'completed') return res.status(400).json({ error: 'Cannot cancel a completed session' });

    const result = await request.query(`
      UPDATE study_sessions SET status='cancelled', updated_at=GETUTCDATE()
      OUTPUT inserted.*
      WHERE session_id=@sessionId
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

/* ---------- DELETE /:sessionId ---------- */
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    const org = await request.query(`SELECT organizer_id, status FROM study_sessions WHERE session_id=@sessionId AND organizer_id=@userId`);
    if (!org.recordset.length) return res.status(403).json({ error: 'Only the session organizer can delete the session' });
    if (org.recordset[0].status === 'in_progress') return res.status(400).json({ error: 'Cannot delete a session that is currently in progress' });

    await request.query(`DELETE FROM study_sessions WHERE session_id=@sessionId`);
    res.json({ message: 'Study session deleted successfully' });
  } catch (error) {
    console.error('Error deleting study session:', error);
    res.status(500).json({ error: 'Failed to delete study session' });
  }
});

module.exports = router;