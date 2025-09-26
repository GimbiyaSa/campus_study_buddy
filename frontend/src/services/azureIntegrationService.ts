/**
 * Azure Integration Service for Campus Study Buddy Frontend
 * Comprehensive integration with all Azure resources as per technical architecture
 */

import { WebPubSubClient } from '@azure/web-pubsub-client';

export interface University {
  id: string;
  name: string;
  domain: string;
  region: string;
  branding?: {
    primaryColor: string;
    logoUrl: string;
  };
}

export interface StudyPartner {
  id: number;
  name: string;
  university: string;
  major: string;
  year: string;
  bio?: string;
  studyHours: number;
  rating: number;
  lastActive: string;
  courses: string[];
  modules: string[];
  isOnline: boolean;
  compatibilityScore: number;
  avatar?: string;
  overlap: string;
  studyPreferences: {
    studyStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
    groupSize: 'small' | 'medium' | 'large';
    preferredTimes: string[];
    subjects: string[];
    location?: 'online' | 'campus' | 'library' | 'hybrid';
    sessionDuration?: '30min' | '1hour' | '2hours' | '3hours+';
  };
  availability: {
    [day: string]: string[]; // e.g., monday: ["09:00-12:00", "14:00-17:00"]
  };
  academicLevel: number;
  gpa?: number;
  studyStreak: number;
  groupsJoined: number;
  sessionsCompleted: number;
}

export interface StudyGroup {
  id: number;
  name: string;
  description: string;
  moduleCode: string;
  moduleName: string;
  university: string;
  creator: {
    id: number;
    name: string;
    avatar?: string;
  };
  members: Array<{
    id: number;
    name: string;
    avatar?: string;
    role: 'admin' | 'member' | 'moderator';
    joinedAt: string;
    lastActive: string;
    contributionScore: number;
  }>;
  memberCount: number;
  maxMembers: number;
  isPrivate: boolean;
  tags: string[];
  studyGoals: string[];
  meetingSchedule?: {
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'irregular';
    preferredDays: string[];
    preferredTimes: string[];
    duration: string;
    location: 'online' | 'campus' | 'library' | 'flexible';
  };
  performance: {
    averageProgress: number;
    totalStudyHours: number;
    completedSessions: number;
    groupRating: number;
  };
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
  status: 'active' | 'inactive' | 'archived';
}

export interface StudySession {
  id: number;
  groupId: number;
  title: string;
  description: string;
  moduleCode: string;
  topics: string[];
  scheduledAt: string;
  duration: number; // minutes
  location: {
    type: 'online' | 'campus' | 'library' | 'custom';
    details: string;
    meetingUrl?: string;
    buildingRoom?: string;
  };
  organizer: {
    id: number;
    name: string;
    avatar?: string;
  };
  attendees: Array<{
    id: number;
    name: string;
    avatar?: string;
    status: 'confirmed' | 'tentative' | 'declined' | 'pending';
    attendedAt?: string;
    notes?: string;
  }>;
  materials: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    uploadedBy: number;
    uploadedAt: string;
  }>;
  agenda: Array<{
    topic: string;
    duration: number;
    resources: string[];
  }>;
  goals: string[];
  prerequisites?: string[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  feedback?: {
    rating: number;
    comments: string[];
    improvements: string[];
  };
  recordings?: Array<{
    url: string;
    duration: number;
    timestamp: string;
  }>;
  chatRoomId?: string;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: string;
  lastActive: string;
  contributions: number;
  studyHours: number;
}

export interface PartnerFilter {
  subjects?: string[];
  university?: string;
  year?: number;
  studyStyle?: string;
  location?: string;
  availability?: string;
  groupSize?: string;
  sessionDuration?: string;
  limit?: number;
  minCompatibilityScore?: number;
  maxDistance?: number;
  isOnline?: boolean;
  query?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'consistency' | 'collaboration' | 'mastery' | 'leadership';
  points: number;
  earnedAt?: string;
  progress?: number;
  target?: number;
}

export interface SessionParticipant {
  id: number;
  name: string;
  avatar?: string;
  status: 'confirmed' | 'tentative' | 'declined' | 'pending';
  attendedAt?: string;
  notes?: string;
  userId?: string;
}

