const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get database pool (assuming it's initialized in userService.js)
const getPool = () => {
  return sql.globalPool || require('./userService').pool;
};

// Get all study sessions (with filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { groupId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;
    
    const request = getPool().request();
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));

    let whereClause = 'WHERE 1=1';
    
    if (groupId) {
      request.input('groupId', sql.Int, groupId);
      whereClause += ' AND ss.group_id = @groupId';
    }
    
    if (status) {
      request.input('status', sql.NVarChar(50), status);
      whereClause += ' AND ss.status = @status';
    }
    
    if (startDate) {
      request.input('startDate', sql.DateTime2, startDate);
      whereClause += ' AND ss.scheduled_start >= @startDate';
    }
    
    if (endDate) {
      request.input('endDate', sql.DateTime2, endDate);
      whereClause += ' AND ss.scheduled_start <= @endDate';
    }

    const result = await request.query(`
      SELECT 
        ss.*,
        u.first_name + ' ' + u.last_name as organizer_name,
        sg.group_name,
        m.module_code,
        m.module_name,
        COUNT(sa.user_id) as total_attendees,
        COUNT(CASE WHEN sa.attendance_status = 'attending' THEN 1 END) as confirmed_attendees
      FROM study_sessions ss
      JOIN users u ON ss.organizer_id = u.user_id
      JOIN study_groups sg ON ss.group_id = sg.group_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN session_attendees sa ON ss.session_id = sa.session_id
      ${whereClause}
      GROUP BY ss.session_id, ss.group_id, ss.organizer_id, ss.session_title, ss.description,
               ss.scheduled_start, ss.scheduled_end, ss.actual_start, ss.actual_end, ss.location,
               ss.session_type, ss.status, ss.created_at, ss.updated_at,
               u.first_name, u.last_name, sg.group_name, m.module_code, m.module_name
      ORDER BY ss.scheduled_start ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching study sessions:', error);
    res.status(500).json({ error: 'Failed to fetch study sessions' });
  }
});

// Get specific study session with details
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    const result = await request.query(`
      SELECT 
        ss.*,
        u.first_name + ' ' + u.last_name as organizer_name,
        sg.group_name,
        m.module_code,
        m.module_name,
        COUNT(sa.user_id) as total_attendees,
        COUNT(CASE WHEN sa.attendance_status = 'attending' THEN 1 END) as confirmed_attendees,
        user_sa.attendance_status as user_attendance_status,
        CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END as is_organizer,
        CASE WHEN gm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_group_member
      FROM study_sessions ss
      JOIN users u ON ss.organizer_id = u.user_id
      JOIN study_groups sg ON ss.group_id = sg.group_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN session_attendees sa ON ss.session_id = sa.session_id
      LEFT JOIN session_attendees user_sa ON ss.session_id = user_sa.session_id AND user_sa.user_id = @userId
      LEFT JOIN group_members gm ON sg.group_id = gm.group_id AND gm.user_id = @userId AND gm.status = 'active'
      WHERE ss.session_id = @sessionId
      GROUP BY ss.session_id, ss.group_id, ss.organizer_id, ss.session_title, ss.description,
               ss.scheduled_start, ss.scheduled_end, ss.actual_start, ss.actual_end, ss.location,
               ss.session_type, ss.status, ss.created_at, ss.updated_at,
               u.first_name, u.last_name, sg.group_name, m.module_code, m.module_name,
               user_sa.attendance_status, gm.user_id
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching study session:', error);
    res.status(500).json({ error: 'Failed to fetch study session' });
  }
});

