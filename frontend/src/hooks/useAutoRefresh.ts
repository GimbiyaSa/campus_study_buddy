import { useEffect, useCallback, useRef } from 'react';
import { EventBus } from '../utils/eventBus';
import { EventType } from '../types/events';

/**
 * Custom hook for automatic data refresh when events occur
 * Provides real-time updates across all features without manual refresh
 */
export const useAutoRefresh = () => {
  const refreshCallbacks = useRef<Map<string, () => void>>(new Map());
  const eventBusRef = useRef<EventBus | null>(null);

  useEffect(() => {
    // Initialize event bus connection
    eventBusRef.current = new EventBus();
    
    // Set up global event listeners for automatic refresh
    const setupEventListeners = () => {
      if (!eventBusRef.current) return;

      // User events - refresh user profile, settings
      eventBusRef.current.on(EventType.USER_UPDATED, () => {
        triggerRefresh(['user-profile', 'user-settings', 'navigation']);
      });

      // Progress events - refresh progress displays, analytics
      eventBusRef.current.on(EventType.PROGRESS_UPDATED, () => {
        triggerRefresh(['progress', 'analytics', 'dashboard', 'modules']);
      });

      eventBusRef.current.on(EventType.MODULE_COMPLETED, () => {
        triggerRefresh(['progress', 'analytics', 'dashboard', 'modules', 'achievements']);
      });

      // Study buddy events - refresh buddy lists, requests
      eventBusRef.current.on(EventType.BUDDY_REQUEST_SENT, () => {
        triggerRefresh(['buddy-requests', 'buddy-list', 'notifications']);
      });

      eventBusRef.current.on(EventType.BUDDY_REQUEST_ACCEPTED, () => {
        triggerRefresh(['buddy-requests', 'buddy-list', 'notifications', 'dashboard']);
      });

      eventBusRef.current.on(EventType.BUDDY_MATCHED, () => {
        triggerRefresh(['buddy-list', 'dashboard', 'notifications']);
      });

      // Session events - refresh schedules, calendars
      eventBusRef.current.on(EventType.SESSION_CREATED, () => {
        triggerRefresh(['sessions', 'calendar', 'dashboard', 'notifications']);
      });

      eventBusRef.current.on(EventType.SESSION_UPDATED, () => {
        triggerRefresh(['sessions', 'calendar', 'session-details']);
      });

      eventBusRef.current.on(EventType.SESSION_JOINED, () => {
        triggerRefresh(['sessions', 'calendar', 'session-details', 'my-sessions']);
      });

      eventBusRef.current.on(EventType.SESSION_LEFT, () => {
        triggerRefresh(['sessions', 'calendar', 'session-details', 'my-sessions']);
      });

      // Group events - refresh group displays
      eventBusRef.current.on(EventType.GROUP_CREATED, () => {
        triggerRefresh(['groups', 'my-groups', 'dashboard']);
      });

      eventBusRef.current.on(EventType.GROUP_MEMBER_JOINED, () => {
        triggerRefresh(['groups', 'group-details', 'group-members']);
      });

      eventBusRef.current.on(EventType.GROUP_MEMBER_LEFT, () => {
        triggerRefresh(['groups', 'group-details', 'group-members']);
      });

      // Notification events - refresh notification displays
      eventBusRef.current.on(EventType.NOTIFICATION_CREATED, () => {
        triggerRefresh(['notifications', 'notification-count', 'header']);
      });

      eventBusRef.current.on(EventType.NOTIFICATION_READ, () => {
        triggerRefresh(['notifications', 'notification-count', 'header']);
      });

      // Chat events - refresh chat interfaces
      eventBusRef.current.on(EventType.MESSAGE_SENT, () => {
        triggerRefresh(['chat', 'messages', 'chat-list']);
      });

      // Notes events - refresh notes displays
      eventBusRef.current.on(EventType.NOTE_CREATED, () => {
        triggerRefresh(['notes', 'shared-notes', 'group-notes']);
      });

      eventBusRef.current.on(EventType.NOTE_UPDATED, () => {
        triggerRefresh(['notes', 'shared-notes', 'group-notes', 'note-details']);
      });

      eventBusRef.current.on(EventType.NOTE_SHARED, () => {
        triggerRefresh(['shared-notes', 'group-notes', 'notifications']);
      });
    };

    setupEventListeners();

    return () => {
      if (eventBusRef.current) {
        eventBusRef.current.disconnect();
      }
    };
  }, []);

  /**
   * Trigger refresh for specific data types
   */
  const triggerRefresh = useCallback((refreshTypes: string[]) => {
    refreshTypes.forEach(type => {
      const callback = refreshCallbacks.current.get(type);
      if (callback) {
        console.log(`🔄 Auto-refreshing: ${type}`);
        callback();
      }
    });
  }, []);

  /**
   * Register a refresh callback for a specific data type
   */
  const registerRefresh = useCallback((dataType: string, refreshCallback: () => void) => {
    refreshCallbacks.current.set(dataType, refreshCallback);
    
    return () => {
      refreshCallbacks.current.delete(dataType);
    };
  }, []);

  /**
   * Manually trigger refresh for specific types
   */
  const manualRefresh = useCallback((dataTypes: string[]) => {
    triggerRefresh(dataTypes);
  }, [triggerRefresh]);

  /**
   * Emit an event (for components that create data)
   */
  const emitEvent = useCallback((eventType: EventType, data: any) => {
    if (eventBusRef.current) {
      eventBusRef.current.emit(eventType, data);
    }
  }, []);

  return {
    registerRefresh,
    manualRefresh,
    emitEvent,
    isConnected: eventBusRef.current?.isConnected() ?? false
  };
};

/**
 * Hook for components that display specific data types
 * Automatically refreshes when relevant events occur
 */
export const useDataRefresh = (dataType: string, refreshCallback: () => void) => {
  const { registerRefresh } = useAutoRefresh();

  useEffect(() => {
    const unregister = registerRefresh(dataType, refreshCallback);
    return unregister;
  }, [dataType, refreshCallback, registerRefresh]);
};

/**
 * Hook for progress data that refreshes on progress-related events
 */
export const useProgressRefresh = (refreshCallback: () => void) => {
  useDataRefresh('progress', refreshCallback);
};

/**
 * Hook for session data that refreshes on session-related events
 */
export const useSessionRefresh = (refreshCallback: () => void) => {
  useDataRefresh('sessions', refreshCallback);
};

/**
 * Hook for notification data that refreshes on notification events
 */
export const useNotificationRefresh = (refreshCallback: () => void) => {
  useDataRefresh('notifications', refreshCallback);
};

/**
 * Hook for buddy data that refreshes on buddy-related events
 */
export const useBuddyRefresh = (refreshCallback: () => void) => {
  useDataRefresh('buddy-list', refreshCallback);
};

/**
 * Hook for group data that refreshes on group events
 */
export const useGroupRefresh = (refreshCallback: () => void) => {
  useDataRefresh('groups', refreshCallback);
};

/**
 * Hook for dashboard data that refreshes on multiple event types
 */
export const useDashboardRefresh = (refreshCallback: () => void) => {
  useDataRefresh('dashboard', refreshCallback);
};

/**
 * Hook for analytics data that refreshes on progress events
 */
export const useAnalyticsRefresh = (refreshCallback: () => void) => {
  useDataRefresh('analytics', refreshCallback);
};