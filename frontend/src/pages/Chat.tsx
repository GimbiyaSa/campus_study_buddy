import { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { DataService, type StudyPartner } from '../services/dataService';
import azureIntegrationService from '../services/azureIntegrationService';
import { Send, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react';
import GroupChat from '../components/GroupChat';

export default function Chat() {
  const { currentUser } = useUser();
  
  // IMPORTANT: All hooks must be declared before any conditional returns!
  const [groupChatMode, setGroupChatMode] = useState<{ groupId: string; groupName: string } | null>(null);
  const [buddies, setBuddies] = useState<StudyPartner[]>([]);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [selectedBuddy, setSelectedBuddy] = useState<StudyPartner | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [, setGroupsLoading] = useState(true);
  const [error, setError] = useState<{
    title: string;
    message: string;
    retryable?: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check for groupId in URL params - if present, show GroupChat component
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('groupId');
    
    if (groupId) {
      // Load group info
      DataService.fetchMyGroups().then((groups) => {
        const group = groups.find((g: any) => 
          String(g.id) === groupId || String(g.group_id) === groupId
        );
        if (group) {
          setGroupChatMode({
            groupId: String(group.id || group.group_id),
            groupName: group.name || group.group_name || 'Study Group'
          });
        }
      });
    } else {
      // Clear group chat mode if no groupId in URL
      setGroupChatMode(null);
    }
  }, []);

  // Check for partnerId in URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const partnerId = params.get('partnerId');
    
    if (partnerId && buddies.length > 0) {
      const buddy = buddies.find((b) => String(b.id) === partnerId);
      if (buddy) {
        setSelectedBuddy(buddy);
        // Clear the URL parameter after selecting
        window.history.replaceState({}, '', '/chat');
      }
    }
  }, [buddies]);

  // Load buddies (accepted connections) and groups
  useEffect(() => {
    loadBuddies();
    loadGroups();

    // Listen for buddy updates
    const handleBuddiesUpdate = () => {
      loadBuddies();
    };

    // Listen for group updates
    const handleGroupsUpdate = () => {
      loadGroups();
    };

    // Listen for group membership changes
    const handleGroupJoined = () => {
      console.log('👥 Group joined - refreshing chat groups');
      loadGroups();
    };

    const handleGroupLeft = (event: any) => {
      console.log('👋 Group left - refreshing chat groups');
      const groupId = event.detail?.groupId || event.detail?.group_id;
      if (groupId && (selectedGroup?.id === groupId || selectedGroup?.group_id === groupId)) {
        // Clear selection if we left the currently selected group
        setSelectedGroup(null);
        setGroupChatMode(null);
        setMessages([]);
        window.history.pushState({}, '', '/chat');
      }
      loadGroups();
    };

    // Listen for partner request acceptance to refresh buddy list
    const handlePartnerAccepted = () => {
      console.log('🎉 Partner accepted - refreshing chat buddy list');
      loadBuddies();
    };

    window.addEventListener('buddies:invalidate', handleBuddiesUpdate);
    window.addEventListener('groups:invalidate', handleGroupsUpdate);
    window.addEventListener('group:joined', handleGroupJoined as EventListener);
    window.addEventListener('group:left', handleGroupLeft as EventListener);

    // Subscribe to Azure Web PubSub events
    const unsubscribeAccepted = azureIntegrationService.onConnectionEvent(
      'partner_accepted',
      handlePartnerAccepted
    );

    return () => {
      window.removeEventListener('buddies:invalidate', handleBuddiesUpdate);
      window.removeEventListener('groups:invalidate', handleGroupsUpdate);
      window.removeEventListener('group:joined', handleGroupJoined as EventListener);
      window.removeEventListener('group:left', handleGroupLeft as EventListener);
      unsubscribeAccepted();
    };
  }, []);

  const loadBuddies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await DataService.fetchPartners(); // Get connected partners for chat
      // Filter to only show accepted connections for chat
      const connectedBuddies = data.filter((partner) => partner.connectionStatus === 'accepted');
      setBuddies(connectedBuddies);
    } catch (err) {
      setError({
        title: 'Failed to load study partners',
        message:
          'Unable to fetch your connected study buddies. Please check your connection and try again.',
        retryable: true,
      });
      console.error('Error loading partners:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      setGroupsLoading(true);
      const groups = await DataService.fetchMyGroups();
      // Only include groups where the user is a member
      const memberGroups = groups.filter((group: any) => 
        group.isMember || group.member_count > 0 || group.members?.some((m: any) => 
          m.userId === currentUser?.user_id || m.user_id === currentUser?.user_id
        )
      );
      setMyGroups(memberGroups);
      console.log('📱 Loaded member groups for chat:', memberGroups.length);
    } catch (err) {
      console.error('Error loading groups for chat:', err);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadBuddies();
    loadGroups();
  };

  // Subscribe to real-time messages
  useEffect(() => {
    if (!selectedBuddy) return;

    // Clear messages when switching buddies
    setMessages([]);

    let chatRoomId: string;

    const setupChat = async () => {
      try {
        // Retry connection if not established
        await azureIntegrationService.retryConnection();

        // Get or create chat room and load message history
        const roomResponse = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/v1/chat/partner/${
            selectedBuddy.id
          }/room`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('google_id_token')}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (roomResponse.ok) {
          const roomData = await roomResponse.json();
          chatRoomId = roomData.roomName;

          // Load message history
          const messagesResponse = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/v1/chat/partner/${
              selectedBuddy.id
            }/messages`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem('google_id_token')}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (messagesResponse.ok) {
            const messageHistory = await messagesResponse.json();
            setMessages(messageHistory);
            console.log(`📨 Loaded ${messageHistory.length} messages from history`);
          }
        }

        chatRoomId = await azureIntegrationService.joinPartnerChat(Number(selectedBuddy.id));
        console.log('Joined partner chat:', chatRoomId);
      } catch (error) {
        console.error('Failed to join partner chat:', error);
      }
    };

    setupChat();

    const handler = (payload: any) => {
      if (payload.chatRoomId === chatRoomId) {
        setMessages((prev) => [...prev, payload]);
      }
    };

    const unsub = azureIntegrationService.onConnectionEvent('message', handler);

    return () => {
      unsub();
      if (chatRoomId && selectedBuddy) {
        azureIntegrationService.leavePartnerChat(Number(selectedBuddy.id));
      }
    };
  }, [selectedBuddy, currentUser]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || !selectedBuddy) return;

    try {
      // Send message via backend API (which will save to database and send via WebPubSub)
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/v1/chat/partner/${
          selectedBuddy.id
        }/message`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('google_id_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: input.trim(),
            messageType: 'text',
          }),
        }
      );

      if (response.ok) {
        // Add message to local state for immediate feedback
        const userIds = [currentUser?.user_id, Number(selectedBuddy.id)].sort();
        const chatRoomId = `partner_${userIds.join('_')}`;

        setMessages((prev) => [
          ...prev,
          {
            chatRoomId,
            content: input.trim(),
            senderId: currentUser?.user_id,
            senderName: currentUser?.first_name + ' ' + currentUser?.last_name,
            timestamp: new Date().toISOString(),
          },
        ]);
        setInput('');
      } else {
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (err) {
      setError({
        title: 'Failed to send message',
        message: 'Your message could not be sent. Please try again.',
        retryable: false,
      });
      console.error('Error sending message:', err);
    }
  }

  // If in group chat mode, render GroupChat component instead
  if (groupChatMode) {
    return <GroupChat groupId={groupChatMode.groupId} groupName={groupChatMode.groupName} />;
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Chat</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Connect and collaborate with your study partners and groups in real-time conversations.
          </p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"
            role="status"
            aria-label="Loading"
          ></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Chat</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Connect and collaborate with your study partners and groups in real-time conversations.
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
        {/* Chat List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-full flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Chats</h2>
                  <p className="text-sm text-slate-500">
                    {buddies.length} partners • {myGroups.length} groups
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {buddies.length === 0 && myGroups.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="font-medium text-slate-900 mb-2">No chats yet</h3>
                  <p className="text-sm text-slate-500">
                    Connect with partners or join groups to start chatting!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group Chats Section */}
                  {myGroups.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Group Chats
                      </h3>
                      <div className="space-y-2">
                        {myGroups.map((group) => (
                          <div
                            key={group.id || group.group_id}
                            onClick={() => {
                              setSelectedGroup(group);
                              setSelectedBuddy(null);
                              setMessages([]); // reset messages for new chat
                              // Navigate to group chat
                              const groupId = group.id || group.group_id;
                              window.history.pushState({}, '', `/chat?groupId=${groupId}`);
                              setGroupChatMode({
                                groupId: String(groupId),
                                groupName: group.name || group.group_name || 'Study Group'
                              });
                            }}
                            className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                              selectedGroup?.id === (group.id || group.group_id)
                                ? 'bg-blue-50 border-2 border-blue-200 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                                {(group.name || group.group_name || 'G').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 truncate text-sm">
                                  {group.name || group.group_name || 'Study Group'}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {group.member_count || group.members?.length || 0} members
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Study Partners Section */}
                  {buddies.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Study Partners
                      </h3>
                      <div className="space-y-2">
                        {buddies.map((buddy) => (
                          <div
                            key={buddy.id}
                            onClick={() => {
                              setSelectedBuddy(buddy);
                              setSelectedGroup(null);
                              setMessages([]); // reset messages for new chat
                              // Clear group chat mode
                              setGroupChatMode(null);
                              window.history.pushState({}, '', '/chat');
                            }}
                            className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                              selectedBuddy?.id === buddy.id
                                ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                                {buddy.avatar ? (
                                  <img
                                    src={buddy.avatar}
                                    alt={buddy.name}
                                    className="w-10 h-10 rounded-lg object-cover"
                                  />
                                ) : (
                                  buddy.name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 truncate text-sm">{buddy.name}</p>
                                <p className="text-xs text-slate-500">
                                  {buddy.course || 'Study Partner'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-full flex flex-col">
            {selectedBuddy || selectedGroup ? (
              <>
                {/* Chat Header */}
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold ${
                      selectedBuddy 
                        ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' 
                        : 'bg-gradient-to-br from-blue-400 to-blue-600'
                    }`}>
                      {selectedBuddy ? (
                        selectedBuddy.avatar ? (
                          <img
                            src={selectedBuddy.avatar}
                            alt={selectedBuddy.name}
                            className="w-12 h-12 rounded-xl object-cover"
                          />
                        ) : (
                          selectedBuddy.name.charAt(0).toUpperCase()
                        )
                      ) : selectedGroup ? (
                        (selectedGroup.name || selectedGroup.group_name || 'G').charAt(0).toUpperCase()
                      ) : null}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">
                        {selectedBuddy ? selectedBuddy.name : (selectedGroup?.name || selectedGroup?.group_name || 'Study Group')}
                      </h3>
                      <p className="text-slate-500">
                        {selectedBuddy 
                          ? (selectedBuddy.course || 'Study Partner')
                          : `${selectedGroup?.member_count || selectedGroup?.members?.length || 0} members`
                        }
                      </p>
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
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        Start the conversation!
                      </h3>
                      <p className="text-slate-500">
                        Send a message to begin your study collaboration.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message, i) => {
                        // Try different possible field names for sender ID
                        const messageSenderId = message.senderId || message.sender_id || message.userId || message.user_id || message.senderUserId;
                        const isCurrentUser = String(messageSenderId) === String(currentUser?.user_id);
                        
                        return (
                          <div
                            key={i}
                            className={`flex ${
                              isCurrentUser
                                ? 'justify-end'
                                : 'justify-start'
                            }`}
                          >
                            <div
                              className={`max-w-xs lg:max-w-sm xl:max-w-md px-4 py-3 rounded-2xl ${
                                isCurrentUser
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white border border-slate-200 text-slate-900'
                              }`}
                            >
                              <div
                                className={`text-xs font-medium mb-1 ${
                                  isCurrentUser
                                    ? 'text-emerald-100'
                                    : 'text-slate-500'
                                }`}
                              >
                                {message.senderName}
                              </div>
                              <p className="break-words">{message.content}</p>
                              <p
                                className={`text-xs mt-2 ${
                                  isCurrentUser
                                    ? 'text-emerald-100'
                                    : 'text-slate-400'
                                }`}
                              >
                                {new Date(message.timestamp).toLocaleString([], {
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
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Select a chat
                  </h3>
                  <p className="text-slate-500">
                    Choose a study partner or group from the list to start chatting.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