export interface ProgressData {
  userId: number;
  moduleCode: string;
  module: {
    id: number;
    code: string;
    name: string;
    totalTopics: number;
  };
  progress: {
    completedTopics: number;
    totalStudyHours: number;
    currentStreak: number;
    longestStreak: number;
    averageSessionDuration: number;
    weeklyGoal: number;
    weeklyProgress: number;
    monthlyProgress: number;
    totalTopics: number;
  };
  topicProgress: Array<{
    topicId: number;
    topicName: string;
    chapter: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'mastered';
    completedAt?: string;
    timeSpent: number;
    difficulty: 1 | 2 | 3 | 4 | 5;
    confidence: 1 | 2 | 3 | 4 | 5;
    notes?: string;
    resources: string[];
  }>;
  studySessions: Array<{
    date: string;
    duration: number;
    topics: string[];
    type: 'solo' | 'group' | 'tutoring';
    effectiveness: number;
    notes?: string;
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    earnedAt: string;
    category: 'consistency' | 'collaboration' | 'mastery' | 'leadership';
  }>;
  analytics: {
    weeklyHours: number[];
    productiveHours: string[];
    preferredStudyDays: string[];
    topPerformingTopics: string[];
    improvementAreas: string[];
  };
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: number;
  senderName: string;
  senderAvatar?: string;
  content: string;
  messageType: 'text' | 'file' | 'image' | 'link' | 'system';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  timestamp: string;
  edited?: boolean;
  editedAt?: string;
  replyTo?: string;
  reactions: Array<{
    emoji: string;
    users: number[];
  }>;
  mentions: number[];
  isRead: boolean;
  metadata?: {
    sessionId?: number;
    topicReference?: string;
    urgency?: 'low' | 'medium' | 'high';
  };
}

export interface NotificationData {
  id: string;
  userId: number;
  type:
    | 'partner_request'
    | 'partner_response'
    | 'group_invitation'
    | 'session_reminder'
    | 'session_update'
    | 'progress_milestone'
    | 'system_announcement';
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'social' | 'academic' | 'system' | 'achievement';
  isRead: boolean;
  createdAt: string;
  scheduledFor?: string;
  expiresAt?: string;
  metadata: Record<string, any>;
  relatedEntityId?: number;
  relatedEntityType?: 'partner' | 'group' | 'session' | 'progress';
}

class AzureIntegrationService {
  private static instance: AzureIntegrationService;
  private baseUrl: string;
  private webPubSubClient: WebPubSubClient | null = null;
  private connectionHandlers: Map<string, Function[]> = new Map();
  private currentUser: any = null;

  private constructor() {
    // Use Azure Container Apps URL from infrastructure
    this.baseUrl =
      import.meta.env.VITE_API_URL || 'https://csb-prod-ca-api-7ndjbzgu.azurecontainerapps.io';
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
      const response = await fetch(`${this.baseUrl}/api/v1/users/me`, {
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
      credentials: 'include', // Always include cookies for session auth
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

  // Partner Matching API (Complex Algorithm with Azure SQL)
  public async searchPartners(criteria: PartnerFilter): Promise<StudyPartner[]> {
    const queryParams = new URLSearchParams();

    Object.entries(criteria).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams.append(key, value.join(','));
        } else {
          queryParams.append(key, value.toString());
        }
      }
    });

