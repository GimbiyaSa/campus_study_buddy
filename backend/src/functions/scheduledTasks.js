const express = require('express');
const { scheduledTasksService } = require('../services/scheduledTasksService');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/scheduled-tasks/weekly-reminders:
 *   post:
 *     summary: Send weekly reminders to all users
 *     tags: [Scheduled Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weekly reminders processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sent:
 *                   type: number
 *                 total:
 *                   type: number
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/weekly-reminders', authenticateToken, async (req, res) => {
  try {
    console.log('📅 Weekly reminders endpoint called by:', req.user?.user_id || 'system');
    
    const result = await scheduledTasksService.sendWeeklyReminders();
    
    if (result.success) {
      res.json({
        success: true,
        sent: result.sent,
        total: result.total,
        message: `Weekly reminders sent to ${result.sent}/${result.total} users`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to process weekly reminders'
      });
    }
  } catch (error) {
    console.error('❌ Weekly reminders endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/scheduled-tasks/session-reminders/24h:
 *   post:
 *     summary: Send 24-hour session reminders
 *     tags: [Scheduled Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 24-hour reminders processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessions:
 *                   type: number
 *                 emailsSent:
 *                   type: number
 *                 message:
 *                   type: string
 */
router.post('/session-reminders/24h', authenticateToken, async (req, res) => {
  try {
    console.log('⏰ 24-hour session reminders endpoint called by:', req.user?.user_id || 'system');
    
    const result = await scheduledTasksService.send24HourSessionReminders();
    
    if (result.success) {
      res.json({
        success: true,
        sessions: result.sessions,
        emailsSent: result.emailsSent,
        message: `24-hour reminders sent for ${result.sessions} sessions (${result.emailsSent} emails)`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to process 24-hour session reminders'
      });
    }
  } catch (error) {
    console.error('❌ 24-hour session reminders endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/scheduled-tasks/session-reminders/1h:
 *   post:
 *     summary: Send 1-hour session reminders
 *     tags: [Scheduled Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 1-hour reminders processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessions:
 *                   type: number
 *                 emailsSent:
 *                   type: number
 *                 message:
 *                   type: string
 */
router.post('/session-reminders/1h', authenticateToken, async (req, res) => {
  try {
    console.log('🚨 1-hour session reminders endpoint called by:', req.user?.user_id || 'system');
    
    const result = await scheduledTasksService.send1HourSessionReminders();
    
    if (result.success) {
      res.json({
        success: true,
        sessions: result.sessions,
        emailsSent: result.emailsSent,
        message: `1-hour reminders sent for ${result.sessions} sessions (${result.emailsSent} emails)`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to process 1-hour session reminders'
      });
    }
  } catch (error) {
    console.error('❌ 1-hour session reminders endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/scheduled-tasks/health:
 *   get:
 *     summary: Check scheduled tasks service health
 *     tags: [Scheduled Tasks]
 *     responses:
 *       200:
 *         description: Health check results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 database:
 *                   type: boolean
 *                 logicApps:
 *                   type: object
 *                 initialized:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 */
router.get('/health', async (req, res) => {
  try {
    const health = await scheduledTasksService.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('❌ Scheduled tasks health check error:', error);
    res.status(500).json({
      database: false,
      logicApps: false,
      initialized: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;