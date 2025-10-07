import { useEffect, useState } from 'react';
import { Bell, Users, X, Check } from 'lucide-react';
import azureIntegrationService from '../services/azureIntegrationService';
import { DataService } from '../services/dataService';

interface PartnerRequestNotification {
  requestId: number;
  requesterId: string;
  requesterName: string;
  requesterUniversity?: string;
  requesterCourse?: string;
  message?: string;
  timestamp: string;
}

interface Notification {
  id: string;
  type: 'partner_request' | 'session_reminder' | 'group_update';
  data: any;
  timestamp: string;
  read: boolean;
}

export default function NotificationHandler() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // Listen for incoming notifications
    const unsubscribe = azureIntegrationService.onConnectionEvent(
      'notification',
      (notification: any) => {
        console.log('📧 Received notification:', notification);

        const newNotification: Notification = {
          id: `${notification.type}-${Date.now()}`,
          type: notification.type,
          data: notification.data,
          timestamp: new Date().toISOString(),
          read: false,
        };

        setNotifications((prev) => [newNotification, ...prev].slice(0, 10)); // Keep last 10 notifications
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif))
    );
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderNotification = (notification: Notification) => {
    switch (notification.type) {
      case 'partner_request':
        return (
          <PartnerRequestNotificationItem
            key={notification.id}
            notification={notification}
            data={notification.data as PartnerRequestNotification}
            onRead={() => markAsRead(notification.id)}
            onRemove={() => removeNotification(notification.id)}
          />
        );
      default:
        return (
          <div key={notification.id} className="p-3 border-b border-slate-200">
            <p className="text-sm text-slate-600">Unknown notification type: {notification.type}</p>
          </div>
        );
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-20 max-h-96 overflow-y-auto">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && <p className="text-sm text-slate-600">{unreadCount} unread</p>}
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {notifications.map(renderNotification)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PartnerRequestNotificationItem({
  notification,
  data,
  onRead,
  onRemove,
}: {
  notification: Notification;
  data: PartnerRequestNotification;
  onRead: () => void;
  onRemove: () => void;
}) {
  const handleAccept = async () => {
    try {
      await DataService.acceptPartnerRequest(data.requestId);
      console.log('✅ Partner request accepted');
      onRead();
      onRemove();
      // Refresh partner lists
      window.dispatchEvent(new Event('buddies:invalidate'));
    } catch (error) {
      console.error('Failed to accept partner request:', error);
      alert('Failed to accept partner request. Please try again.');
    }
  };

  const handleDecline = async () => {
    try {
      await DataService.rejectPartnerRequest(data.requestId);
      console.log('✅ Partner request rejected');
      onRead();
      onRemove();
    } catch (error) {
      console.error('Failed to reject partner request:', error);
      alert('Failed to reject partner request. Please try again.');
    }
  };

  return (
    <div className={`p-4 border-b border-slate-200 ${!notification.read ? 'bg-blue-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Users className="h-5 w-5 text-emerald-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="font-medium text-slate-900">
                {data.requesterName} wants to be your study partner
              </p>
              {data.requesterCourse && (
                <p className="text-sm text-slate-600">{data.requesterCourse}</p>
              )}
              {data.message && (
                <p className="text-sm text-slate-700 mt-1 italic">"{data.message}"</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {new Date(data.timestamp).toLocaleString()}
              </p>
            </div>

            <button
              onClick={onRemove}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
              aria-label="Remove notification"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleAccept}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Check className="h-3 w-3" />
              Accept
            </button>
            <button
              onClick={handleDecline}
              className="px-3 py-1.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
