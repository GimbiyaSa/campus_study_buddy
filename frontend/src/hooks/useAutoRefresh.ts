import { useEffect, useCallback, useRef } from 'react';
import { eventBus, type AppEvent } from '../utils/eventBus';

/**
 * Custom hook for automatic data refresh when events occur
 * Provides real-time updates across all features without manual refresh
 */
export const useAutoRefresh = () => {
  const refreshCallbacks = useRef<Map<string, () => void>>(new Map());
  const unsubscribers = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Set up global event listeners for automatic refresh using singleton eventBus
    const setupEventListeners = () => {
      // User events - refresh user profile, settings
      unsubscribers.current.push(
        eventBus.on('user:updated', () => {
          triggerRefresh(['user-profile', 'user-settings', 'navigation']);
        })
      );

      // Progress events - refresh progress displays, analytics
      unsubscribers.current.push(
        eventBus.on('progress:updated', () => {
          triggerRefresh(['progress', 'analytics', 'dashboard', 'modules']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('module:completed', () => {
          triggerRefresh(['progress', 'analytics', 'dashboard', 'modules', 'achievements']);
        })
      );

      // Study buddy events - refresh buddy lists, requests
      unsubscribers.current.push(
        eventBus.on('buddies:request-sent', () => {
          triggerRefresh(['buddy-requests', 'buddy-list', 'notifications']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('buddies:request-accepted', () => {
          triggerRefresh(['buddy-requests', 'buddy-list', 'notifications', 'dashboard']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('buddies:matched', () => {
          triggerRefresh(['buddy-list', 'dashboard', 'notifications']);
        })
      );

      // Session events - refresh schedules, calendars
      unsubscribers.current.push(
        eventBus.on('sessions:created', () => {
          triggerRefresh(['sessions', 'calendar', 'dashboard', 'notifications']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('sessions:updated', () => {
          triggerRefresh(['sessions', 'calendar', 'session-details']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('sessions:joined', () => {
          triggerRefresh(['sessions', 'calendar', 'session-details', 'my-sessions']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('sessions:left', () => {
          triggerRefresh(['sessions', 'calendar', 'session-details', 'my-sessions']);
        })
      );

      // Group events - refresh group displays
      unsubscribers.current.push(
        eventBus.on('groups:created', () => {
          triggerRefresh(['groups', 'my-groups', 'dashboard']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('groups:member-added', () => {
          triggerRefresh(['groups', 'group-details', 'group-members']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('groups:member-removed', () => {
          triggerRefresh(['groups', 'group-details', 'group-members']);
        })
      );

      // Notification events - refresh notification displays
      unsubscribers.current.push(
        eventBus.on('notifications:created', () => {
          triggerRefresh(['notifications', 'notification-count', 'header']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('notifications:read', () => {
          triggerRefresh(['notifications', 'notification-count', 'header']);
        })
      );

      // Chat events - refresh chat interfaces
      unsubscribers.current.push(
        eventBus.on('chat:message-sent', () => {
          triggerRefresh(['chat', 'messages', 'chat-list']);
        })
      );

      // Notes events - refresh notes displays
      unsubscribers.current.push(
        eventBus.on('notes:created', () => {
          triggerRefresh(['notes', 'shared-notes', 'group-notes']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('notes:updated', () => {
          triggerRefresh(['notes', 'shared-notes', 'group-notes', 'note-details']);
        })
      );

      unsubscribers.current.push(
        eventBus.on('notes:shared', () => {
          triggerRefresh(['shared-notes', 'group-notes', 'notifications']);
        })
      );
    };

    setupEventListeners();

    return () => {
      // Unsubscribe from all events
      unsubscribers.current.forEach((unsubscribe) => unsubscribe());
      unsubscribers.current = [];
    };
  }, []);

  /**
   * Trigger refresh for specific data types
   */
  const triggerRefresh = useCallback((refreshTypes: string[]) => {
    refreshTypes.forEach((type) => {
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
  const manualRefresh = useCallback(
    (dataTypes: string[]) => {
      triggerRefresh(dataTypes);
    },
    [triggerRefresh]
  );

  /**
   * Emit an event (for components that create data)
   */
  const emitEvent = useCallback((eventType: AppEvent, data?: any) => {
    eventBus.emit(eventType, data);
  }, []);

  return {
    registerRefresh,
    manualRefresh,
    emitEvent,
    isConnected: true, // eventBus singleton is always connected
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
