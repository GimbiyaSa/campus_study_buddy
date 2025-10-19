const { EventEmitter } = require('events');

// Event types for the application
const EventType = {
  // User events
  USER_REGISTERED: 'user:registered',
  USER_UPDATED: 'user:updated',
  USER_DELETED: 'user:deleted',
  
  // Course/Module events
  COURSE_ENROLLED: 'course:enrolled',
  MODULE_COMPLETED: 'module:completed',
  PROGRESS_UPDATED: 'progress:updated',
  
  // Study buddy events
  BUDDY_REQUEST_SENT: 'buddy:request_sent',
  BUDDY_REQUEST_ACCEPTED: 'buddy:request_accepted',
  BUDDY_REQUEST_DECLINED: 'buddy:request_declined',
  BUDDY_MATCHED: 'buddy:matched',
  
  // Session events
  SESSION_CREATED: 'session:created',
  SESSION_UPDATED: 'session:updated',
  SESSION_CANCELLED: 'session:cancelled',
  SESSION_JOINED: 'session:joined',
  SESSION_LEFT: 'session:left',
  SESSION_STARTING_SOON: 'session:starting_soon',
  
  // Group events
  GROUP_CREATED: 'group:created',
  GROUP_UPDATED: 'group:updated',
  GROUP_MEMBER_JOINED: 'group:member_joined',
  GROUP_MEMBER_LEFT: 'group:member_left',
  
  // Notification events
  NOTIFICATION_CREATED: 'notification:created',
  NOTIFICATION_READ: 'notification:read',
  
  // Chat events
  MESSAGE_SENT: 'chat:message_sent',
  CHAT_CREATED: 'chat:created',
  
  // Notes events
  NOTE_CREATED: 'note:created',
  NOTE_UPDATED: 'note:updated',
  NOTE_SHARED: 'note:shared',
};

/**
 * Centralized Event Bus for the Study Buddy application
 * Handles real-time event distribution and automatic Logic Apps integration
 */
class StudyBuddyEventBus extends EventEmitter {
  constructor() {
    super();
    this.logicAppsIntegration = true;
    this.setMaxListeners(100); // Increase limit for multiple listeners
    this.setupLogicAppsIntegration();
    console.log('🎯 Study Buddy Event Bus initialized');
  }

  /**
   * Emit an event with automatic Logic Apps integration
   */
  emitEvent(eventType, data, metadata = {}) {
    const payload = {
      type: eventType,
      data,
      userId: data.userId || data.user_id,
      groupId: data.groupId || data.group_id,
      sessionId: data.sessionId || data.session_id,
      timestamp: new Date(),
      metadata,
    };

    // Emit to all listeners
    this.emit(eventType, payload);
    this.emit('*', payload); // Global listener

    // Handle Logic Apps integration if enabled
    if (this.logicAppsIntegration) {
      this.handleLogicAppsIntegration(payload);
    }

    console.log(`📡 Event emitted: ${eventType}`, {
      userId: payload.userId,
      groupId: payload.groupId,
      sessionId: payload.sessionId,
    });
  }

