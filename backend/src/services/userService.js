const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Initialize Azure SQL connection pool
let pool;
const initializeDatabase = async () => {
  try {
    // Try to use Azure configuration first
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
    } catch (azureError) {
      console.warn('Azure config not available, using environment variables');
      // Fallback to connection string
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found in environment variables');
      }
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Initialize database connection
initializeDatabase();

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);

    const result = await request.query(`
      SELECT 
        u.user_id,
        u.email,
        u.password_hash,
        u.first_name,
        u.last_name,
        u.university,
        u.course,
        u.year_of_study,
        MAX(CAST(u.bio AS NVARCHAR(MAX))) AS bio,
        u.profile_image_url,
        MAX(CAST(u.study_preferences AS NVARCHAR(MAX))) AS study_preferences,
        u.is_active,
        u.created_at,
        u.updated_at,
        STRING_AGG(m.module_code, ',') as enrolled_modules
      FROM users u
      LEFT JOIN user_modules um ON u.user_id = um.user_id AND um.enrollment_status = 'active'
      LEFT JOIN modules m ON um.module_id = m.module_id
      WHERE u.user_id = @userId AND u.is_active = 1
      GROUP BY u.user_id, u.email, u.password_hash, u.first_name, u.last_name, 
               u.university, u.course, u.year_of_study, u.profile_image_url, 
               u.is_active, u.created_at, u.updated_at
    `);

    if (result.recordset.length === 0) {
      // Create new user profile
      const insertRequest = pool.request();
      insertRequest.input('user_id', sql.NVarChar(255), req.user.id);
      insertRequest.input('email', sql.NVarChar(255), req.user.email);
      insertRequest.input(
        'firstName',
        sql.NVarChar(100),
        req.user.firstName || req.user.name?.split(' ')[0] || ''
      );
      insertRequest.input(
        'lastName',
        sql.NVarChar(100),
        req.user.lastName || req.user.name?.split(' ').slice(1).join(' ') || ''
      );
      insertRequest.input('university', sql.NVarChar(255), req.user.university || '');
      insertRequest.input('course', sql.NVarChar(255), req.user.course || '');
      insertRequest.input('passwordHash', sql.NVarChar(255), ''); // Will be handled by Azure AD
      insertRequest.input(
        'studyPreferences',
        sql.NVarChar(sql.MAX),
        JSON.stringify({
          preferredTimes: [],
          studyStyle: 'visual',
          groupSize: 'medium',
        })
      );

      const insertResult = await insertRequest.query(`
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, university, course, study_preferences)
        OUTPUT inserted.*
        VALUES (@user_id, @email, @passwordHash, @firstName, @lastName, @university, @course, @studyPreferences)
      `);

      const newUser = insertResult.recordset[0];
      newUser.enrolled_modules = '';
      return res.json(newUser);
    }

    const user = result.recordset[0];
    // Parse JSON fields
    if (user.study_preferences) {
      user.study_preferences = JSON.parse(user.study_preferences);
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);

    // Build dynamic update query based on provided fields
    const allowedFields = [
      'first_name',
      'last_name',
      'university',
      'course',
      'year_of_study',
      'bio',
      'profile_image_url',
      'study_preferences',
    ];
    const updateFields = [];
    const updateValues = [];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = @${field}`);
        if (field === 'study_preferences') {
          request.input(field, sql.NVarChar(sql.MAX), JSON.stringify(req.body[field]));
        } else {
          request.input(field, sql.NVarChar, req.body[field]);
        }
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const result = await request.query(`
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = GETUTCDATE()
      OUTPUT inserted.*
      WHERE user_id = @userId AND is_active = 1
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.recordset[0];
    if (user.study_preferences) {
      user.study_preferences = JSON.parse(user.study_preferences);
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Get all users (for demo/fallback)
router.get('/', async (req, res) => {
  try {
    const request = pool.request();
    const result = await request.query(`
      SELECT user_id, email, first_name, last_name, university, course, 
             year_of_study, profile_image_url, is_active
      FROM users 
      WHERE is_active = 1
      ORDER BY created_at DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user's enrolled modules
router.get('/me/modules', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);

    const result = await request.query(`
      SELECT 
        m.*,
        um.enrollment_status,
        um.enrolled_at,
        COUNT(t.topic_id) as total_topics
      FROM user_modules um
      JOIN modules m ON um.module_id = m.module_id
      LEFT JOIN topics t ON m.module_id = t.module_id AND t.is_active = 1
      WHERE um.user_id = @userId
      GROUP BY m.module_id, m.module_code, m.module_name, m.description, 
               m.university, m.is_active, m.created_at, um.enrollment_status, um.enrolled_at
      ORDER BY um.enrolled_at DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching user modules:', error);
    res.status(500).json({ error: 'Failed to fetch user modules' });
  }
});

// Enroll in a module
router.post('/me/modules/:moduleId/enroll', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);
    request.input('moduleId', sql.Int, req.params.moduleId);

    // Check if already enrolled
    const checkResult = await request.query(`
      SELECT * FROM user_modules 
      WHERE user_id = @userId AND module_id = @moduleId
    `);

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ error: 'Already enrolled in this module' });
    }

    // Enroll user
    const result = await request.query(`
      INSERT INTO user_modules (user_id, module_id, enrollment_status)
      OUTPUT inserted.*
      VALUES (@userId, @moduleId, 'active')
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error enrolling in module:', error);
    res.status(500).json({ error: 'Failed to enroll in module' });
  }
});

// Get user's study progress
router.get('/me/progress', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);

    const result = await request.query(`
      SELECT 
        up.*,
        t.topic_name,
        c.chapter_name,
        m.module_code,
        m.module_name
      FROM user_progress up
      LEFT JOIN topics t ON up.topic_id = t.topic_id
      LEFT JOIN chapters c ON up.chapter_id = c.chapter_id
      LEFT JOIN modules m ON t.module_id = m.module_id
      WHERE up.user_id = @userId
      ORDER BY up.updated_at DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch user progress' });
  }
});

