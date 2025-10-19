const express = require('express');
const { logicAppsService } = require('../services/logicAppsService');
const { scheduledTasksService } = require('../services/scheduledTasksService');
const { eventBus, EventType } = require('../utils/eventBus');
const { azureConfig } = require('../config/azureConfig');

const router = express.Router();

/**
 * @swagger
 * /api/test/logic-apps:
 *   get:
 *     summary: Test Logic Apps integration
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: Test results
 */
router.get('/logic-apps', async (req, res) => {
  try {
    console.log('🧪 Starting Logic Apps integration test...');

    const results = {
      timestamp: new Date().toISOString(),
      tests: {},
      overall: 'unknown',
    };

    // Test 1: Azure Config URLs
    try {
      const emailUrl = await azureConfig.getLogicAppEmailUrl();
      const reminderUrl = await azureConfig.getLogicAppReminderUrl();
      const frontendUrl = await azureConfig.getFrontendUrl();

      results.tests.azureConfig = {
        status: 'pass',
        emailUrlConfigured: !!emailUrl && emailUrl.includes('logic.azure.com'),
        reminderUrlConfigured: !!reminderUrl && reminderUrl.includes('logic.azure.com'),
        frontendUrlConfigured: !!frontendUrl,
        urls: {
          emailUrl: emailUrl ? `${emailUrl.substring(0, 40)}...` : 'not configured',
          reminderUrl: reminderUrl ? `${reminderUrl.substring(0, 40)}...` : 'not configured',
          frontendUrl: frontendUrl || 'not configured',
        },
      };
    } catch (error) {
      results.tests.azureConfig = {
        status: 'fail',
        error: error.message,
      };
    }

    // Test 2: Logic Apps Service Initialization
    try {
      const healthCheck = await logicAppsService.healthCheck();
      results.tests.logicAppsService = {
        status: healthCheck.emailService && healthCheck.reminderService ? 'pass' : 'partial',
        healthCheck,
      };
    } catch (error) {
      results.tests.logicAppsService = {
        status: 'fail',
        error: error.message,
      };
    }

    // Test 3: Scheduled Tasks Service
    try {
      const healthCheck = await scheduledTasksService.healthCheck();
      results.tests.scheduledTasks = {
        status: healthCheck.database && healthCheck.logicApps ? 'pass' : 'partial',
        healthCheck,
      };
    } catch (error) {
      results.tests.scheduledTasks = {
        status: 'fail',
        error: error.message,
      };
    }

    // Test 4: Event Bus Integration
    try {
      const stats = eventBus.getStats();
      results.tests.eventBus = {
        status: 'pass',
        stats,
        logicAppsIntegration: eventBus.logicAppsIntegration,
      };
    } catch (error) {
      results.tests.eventBus = {
        status: 'fail',
        error: error.message,
      };
    }

    // Test 5: Test Event Emission (without actually sending emails)
    try {
      // Temporarily disable Logic Apps integration for testing
      const originalSetting = eventBus.logicAppsIntegration;
      eventBus.setLogicAppsIntegration(false);

      // Emit a test event
      eventBus.emitEvent(EventType.PROGRESS_UPDATED, {
        userId: 'test-user',
        topicId: 123,
        completionStatus: 'completed',
      });

      // Restore original setting
      eventBus.setLogicAppsIntegration(originalSetting);

      results.tests.eventEmission = {
        status: 'pass',
        message: 'Event emission test completed successfully',
      };
    } catch (error) {
      results.tests.eventEmission = {
        status: 'fail',
        error: error.message,
      };
    }

    // Determine overall status
    const testResults = Object.values(results.tests);
    const passCount = testResults.filter((t) => t.status === 'pass').length;
    const partialCount = testResults.filter((t) => t.status === 'partial').length;
    const failCount = testResults.filter((t) => t.status === 'fail').length;

    if (failCount === 0 && partialCount === 0) {
      results.overall = 'pass';
    } else if (failCount === 0) {
      results.overall = 'partial';
    } else {
      results.overall = 'fail';
    }

    results.summary = {
      total: testResults.length,
      pass: passCount,
      partial: partialCount,
      fail: failCount,
    };

    console.log(
      `✅ Logic Apps test completed: ${results.overall} (${passCount}/${testResults.length} passed)`
    );

    res.json(results);
  } catch (error) {
    console.error('❌ Logic Apps test failed:', error);
    res.status(500).json({
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error.message,
      message: 'Test execution failed',
    });
  }
});

/**
 * @swagger
 * /api/test/email:
 *   post:
 *     summary: Send test email via Logic Apps
 *     tags: [Test]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test email sent
 */
router.post('/email', async (req, res) => {
  try {
    const { email, message = 'This is a test message from the Study Buddy app!' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const result = await logicAppsService.sendEmail({
      to: email,
      subject: 'Study Buddy - Test Email',
      body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4CAF50;">Test Email</h2>
        <p>${message}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p style="color: #666; font-size: 14px;">This is a test email from the Study Buddy Logic Apps integration.</p>
      </div>`,
      type: 'test',
      metadata: { testTimestamp: new Date().toISOString() },
    });

    res.json({
      success: result.success,
      message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
      result,
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Test email failed',
    });
  }
});

module.exports = router;
