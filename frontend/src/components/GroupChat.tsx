import { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { DataService } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';
import { Send, MessageCircle, ArrowLeft } from 'lucide-react';
import { navigate } from '../router';

interface GroupChatProps {
  groupId: string;
  groupName: string;
}

export default function GroupChat({ groupId, groupName }: GroupChatProps) {
  const { currentUser } = useUser();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupId) return;

    // Load message history
    const loadMessages = async () => {
      try {
        setLoading(true);
        const history = await DataService.fetchGroupMessages(groupId);
        setMessages(history);
        console.log(`📨 Loaded ${history.length} group messages`);
      } catch (error) {
        console.error('Failed to load group messages:', error);
        // If the service is initializing, retry after a short delay
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('initializing') || errorMessage.includes('503')) {
          setTimeout(() => {
            console.log('🔄 Retrying to load group messages...');
            loadMessages();
          }, 2000);
        }
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    // Join the group chat room
    let chatRoomId: string;
    const setupChat = async () => {
      try {
        // Retry connection if not established
        await azureIntegrationService.retryConnection();
        chatRoomId = await azureIntegrationService.joinGroupChat(groupId);
        console.log('Joined group chat:', chatRoomId);
      } catch (error) {
        console.error('Failed to join group chat:', error);
      }
    };

    setupChat();

    // Listen for real-time messages
    const handler = (payload: any) => {
      if (
        payload.groupId === groupId ||
        payload.chatRoomId === `group_${groupId}` ||
        payload.chatRoomId === chatRoomId
      ) {
        setMessages((prev) => [...prev, payload]);
      }
    };

    const unsub = azureIntegrationService.onConnectionEvent('message', handler);

    return () => {
      unsub();
      if (chatRoomId) {
        azureIntegrationService.leaveGroupChat(groupId);
      }
    };
  }, [groupId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const messageContent = input.trim();
    setInput(''); // Clear input immediately

    try {
      // Send message via DataService (which will save to database and send via WebPubSub)
      await DataService.sendGroupMessage(groupId, messageContent);

      // Add message to local state for immediate feedback
      const newMessage = {
        content: messageContent,
        senderId: currentUser?.user_id,
        senderName: `${currentUser?.first_name} ${currentUser?.last_name}`,
        timestamp: new Date().toISOString(),
        groupId: groupId,
        chatRoomId: `group_${groupId}`,
      };

      setMessages((prev) => [...prev, newMessage]);
      console.log('📤 Group message sent');
    } catch (error) {
      console.error('Failed to send group message:', error);
      // Optionally show error to user
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/groups')}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
          title="Back to groups"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-4xl font-bold text-slate-900">{groupName}</h1>
          <p className="text-lg text-slate-600 mt-2">Group Chat</p>
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-[600px] flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div
                className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"
                role="status"
                aria-label="Loading messages"
              ></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Start the conversation!</h3>
              <p className="text-slate-500">Be the first to send a message to your group.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, i) => {
                const senderId =
                  message.senderId || message.sender_id || message.userId || message.user_id;
                const isCurrentUser = String(senderId) === String(currentUser?.user_id);

                return (
                  <div
                    key={message.id || message.message_id || i}
                    className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] ${
                        isCurrentUser
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-900'
                      } rounded-2xl p-4 shadow-sm`}
                    >
                      {!isCurrentUser && (
                        <p className="text-xs font-semibold mb-1 opacity-70">
                          {message.senderName ||
                            message.sender_name ||
                            message.userName ||
                            message.user_name ||
                            'Group Member'}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed">
                        {message.content || message.message_content || message.text}
                      </p>
                      <p
                        className={`text-xs mt-2 ${
                          isCurrentUser ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {new Date(message.timestamp || message.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="p-6 border-t border-slate-100 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-end gap-3"
          >
            <div className="flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type your message..."
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={2}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-6 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="h-5 w-5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
