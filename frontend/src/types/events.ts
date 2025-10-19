/**
 * Event Types for Study Buddy Application
 * Consistent event types shared between frontend and backend
 */

export enum EventType {
  // User events
  USER_REGISTERED = 'user:registered',
  USER_UPDATED = 'user:updated',
  USER_DELETED = 'user:deleted',
  
  // Course/Module events
  COURSE_ENROLLED = 'course:enrolled',
  MODULE_COMPLETED = 'module:completed',
  PROGRESS_UPDATED = 'progress:updated',
  
  // Study buddy events
  BUDDY_REQUEST_SENT = 'buddy:request_sent',
  BUDDY_REQUEST_ACCEPTED = 'buddy:request_accepted',
  BUDDY_REQUEST_DECLINED = 'buddy:request_declined',
  BUDDY_MATCHED = 'buddy:matched',
  
  // Session events
  SESSION_CREATED = 'session:created',
  SESSION_UPDATED = 'session:updated',
  SESSION_CANCELLED = 'session:cancelled',
  SESSION_JOINED = 'session:joined',
  SESSION_LEFT = 'session:left',
  SESSION_STARTING_SOON = 'session:starting_soon',
  
  // Group events
  GROUP_CREATED = 'group:created',
  GROUP_UPDATED = 'group:updated',
  GROUP_MEMBER_JOINED = 'group:member_joined',
  GROUP_MEMBER_LEFT = 'group:member_left',
  
  // Notification events
  NOTIFICATION_CREATED = 'notification:created',
  NOTIFICATION_READ = 'notification:read',
  
  // Chat events
  MESSAGE_SENT = 'chat:message_sent',
  CHAT_CREATED = 'chat:created',
  
  // Notes events
  NOTE_CREATED = 'note:created',
  NOTE_UPDATED = 'note:updated',
  NOTE_SHARED = 'note:shared',
}

export interface EventPayload {
  type: EventType;
  data: any;
  userId?: string;
  groupId?: string;
  sessionId?: string;
  timestamp: Date | string;
  metadata?: Record<string, any>;
}