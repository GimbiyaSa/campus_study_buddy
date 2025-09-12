const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get database pool (assuming it's initialized in userService.js)
const getPool = () => {
  return sql.globalPool || require('./userService').pool;
};

// Create notification
const createNotification = async (userId, notificationType, title, message, metadata = null, scheduledFor = null) => {
  try {
    const request = getPool().request();
    request.input('userId', sql.Int, userId);
    request.input('notificationType', sql.NVarChar(100), notificationType);
    request.input('title', sql.NVarChar(255), title);
    request.input('message', sql.NText, message);
    request.input('metadata', sql.NVarChar(sql.MAX), metadata ? JSON.stringify(metadata) : null);
    request.input('scheduledFor', sql.DateTime2, scheduledFor);

    const result = await request.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, metadata, scheduled_for)
      OUTPUT inserted.*
      VALUES (@userId, @notificationType, @title, @message, @metadata, @scheduledFor)
    `);

    return result.recordset[0];
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Send session reminders
const sendSessionReminders = async () => {
  try {
    const request = getPool().request();
    
    // Get sessions starting in the next hour that haven't had reminders sent
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
      JOIN study_groups sg ON ss.group_id = sg.group_id
      WHERE ss.scheduled_start BETWEEN GETUTCDATE() AND DATEADD(hour, 1, GETUTCDATE())
        AND ss.status = 'scheduled'
        AND sa.attendance_status = 'attending'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.user_id = sa.user_id 
            AND n.notification_type = 'session_reminder'
            AND JSON_VALUE(n.metadata, '$.session_id') = CAST(ss.session_id AS NVARCHAR)
            AND n.created_at > DATEADD(day, -1, GETUTCDATE())
        )
    `);

    // Send reminders
    for (const session of upcomingSessions.recordset) {
      const metadata = {
        session_id: session.session_id,
        group_id: session.group_id,
        scheduled_start: session.scheduled_start
      };

      await createNotification(
        session.user_id,
        'session_reminder',
        'Study Session Reminder',
        `Your study session "${session.session_title}" in ${session.group_name} starts at ${new Date(session.scheduled_start).toLocaleTimeString()}.`,
        metadata,
        new Date(Date.now() + 5 * 60 * 1000) // Send in 5 minutes
      );
    }

    console.log(`Sent ${upcomingSessions.recordset.length} session reminders`);
  } catch (error) {
    console.error('Error sending session reminders:', error);
  }
};

// Get all notifications for a user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { unreadOnly = false, limit = 50, offset = 0, type } = req.query;
    
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));

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

    // Parse metadata JSON
    const notifications = result.recordset.map(notification => ({
      ...notification,
      metadata: notification.metadata ? JSON.parse(notification.metadata) : null
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
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);

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
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);
    request.input('notificationId', sql.Int, req.params.notificationId);

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

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);

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
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);
    request.input('notificationId', sql.Int, req.params.notificationId);

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
        error: 'user_id, notification_type, title, and message are required' 
      });
    }

    // Validate notification type
    const validTypes = ['session_reminder', 'group_invite', 'progress_update', 'partner_match', 'message', 'system'];
    if (!validTypes.includes(notification_type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const notification = await createNotification(
      user_id,
      notification_type,
      title,
      message,
      metadata,
      scheduled_for
    );

    // Parse metadata for response
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
        error: 'notification_type, title, and message are required' 
      });
    }

    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is admin or creator of the group
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
      return res.status(403).json({ error: 'Only group creators and admins can send group notifications' });
    }

    // Get all group members
    const membersResult = await request.query(`
      SELECT user_id FROM group_members 
      WHERE group_id = @groupId AND status = 'active'
    `);

    const notifications = [];
    for (const member of membersResult.recordset) {
      try {
        const notification = await createNotification(
          member.user_id,
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
      notifications: notifications.length
    });
  } catch (error) {
    console.error('Error sending group notifications:', error);
    res.status(500).json({ error: 'Failed to send group notifications' });
  }
});

// Get pending notifications (scheduled but not sent)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();

    const result = await request.query(`
      SELECT *
      FROM notifications
      WHERE scheduled_for <= GETUTCDATE() 
        AND sent_at IS NULL
        AND scheduled_for IS NOT NULL
      ORDER BY scheduled_for ASC
    `);

    // Parse metadata JSON
    const notifications = result.recordset.map(notification => ({
      ...notification,
      metadata: notification.metadata ? JSON.parse(notification.metadata) : null
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

    const request = getPool().request();
    
    // Create a table-valued parameter for the IDs
    const idList = notification_ids.map(id => `(${parseInt(id)})`).join(',');
    
    const result = await request.query(`
      UPDATE notifications 
      SET sent_at = GETUTCDATE()
      WHERE notification_id IN (${idList})
    `);

    res.json({ 
      message: `Marked ${result.rowsAffected[0]} notifications as sent`
    });
  } catch (error) {
    console.error('Error marking notifications as sent:', error);
    res.status(500).json({ error: 'Failed to mark notifications as sent' });
  }
});

// Export the notification creation function for use in other services
module.exports = router;
module.exports.createNotification = createNotification;
module.exports.sendSessionReminders = sendSessionReminders;