const axios = require('axios');
const { azureConfig } = require('../config/azureConfig');

/**
 * Azure Logic Apps Integration Service
 * Handles email notifications, calendar events, and reminder workflows
 */
class LogicAppsService {
  constructor() {
    this.emailWorkflowUrl = null;
    this.reminderWorkflowUrl = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Get Logic App workflow URLs from Azure Config (Key Vault) or environment
      try {
        this.emailWorkflowUrl = await azureConfig.getLogicAppEmailUrl();
        this.reminderWorkflowUrl = await azureConfig.getLogicAppReminderUrl();
        console.log('📧 Logic Apps service initialized via Azure Config');
      } catch (configError) {
        console.warn('Azure config not available for Logic Apps, using environment variables');
        
        // Fallback to environment variables
        this.emailWorkflowUrl = process.env.LOGIC_APP_EMAIL_URL;
        this.reminderWorkflowUrl = process.env.LOGIC_APP_REMINDER_URL;
      }

      if (this.emailWorkflowUrl) {
        console.log('📧 Email Logic App workflow initialized');
      }

      if (this.reminderWorkflowUrl) {
        console.log('📅 Reminder Logic App workflow initialized');
      }

      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize Logic Apps service:', error);
    }
  }

  /**
   * Send email notification via Logic App
   * @param {Object} emailData - Email details
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.body - Email body (HTML supported)
   * @param {string} emailData.type - Email type (welcome, reminder, notification)
   * @param {Object} emailData.metadata - Additional data for email
   */
  async sendEmail(emailData) {
    await this.initialize();

    if (!this.emailWorkflowUrl) {
      console.warn('⚠️ Email workflow URL not configured, skipping email');
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const payload = {
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
        type: emailData.type || 'notification',
        timestamp: new Date().toISOString(),
        metadata: emailData.metadata || {}
      };

      console.log('📧 Sending email via Logic App:', { to: emailData.to, subject: emailData.subject });

      const response = await axios.post(this.emailWorkflowUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      console.log('✅ Email sent successfully:', response.status);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Failed to send email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create calendar reminder via Logic App
   * @param {Object} eventData - Calendar event details
   * @param {string} eventData.userEmail - User's email for calendar
   * @param {string} eventData.title - Event title
   * @param {string} eventData.description - Event description
   * @param {string} eventData.startTime - Event start (ISO string)
   * @param {string} eventData.endTime - Event end (ISO string)
   * @param {string} eventData.location - Event location
   * @param {Array} eventData.attendees - List of attendee emails
   */
  async createCalendarEvent(eventData) {
    await this.initialize();

    if (!this.reminderWorkflowUrl) {
      console.warn('⚠️ Reminder workflow URL not configured, skipping calendar event');
      return { success: false, message: 'Calendar service not configured' };
    }

    try {
      const payload = {
        userEmail: eventData.userEmail,
        title: eventData.title,
        description: eventData.description || '',
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        location: eventData.location || 'Online',
        attendees: eventData.attendees || [],
        type: 'calendar_event',
        timestamp: new Date().toISOString()
      };

      console.log('📅 Creating calendar event via Logic App:', { title: eventData.title, user: eventData.userEmail });

      const response = await axios.post(this.reminderWorkflowUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ Calendar event created successfully:', response.status);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Failed to create calendar event:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly study schedule reminder
   * @param {string} userEmail - User's email
   * @param {Array} upcomingSessions - Array of upcoming study sessions
   * @param {Object} weeklyStats - User's weekly study statistics
   */
  async sendWeeklyReminder(userEmail, upcomingSessions, weeklyStats) {
    const subject = 'Your Weekly Study Schedule & Progress 📚';
    
    let body = `
      <h2>Hi there! 👋</h2>
      <p>Here's your weekly study summary and upcoming sessions:</p>
      
      <h3>📊 This Week's Progress</h3>
      <ul>
        <li>Total Study Hours: <strong>${weeklyStats.totalHours || 0}h</strong></li>
        <li>Topics Completed: <strong>${weeklyStats.completedTopics || 0}</strong></li>
        <li>Study Sessions Attended: <strong>${weeklyStats.sessionsAttended || 0}</strong></li>
      </ul>
    `;

    if (upcomingSessions && upcomingSessions.length > 0) {
      body += `
        <h3>📅 Upcoming Study Sessions</h3>
        <ul>
      `;
      
      upcomingSessions.forEach(session => {
        const sessionDate = new Date(session.startTime).toLocaleDateString();
        const sessionTime = new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        body += `
          <li>
            <strong>${session.title}</strong><br>
            📅 ${sessionDate} at ${sessionTime}<br>
            📍 ${session.location}<br>
            ${session.participants > 0 ? `👥 ${session.participants} participants` : ''}
          </li>
        `;
      });
      
      body += '</ul>';
    } else {
      body += '<p>No upcoming study sessions scheduled. Why not create one? 🎯</p>';
    }

    body += `
      <p>Keep up the great work! 🌟</p>
      <p><a href="${process.env.FRONTEND_URL || 'https://your-app.com'}" style="background: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Open Campus Study Buddy</a></p>
    `;

    return await this.sendEmail({
      to: userEmail,
      subject,
      body,
      type: 'weekly_reminder',
      metadata: {
        weeklyStats,
        upcomingSessionsCount: upcomingSessions?.length || 0
      }
    });
  }

  /**
   * Send study session reminder
   * @param {Object} session - Study session details
   * @param {Array} participants - List of participant emails
   * @param {number} hoursBefore - Hours before session (1, 24, etc.)
   */
  async sendSessionReminder(session, participants, hoursBefore = 24) {
    const sessionDate = new Date(session.startTime);
    const isToday = hoursBefore <= 2;
    
    const subject = isToday 
      ? `Study Session Starting Soon! 🚨 ${session.title}`
      : `Reminder: Study Session Tomorrow 📚 ${session.title}`;

    const body = `
      <h2>${isToday ? 'Your study session is starting soon!' : 'Don\'t forget about your study session!'} 📚</h2>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #10B981; margin-top: 0;">${session.title}</h3>
        <p><strong>📅 Date:</strong> ${sessionDate.toLocaleDateString()}</p>
        <p><strong>⏰ Time:</strong> ${sessionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        <p><strong>📍 Location:</strong> ${session.location}</p>
        ${session.course ? `<p><strong>📖 Course:</strong> ${session.course}</p>` : ''}
        ${session.description ? `<p><strong>📝 Description:</strong> ${session.description}</p>` : ''}
      </div>

      <p>${isToday ? 'Get ready and join your study buddies!' : 'Make sure to prepare any materials you might need.'}</p>
      
      <p><a href="${process.env.FRONTEND_URL || 'https://your-app.com'}/sessions/${session.id}" style="background: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Session Details</a></p>
    `;

    // Send email to all participants
    const emailPromises = participants.map(email => 
      this.sendEmail({
        to: email,
        subject,
        body,
        type: 'session_reminder',
        metadata: {
          sessionId: session.id,
          hoursBefore,
          sessionTime: session.startTime
        }
      })
    );

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    console.log(`📧 Session reminder sent to ${successful}/${participants.length} participants`);
    return { success: successful > 0, sentCount: successful, totalCount: participants.length };
  }

  /**
   * Send buddy request notification
   * @param {string} recipientEmail - Recipient's email
   * @param {Object} senderInfo - Sender's information
   * @param {string} message - Optional message from sender
   */
  async sendBuddyRequestNotification(recipientEmail, senderInfo, message = '') {
    const subject = `New Study Buddy Request from ${senderInfo.name} 🤝`;
    
    const body = `
      <h2>You have a new study buddy request! 🤝</h2>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #10B981; margin-top: 0;">${senderInfo.name}</h3>
        <p><strong>🎓 University:</strong> ${senderInfo.university || 'Not specified'}</p>
        <p><strong>📚 Course:</strong> ${senderInfo.course || 'Not specified'}</p>
        <p><strong>📊 Study Hours:</strong> ${senderInfo.studyHours || 0}h</p>
        ${senderInfo.bio ? `<p><strong>📝 Bio:</strong> ${senderInfo.bio}</p>` : ''}
        ${message ? `<p><strong>💬 Message:</strong> "${message}"</p>` : ''}
      </div>

      <p>Check out their profile and decide if you'd like to connect!</p>
      
      <p><a href="${process.env.FRONTEND_URL || 'https://your-app.com'}/study-buddy" style="background: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Buddy Requests</a></p>
    `;

    return await this.sendEmail({
      to: recipientEmail,
      subject,
      body,
      type: 'buddy_request',
      metadata: {
        senderId: senderInfo.id,
        senderName: senderInfo.name
      }
    });
  }

  /**
   * Health check for Logic Apps service
   */
  async healthCheck() {
    await this.initialize();
    
    return {
      emailService: !!this.emailWorkflowUrl,
      reminderService: !!this.reminderWorkflowUrl,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
const logicAppsService = new LogicAppsService();
module.exports = { logicAppsService };