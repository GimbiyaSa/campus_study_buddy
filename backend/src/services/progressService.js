/**
 * Progress Service - Study Progress Tracking
 * 
 * This service handles study session logging and progress tracking with the following logic:
 * 
 * 1. STUDY SESSIONS: 
 *    - Log study time in `study_hours` table
 *    - Link to modules and topics for better tracking
 *    - Support both individual and group study sessions
 * 
 * 2. PROGRESS TRACKING:
 *    - Topic-level progress: user_progress.chapter_id IS NULL (tracks overall topic progress)
 *    - Chapter-level progress: user_progress.chapter_id IS NOT NULL (tracks specific chapter progress)
 *    - This service primarily focuses on TOPIC-LEVEL progress for consistency with course service
 * 
 * 3. INTEGRATION WITH COURSE SERVICE:
 *    - Progress calculations must match between progress and course services
 *    - Both services use topic-level completion for module progress percentage
 *    - Study hours from both study_hours table and user_progress.hours_spent are tracked
 * 
 * 4. AUTHENTICATION:
 *    - All endpoints require valid JWT token via authenticateToken middleware
 *    - User context is extracted from req.user (set by auth middleware)
 * 
 * 5. KEY ENDPOINTS:
 *    - POST /sessions: Log study session and update topic progress
 *    - GET /analytics: Comprehensive study analytics with time-based filtering
 *    - GET /modules/:id: Detailed progress for specific module
 *    - PUT /topics/:id/complete: Mark topic as completed
 *    - GET /goals: Study goals and achievements tracking
 *    - GET /leaderboard: Social feature for study competition
 */

const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Azure SQL Database configuration
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

// Helper function to get database pool
async function getPool() {
  if (!pool) {
    await initializeDatabase();
  }
  return pool;
}