// Get session attendees
router.get('/:sessionId/attendees', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);

    const result = await request.query(`
      SELECT 
        sa.*,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_image_url,
        u.course,
        u.year_of_study
      FROM session_attendees sa
      JOIN users u ON sa.user_id = u.user_id
      WHERE sa.session_id = @sessionId
      ORDER BY sa.attendance_status, u.first_name, u.last_name
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching session attendees:', error);
    res.status(500).json({ error: 'Failed to fetch session attendees' });
  }
});

// Create new study session
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      group_id, 
      session_title, 
      description, 
      scheduled_start, 
      scheduled_end, 
      location, 
      session_type 
    } = req.body;
    
    if (!group_id || !session_title || !scheduled_start || !scheduled_end) {
      return res.status(400).json({ 
        error: 'group_id, session_title, scheduled_start, and scheduled_end are required' 
      });
    }

    // Validate dates
    if (new Date(scheduled_start) >= new Date(scheduled_end)) {
      return res.status(400).json({ error: 'scheduled_end must be after scheduled_start' });
    }

    if (new Date(scheduled_start) <= new Date()) {
      return res.status(400).json({ error: 'scheduled_start must be in the future' });
    }

    const request = getPool().request();
    request.input('groupId', sql.Int, group_id);
    request.input('organizerId', sql.Int, req.user.id);
    request.input('sessionTitle', sql.NVarChar(255), session_title);
    request.input('description', sql.NText, description || null);
    request.input('scheduledStart', sql.DateTime2, scheduled_start);
    request.input('scheduledEnd', sql.DateTime2, scheduled_end);
    request.input('location', sql.NVarChar(500), location || null);
    request.input('sessionType', sql.NVarChar(50), session_type || 'study');

    // Check if user is a member of the group
    const memberCheck = await request.query(`
      SELECT gm.role FROM group_members gm
      WHERE gm.group_id = @groupId AND gm.user_id = @organizerId AND gm.status = 'active'
    `);

    if (memberCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'You must be a member of the group to respond to sessions' });
    }

    // Check if attendance record exists
    const existingAttendance = await request.query(`
      SELECT attendance_id FROM session_attendees 
      WHERE session_id = @sessionId AND user_id = @userId
    `);

    let result;
    if (existingAttendance.recordset.length > 0) {
      // Update existing attendance
      request.input('attendanceId', sql.Int, existingAttendance.recordset[0].attendance_id);
      result = await request.query(`
        UPDATE session_attendees 
        SET attendance_status = @attendanceStatus, 
            notes = @notes,
            responded_at = GETUTCDATE()
        OUTPUT inserted.*
        WHERE attendance_id = @attendanceId
      `);
    } else {
      // Create new attendance record
      result = await request.query(`
        INSERT INTO session_attendees (session_id, user_id, attendance_status, notes, responded_at)
        OUTPUT inserted.*
        VALUES (@sessionId, @userId, @attendanceStatus, @notes, GETUTCDATE())
      `);
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error updating session attendance:', error);
    res.status(500).json({ error: 'Failed to update session attendance' });
  }
});

// Start a session (organizer only)
router.put('/:sessionId/start', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is the organizer
    const organizerCheck = await request.query(`
      SELECT organizer_id, status FROM study_sessions 
      WHERE session_id = @sessionId AND organizer_id = @userId
    `);

    if (organizerCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Only the session organizer can start the session' });
    }

    const session = organizerCheck.recordset[0];
    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Session is not in scheduled status' });
    }

    const result = await request.query(`
      UPDATE study_sessions 
      SET status = 'in_progress', actual_start = GETUTCDATE()
      OUTPUT inserted.*
      WHERE session_id = @sessionId
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// End a session (organizer only)
router.put('/:sessionId/end', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is the organizer
    const organizerCheck = await request.query(`
      SELECT organizer_id, status FROM study_sessions 
      WHERE session_id = @sessionId AND organizer_id = @userId
    `);

    if (organizerCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Only the session organizer can end the session' });
    }

    const session = organizerCheck.recordset[0];
    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Session is not currently in progress' });
    }

    const result = await request.query(`
      UPDATE study_sessions 
      SET status = 'completed', actual_end = GETUTCDATE()
      OUTPUT inserted.*
      WHERE session_id = @sessionId
    `);

    // Mark all attending users as attended
    await request.query(`
      UPDATE session_attendees 
      SET attendance_status = 'attended'
      WHERE session_id = @sessionId AND attendance_status = 'attending'
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Cancel a session (organizer only)
router.put('/:sessionId/cancel', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is the organizer
    const organizerCheck = await request.query(`
      SELECT organizer_id, status FROM study_sessions 
      WHERE session_id = @sessionId AND organizer_id = @userId
    `);

    if (organizerCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Only the session organizer can cancel the session' });
    }

    const session = organizerCheck.recordset[0];
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed session' });
    }

    const result = await request.query(`
      UPDATE study_sessions 
      SET status = 'cancelled'
      OUTPUT inserted.*
      WHERE session_id = @sessionId
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

// Update study session (organizer only)
router.put('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is the organizer
    const organizerCheck = await request.query(`
      SELECT organizer_id, status FROM study_sessions 
      WHERE session_id = @sessionId AND organizer_id = @userId
    `);

    if (organizerCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Only the session organizer can update the session' });
    }

    const session = organizerCheck.recordset[0];
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Cannot update a completed session' });
    }

    const allowedFields = ['session_title', 'description', 'scheduled_start', 'scheduled_end', 'location', 'session_type'];
    const updateFields = [];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = @${field}`);
        if (field === 'scheduled_start' || field === 'scheduled_end') {
          request.input(field, sql.DateTime2, req.body[field]);
        } else {
          request.input(field, sql.NVarChar, req.body[field]);
        }
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Validate dates if both are being updated
    if (req.body.scheduled_start && req.body.scheduled_end) {
      if (new Date(req.body.scheduled_start) >= new Date(req.body.scheduled_end)) {
        return res.status(400).json({ error: 'scheduled_end must be after scheduled_start' });
      }
    }

    const result = await request.query(`
      UPDATE study_sessions 
      SET ${updateFields.join(', ')}
      OUTPUT inserted.*
      WHERE session_id = @sessionId
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error updating study session:', error);
    res.status(500).json({ error: 'Failed to update study session' });
  }
});