// Update progress for a topic/chapter
router.put('/me/progress', authenticateToken, async (req, res) => {
  try {
    const { topic_id, chapter_id, completion_status, hours_spent, notes } = req.body;

    if (!topic_id && !chapter_id) {
      return res.status(400).json({ error: 'Either topic_id or chapter_id is required' });
    }

    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);
    request.input('topicId', sql.Int, topic_id || null);
    request.input('chapterId', sql.Int, chapter_id || null);
    request.input('completionStatus', sql.NVarChar(50), completion_status || 'not_started');
    request.input('hoursSpent', sql.Decimal(5, 2), hours_spent || 0);
    request.input('notes', sql.NText, notes || null);

    // Check if progress record exists
    const checkResult = await request.query(`
      SELECT progress_id FROM user_progress 
      WHERE user_id = @userId 
        AND (@topicId IS NULL OR topic_id = @topicId)
        AND (@chapterId IS NULL OR chapter_id = @chapterId)
    `);

    let result;
    if (checkResult.recordset.length > 0) {
      // Update existing progress
      request.input('progressId', sql.Int, checkResult.recordset[0].progress_id);
      result = await request.query(`
        UPDATE user_progress 
        SET completion_status = @completionStatus, 
            hours_spent = @hoursSpent,
            notes = @notes,
            updated_at = GETUTCDATE(),
            completed_at = CASE WHEN @completionStatus = 'completed' THEN GETUTCDATE() ELSE completed_at END
        OUTPUT inserted.*
        WHERE progress_id = @progressId
      `);
    } else {
      // Create new progress record
      result = await request.query(`
        INSERT INTO user_progress (user_id, topic_id, chapter_id, completion_status, hours_spent, notes, started_at)
        OUTPUT inserted.*
        VALUES (@userId, @topicId, @chapterId, @completionStatus, @hoursSpent, @notes, 
                CASE WHEN @completionStatus != 'not_started' THEN GETUTCDATE() ELSE NULL END)
      `);
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error updating user progress:', error);
    res.status(500).json({ error: 'Failed to update user progress' });
  }
});

