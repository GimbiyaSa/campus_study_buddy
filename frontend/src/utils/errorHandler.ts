/**
 * Unified Error Handling System
 * Expert-level error management with consistent UX patterns
 */

export interface AppError {
  code: string;
  title: string;
  message: string;
  action?: string;
  type: 'network' | 'auth' | 'validation' | 'server' | 'permission';
  retryable: boolean;
}

export class ErrorHandler {
  private static readonly ERROR_PATTERNS = {
    // Network & Connection Errors
    NETWORK_UNAVAILABLE: {
      code: 'NETWORK_001',
      title: 'Connection Lost',
      message: 'Unable to connect to our servers. Please check your internet connection.',
      action: 'Try again',
      type: 'network' as const,
      retryable: true,
    },

    TIMEOUT: {
      code: 'NETWORK_002',
      title: 'Request Timeout',
      message: 'The request is taking longer than expected. This might be due to network issues.',
      action: 'Retry now',
      type: 'network' as const,
      retryable: true,
    },

    // Authentication Errors
    UNAUTHORIZED: {
      code: 'AUTH_001',
      title: 'Session Expired',
      message: 'Your session has expired. Please sign in again to continue.',
      action: 'Sign in',
      type: 'auth' as const,
      retryable: false,
    },

    FORBIDDEN: {
      code: 'AUTH_002',
      title: 'Access Denied',
      message: "You don't have permission to access this resource.",
      action: 'Contact support',
      type: 'permission' as const,
      retryable: false,
    },

    // Feature-Specific Errors
    COURSES_LOAD_FAILED: {
      code: 'COURSES_001',
      title: 'Courses Unavailable',
      message: 'Unable to load your enrolled courses at the moment.',
      action: 'Refresh',
      type: 'server' as const,
      retryable: true,
    },

    PROGRESS_LOAD_FAILED: {
      code: 'PROGRESS_001',
      title: 'Progress Data Unavailable',
      message: 'Unable to load your study progress and analytics.',
      action: 'Refresh',
      type: 'server' as const,
      retryable: true,
    },

    PARTNERS_LOAD_FAILED: {
      code: 'PARTNERS_001',
      title: 'Study Partners Unavailable',
      message: 'Unable to load study partner recommendations.',
      action: 'Refresh',
      type: 'server' as const,
      retryable: true,
    },

    DASHBOARD_LOAD_FAILED: {
      code: 'DASHBOARD_001',
      title: 'Dashboard Unavailable',
      message: 'Unable to load your study dashboard and overview.',
      action: 'Refresh',
      type: 'server' as const,
      retryable: true,
    },
  };

  static handleApiError(
    error: any,
    context: 'courses' | 'progress' | 'partners' | 'dashboard'
  ): AppError {
    // Network errors
    if (!navigator.onLine) {
      return this.ERROR_PATTERNS.NETWORK_UNAVAILABLE;
    }

    if (error.name === 'AbortError' || error.code === 'NETWORK_ERROR') {
      return this.ERROR_PATTERNS.NETWORK_UNAVAILABLE;
    }

    if (error.name === 'TimeoutError') {
      return this.ERROR_PATTERNS.TIMEOUT;
    }

    // HTTP Status errors
    if (error.status) {
      switch (error.status) {
        case 401:
          return this.ERROR_PATTERNS.UNAUTHORIZED;
        case 403:
          return this.ERROR_PATTERNS.FORBIDDEN;
        case 404:
        case 500:
        case 502:
        case 503:
          break; // Fall through to context-specific error
      }
    }

    // Context-specific errors
    switch (context) {
      case 'courses':
        return this.ERROR_PATTERNS.COURSES_LOAD_FAILED;
      case 'progress':
        return this.ERROR_PATTERNS.PROGRESS_LOAD_FAILED;
      case 'partners':
        return this.ERROR_PATTERNS.PARTNERS_LOAD_FAILED;
      case 'dashboard':
        return this.ERROR_PATTERNS.DASHBOARD_LOAD_FAILED;
      default:
        return this.ERROR_PATTERNS.NETWORK_UNAVAILABLE;
    }
  }

  static getRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s (max)
    return Math.min(1000 * Math.pow(2, attempt), 8000);
  }
}
