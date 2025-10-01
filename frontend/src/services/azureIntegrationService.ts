import { buildApiUrl } from '@/utils/url';
import { WebPubSubClient } from '@azure/web-pubsub-client';

class AzureIntegrationService {
  private static instance: AzureIntegrationService;
  private baseUrl: string;
  private webPubSubClient: WebPubSubClient | null = null;
  private connectionHandlers: Map<string, Function[]> = new Map();
  private currentUser: any = null;

  private constructor() {
    // Use environment variable or fallback to local development
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    this.initializeAuth();
  }

  public static getInstance(): AzureIntegrationService {
    if (!AzureIntegrationService.instance) {
      AzureIntegrationService.instance = new AzureIntegrationService();
    }
    return AzureIntegrationService.instance;
  }

  private async initializeAuth() {
    // Check for existing session
    try {
      const response = await fetch(buildApiUrl(`/api/v1/users/me`), {
        credentials: 'include',
      });
      if (response.ok) {
        this.currentUser = await response.json();
        await this.initializeRealTimeConnection();
      }
    } catch (error) {
      console.log('No existing session found');
    }
  }

  public async setAuth(user: any) {
    this.currentUser = user;
    await this.initializeRealTimeConnection();
  }

  public clearAuth() {
    this.currentUser = null;
    this.disconnectRealTime();
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      credentials: 'include',
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        if (response.status === 401) {
          this.clearAuth();
          throw new Error('Authentication required');
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Real-time Communication with Azure Web PubSub
  private async initializeRealTimeConnection() {
    if (!this.currentUser || this.webPubSubClient) return;

    try {
      // Get connection token from backend
      const tokenResponse = await this.request<{ token: string; url: string }>(
        '/api/v1/chat/connection-token'
      );

      this.webPubSubClient = new WebPubSubClient(tokenResponse.url);

      this.webPubSubClient.on('connected', () => {
        console.log('✅ Connected to Azure Web PubSub');
        this.handleConnectionEvent('connected', {});
      });

      this.webPubSubClient.on('disconnected', () => {
        console.log('❌ Disconnected from Azure Web PubSub');
        this.handleConnectionEvent('disconnected', {});
      });

      this.webPubSubClient.on('server-message', (message) => {
        this.handleIncomingMessage(message as any);
      });

      await this.webPubSubClient.start();

      // Join user-specific channel for notifications
      await this.webPubSubClient.joinGroup(`user-${this.currentUser.id}`);
    } catch (error) {
      console.error('Failed to initialize real-time connection:', error);
    }
  }

  private disconnectRealTime() {
    if (this.webPubSubClient) {
      this.webPubSubClient.stop();
      this.webPubSubClient = null;
    }
    this.connectionHandlers.clear();
  }

  private handleConnectionEvent(event: string, data: any) {
    const handlers = this.connectionHandlers.get(event) || [];
    handlers.forEach((handler) => handler(data));
  }

  private handleIncomingMessage(data: any) {
    const { type, payload } = data;

    switch (type) {
      case 'chat_message':
        this.handleConnectionEvent('message', payload);
        break;
      case 'partner_request':
        this.handleConnectionEvent('notification', {
          type: 'partner_request',
          data: payload,
        });
        break;
      case 'session_reminder':
        this.handleConnectionEvent('notification', {
          type: 'session_reminder',
          data: payload,
        });
        break;
      case 'group_update':
        this.handleConnectionEvent('group_update', payload);
        break;
      default:
        console.log('Unknown message type:', type);
    }
  }

  // Event subscription methods
  public onConnectionEvent(event: string, handler: Function) {
    if (!this.connectionHandlers.has(event)) {
      this.connectionHandlers.set(event, []);
    }
    this.connectionHandlers.get(event)!.push(handler);

    return () => {
      const handlers = this.connectionHandlers.get(event) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  // API Methods
  public async getPartnerRecommendations(limit: number = 10): Promise<any[]> {
    return this.request<any[]>(`/api/v1/partners/recommendations?limit=${limit}`);
  }

  public async sendPartnerRequest(
    partnerId: number,
    moduleId?: number,
    message?: string
  ): Promise<void> {
    return this.request('/api/v1/partners/match', {
      method: 'POST',
      body: JSON.stringify({
        matched_user_id: partnerId,
        module_id: moduleId,
        message: message,
      }),
    });
  }

  public async getMyGroups(): Promise<any[]> {
    return this.request<any[]>('/api/v1/groups/my-groups');
  }

  public async joinGroup(groupId: number, message?: string): Promise<void> {
    return this.request(`/api/v1/groups/${groupId}/join`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  public async getProgressData(filters?: any): Promise<any[]> {
    const queryParams = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request<any[]>(`/api/v1/progress?${queryParams}`);
  }

  public async sendChatMessage(
    chatRoomId: string,
    content: string,
    messageType: string = 'text'
  ): Promise<void> {
    if (!this.webPubSubClient) {
      throw new Error('Real-time connection not established');
    }

    await this.webPubSubClient.sendToGroup(
      chatRoomId,
      {
        type: 'chat_message',
        payload: {
          chatRoomId,
          content,
          messageType,
          senderId: this.currentUser?.id,
          senderName: this.currentUser?.name,
          timestamp: new Date().toISOString(),
        },
      },
      'json'
    );
  }

  // File Upload API
  public async uploadFile(file: File, metadata?: any): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
    }

    return this.request('/api/v1/users/files/upload', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  // Health check
  public async getHealthStatus(): Promise<any> {
    return this.request('/health');
  }
}

// Export singleton instance
export const azureService = AzureIntegrationService.getInstance();
export default azureService;