// Get user's study hours
router.get('/me/study-hours', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, moduleId } = req.query;

    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);

    let whereClause = 'WHERE sh.user_id = @userId';

    if (startDate) {
      request.input('startDate', sql.Date, startDate);
      whereClause += ' AND sh.study_date >= @startDate';
    }

    if (endDate) {
      request.input('endDate', sql.Date, endDate);
      whereClause += ' AND sh.study_date <= @endDate';
    }

    if (moduleId) {
      request.input('moduleId', sql.Int, moduleId);
      whereClause += ' AND sh.module_id = @moduleId';
    }

    const result = await request.query(`
      SELECT 
        sh.*,
        m.module_code,
        m.module_name,
        t.topic_name,
        ss.session_title
      FROM study_hours sh
      LEFT JOIN modules m ON sh.module_id = m.module_id
      LEFT JOIN topics t ON sh.topic_id = t.topic_id
      LEFT JOIN study_sessions ss ON sh.session_id = ss.session_id
      ${whereClause}
      ORDER BY sh.study_date DESC, sh.logged_at DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching study hours:', error);
    res.status(500).json({ error: 'Failed to fetch study hours' });
  }
});

// Log study hours
router.post('/me/study-hours', authenticateToken, async (req, res) => {
  try {
    const { module_id, topic_id, session_id, hours_logged, description, study_date } = req.body;

    if (!hours_logged || hours_logged <= 0) {
      return res.status(400).json({ error: 'Valid hours_logged is required' });
    }

    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);
    request.input('moduleId', sql.Int, module_id || null);
    request.input('topicId', sql.Int, topic_id || null);
    request.input('sessionId', sql.Int, session_id || null);
    request.input('hoursLogged', sql.Decimal(5, 2), hours_logged);
    request.input('description', sql.NText, description || null);
    request.input('studyDate', sql.Date, study_date || new Date().toISOString().split('T')[0]);

    const result = await request.query(`
      INSERT INTO study_hours (user_id, module_id, topic_id, session_id, hours_logged, description, study_date)
      OUTPUT inserted.*
      VALUES (@userId, @moduleId, @topicId, @sessionId, @hoursLogged, @description, @studyDate)
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error logging study hours:', error);
    res.status(500).json({ error: 'Failed to log study hours' });
  }
});

// Get user statistics
router.get('/me/statistics', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);

    const result = await request.query(`
      SELECT 
        COALESCE(SUM(sh.hours_logged), 0) as total_study_hours,
        COUNT(DISTINCT sa.session_id) as sessions_attended,
        COUNT(DISTINCT CASE WHEN up.completion_status = 'completed' THEN up.topic_id END) as topics_completed,
        COUNT(DISTINCT CASE WHEN up.completion_status = 'completed' THEN up.chapter_id END) as chapters_completed,
        COUNT(DISTINCT um.module_id) as modules_enrolled
      FROM users u
      LEFT JOIN study_hours sh ON u.user_id = sh.user_id
      LEFT JOIN session_attendees sa ON u.user_id = sa.user_id AND sa.attendance_status = 'attended'
      LEFT JOIN user_progress up ON u.user_id = up.user_id
      LEFT JOIN user_modules um ON u.user_id = um.user_id AND um.enrollment_status = 'active'
      WHERE u.user_id = @userId
      GROUP BY u.user_id
    `);

    const stats = result.recordset[0] || {
      total_study_hours: 0,
      sessions_attended: 0,
      topics_completed: 0,
      chapters_completed: 0,
      modules_enrolled: 0,
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

// Get user's notifications
router.get('/me/notifications', authenticateToken, async (req, res) => {
  try {
    const { unreadOnly = false, limit = 50 } = req.query;

    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);
    request.input('limit', sql.Int, parseInt(limit));

    let whereClause = 'WHERE n.user_id = @userId';
    if (unreadOnly === 'true') {
      whereClause += ' AND n.is_read = 0';
    }

    const result = await request.query(`
      SELECT TOP (@limit) *
      FROM notifications n
      ${whereClause}
      ORDER BY n.created_at DESC
    `);

    // Parse metadata JSON
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

// Mark notification as read
router.put('/me/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, req.user.id);
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

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// File upload endpoint for profile images and study materials
router.post('/files/upload', authenticateToken, async (req, res) => {
  try {
    // This is a placeholder for file upload functionality
    // In a real implementation, you'd use multer middleware and Azure Storage
    const { azureStorage } = require('./azureStorageService');
    
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.file;
    const uploadType = req.body.uploadType || 'user-file';
    const moduleId = req.body.moduleId;

    let uploadResult;
    
    if (uploadType === 'profile-image') {
      uploadResult = await azureStorage.uploadProfileImage(
        req.user.id,
        file.data,
        file.mimetype
      );
    } else if (uploadType === 'study-material' && moduleId) {
      uploadResult = await azureStorage.uploadStudyMaterial(
        req.user.id,
        parseInt(moduleId),
        file.name,
        file.data,
        file.mimetype
      );
    } else {
      uploadResult = await azureStorage.uploadUserFile(
        req.user.id,
        file.name,
        file.data,
        file.mimetype,
        { uploadType }
      );
    }

    res.json({
      message: 'File uploaded successfully',
      file: {
        url: uploadResult.url,
        filename: file.name,
        size: file.size,
        type: file.mimetype,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

module.exports = router;
