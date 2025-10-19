const { logicAppsService } = require('./logicAppsService');
const sql = require('mssql');

/**
 * Scheduled Tasks Service
 * Handles weekly reminders, session reminders, and other scheduled notifications
 */
class ScheduledTasksService {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Get database connection
      try {
        const { azureConfig } = require('../config/azureConfig');
        const dbConfig = await azureConfig.getDatabaseConfig();
        this.pool = await sql.connect(dbConfig);
      } catch (azureErr) {
        // Fallback to env var
        if (process.env.DATABASE_CONNECTION_STRING) {
          this.pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
        } else {
          throw new Error('DATABASE_CONNECTION_STRING not found');
        }
      }

      this.initialized = true;
      console.log('📅 Scheduled Tasks Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Scheduled Tasks Service:', error);
    }
  }

  /**
   * Send weekly reminders to all active users
   * Should be called by a scheduler (e.g., Azure Logic Apps, cron job)
   */
  async sendWeeklyReminders() {
    await this.initialize();
    if (!this.pool) return;

    console.log('📅 Starting weekly reminder process...');

    try {
      // Get all active users with their weekly stats
      const usersResult = await this.pool.request().query(`
        WITH WeeklyStats AS (
          SELECT 
            u.user_id,
            u.email,
            u.first_name + ' ' + u.last_name as name,
            COALESCE(SUM(sh.hours_spent), 0) as totalHours,
            COUNT(DISTINCT CASE WHEN up.completion_status = 'completed' 
                                   AND up.updated_at >= DATEADD(day, -7, GETDATE()) 
                               THEN up.topic_id END) as completedTopics,
            COUNT(DISTINCT sa.session_id) as sessionsAttended
          FROM users u
          LEFT JOIN study_hours sh ON u.user_id = sh.user_id 
            AND sh.logged_at >= DATEADD(day, -7, GETDATE())
          LEFT JOIN user_progress up ON u.user_id = up.user_id
          LEFT JOIN session_attendees sa ON u.user_id = sa.user_id 
            AND sa.responded_at >= DATEADD(day, -7, GETDATE())
            AND sa.attendance_status = 'attending'
          WHERE u.email IS NOT NULL 
            AND u.email != ''
            AND u.user_id IN (SELECT DISTINCT user_id FROM user_modules WHERE enrollment_status = 'active')
          GROUP BY u.user_id, u.email, u.first_name, u.last_name
        )
        SELECT * FROM WeeklyStats
        ORDER BY name
      `);

      const users = usersResult.recordset;
      console.log(`📊 Processing weekly reminders for ${users.length} users`);

      let successCount = 0;
      const batchSize = 10; // Process in batches to avoid rate limits

      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        // Process batch in parallel
        const promises = batch.map(async (user) => {
          try {
            // Get upcoming sessions for this user
            const sessionsResult = await this.pool.request()
              .input('userId', sql.NVarChar(255), user.user_id)
              .query(`
                SELECT 
                  ss.session_title as title,
                  ss.scheduled_start as startTime,
                  ss.location,
                  COUNT(sa2.user_id) as participants
                FROM study_sessions ss
                JOIN session_attendees sa ON ss.session_id = sa.session_id
                LEFT JOIN session_attendees sa2 ON ss.session_id = sa2.session_id 
                  AND sa2.attendance_status = 'attending'
                WHERE sa.user_id = @userId 
                  AND sa.attendance_status = 'attending'
                  AND ss.scheduled_start > GETDATE()
                  AND ss.scheduled_start <= DATEADD(day, 7, GETDATE())
                  AND ss.status IN ('scheduled', 'upcoming')
                GROUP BY ss.session_id, ss.session_title, ss.scheduled_start, ss.location
                ORDER BY ss.scheduled_start
              `);

            const upcomingSessions = sessionsResult.recordset;
            
            // Send weekly reminder
            const result = await logicAppsService.sendWeeklyReminder(
              user.email,
              upcomingSessions,
              {
                totalHours: Math.round(user.totalHours * 10) / 10, // Round to 1 decimal
                completedTopics: user.completedTopics,
                sessionsAttended: user.sessionsAttended
              }
            );

            if (result.success) {
              successCount++;
            }
            
            return { success: result.success, user: user.name };
          } catch (error) {
            console.error(`❌ Failed to send weekly reminder to ${user.name}:`, error.message);
            return { success: false, user: user.name, error: error.message };
          }
        });

        await Promise.all(promises);
        
        // Small delay between batches
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ Weekly reminders completed: ${successCount}/${users.length} sent successfully`);
      return { success: true, sent: successCount, total: users.length };
      
    } catch (error) {
      console.error('❌ Weekly reminder process failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send 24-hour session reminders
   * Should be called daily to remind users of upcoming sessions
   */
  async send24HourSessionReminders() {
    await this.initialize();
    if (!this.pool) return;

    console.log('⏰ Starting 24-hour session reminder process...');

    try {
      // Get sessions starting in 20-28 hours (to account for timezone variations)
      const sessionsResult = await this.pool.request().query(`
        SELECT DISTINCT
          ss.session_id,
          ss.session_title as title,
          ss.description,
          ss.scheduled_start as startTime,
          ss.scheduled_end as endTime,
          ss.location,
          sg.name as course
        FROM study_sessions ss
        LEFT JOIN study_groups sg ON ss.group_id = sg.group_id
        WHERE ss.scheduled_start >= DATEADD(hour, 20, GETDATE())
          AND ss.scheduled_start <= DATEADD(hour, 28, GETDATE())
          AND ss.status IN ('scheduled', 'upcoming')
      `);

      const sessions = sessionsResult.recordset;
      console.log(`📅 Found ${sessions.length} sessions for 24-hour reminders`);

      let totalSent = 0;

      for (const session of sessions) {
        try {
          // Get participants for this session
          const participantsResult = await this.pool.request()
            .input('sessionId', sql.Int, session.session_id)
            .query(`
              SELECT u.email
              FROM session_attendees sa
              JOIN users u ON sa.user_id = u.user_id
              WHERE sa.session_id = @sessionId 
                AND sa.attendance_status = 'attending'
                AND u.email IS NOT NULL 
                AND u.email != ''
            `);

          const participantEmails = participantsResult.recordset.map(p => p.email);
          
          if (participantEmails.length > 0) {
            const result = await logicAppsService.sendSessionReminder(
              session,
              participantEmails,
              24
            );
            
            if (result.success) {
              totalSent += result.sentCount || 0;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to send reminders for session ${session.session_id}:`, error.message);
        }
      }

      console.log(`✅ 24-hour reminders completed: ${totalSent} emails sent for ${sessions.length} sessions`);
      return { success: true, sessions: sessions.length, emailsSent: totalSent };
      
    } catch (error) {
      console.error('❌ 24-hour reminder process failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send 1-hour session reminders
   * Should be called hourly to remind users of imminent sessions
   */
  async send1HourSessionReminders() {
    await this.initialize();
    if (!this.pool) return;

    console.log('🚨 Starting 1-hour session reminder process...');

    try {
      // Get sessions starting in 50-70 minutes
      const sessionsResult = await this.pool.request().query(`
        SELECT DISTINCT
          ss.session_id,
          ss.session_title as title,
          ss.description,
          ss.scheduled_start as startTime,
          ss.scheduled_end as endTime,
          ss.location,
          sg.name as course
        FROM study_sessions ss
        LEFT JOIN study_groups sg ON ss.group_id = sg.group_id
        WHERE ss.scheduled_start >= DATEADD(minute, 50, GETDATE())
          AND ss.scheduled_start <= DATEADD(minute, 70, GETDATE())
          AND ss.status IN ('scheduled', 'upcoming')
      `);

      const sessions = sessionsResult.recordset;
      console.log(`⏰ Found ${sessions.length} sessions for 1-hour reminders`);

      let totalSent = 0;

      for (const session of sessions) {
        try {
          // Get participants for this session
          const participantsResult = await this.pool.request()
            .input('sessionId', sql.Int, session.session_id)
            .query(`
              SELECT u.email
              FROM session_attendees sa
              JOIN users u ON sa.user_id = u.user_id
              WHERE sa.session_id = @sessionId 
                AND sa.attendance_status = 'attending'
                AND u.email IS NOT NULL 
                AND u.email != ''
            `);

          const participantEmails = participantsResult.recordset.map(p => p.email);
          
          if (participantEmails.length > 0) {
            const result = await logicAppsService.sendSessionReminder(
              session,
              participantEmails,
              1
            );
            
            if (result.success) {
              totalSent += result.sentCount || 0;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to send 1-hour reminders for session ${session.session_id}:`, error.message);
        }
      }

      console.log(`✅ 1-hour reminders completed: ${totalSent} emails sent for ${sessions.length} sessions`);
      return { success: true, sessions: sessions.length, emailsSent: totalSent };
      
    } catch (error) {
      console.error('❌ 1-hour reminder process failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Health check for scheduled tasks
   */
  async healthCheck() {
    await this.initialize();
    
    const logicAppsHealth = await logicAppsService.healthCheck();
    
    return {
      database: !!this.pool,
      logicApps: logicAppsHealth,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
const scheduledTasksService = new ScheduledTasksService();
module.exports = { scheduledTasksService };