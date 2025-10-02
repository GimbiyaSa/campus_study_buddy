import { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { DataService, type StudyPartner } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';
import { Send, MessageCircle, Users, AlertCircle, RefreshCw } from 'lucide-react';

export default function Chat() {
  const { currentUser } = useUser();
  const [buddies, setBuddies] = useState<StudyPartner[]>([]);
  const [selectedBuddy, setSelectedBuddy] = useState<StudyPartner | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{title: string; message: string; retryable?: boolean} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load buddies (accepted connections)
  useEffect(() => {
    loadBuddies();

    // Listen for buddy updates
    const handleBuddiesUpdate = () => {
      loadBuddies();
    };

    window.addEventListener('buddies:invalidate', handleBuddiesUpdate);
    
    return () => {
      window.removeEventListener('buddies:invalidate', handleBuddiesUpdate);
    };
  }, []);

  const loadBuddies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await DataService.fetchPartners();
      setBuddies(data);
    } catch (err) {
      setError({
        title: 'Failed to load study partners',
        message: 'Unable to fetch your connected study buddies. Please check your connection and try again.',
        retryable: true
      });
      console.error('Error loading partners:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadBuddies();
  };

  // Subscribe to real-time messages
  useEffect(() => {
    if (!selectedBuddy) return;
    const chatRoomId = getChatRoomId(String(currentUser?.user_id), String(selectedBuddy.id));
    const handler = (payload: any) => {
      if (payload.chatRoomId === chatRoomId) {
        setMessages((prev) => [...prev, payload]);
      }
    };
    const unsub = azureIntegrationService.onConnectionEvent('message', handler);
    return () => unsub();
  }, [selectedBuddy, currentUser]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function getChatRoomId(userA: string, userB: string) {
    return [userA, userB].sort().join('-');
  }

  async function sendMessage() {
    if (!input.trim() || !selectedBuddy) return;
    
    try {
      const chatRoomId = getChatRoomId(String(currentUser?.user_id), String(selectedBuddy.id));
      await azureIntegrationService.sendChatMessage(chatRoomId, input.trim());
      setMessages((prev) => [...prev, {
        chatRoomId,
        content: input.trim(),
        senderId: currentUser?.user_id,
        senderName: currentUser?.first_name + ' ' + currentUser?.last_name,
        timestamp: new Date().toISOString(),
      }]);
      setInput('');
    } catch (err) {
      setError({
        title: 'Failed to send message',
        message: 'Your message could not be sent. Please try again.',
        retryable: false
      });
      console.error('Error sending message:', err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Chat with study partners</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Connect and collaborate with your study buddies in real-time conversations.
          </p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" role="status" aria-label="Loading"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Chat with study partners</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Connect and collaborate with your study buddies in real-time conversations.
        </p>
      </div>

      {/* Enhanced Error Display */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-red-900 mb-1">{error.title}</h4>
              <p className="text-sm text-red-700 mb-3">{error.message}</p>
              {error.retryable && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded-lg transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Chat Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-[600px]">
        {/* Partners List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-full flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Study Partners</h2>
                  <p className="text-sm text-slate-500">{buddies.length} connected</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {buddies.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="font-medium text-slate-900 mb-2">No partners yet</h3>
                  <p className="text-sm text-slate-500">Start connecting with classmates to begin chatting!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {buddies.map((buddy) => (
                    <div
                      key={buddy.id}
                      onClick={() => {
                        setSelectedBuddy(buddy);
                        setMessages([]); // reset messages for new chat
                      }}
                      className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 ${
                        selectedBuddy?.id === buddy.id
                          ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white font-semibold">
                          {buddy.avatar ? (
                            <img
                              src={buddy.avatar}
                              alt={buddy.name}
                              className="w-12 h-12 rounded-xl object-cover"
                            />
                          ) : (
                            buddy.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{buddy.name}</p>
                          <p className="text-sm text-slate-500 truncate">{buddy.course || 'Study Partner'}</p>
                          <p className="text-xs text-slate-400">Connected</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-full flex flex-col">
            {selectedBuddy ? (
              <>
                {/* Chat Header */}
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white font-semibold">
                      {selectedBuddy.avatar ? (
                        <img
                          src={selectedBuddy.avatar}
                          alt={selectedBuddy.name}
                          className="w-12 h-12 rounded-xl object-cover"
                        />
                      ) : (
                        selectedBuddy.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">{selectedBuddy.name}</h3>
                      <p className="text-slate-500">{selectedBuddy.course || 'Study Partner'}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                  {messages.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <MessageCircle className="h-8 w-8 text-emerald-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">Start the conversation!</h3>
                      <p className="text-slate-500">Send a message to begin your study collaboration.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message, i) => (
                        <div
                          key={i}
                          className={`flex ${message.senderId === currentUser?.user_id ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs lg:max-w-sm xl:max-w-md px-4 py-3 rounded-2xl ${
                              message.senderId === currentUser?.user_id
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-900'
                            }`}
                          >
                            <div className={`text-xs font-medium mb-1 ${
                              message.senderId === currentUser?.user_id ? 'text-emerald-100' : 'text-slate-500'
                            }`}>
                              {message.senderName}
                            </div>
                            <p className="break-words">{message.content}</p>
                            <p className={`text-xs mt-2 ${
                              message.senderId === currentUser?.user_id ? 'text-emerald-100' : 'text-slate-400'
                            }`}>
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
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
                        rows={1}
                        className="w-full resize-none border border-slate-300 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                        style={{ minHeight: '48px', maxHeight: '120px' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      aria-label="Send"
                      className="w-12 h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition-colors shadow-sm"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 bg-slate-50">
                <div className="text-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <MessageCircle className="h-10 w-10 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Select a study partner</h3>
                  <p className="text-slate-500">Choose someone from your partner list to start chatting.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