// POST /progress/sessions - Log study session
router.post('/sessions', authenticateToken, async (req, res) => {

  try {
    const { moduleId, topicIds, duration, notes, groupId, sessionId, description } = req.body;

    if (!duration || duration <= 0) {
      return res.status(400).json({ error: 'Duration must be greater than 0' });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // If moduleId is provided, verify user is enrolled
      if (moduleId) {
        const enrollmentCheck = new sql.Request(transaction);
        enrollmentCheck.input('userId', sql.NVarChar(255), req.user.id);
        enrollmentCheck.input('moduleId', sql.Int, moduleId);

        const enrollment = await enrollmentCheck.query(`
                    SELECT user_module_id FROM dbo.user_modules 
                    WHERE user_id = @userId AND module_id = @moduleId AND enrollment_status = 'active'
                `);

        if (enrollment.recordset.length === 0) {
          await transaction.rollback();
          return res.status(403).json({ error: 'Not enrolled in this module' });
        }
      }

      // Log study hours
      const studyHoursRequest = new sql.Request(transaction);
      studyHoursRequest.input('userId', sql.NVarChar(255), req.user.id);
      studyHoursRequest.input('moduleId', sql.Int, moduleId || null);
      studyHoursRequest.input(
        'topicId',
        sql.Int,
        topicIds && topicIds.length > 0 ? topicIds[0] : null
      );
      studyHoursRequest.input('sessionId', sql.Int, sessionId || null);
      studyHoursRequest.input('hoursLogged', sql.Decimal(5, 2), duration / 60);
      studyHoursRequest.input('description', sql.NText, description || notes || '');
      studyHoursRequest.input('studyDate', sql.Date, new Date());

      const studyHoursResult = await studyHoursRequest.query(`
                INSERT INTO dbo.study_hours (user_id, module_id, topic_id, session_id, hours_logged, description, study_date, logged_at)
                OUTPUT inserted.hour_id, inserted.study_date, inserted.logged_at
                VALUES (@userId, @moduleId, @topicId, @sessionId, @hoursLogged, @description, @studyDate, GETUTCDATE())
            `);

      const loggedHour = studyHoursResult.recordset[0];

      // Update topic progress if topicIds provided
      const progressUpdates = [];
      if (topicIds && topicIds.length > 0) {
        for (const topicId of topicIds) {
          const progressRequest = new sql.Request(transaction);
          progressRequest.input('userId', sql.NVarChar(255), req.user.id);
          progressRequest.input('topicId', sql.Int, topicId);

          // Check if topic-level progress record exists (chapter_id IS NULL means topic-level)
          const existingProgress = await progressRequest.query(`
                        SELECT progress_id, completion_status, hours_spent 
                        FROM dbo.user_progress 
                        WHERE user_id = @userId AND topic_id = @topicId AND chapter_id IS NULL
                    `);

          if (existingProgress.recordset.length > 0) {
            // Update existing topic-level progress
            const current = existingProgress.recordset[0];
            const newHours = (current.hours_spent || 0) + duration / 60;
            const newStatus =
              current.completion_status === 'not_started'
                ? 'in_progress'
                : current.completion_status;

            progressRequest.input('newHours', sql.Decimal(5, 2), newHours);
            progressRequest.input('newStatus', sql.NVarChar(50), newStatus);
            progressRequest.input('progressId', sql.Int, current.progress_id);

            await progressRequest.query(`
                            UPDATE dbo.user_progress 
                            SET hours_spent = @newHours, 
                                completion_status = @newStatus,
                                started_at = COALESCE(started_at, GETUTCDATE()),
                                updated_at = GETUTCDATE()
                            WHERE progress_id = @progressId
                        `);

            progressUpdates.push({ topicId, status: newStatus, hours: newHours });
          } else {
            // Create new topic-level progress record
            progressRequest.input('hoursSpent', sql.Decimal(5, 2), duration / 60);

            const newProgressResult = await progressRequest.query(`
                            INSERT INTO dbo.user_progress (user_id, topic_id, chapter_id, completion_status, hours_spent, started_at, updated_at)
                            OUTPUT inserted.progress_id
                            VALUES (@userId, @topicId, NULL, 'in_progress', @hoursSpent, GETUTCDATE(), GETUTCDATE())
                        `);

            progressUpdates.push({
              topicId,
              status: 'in_progress',
              hours: duration / 60,
              progressId: newProgressResult.recordset[0].progress_id,
            });
          }
        }
      }

      await transaction.commit();

      const response = {
        hourId: loggedHour.hour_id,
        userId: req.user.id,
        moduleId: moduleId,
        topicIds: topicIds || [],
        duration: duration,
        hours: duration / 60,
        description: description || notes || '',
        studyDate: loggedHour.study_date,
        loggedAt: loggedHour.logged_at,
        progressUpdates: progressUpdates,
      };

      res.status(201).json(response);
    } catch (transactionErr) {
      await transaction.rollback();
      throw transactionErr;
    }
  } catch (error) {
    console.error('Error logging study session:', error);
    res.status(500).json({ error: 'Failed to log study session' });
  }
});