// Delete study session (organizer only)
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('sessionId', sql.Int, req.params.sessionId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is the organizer
    const organizerCheck = await request.query(`
      SELECT organizer_id, status FROM study_sessions 
      WHERE session_id = @sessionId AND organizer_id = @userId
    `);

    if (organizerCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Only the session organizer can delete the session' });
    }

    const session = organizerCheck.recordset[0];
    if (session.status === 'in_progress') {
      return res.status(400).json({ error: 'Cannot delete a session that is currently in progress' });
    }

    // Delete session and related data (cascading deletes will handle session_attendees)
    await request.query(`
      DELETE FROM study_sessions WHERE session_id = @sessionId
    `);

    res.json({ message: 'Study session deleted successfully' });
  } catch (error) {
    console.error('Error deleting study session:', error);
    res.status(500).json({ error: 'Failed to delete study session' });
  }
});

// Get user's upcoming sessions
router.get('/user/upcoming', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);
    request.input('limit', sql.Int, parseInt(limit));
    request.input('currentTime', sql.DateTime2, new Date());

    const result = await request.query(`
      SELECT TOP (@limit)
        ss.*,
        u.first_name + ' ' + u.last_name as organizer_name,
        sg.group_name,
        m.module_code,
        m.module_name,
        sa.attendance_status,
        CASE WHEN ss.organizer_id = @userId THEN 1 ELSE 0 END as is_organizer
      FROM study_sessions ss
      JOIN users u ON ss.organizer_id = u.user_id
      JOIN study_groups sg ON ss.group_id = sg.group_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN session_attendees sa ON ss.session_id = sa.session_id AND sa.user_id = @userId
      JOIN group_members gm ON sg.group_id = gm.group_id AND gm.user_id = @userId AND gm.status = 'active'
      WHERE ss.scheduled_start > @currentTime 
        AND ss.status IN ('scheduled', 'in_progress')
      ORDER BY ss.scheduled_start ASC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching upcoming sessions:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming sessions' });
  }
});

module.exports = router;