    return this.request<StudyPartner[]>(`/api/v1/partners/search?${queryParams}`);
  }

  public async getPartnerRecommendations(limit: number = 10): Promise<StudyPartner[]> {
    return this.request<StudyPartner[]>(`/api/v1/partners/recommendations?limit=${limit}`);
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

  public async getPartnerMatches(status?: string): Promise<any[]> {
    const queryParams = status ? `?status=${status}` : '';
    return this.request<any[]>(`/api/v1/partners/matches${queryParams}`);
  }

  public async respondToPartnerRequest(
    matchId: number,
    response: 'accepted' | 'declined'
  ): Promise<void> {
    return this.request(`/api/v1/partners/matches/${matchId}/respond`, {
      method: 'PUT',
      body: JSON.stringify({ response }),
    });
  }

  // Study Groups API (CRUD with Real-time Updates)
  public async getStudyGroups(filters?: {
    university?: string;
    moduleCode?: string;
    tags?: string[];
    memberCount?: string;
    availability?: string;
  }): Promise<StudyGroup[]> {
    const queryParams = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            queryParams.append(key, value.join(','));
          } else {
            queryParams.append(key, value.toString());
          }
        }
      });
    }

    return this.request<StudyGroup[]>(`/api/v1/groups?${queryParams}`);
  }

  public async getMyGroups(): Promise<StudyGroup[]> {
    return this.request<StudyGroup[]>('/api/v1/groups/my-groups');
  }

  public async createStudyGroup(groupData: {
    name: string;
    description: string;
    moduleCode: string;
    maxMembers: number;
    isPrivate: boolean;
    tags: string[];
    studyGoals: string[];
    meetingSchedule?: any;
  }): Promise<StudyGroup> {
    return this.request<StudyGroup>('/api/v1/groups', {
      method: 'POST',
      body: JSON.stringify(groupData),
    });
  }

  public async joinGroup(groupId: number, message?: string): Promise<void> {
    return this.request(`/api/v1/groups/${groupId}/join`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  public async leaveGroup(groupId: number): Promise<void> {
    return this.request(`/api/v1/groups/${groupId}/leave`, {
      method: 'POST',
    });
  }

  // Session Scheduling API (Calendar Integration)
  public async getStudySessions(filters?: {
    groupId?: number;
    moduleCode?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    limit?: number;
  }): Promise<StudySession[]> {
    const queryParams = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request<StudySession[]>(`/api/v1/sessions?${queryParams}`);
  }

  public async getGroupSessions(groupId: number, limit: number = 20): Promise<StudySession[]> {
    return this.getStudySessions({ groupId, limit });
  }

  public async createStudySession(sessionData: {
    groupId: number;
    title: string;
    description: string;
    moduleCode: string;
    topics: string[];
    scheduledAt: string;
    duration: number;
    location: any;
    agenda: any[];
    goals: string[];
  }): Promise<StudySession> {
    return this.request<StudySession>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  public async updateSessionAttendance(
    sessionId: number,
    status: 'confirmed' | 'tentative' | 'declined'
  ): Promise<void> {
    return this.request(`/api/v1/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  // Progress Tracking API (Time-series Data)
  public async getProgressData(filters?: {
    moduleId?: number;
    moduleCode?: string;
    timeframe?: 'week' | 'month' | 'semester' | 'year';
  }): Promise<ProgressData[]> {
    const queryParams = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request<ProgressData[]>(`/api/v1/progress?${queryParams}`);
  }

  public async logStudySession(sessionData: {
    moduleId: number;
    topics: string[];
    duration: number;
    type: 'solo' | 'group' | 'tutoring';
    effectiveness: number;
    notes?: string;
  }): Promise<void> {
    return this.request('/api/v1/progress/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  public async updateTopicProgress(
    topicId: number,
    progress: {
      status: 'not_started' | 'in_progress' | 'completed' | 'mastered';
      timeSpent: number;
      confidence: number;
      notes?: string;
    }
  ): Promise<void> {
    return this.request(`/api/v1/progress/topics/${topicId}`, {
      method: 'PUT',
      body: JSON.stringify(progress),
    });
  }

  // File Sharing API (Azure Blob Storage)
  public async uploadFile(
    file: File,
    metadata?: {
      moduleId?: number;
      sessionId?: number;
      description?: string;
      isPublic?: boolean;
    }
  ): Promise<{
    url: string;
    fileName: string;
    fileSize: number;
    uploadedAt: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
    }

    return this.request('/api/v1/files/upload', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  public async getUserFiles(container?: string): Promise<any[]> {
    const queryParams = container ? `?container=${container}` : '';
    return this.request<any[]>(`/api/v1/users/files/list${queryParams}`);
  }

  // Chat API (Real-time with Azure Web PubSub)
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

  public async getChatHistory(
    chatRoomId: string,
    limit: number = 50,
    before?: string
  ): Promise<ChatMessage[]> {
    const queryParams = new URLSearchParams({ limit: limit.toString() });
    if (before) queryParams.append('before', before);

    return this.request<ChatMessage[]>(`/api/v1/chat/${chatRoomId}/messages?${queryParams}`);
  }

  public async joinChatRoom(chatRoomId: string): Promise<void> {
    if (this.webPubSubClient) {
      await this.webPubSubClient.joinGroup(chatRoomId);
    }
  }

  public async leaveChatRoom(chatRoomId: string): Promise<void> {
    if (this.webPubSubClient) {
      await this.webPubSubClient.leaveGroup(chatRoomId);
    }
  }

  // Notifications API
  public async getNotifications(filters?: {
    type?: string;
    isRead?: boolean;
    limit?: number;
  }): Promise<NotificationData[]> {
    const queryParams = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request<NotificationData[]>(`/api/v1/notifications?${queryParams}`);
  }

  public async markNotificationRead(notificationId: string): Promise<void> {
    return this.request(`/api/v1/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  }

  // Health check with Azure services
  public async getHealthStatus(): Promise<{
    status: string;
    timestamp: string;
    services: {
      database: any;
      storage: any;
      webpubsub?: any;
    };
  }> {
    return this.request('/health');
  }

  // Additional methods for missing functionality
  public async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    return this.request<GroupMember[]>(`/api/v1/groups/${groupId}/members`);
  }

  public async getSessionDetails(sessionId: number): Promise<StudySession> {
    return this.request<StudySession>(`/api/v1/sessions/${sessionId}`);
  }

  public async createSession(sessionData: Partial<StudySession>): Promise<StudySession> {
    return this.request<StudySession>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  public async joinSession(sessionId: number): Promise<void> {
    return this.request(`/api/v1/sessions/${sessionId}/join`, {
      method: 'POST',
    });
  }

  public async getUserAchievements(): Promise<Achievement[]> {
    return this.request<Achievement[]>('/api/v1/user/achievements');
  }
}

// Export singleton instance
export const azureService = AzureIntegrationService.getInstance();
export default azureService;