// GET /progress/analytics - Get progress analytics
router.get('/analytics', authenticateToken, async (req, res) => {

  try {
    const { timeframe = '30d', moduleId } = req.query;
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);
    request.input('daysBack', sql.Int, daysBack);

    let moduleFilter = '';
    if (moduleId) {
      request.input('moduleId', sql.Int, parseInt(moduleId));
      moduleFilter = 'AND sh.module_id = @moduleId';
    }

    // Get study hours data
    const studyHoursQuery = `
            SELECT 
                sh.study_date,
                sh.hours_logged,
                sh.description,
                m.module_name,
                m.module_code,
                t.topic_name,
                sh.logged_at
            FROM dbo.study_hours sh
            LEFT JOIN dbo.modules m ON sh.module_id = m.module_id
            LEFT JOIN dbo.topics t ON sh.topic_id = t.topic_id
            WHERE sh.user_id = @userId 
            AND sh.study_date >= DATEADD(day, -@daysBack, CAST(GETUTCDATE() AS DATE))
            ${moduleFilter}
            ORDER BY sh.study_date DESC, sh.logged_at DESC
        `;

    const studyHoursResult = await request.query(studyHoursQuery);
    const studyHours = studyHoursResult.recordset;

    // Get progress data (only topic-level progress, not chapter-level)
    const progressQuery = `
            SELECT 
                up.completion_status,
                up.hours_spent,
                up.started_at,
                up.completed_at,
                t.topic_name,
                m.module_name,
                m.module_code
            FROM dbo.user_progress up
            INNER JOIN dbo.topics t ON up.topic_id = t.topic_id
            INNER JOIN dbo.modules m ON t.module_id = m.module_id
            WHERE up.user_id = @userId
            AND up.chapter_id IS NULL
            AND up.updated_at >= DATEADD(day, -@daysBack, GETUTCDATE())
            ${moduleFilter.replace('sh.module_id', 'm.module_id')}
            ORDER BY up.updated_at DESC
        `;

    const progressResult = await request.query(progressQuery);
    const progressData = progressResult.recordset;

    // Calculate analytics
    const analytics = {
      timeframe: timeframe,
      totalSessions: studyHours.length,
      totalHours: studyHours.reduce((sum, sh) => sum + sh.hours_logged, 0),
      averageSessionLength:
        studyHours.length > 0
          ? studyHours.reduce((sum, sh) => sum + sh.hours_logged, 0) / studyHours.length
          : 0,

      // Topics and modules studied
      topicsStudied: [
        ...new Set(studyHours.filter((sh) => sh.topic_name).map((sh) => sh.topic_name)),
      ],
      modulesStudied: [
        ...new Set(studyHours.filter((sh) => sh.module_name).map((sh) => sh.module_name)),
      ],

      // Progress breakdown
      topicsCompleted: progressData.filter((p) => p.completion_status === 'completed').length,
      topicsInProgress: progressData.filter((p) => p.completion_status === 'in_progress').length,

      // Daily breakdown
      dailyBreakdown: generateDailyBreakdown(studyHours, daysBack),

      // Module/subject breakdown
      moduleBreakdown: generateModuleBreakdown(studyHours),

      // Recent activity
      recentSessions: studyHours.slice(0, 10).map((sh) => ({
        date: sh.study_date,
        hours: sh.hours_logged,
        module: sh.module_name,
        topic: sh.topic_name,
        description: sh.description,
        loggedAt: sh.logged_at,
      })),

      // Progress trends
      progressTrend: generateProgressTrend(progressData),
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /progress/modules/:moduleId - Get detailed progress for a specific module
router.get('/modules/:moduleId', authenticateToken, async (req, res) => {

  try {
    const moduleId = parseInt(req.params.moduleId);

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);
    request.input('moduleId', sql.Int, moduleId);

    // Verify enrollment
    const enrollmentCheck = await request.query(`
            SELECT um.enrollment_status, m.module_name, m.module_code, m.description
            FROM dbo.user_modules um
            INNER JOIN dbo.modules m ON um.module_id = m.module_id
            WHERE um.user_id = @userId AND um.module_id = @moduleId
        `);

    if (enrollmentCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Not enrolled in this module' });
    }

    const moduleInfo = enrollmentCheck.recordset[0];

    // Get topic progress
    const topicsQuery = `
            SELECT 
                t.topic_id,
                t.topic_name,
                t.description as topic_description,
                t.order_sequence,
                ISNULL(up.completion_status, 'not_started') as completion_status,
                ISNULL(up.hours_spent, 0) as hours_spent,
                up.started_at,
                up.completed_at,
                up.notes,
                -- Chapter counts
                (SELECT COUNT(*) FROM dbo.chapters c WHERE c.topic_id = t.topic_id AND c.is_active = 1) as total_chapters,
                (SELECT COUNT(*) 
                 FROM dbo.chapters c 
                 INNER JOIN dbo.user_progress up2 ON c.chapter_id = up2.chapter_id 
                 WHERE c.topic_id = t.topic_id AND up2.user_id = @userId AND up2.completion_status = 'completed'
                ) as completed_chapters,
                -- Study hours for this topic
                ISNULL((SELECT SUM(hours_logged) FROM dbo.study_hours sh WHERE sh.topic_id = t.topic_id AND sh.user_id = @userId), 0) as logged_hours
            FROM dbo.topics t
            LEFT JOIN dbo.user_progress up ON t.topic_id = up.topic_id AND up.user_id = @userId AND up.chapter_id IS NULL
            WHERE t.module_id = @moduleId AND t.is_active = 1
            ORDER BY t.order_sequence ASC, t.topic_name ASC
        `;

    const topicsResult = await request.query(topicsQuery);
    const topics = topicsResult.recordset.map((topic) => ({
      topicId: topic.topic_id,
      name: topic.topic_name,
      description: topic.topic_description,
      orderSequence: topic.order_sequence,
      completionStatus: topic.completion_status,
      hoursSpent: topic.hours_spent,
      loggedHours: topic.logged_hours,
      startedAt: topic.started_at,
      completedAt: topic.completed_at,
      notes: topic.notes,
      totalChapters: topic.total_chapters,
      completedChapters: topic.completed_chapters,
      progress:
        topic.total_chapters > 0
          ? Math.round((topic.completed_chapters / topic.total_chapters) * 100)
          : 0,
    }));

    // Get overall module stats
    const totalTopics = topics.length;
    const completedTopics = topics.filter((t) => t.completionStatus === 'completed').length;
    const inProgressTopics = topics.filter((t) => t.completionStatus === 'in_progress').length;
    const totalHours = topics.reduce((sum, t) => sum + t.loggedHours, 0);
    const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

    // Get recent study sessions for this module
    const recentSessionsQuery = `
            SELECT TOP 10
                sh.study_date,
                sh.hours_logged,
                sh.description,
                t.topic_name,
                sh.logged_at
            FROM dbo.study_hours sh
            LEFT JOIN dbo.topics t ON sh.topic_id = t.topic_id
            WHERE sh.user_id = @userId AND sh.module_id = @moduleId
            ORDER BY sh.study_date DESC, sh.logged_at DESC
        `;

    const recentSessionsResult = await request.query(recentSessionsQuery);
    const recentSessions = recentSessionsResult.recordset;

    const response = {
      moduleId: moduleId,
      moduleName: moduleInfo.module_name,
      moduleCode: moduleInfo.module_code,
      description: moduleInfo.description,
      enrollmentStatus: moduleInfo.enrollment_status,

      // Progress summary
      progress: {
        overall: overallProgress,
        totalTopics: totalTopics,
        completedTopics: completedTopics,
        inProgressTopics: inProgressTopics,
        notStartedTopics: totalTopics - completedTopics - inProgressTopics,
      },

      // Time tracking
      timeTracking: {
        totalHours: totalHours,
        averageHoursPerTopic: totalTopics > 0 ? totalHours / totalTopics : 0,
        totalSessions: recentSessions.length,
        averageSessionLength: recentSessions.length > 0 ? 
          recentSessions.reduce((sum, s) => sum + s.hours_logged, 0) / recentSessions.length : 0,
      },

      // Detailed topic progress
      topics: topics,

      // Recent activity
      recentSessions: recentSessions.map((session) => ({
        date: session.study_date,
        hours: session.hours_logged,
        topic: session.topic_name,
        description: session.description,
        loggedAt: session.logged_at,
      })),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching module progress:', error);
    res.status(500).json({ error: 'Failed to fetch module progress' });
  }
});

// PUT /progress/topics/:topicId/complete - Mark topic as completed
router.put('/topics/:topicId/complete', authenticateToken, async (req, res) => {

  try {
    const topicId = parseInt(req.params.topicId);
    const { notes } = req.body;

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Verify user has access to this topic (through module enrollment)
      const accessCheck = new sql.Request(transaction);
      accessCheck.input('userId', sql.NVarChar(255), req.user.id);
      accessCheck.input('topicId', sql.Int, topicId);

      const access = await accessCheck.query(`
                SELECT t.topic_name, m.module_name
                FROM dbo.topics t
                INNER JOIN dbo.modules m ON t.module_id = m.module_id
                INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
                WHERE t.topic_id = @topicId AND um.user_id = @userId AND um.enrollment_status = 'active'
            `);

      if (access.recordset.length === 0) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Access denied to this topic' });
      }

      const topicInfo = access.recordset[0];

      // Update or create progress record
      const progressRequest = new sql.Request(transaction);
      progressRequest.input('userId', sql.NVarChar(255), req.user.id);
      progressRequest.input('topicId', sql.Int, topicId);
      progressRequest.input('notes', sql.NText, notes || '');

      const existingProgress = await progressRequest.query(`
                SELECT progress_id FROM dbo.user_progress 
                WHERE user_id = @userId AND topic_id = @topicId AND chapter_id IS NULL
            `);

      if (existingProgress.recordset.length > 0) {
        // Update existing
        progressRequest.input('progressId', sql.Int, existingProgress.recordset[0].progress_id);
        await progressRequest.query(`
                    UPDATE dbo.user_progress 
                    SET completion_status = 'completed',
                        completed_at = GETUTCDATE(),
                        updated_at = GETUTCDATE(),
                        notes = @notes
                    WHERE progress_id = @progressId
                `);
      } else {
        // Create new
        await progressRequest.query(`
                    INSERT INTO dbo.user_progress (user_id, topic_id, completion_status, started_at, completed_at, updated_at, notes)
                    VALUES (@userId, @topicId, 'completed', GETUTCDATE(), GETUTCDATE(), GETUTCDATE(), @notes)
                `);
      }

      await transaction.commit();

      res.json({
        success: true,
        topicId: topicId,
        topicName: topicInfo.topic_name,
        moduleName: topicInfo.module_name,
        completedAt: new Date().toISOString(),
        notes: notes || '',
      });
    } catch (transactionErr) {
      await transaction.rollback();
      throw transactionErr;
    }
  } catch (error) {
    console.error('Error completing topic:', error);
    res.status(500).json({ error: 'Failed to complete topic' });
  }
});

// GET /progress/leaderboard - Get study leaderboard (optional social feature)
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { timeframe = '30d', limit = 10 } = req.query;
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;

    const pool = await getPool();
    const request = pool.request();
    request.input('daysBack', sql.Int, daysBack);
    request.input('limit', sql.Int, parseInt(limit));

    const leaderboardQuery = `
            SELECT TOP (@limit)
                u.user_id,
                u.first_name,
                u.last_name,
                u.university,
                u.course,
                SUM(sh.hours_logged) as total_hours,
                COUNT(DISTINCT sh.study_date) as study_days,
                COUNT(sh.hour_id) as total_sessions,
                AVG(sh.hours_logged) as avg_session_length
            FROM dbo.users u
            INNER JOIN dbo.study_hours sh ON u.user_id = sh.user_id
            WHERE sh.study_date >= DATEADD(day, -@daysBack, CAST(GETUTCDATE() AS DATE))
            AND u.is_active = 1
            GROUP BY u.user_id, u.first_name, u.last_name, u.university, u.course
            ORDER BY total_hours DESC, study_days DESC
        `;

    const result = await request.query(leaderboardQuery);

    const leaderboard = result.recordset.map((user, index) => ({
      rank: index + 1,
      userId: user.user_id,
      name: `${user.first_name} ${user.last_name}`,
      university: user.university,
      course: user.course,
      totalHours: Math.round(user.total_hours * 100) / 100,
      studyDays: user.study_days,
      totalSessions: user.total_sessions,
      avgSessionLength: Math.round(user.avg_session_length * 100) / 100,
    }));

    res.json({
      timeframe: timeframe,
      leaderboard: leaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /progress/goals - Get user study goals (new feature)
router.get('/goals', authenticateToken, async (req, res) => {

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);

    // Get current week and month progress
    const progressQuery = `
            SELECT 
                -- This week
                ISNULL(SUM(CASE WHEN sh.study_date >= DATEADD(day, -7, CAST(GETUTCDATE() AS DATE)) 
                    THEN sh.hours_logged ELSE 0 END), 0) as hours_this_week,
                COUNT(CASE WHEN sh.study_date >= DATEADD(day, -7, CAST(GETUTCDATE() AS DATE)) 
                    THEN 1 END) as sessions_this_week,
                
                -- This month
                ISNULL(SUM(CASE WHEN sh.study_date >= DATEADD(day, -30, CAST(GETUTCDATE() AS DATE)) 
                    THEN sh.hours_logged ELSE 0 END), 0) as hours_this_month,
                COUNT(CASE WHEN sh.study_date >= DATEADD(day, -30, CAST(GETUTCDATE() AS DATE)) 
                    THEN 1 END) as sessions_this_month,
                
                -- All time
                ISNULL(SUM(sh.hours_logged), 0) as total_hours,
                COUNT(sh.hour_id) as total_sessions
            FROM dbo.study_hours sh
            WHERE sh.user_id = @userId
        `;

    const progressResult = await request.query(progressQuery);
    const progress = progressResult.recordset[0];

    // Get topic completion stats (only topic-level progress)
    const topicStatsQuery = `
            SELECT 
                COUNT(CASE WHEN up.completion_status = 'completed' THEN 1 END) as completed_topics,
                COUNT(CASE WHEN up.completion_status = 'in_progress' THEN 1 END) as in_progress_topics,
                COUNT(*) as total_tracked_topics
            FROM dbo.user_progress up
            WHERE up.user_id = @userId AND up.chapter_id IS NULL
        `;

    const topicStatsResult = await request.query(topicStatsQuery);
    const topicStats = topicStatsResult.recordset[0];

    // Sample goals (you could store these in database)
    const goals = {
      weekly: {
        hoursGoal: 10,
        sessionsGoal: 5,
        currentHours: Math.round(progress.hours_this_week * 100) / 100,
        currentSessions: progress.sessions_this_week,
        hoursProgress: Math.min(100, (progress.hours_this_week / 10) * 100),
        sessionsProgress: Math.min(100, (progress.sessions_this_week / 5) * 100),
      },
      monthly: {
        hoursGoal: 40,
        topicsGoal: 5,
        currentHours: Math.round(progress.hours_this_month * 100) / 100,
        currentTopics: topicStats.completed_topics,
        hoursProgress: Math.min(100, (progress.hours_this_month / 40) * 100),
        topicsProgress: Math.min(100, (topicStats.completed_topics / 5) * 100),
      },
      overall: {
        totalHours: Math.round(progress.total_hours * 100) / 100,
        totalSessions: progress.total_sessions,
        completedTopics: topicStats.completed_topics,
        inProgressTopics: topicStats.in_progress_topics,
      },
    };

    res.json(goals);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Helper functions
function generateDailyBreakdown(studyHours, days) {
  const breakdown = {};

  // Initialize all days
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    breakdown[dateKey] = {
      sessions: 0,
      hours: 0,
    };
  }

  // Fill in actual data
  studyHours.forEach((entry) => {
    const dateKey = entry.study_date.toISOString().split('T')[0];
    if (breakdown[dateKey]) {
      breakdown[dateKey].sessions++;
      breakdown[dateKey].hours =
        Math.round((breakdown[dateKey].hours + entry.hours_logged) * 100) / 100;
    }
  });

  return breakdown;
}

function generateModuleBreakdown(studyHours) {
  const breakdown = {};

  studyHours.forEach((entry) => {
    const moduleKey = entry.module_name || 'Unknown';
    if (!breakdown[moduleKey]) {
      breakdown[moduleKey] = {
        sessions: 0,
        hours: 0,
        moduleCode: entry.module_code || null,
      };
    }
    breakdown[moduleKey].sessions++;
    breakdown[moduleKey].hours =
      Math.round((breakdown[moduleKey].hours + entry.hours_logged) * 100) / 100;
  });

  return breakdown;
}

function generateProgressTrend(progressData) {
  const completedByDate = {};

  progressData
    .filter((p) => p.completion_status === 'completed' && p.completed_at)
    .forEach((p) => {
      const dateKey = p.completed_at.toISOString().split('T')[0];
      completedByDate[dateKey] = (completedByDate[dateKey] || 0) + 1;
    });

  return completedByDate;
}

// Error handling middleware for database connection issues
router.use((err, req, res, next) => {
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('Database connection issue detected, will reconnect on next request:', err.message);
    // Reset the pool to force reconnection on next request
    pool = null;
    res.status(503).json({ error: 'Service temporarily unavailable, please try again' });
    return;
  }
  next(err);
});

module.exports = router;
