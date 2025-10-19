// frontend/src/utils/eventBus.ts
/**
 * Centralized Event Bus for Real-time Updates
 *
 * This event bus ensures all components automatically refresh when data changes.
 * Emit events after any data mutation (create, update, delete) to notify all listeners.
 */

export type AppEvent =
  // Course events
  | 'courses:invalidate'
  | 'courses:created'
  | 'courses:updated'
  | 'courses:deleted'
  | 'courses:enrolled'
  // Topic/Progress events
  | 'topics:invalidate'
  | 'topics:created'
  | 'topics:updated'
  | 'topics:completed'
  | 'progress:updated'
  | 'hours:logged'
  | 'module:completed'
  // Study buddy events
  | 'buddies:invalidate'
  | 'buddies:request-sent'
  | 'buddies:request-accepted'
  | 'buddies:request-rejected'
  | 'buddies:matched'
  // Study group events
  | 'groups:invalidate'
  | 'groups:created'
  | 'groups:updated'
  | 'groups:deleted'
  | 'groups:joined'
  | 'groups:left'
  | 'groups:member-added'
  | 'groups:member-removed'
  // Study session events
  | 'sessions:invalidate'
  | 'sessions:created'
  | 'sessions:updated'
  | 'sessions:deleted'
  | 'sessions:joined'
  | 'sessions:left'
  | 'sessions:started'
  | 'sessions:ended'
  | 'sessions:reminder-sent'
  | 'sessions:calendar-created'
  // Notification events
  | 'notifications:invalidate'
  | 'notifications:new'
  | 'notifications:read'
  | 'notifications:deleted'
  | 'notifications:created'
  // Chat/Notes events
  | 'chat:message-sent'
  | 'chat:created'
  | 'notes:invalidate'
  | 'notes:created'
  | 'notes:updated'
  | 'notes:deleted'
  | 'notes:shared'
  // User events
  | 'user:registered'
  | 'user:updated'
  | 'profile:updated'
  // Email & Calendar integration
  | 'email:sent'
  | 'calendar:event-created'
  | 'reminder:sent'
  // Global refresh
  | 'app:refresh-all'
  | 'app:auto-refresh';

export interface EventPayload {
  type: 'create' | 'update' | 'delete' | 'progress_update' | 'action' | 'generic';
  courseId?: string;
  topicId?: number;
  groupId?: string;
  sessionId?: string;
  buddyId?: string;
  notificationId?: number;
  timestamp?: number;
  metadata?: Record<string, any>;
}

class EventBus {
  private listeners: Map<AppEvent, Set<(payload?: EventPayload) => void>> = new Map();

  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on(event: AppEvent, callback: (payload?: EventPayload) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Subscribe to multiple events with the same callback
   */
  onMany(events: AppEvent[], callback: (payload?: EventPayload) => void): () => void {
    const unsubscribers = events.map((event) => this.on(event, callback));

    // Return function that unsubscribes from all
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Subscribe once - automatically unsubscribes after first call
   */
  once(event: AppEvent, callback: (payload?: EventPayload) => void): void {
    const wrapper = (payload?: EventPayload) => {
      callback(payload);
      this.listeners.get(event)?.delete(wrapper);
    };

    this.on(event, wrapper);
  }

  /**
   * Emit an event to all listeners
   */
  emit(event: AppEvent, payload?: EventPayload): void {
    console.log(`🔔 EventBus: Emitting '${event}'`, payload);

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in event listener for '${event}':`, error);
        }
      });
    }

    // Also emit to window for backwards compatibility
    window.dispatchEvent(
      new CustomEvent(event, {
        detail: payload || { type: 'generic', timestamp: Date.now() },
      })
    );
  }

  /**
   * Emit multiple related events at once
   */
  emitMany(events: AppEvent[], payload?: EventPayload): void {
    events.forEach((event) => this.emit(event, payload));
  }

  /**
   * Remove all listeners for an event
   */
  off(event: AppEvent): void {
    this.listeners.delete(event);
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get count of listeners for debugging
   */
  getListenerCount(event: AppEvent): number {
    return this.listeners.get(event)?.size || 0;
  }

  /**
   * Debug: Log all active listeners
   */
  debug(): void {
    console.log('📊 EventBus Active Listeners:');
    this.listeners.forEach((callbacks, event) => {
      console.log(`  ${event}: ${callbacks.size} listener(s)`);
    });
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Helper hook for React components
export function useEventBus(
  event: AppEvent | AppEvent[],
  callback: (payload?: EventPayload) => void,
  deps: any[] = []
) {
  const { useEffect } = require('react');

  useEffect(() => {
    if (Array.isArray(event)) {
      return eventBus.onMany(event, callback);
    } else {
      return eventBus.on(event, callback);
    }
  }, deps);
}
