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
 * Handles real-time event distribution
 */
class StudyBuddyEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Increase limit for multiple listeners
    console.log('🎯 Study Buddy Event Bus initialized');
  }

  /**
   * Emit an event
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

    console.log(`📡 Event emitted: ${eventType}`, {
      userId: payload.userId,
      groupId: payload.groupId,
      sessionId: payload.sessionId,
    });
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
    };
  }
}

// Export singleton instance
const eventBus = new StudyBuddyEventBus();

module.exports = { eventBus, EventType };