  /**
   * Setup automatic Logic Apps integration for notifications and calendar events
   */
  setupLogicAppsIntegration() {
    // Dynamically import logicAppsService to avoid circular dependencies
    let logicAppsService;
    try {
      logicAppsService = require('../services/logicAppsService').logicAppsService;
    } catch (error) {
      console.warn('❌ Could not load logicAppsService for event integration:', error.message);
      return;
    }

    // Session events - create calendar events
    this.on(EventType.SESSION_CREATED, async (payload) => {
      try {
        const sessionData = payload.data;
        if (sessionData.scheduled_start && sessionData.participants?.length > 0) {
          await logicAppsService.createCalendarEvent(sessionData);
        }
      } catch (error) {
        console.error('❌ Failed to create calendar event:', error.message);
      }
    });

    // Buddy request events - send email notifications
    this.on(EventType.BUDDY_REQUEST_SENT, async (payload) => {
      try {
        const { requester, recipient } = payload.data;
        if (recipient.email) {
          await logicAppsService.sendBuddyRequestNotification(
            recipient.email,
            requester,
            payload.data
          );
        }
      } catch (error) {
        console.error('❌ Failed to send buddy request email:', error.message);
      }
    });

    this.on(EventType.BUDDY_REQUEST_ACCEPTED, async (payload) => {
      try {
        const { requester, accepter } = payload.data;
        if (requester.email) {
          await logicAppsService.sendEmail({
            to: requester.email,
            subject: 'Study Buddy Request Accepted! 🎉',
            body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #4CAF50;">Great news!</h2>
              <p>Your study buddy request has been accepted by <strong>${accepter.name}</strong>!</p>
              <p>You can now start planning study sessions together and collaborate on your courses.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>What's next?</h3>
                <ul>
                  <li>Schedule study sessions together</li>
                  <li>Share notes and resources</li>
                  <li>Track your progress as a team</li>
                </ul>
              </div>
              <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
                     style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Start Studying Together
              </a></p>
              <p style="color: #666; font-size: 14px;">Happy studying!<br>The Study Buddy Team</p>
            </div>`,
            type: 'buddy_request_accepted',
            metadata: { requesterId: requester.user_id, accepterId: accepter.user_id }
          });
        }
      } catch (error) {
        console.error('❌ Failed to send buddy acceptance email:', error.message);
      }
    });

    // Progress events - milestone celebrations
    this.on(EventType.MODULE_COMPLETED, async (payload) => {
      try {
        const { user, module, progress } = payload.data;
        if (user.email && progress.completion_percentage >= 100) {
          await logicAppsService.sendEmail({
            to: user.email,
            subject: `Module Completed: ${module.name} ✨`,
            body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #FF9800;">Congratulations! 🎊</h2>
              <p>You've successfully completed the module <strong>${module.name}</strong>!</p>
              <div style="background: linear-gradient(135deg, #FF9800, #FFC107); color: white; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
                <h3 style="margin: 0;">Module Complete!</h3>
                <p style="margin: 10px 0 0 0; font-size: 18px;">${module.name}</p>
              </div>
              <p>Keep up the great work! Your progress is inspiring.</p>
              <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/progress" 
                     style="background: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Your Progress
              </a></p>
              <p style="color: #666; font-size: 14px;">Keep learning!<br>The Study Buddy Team</p>
            </div>`,
            type: 'module_completion',
            metadata: { moduleId: module.module_id, userId: user.user_id }
          });
        }
      } catch (error) {
        console.error('❌ Failed to send module completion email:', error.message);
      }
    });

    // Group events - member notifications
    this.on(EventType.GROUP_MEMBER_JOINED, async (payload) => {
      try {
        const { group, newMember, existingMembers } = payload.data;
        const memberEmails = existingMembers?.filter(m => m.email && m.user_id !== newMember.user_id)
                                          ?.map(m => m.email) || [];
        
        if (memberEmails.length > 0) {
          // Send to multiple recipients by sending individual emails
          for (const email of memberEmails) {
            await logicAppsService.sendEmail({
              to: email,
              subject: `New member joined ${group.name}`,
              body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2196F3;">Welcome ${newMember.name}! 👋</h2>
                <p><strong>${newMember.name}</strong> has joined your study group <em>${group.name}</em>.</p>
                <p>Say hello and help them get up to speed with your group activities!</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/groups/${group.group_id}" 
                       style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Visit Group
                </a></p>
              </div>`,
              type: 'group_member_joined',
              metadata: { groupId: group.group_id, newMemberId: newMember.user_id }
            });
          }
        }
      } catch (error) {
        console.error('❌ Failed to send group member notification:', error.message);
      }
    });

    console.log('📧 Logic Apps integration setup complete');
  }

  /**
   * Handle Logic Apps integration based on event type
   */
  async handleLogicAppsIntegration(payload) {
    // This method is called automatically for all events
    // Specific integrations are handled by the event listeners above
    
    // You can add general Logic Apps handling here if needed
    // For example, logging to a central system, analytics, etc.
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType, listener) {
    this.on(eventType, listener);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(eventType, listener) {
    this.off(eventType, listener);
  }

  /**
   * Enable/disable Logic Apps integration
   */
  setLogicAppsIntegration(enabled) {
    this.logicAppsIntegration = enabled;
    console.log(`📧 Logic Apps integration ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get event bus statistics
   */
  getStats() {
    return {
      eventNames: this.eventNames(),
      maxListeners: this.getMaxListeners(),
      listenerCount: this.eventNames().reduce((acc, event) => {
        acc[event.toString()] = this.listenerCount(event);
        return acc;
      }, {}),
      logicAppsIntegration: this.logicAppsIntegration,
    };
  }
}

// Export singleton instance
const eventBus = new StudyBuddyEventBus();

module.exports = { eventBus, EventType };