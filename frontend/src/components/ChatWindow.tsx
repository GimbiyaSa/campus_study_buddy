import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Paperclip, Smile, Users, Phone, Video, Settings } from 'lucide-react';
import { azureService, type ChatMessage } from '../services/azureIntegrationService';

interface ChatWindowProps {
  chatRoomId: string;
  chatRoomName: string;
  chatRoomType: 'group' | 'direct' | 'session';
  participants: Array<{
    id: number;
    name: string;
    avatar?: string;
    isOnline: boolean;
    lastSeen?: string;
  }>;
  onClose?: () => void;
  className?: string;
}

export default function ChatWindow({
  chatRoomId,
  chatRoomName,
  chatRoomType,
  participants,
  onClose,
  className = '',
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [unsubscribeHandlers, setUnsubscribeHandlers] = useState<(() => void)[]>([]);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load chat history
  const loadChatHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const history = await azureService.getChatHistory(chatRoomId, 50);
      setMessages(history);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [chatRoomId, scrollToBottom]);

  // Setup real-time connections
  useEffect(() => {
    const setupRealTime = async () => {
      try {
        // Join chat room
        await azureService.joinChatRoom(chatRoomId);
        setIsConnected(true);

        // Setup event handlers
        const handlers = [
          azureService.onConnectionEvent('connected', () => {
            setIsConnected(true);
            console.log(`Connected to chat room: ${chatRoomId}`);
          }),

          azureService.onConnectionEvent('disconnected', () => {
            setIsConnected(false);
            console.log(`Disconnected from chat room: ${chatRoomId}`);
          }),

          azureService.onConnectionEvent('message', (message: ChatMessage) => {
            if (message.chatRoomId === chatRoomId) {
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some((m) => m.id === message.id)) {
                  return prev;
                }
                return [...prev, message].sort(
                  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
              });
              setTimeout(scrollToBottom, 100);
            }
          }),

          azureService.onConnectionEvent(
            'typing',
            (data: { userId: number; isTyping: boolean }) => {
              setTypingUsers((prev) => {
                const newSet = new Set(prev);
                if (data.isTyping) {
                  newSet.add(data.userId);
                } else {
                  newSet.delete(data.userId);
                }
                return newSet;
              });
            }
          ),
        ];

        setUnsubscribeHandlers(handlers);

        // Load initial messages
        await loadChatHistory();
      } catch (error) {
        console.error('Error setting up real-time chat:', error);
        setIsConnected(false);
      }
    };

    setupRealTime();

    // Cleanup on unmount
    return () => {
      unsubscribeHandlers.forEach((unsub) => unsub());
      azureService.leaveChatRoom(chatRoomId);
    };
  }, [chatRoomId, loadChatHistory, scrollToBottom]);

  // Handle typing indicators
  const handleTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      // Send typing indicator
      azureService.sendChatMessage(chatRoomId, '', 'typing_start');
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      azureService.sendChatMessage(chatRoomId, '', 'typing_stop');
    }, 2000);
  }, [isTyping, chatRoomId]);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !isConnected) return;

    try {
      await azureService.sendChatMessage(chatRoomId, newMessage.trim(), 'text');
      setNewMessage('');

      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      setIsTyping(false);

      // Focus back to input
      messageInputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else {
      handleTyping();
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;

    return date.toLocaleDateString();
  };

  // Get typing users text
  const getTypingText = () => {
    const typingUserNames = participants
      .filter((p) => typingUsers.has(p.id))
      .map((p) => p.name.split(' ')[0])
      .slice(0, 3);

    if (typingUserNames.length === 0) return '';
    if (typingUserNames.length === 1) return `${typingUserNames[0]} is typing...`;
    if (typingUserNames.length === 2) return `${typingUserNames.join(' and ')} are typing...`;
    return `${typingUserNames.slice(0, -1).join(', ')} and ${
      typingUserNames[typingUserNames.length - 1]
    } are typing...`;
  };

  return (
    <div
      className={`flex flex-col h-full bg-white rounded-lg shadow-lg border border-gray-200 ${className}`}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
              {chatRoomType === 'group' ? (
                <Users className="w-5 h-5" />
              ) : (
                participants[0]?.name?.charAt(0) || 'C'
              )}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                isConnected ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{chatRoomName}</h3>
            <p className="text-sm text-gray-500">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
              {!isConnected && ' • Disconnected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {chatRoomType === 'group' && (
            <>
              <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <Phone className="w-5 h-5" />
              </button>
              <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <Video className="w-5 h-5" />
              </button>
            </>
          )}

          <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Users className="w-12 h-12 mb-2 text-gray-300" />
            <p>No messages yet</p>
            <p className="text-sm">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.senderId === azureService['currentUser']?.id;
            const showAvatar =
              !isOwn && (index === 0 || messages[index - 1]?.senderId !== message.senderId);

            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} gap-2`}
              >
                {!isOwn && (
                  <div className="w-8 h-8 flex-shrink-0">
                    {showAvatar && (
                      <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {message.senderName?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                )}

                <div className={`max-w-xs lg:max-w-md ${isOwn ? 'ml-auto' : 'mr-auto'}`}>
                  {!isOwn && showAvatar && (
                    <p className="text-xs text-gray-500 mb-1 px-3">{message.senderName}</p>
                  )}

                  <div
                    className={`px-4 py-2 rounded-2xl ${
                      isOwn ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.messageType === 'text' ? (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : message.messageType === 'file' ? (
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        <span className="text-sm">{message.fileName}</span>
                      </div>
                    ) : (
                      <p className="text-sm italic text-gray-600">{message.content}</p>
                    )}

                    <p className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                      {formatTimestamp(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing Indicator */}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 px-3">
            <div className="flex space-x-1">
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span>{getTypingText()}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-end gap-2">
          <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={messageInputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
              disabled={!isConnected}
              className="w-full px-4 py-2 pr-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32 disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={1}
              style={{ minHeight: '40px' }}
            />

            <button className="absolute right-2 top-2 p-1 text-gray-500 hover:text-gray-700 transition-colors">
              <Smile className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !isConnected}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="flex items-center gap-2 mt-2 text-sm text-amber-600">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span>Reconnecting...</span>
          </div>
        )}
      </div>
    </div>
  );
}
