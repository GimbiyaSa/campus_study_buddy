// backend/src/services/notificationService.js
const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');
const { eventBus, EventType } = require('../utils/eventBus');

const router = express.Router();

/**
 * ---- Database pool (lazy init) ----
 * Tries Azure config first, then env var DATABASE_CONNECTION_STRING.
 * Always await getPool() before using pool.request().
 */
let pool;
const getPool = async () => {
  if (pool && pool.connected) return pool;
  try {
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
    } catch (azureError) {
      console.warn('Azure config not available, using environment variables');
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found in environment variables');
      }
    }
    sql.globalPool = pool; // make available to other modules if they rely on globalPool
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// ------------------------- Core helper -------------------------
const createNotification = async (
  userId,
  notificationType,
  title,
  message,
  metadata = null,
  scheduledFor = null
) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    // user_id is NVARCHAR(255) in the DB — coerce to string & bind as NVARCHAR
    request.input('userIdVarchar', sql.NVarChar(255), String(userId));
    request.input('notificationType', sql.NVarChar(100), notificationType);
    request.input('title', sql.NVarChar(255), title);
    request.input('message', sql.NText, message);
    request.input('metadata', sql.NVarChar(sql.MAX), metadata ? JSON.stringify(metadata) : null);
    request.input('scheduledFor', sql.DateTime2, scheduledFor);

    const result = await request.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, metadata, scheduled_for)
      OUTPUT inserted.*
      VALUES (@userIdVarchar, @notificationType, @title, @message, @metadata, @scheduledFor)
    `);

    const notification = result.recordset[0];

    // Emit notification created event
    eventBus.emitEvent(EventType.NOTIFICATION_CREATED, {
      userId: userId,
      notificationId: notification.notification_id,
      type: notificationType,
      title: title,
      message: message,
      metadata: metadata,
      scheduledFor: scheduledFor,
      createdAt: notification.created_at,
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// ---------------------- Existing hourly reminder ----------------------
const sendSessionReminders = async () => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const upcomingSessions = await request.query(`
      SELECT 
        ss.*,
        sa.user_id,
        u.first_name,
        u.last_name,
        sg.group_name
      FROM study_sessions ss
      JOIN session_attendees sa ON ss.session_id = sa.session_id
      JOIN users u ON sa.user_id = u.user_id
      LEFT JOIN study_groups sg ON ss.group_id = sg.group_id
      WHERE ss.scheduled_start BETWEEN GETUTCDATE() AND DATEADD(hour, 1, GETUTCDATE())
        AND ss.status IN ('scheduled', 'upcoming')
        AND sa.attendance_status = 'attending'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.user_id = sa.user_id 
            AND n.notification_type = 'session_reminder'
            AND JSON_VALUE(n.metadata, '$.session_id') = CAST(ss.session_id AS NVARCHAR(255))
            AND n.created_at > DATEADD(day, -1, GETUTCDATE())
        )
    `);

    for (const session of upcomingSessions.recordset) {
      const metadata = {
        session_id: session.session_id,
        group_id: session.group_id,
        scheduled_start: session.scheduled_start,
        reminder_offset_hours: 1,
      };

      await createNotification(
        String(session.user_id),
        'session_reminder',
        'Study Session Reminder',
        `Your study session "${session.session_title}" in ${
          session.group_name || 'your schedule'
        } starts at ${new Date(session.scheduled_start).toLocaleTimeString()}.`,
        metadata,
        new Date(Date.now() + 5 * 60 * 1000) // Send in 5 minutes
      );
    }

    console.log(`[notifications] Sent ${upcomingSessions.recordset.length} "1 hour" reminders`);
  } catch (error) {
    console.error('Error sending session reminders:', error);
  }
};

// ---------------------- NEW: 24-hour reminders ----------------------
const schedule24hRemindersForSession = async (sessionId) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('sessionId', sql.Int, sessionId);

    const result = await request.query(`
      SELECT 
        ss.session_id,
        ss.session_title,
        ss.scheduled_start,
        ss.group_id,
        sg.group_name,
        sa.user_id
      FROM study_sessions ss
      JOIN session_attendees sa ON sa.session_id = ss.session_id
      LEFT JOIN study_groups sg ON ss.group_id = sg.group_id
      WHERE ss.session_id = @sessionId
        AND sa.attendance_status = 'attending'
        AND ss.status IN ('scheduled', 'upcoming')
    `);

    if (!result.recordset.length) return { created: 0 };

    const start = new Date(result.recordset[0].scheduled_start);
    const scheduledFor = new Date(start.getTime() - 24 * 60 * 60 * 1000); // 24h before
    let created = 0;

    for (const row of result.recordset) {
      try {
        await createNotification(
          String(row.user_id),
          'session_reminder',
          'Study Session Reminder',
          `Reminder: "${row.session_title}" in ${
            row.group_name || 'your schedule'
          } starts ${start.toLocaleString()}.`,
          {
            session_id: row.session_id,
            group_id: row.group_id ?? null,
            scheduled_start: start.toISOString(),
            reminder_offset_hours: 24,
          },
          scheduledFor
        );
        created++;
      } catch (e) {
        console.error('Failed to schedule 24h reminder for user', row.user_id, e);
      }
    }

    console.log(`[notifications] Scheduled ${created} "24h" reminders for session ${sessionId}`);
    return { created };
  } catch (e) {
    console.error('schedule24hRemindersForSession error:', e);
    return { created: 0 };
  }
};

// Notify all attendees that a session was cancelled (system notification + metadata)
const notifySessionCancelled = async (sessionId, cancelledByUserId = null) => {
  const pool = await getPool();

  // Grab attendees + basic session info
  const rs = await pool.request().input('sid', sql.Int, sessionId).query(`
      SELECT 
        sa.user_id       AS userId,
        ss.session_id    AS sessionId,
        ss.session_title AS title,
        ss.group_id      AS groupId
      FROM dbo.session_attendees sa
      JOIN dbo.study_sessions   ss ON ss.session_id = sa.session_id
      WHERE sa.session_id = @sid
        AND sa.attendance_status IN ('attending','attended','pending')
    `);

  // (Optional) avoid dupes within the last day
  // If you want to suppress re-sends, uncomment and use this NOT EXISTS check per-user.

  for (const row of rs.recordset) {
    try {
      await createNotification(
        String(row.userId),
        'system',
        'Session cancelled',
        `The session "${row.title}" has been cancelled.`,
        {
          kind: 'session_cancelled',
          session_id: row.sessionId,
          group_id: row.groupId ?? null,
          cancelled_by: cancelledByUserId ?? null,
        }
      );
    } catch (e) {
      console.error('notifySessionCancelled: failed for user', row.userId, e);
    }
  }
};

// Batch scheduler (run via worker/cron)
const scheduleDaily24hReminders = async () => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const sessionsRes = await request.query(`
      SELECT ss.session_id
      FROM study_sessions ss
      WHERE ss.scheduled_start BETWEEN DATEADD(hour, 24, GETUTCDATE())
                                  AND DATEADD(hour, 25, GETUTCDATE())
        AND ss.status IN ('scheduled', 'upcoming')
    `);

    let total = 0;
    for (const s of sessionsRes.recordset) {
      const { created } = await schedule24hRemindersForSession(s.session_id);
      total += created;
    }
    console.log('[notifications] scheduleDaily24hReminders created:', total);
  } catch (err) {
    console.error('[notifications] scheduleDaily24hReminders error:', err);
  }
};

// ----------------------------- Routes -----------------------------

// Get all notifications for a user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { unreadOnly = false, limit = 50, offset = 0, type } = req.query;

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), String(req.user.id));
    request.input('limit', sql.Int, parseInt(limit, 10));
    request.input('offset', sql.Int, parseInt(offset, 10));

    let whereClause = 'WHERE n.user_id = @userId';

    if (unreadOnly === 'true') {
      whereClause += ' AND n.is_read = 0';
    }

    if (type) {
      request.input('type', sql.NVarChar(100), type);
      whereClause += ' AND n.notification_type = @type';
    }

    const result = await request.query(`
      SELECT *
      FROM notifications n
      ${whereClause}
      ORDER BY n.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const notifications = result.recordset.map((notification) => ({
      ...notification,
      metadata: notification.metadata ? JSON.parse(notification.metadata) : null,
    }));

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get notification counts
router.get('/counts', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), String(req.user.id));

    const result = await request.query(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = 0 THEN 1 END) as unread_notifications,
        COUNT(CASE WHEN notification_type = 'session_reminder' AND is_read = 0 THEN 1 END) as unread_reminders,
        COUNT(CASE WHEN notification_type = 'group_invite' AND is_read = 0 THEN 1 END) as unread_invites,
        COUNT(CASE WHEN notification_type = 'partner_match' AND is_read = 0 THEN 1 END) as unread_matches
      FROM notifications
      WHERE user_id = @userId
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching notification counts:', error);
    res.status(500).json({ error: 'Failed to fetch notification counts' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), String(req.user.id));
    request.input('notificationId', sql.Int, parseInt(req.params.notificationId, 10));

    const result = await request.query(`
      UPDATE notifications 
      SET is_read = 1
      OUTPUT inserted.*
      WHERE notification_id = @notificationId AND user_id = @userId
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const notification = result.recordset[0];
    notification.metadata = notification.metadata ? JSON.parse(notification.metadata) : null;

    // Emit notification read event
    eventBus.emitEvent(EventType.NOTIFICATION_READ, {
      userId: req.user.id,
      notificationId: notification.notification_id,
      type: notification.notification_type,
      readAt: new Date().toISOString(),
    });

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), String(req.user.id));

    const result = await request.query(`
      UPDATE notifications 
      SET is_read = 1
      WHERE user_id = @userId AND is_read = 0
    `);

    res.json({ message: `Marked ${result.rowsAffected[0]} notifications as read` });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:notificationId', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), String(req.user.id));
    request.input('notificationId', sql.Int, parseInt(req.params.notificationId, 10));

    const result = await request.query(`
      DELETE FROM notifications 
      WHERE notification_id = @notificationId AND user_id = @userId
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Create notification (admin/system use)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id, notification_type, title, message, metadata, scheduled_for } = req.body;

    if (!user_id || !notification_type || !title || !message) {
      return res.status(400).json({
        error: 'user_id, notification_type, title, and message are required',
      });
    }

    // Must match DB constraint
    const validTypes = [
      'session_reminder',
      'group_invite',
      'progress_update',
      'partner_match',
      'message',
      'system',
    ];
    if (!validTypes.includes(notification_type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const notification = await createNotification(
      String(user_id),
      notification_type,
      title,
      message,
      metadata,
      scheduled_for ? new Date(scheduled_for) : null
    );

    notification.metadata = notification.metadata ? JSON.parse(notification.metadata) : null;

    res.status(201).json(notification);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// Send notification to all group members
router.post('/group/:groupId/notify', authenticateToken, async (req, res) => {
  try {
    const { notification_type, title, message, metadata } = req.body;

    if (!notification_type || !title || !message) {
      return res.status(400).json({
        error: 'notification_type, title, and message are required',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('groupId', sql.Int, parseInt(req.params.groupId, 10));
    request.input('userId', sql.NVarChar(255), String(req.user.id));

    // Creators/admins only
    const permissionCheck = await request.query(`
      SELECT sg.creator_id, gm.role
      FROM study_groups sg
      LEFT JOIN group_members gm ON sg.group_id = gm.group_id AND gm.user_id = @userId AND gm.status = 'active'
      WHERE sg.group_id = @groupId AND sg.is_active = 1
    `);

    if (permissionCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Study group not found' });
    }

    const { creator_id, role } = permissionCheck.recordset[0];
    if (creator_id !== req.user.id && role !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Only group creators and admins can send group notifications' });
    }

    const membersResult = await request.query(`
      SELECT user_id FROM group_members 
      WHERE group_id = @groupId AND status = 'active'
    `);

    const notifications = [];
    for (const member of membersResult.recordset) {
      try {
        const notification = await createNotification(
          String(member.user_id),
          notification_type,
          title,
          message,
          { ...metadata, group_id: req.params.groupId }
        );
        notifications.push(notification);
      } catch (error) {
        console.error(`Error sending notification to user ${member.user_id}:`, error);
      }
    }

    res.json({
      message: `Sent notifications to ${notifications.length} group members`,
      notifications: notifications.length,
    });
  } catch (error) {
    console.error('Error sending group notifications:', error);
    res.status(500).json({ error: 'Failed to send group notifications' });
  }
});

// Get pending notifications (scheduled but not sent)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const result = await request.query(`
      SELECT *
      FROM notifications
      WHERE scheduled_for <= GETUTCDATE() 
        AND sent_at IS NULL
        AND scheduled_for IS NOT NULL
      ORDER BY scheduled_for ASC
    `);

    const notifications = result.recordset.map((notification) => ({
      ...notification,
      metadata: notification.metadata ? JSON.parse(notification.metadata) : null,
    }));

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching pending notifications:', error);
    res.status(500).json({ error: 'Failed to fetch pending notifications' });
  }
});

// Mark notifications as sent (for background job processing)
router.put('/mark-sent', authenticateToken, async (req, res) => {
  try {
    const { notification_ids } = req.body;

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return res.status(400).json({ error: 'notification_ids array is required' });
    }

    const pool = await getPool();
    const request = pool.request();

    // flatten IDs for IN clause
    const idList = notification_ids
      .map((id) => parseInt(id, 10))
      .filter((n) => !Number.isNaN(n))
      .join(',');

    if (!idList) {
      return res.status(400).json({ error: 'No valid notification IDs provided' });
    }

    const result = await request.query(`
      UPDATE notifications 
      SET sent_at = GETUTCDATE()
      WHERE notification_id IN (${idList})
    `);

    res.json({
      message: `Marked ${result.rowsAffected[0]} notifications as sent`,
    });
  } catch (error) {
    console.error('Error marking notifications as sent:', error);
    res.status(500).json({ error: 'Failed to mark notifications as sent' });
  }
});

// NEW: schedule 24h-before reminders for a single session (handy to call right after creation)
router.post('/sessions/:sessionId/schedule-24h', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    if (Number.isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const { created } = await schedule24hRemindersForSession(sessionId);
    res.json({ message: `Scheduled ${created} reminders for session ${sessionId}` });
  } catch (e) {
    console.error('Error scheduling 24h reminders:', e);
    res.status(500).json({ error: 'Failed to schedule 24h reminders' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.sendSessionReminders = sendSessionReminders;
module.exports.schedule24hRemindersForSession = schedule24hRemindersForSession;
module.exports.scheduleDaily24hReminders = scheduleDaily24hReminders;
module.exports.notifySessionCancelled = notifySessionCancelled;
