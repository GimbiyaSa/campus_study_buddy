const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Initialize Web PubSub client using Azure config
let serviceClient;
const initializeWebPubSub = async () => {
  try {
    // Try to use Azure configuration first
    try {
      const { azureConfig } = require('../config/azureConfig');
      serviceClient = await azureConfig.getWebPubSubClient();
    } catch (azureError) {
      console.warn('Azure config not available, using environment variables');
      serviceClient = new WebPubSubServiceClient(
        process.env.WEB_PUBSUB_CONNECTION_STRING,
        'studybuddy'
      );
      console.log('✅ Connected to Azure Web PubSub (via env vars)');
    }
  } catch (error) {
    console.error('❌ Web PubSub connection failed:', error);
    throw error;
  }
};

// Initialize Azure SQL connection pool
let pool;
let isInitialized = false;

const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database connection for chat service...');
    // Try to use Azure configuration first
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      console.log('🔧 Using Azure config for database connection');
      pool = await sql.connect(dbConfig);
    } catch (azureError) {
      console.warn(
        '⚠️ Azure config not available, using environment variables:',
        azureError.message
      );
      // Fallback to connection string
      if (process.env.DATABASE_CONNECTION_STRING) {
        console.log('🔧 Using DATABASE_CONNECTION_STRING from environment');
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found in environment variables');
      }
    }
    console.log('✅ Database connection established for chat service');
  } catch (error) {
    console.error('❌ Database connection failed for chat service:', error.message);
    throw error;
  }
};

// Initialize both services
const initializeServices = async () => {
  try {
    await Promise.all([initializeWebPubSub(), initializeDatabase()]);
    isInitialized = true;
    console.log('✅ Chat service fully initialized');
  } catch (error) {
    console.error('❌ Chat service initialization failed:', error);
  }
};

// Start initialization
initializeServices();

// Helper function to check if service is ready
const ensureServiceReady = (req, res, next) => {
  if (!isInitialized || !pool) {
    return res
      .status(503)
      .json({ error: 'Chat service is initializing, please try again in a moment' });
  }
  next();
};

// Helper function
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Get chat connection
router.post('/negotiate', authenticateToken, ensureServiceReady, async (req, res) => {
  try {
    const { groupId, partnerId } = req.body;

    // For initial connection, allow without specific group/partner
    let groups = [`user_${req.user.id}`]; // User's personal channel for notifications

    // For partner chat, create a group ID from user IDs
    if (partnerId) {
      const userIds = [req.user.id, partnerId].sort();
      const partnerGroup = `partner_${userIds.join('_')}`;
      groups.push(partnerGroup);
    } else if (groupId) {
      // Verify user has access to the group
      const hasAccess = await verifyGroupAccess(req.user.id, groupId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to group' });
      }
      groups.push(`group_${groupId}`);
    }

    const token = await serviceClient.getClientAccessToken({
      userId: req.user.id,
      groups: groups,
      roles: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup'],
    });

    res.json({
      url: token.url,
      accessToken: token.token,
      groups: groups,
    });
  } catch (error) {
    console.error('Error negotiating chat connection:', error);
    res.status(500).json({ error: 'Failed to establish chat connection' });
  }
});

// Send message to group
router.post(
  '/groups/:groupId/messages',
  authenticateToken,
  ensureServiceReady,
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const { content, type = 'text' } = req.body;
      const userId = req.user.id;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      console.log('💬 Sending group message:', {
        groupId,
        userId,
        content: content.substring(0, 50) + '...',
      });

      // Get or create chat room for this group
      const roomName = `group_${groupId}`;

      let roomRequest = pool.request();
      roomRequest.input('roomName', sql.NVarChar(255), roomName);
      roomRequest.input('groupId', sql.Int, parseInt(groupId));

      let roomResult = await roomRequest.query(`
      SELECT room_id FROM chat_rooms WHERE room_name = @roomName
    `);

      let roomId;
      if (roomResult.recordset.length === 0) {
        // Create room if it doesn't exist
        const createRoomRequest = pool.request();
        createRoomRequest.input('roomName', sql.NVarChar(255), roomName);
        createRoomRequest.input('groupId', sql.Int, parseInt(groupId));
        createRoomRequest.input('roomType', sql.NVarChar(50), 'group');

        const createResult = await createRoomRequest.query(`
        INSERT INTO chat_rooms (group_id, room_name, room_type, is_active)
        OUTPUT INSERTED.room_id
        VALUES (@groupId, @roomName, @roomType, 1)
      `);
        roomId = createResult.recordset[0].room_id;
        console.log('✅ Created new group chat room:', roomId);
      } else {
        roomId = roomResult.recordset[0].room_id;
      }

      // Save message to database
      const messageRequest = pool.request();
      messageRequest.input('roomId', sql.Int, roomId);
      messageRequest.input('senderId', sql.NVarChar(255), userId);
      messageRequest.input('content', sql.NText, content.trim());
      messageRequest.input('messageType', sql.NVarChar(50), type);

      const messageResult = await messageRequest.query(`
      INSERT INTO chat_messages (room_id, sender_id, message_content, message_type)
      OUTPUT INSERTED.message_id, INSERTED.created_at
      VALUES (@roomId, @senderId, @content, @messageType)
    `);

      const newMessage = messageResult.recordset[0];

      // Get sender name
      const senderRequest = pool.request();
      senderRequest.input('senderId', sql.NVarChar(255), userId);
      const senderResult = await senderRequest.query(`
      SELECT first_name + ' ' + last_name as senderName FROM users WHERE user_id = @senderId
    `);

      const senderName = senderResult.recordset[0]?.senderName || 'Unknown User';

      // Send real-time message via WebPubSub
      const messagePayload = {
        type: 'chat_message',
        payload: {
          chatRoomId: roomName,
          content: content.trim(),
          messageType: type,
          senderId: userId,
          senderName,
          timestamp: newMessage.created_at,
          messageId: newMessage.message_id,
          groupId: groupId,
        },
      };

      try {
        await serviceClient.sendToGroup(roomName, messagePayload);
        console.log('✅ Real-time group message sent via WebPubSub');
      } catch (pubsubError) {
        console.warn('⚠️ Failed to send real-time group message:', pubsubError);
      }

      console.log('✅ Group message saved and sent');
      res.json({
        messageId: newMessage.message_id,
        timestamp: newMessage.created_at,
        success: true,
      });
    } catch (error) {
      console.error('❌ Error sending group message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

// Get chat history for a group
router.get('/groups/:groupId/messages', authenticateToken, ensureServiceReady, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50 } = req.query;
    const userId = req.user.id;

    console.log('📨 Fetching group messages:', { groupId, userId, limit });

    // Check if database pool is available
    if (!pool) {
      console.error('❌ Database pool not initialized');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Verify user has access to this group
    const hasAccess = await verifyGroupAccess(userId, groupId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to group' });
    }

    // Get or create chat room for this group
    const roomName = `group_${groupId}`;

    const roomRequest = pool.request();
    roomRequest.input('roomName', sql.NVarChar(255), roomName);
    roomRequest.input('groupId', sql.Int, parseInt(groupId));

    let roomResult = await roomRequest.query(`
      SELECT room_id FROM chat_rooms WHERE room_name = @roomName
    `);

    let roomId;
    if (roomResult.recordset.length === 0) {
      // Create room if it doesn't exist
      const createRoomRequest = pool.request();
      createRoomRequest.input('roomName', sql.NVarChar(255), roomName);
      createRoomRequest.input('groupId', sql.Int, parseInt(groupId));
      createRoomRequest.input('roomType', sql.NVarChar(50), 'group');

      const createResult = await createRoomRequest.query(`
        INSERT INTO chat_rooms (group_id, room_name, room_type, is_active)
        OUTPUT INSERTED.room_id
        VALUES (@groupId, @roomName, @roomType, 1)
      `);
      roomId = createResult.recordset[0].room_id;
      console.log('✅ Created new chat room:', roomId);
    } else {
      roomId = roomResult.recordset[0].room_id;
    }

    // Get messages from room
    const messageRequest = pool.request();
    messageRequest.input('roomId', sql.Int, roomId);
    messageRequest.input('limit', sql.Int, parseInt(limit));

    const messageResult = await messageRequest.query(`
      SELECT TOP (@limit)
        cm.message_id as id,
        cm.sender_id as senderId,
        cm.message_content as content,
        cm.message_type as type,
        cm.created_at as timestamp,
        u.first_name + ' ' + u.last_name as senderName
      FROM chat_messages cm
      INNER JOIN users u ON cm.sender_id = u.user_id
      WHERE cm.room_id = @roomId AND cm.is_deleted = 0
      ORDER BY cm.created_at DESC
    `);

    const messages = messageResult.recordset.reverse(); // Return in chronological order
    console.log(`✅ Fetched ${messages.length} messages for group ${groupId}`);
    res.json(messages);
  } catch (error) {
    console.error('❌ Error fetching group messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

async function verifyGroupAccess(userId, groupId) {
  // Implementation to verify user is member of the group using Azure SQL
  try {
    if (!pool) {
      throw new Error('Message store not available');
    }
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), userId);
    request.input('groupId', sql.Int, groupId);

    const result = await request.query(`
      SELECT gm.group_id, gm.user_id, gm.role, gm.status
      FROM group_members gm
      INNER JOIN study_groups sg ON gm.group_id = sg.group_id
      WHERE gm.user_id = @userId 
      AND gm.group_id = @groupId
      AND gm.status = 'active'
    `);

    return result.recordset.length > 0;
  } catch (error) {
    console.error('Error verifying group access:', error);
    return false;
  }
}

// Partner chat endpoints for message persistence

// Get or create a partner chat room
router.get('/partner/:partnerId/room', authenticateToken, ensureServiceReady, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user.id;

    console.log('🔍 Getting partner chat room:', { userId, partnerId });

    // Verify users are connected as partners
    const partnerRequest = pool.request();
    partnerRequest.input('userId', sql.NVarChar(255), userId);
    partnerRequest.input('partnerId', sql.NVarChar(255), partnerId);

    const partnerCheck = await partnerRequest.query(`
      SELECT COUNT(*) as count FROM partner_matches
      WHERE ((requester_id = @userId AND matched_user_id = @partnerId) 
         OR (requester_id = @partnerId AND matched_user_id = @userId))
      AND match_status = 'accepted'
    `);

    if (partnerCheck.recordset[0].count === 0) {
      return res.status(403).json({ error: 'Not connected as study partners' });
    }

    // Create consistent room name from user IDs
    const userIds = [userId, partnerId].sort();
    const roomName = `partner_${userIds.join('_')}`;

    // Check if room exists, if not create it
    const roomRequest = pool.request();
    roomRequest.input('roomName', sql.NVarChar(255), roomName);

    let roomResult = await roomRequest.query(`
      SELECT room_id FROM chat_rooms WHERE room_name = @roomName
    `);

    let roomId;
    if (roomResult.recordset.length === 0) {
      // Create new room (we'll use a dummy group_id of 1 for partner chats)
      const createRoomRequest = pool.request();
      createRoomRequest.input('roomName', sql.NVarChar(255), roomName);
      createRoomRequest.input('roomType', sql.NVarChar(50), 'private');

      const createResult = await createRoomRequest.query(`
        INSERT INTO chat_rooms (group_id, room_name, room_type, is_active)
        OUTPUT INSERTED.room_id
        VALUES (1, @roomName, @roomType, 1)
      `);
      roomId = createResult.recordset[0].room_id;
      console.log('✅ Created new partner chat room:', roomId);
    } else {
      roomId = roomResult.recordset[0].room_id;
      console.log('✅ Found existing partner chat room:', roomId);
    }

    res.json({ roomId, roomName });
  } catch (error) {
    console.error('❌ Error getting partner chat room:', error);
    res.status(500).json({ error: 'Failed to get chat room' });
  }
});

// Get message history for a partner chat
router.get(
  '/partner/:partnerId/messages',
  authenticateToken,
  ensureServiceReady,
  async (req, res) => {
    try {
      const { partnerId } = req.params;
      const userId = req.user.id;
      const { limit = 50, before } = req.query;

      console.log('📨 Getting partner chat messages:', { userId, partnerId, limit });

      // Create consistent room name from user IDs
      const userIds = [userId, partnerId].sort();
      const roomName = `partner_${userIds.join('_')}`;

      // Get room ID
      const roomRequest = pool.request();
      roomRequest.input('roomName', sql.NVarChar(255), roomName);

      const roomResult = await roomRequest.query(`
      SELECT room_id FROM chat_rooms WHERE room_name = @roomName
    `);

      if (roomResult.recordset.length === 0) {
        return res.json([]); // No messages if room doesn't exist
      }

      const roomId = roomResult.recordset[0].room_id;

      // Get messages
      const messageRequest = pool.request();
      messageRequest.input('roomId', sql.Int, roomId);
      messageRequest.input('limit', sql.Int, parseInt(limit));

      let query = `
      SELECT TOP (@limit)
        cm.message_id,
        cm.sender_id,
        cm.message_content as content,
        cm.message_type,
        cm.created_at as timestamp,
        u.first_name + ' ' + u.last_name as senderName
      FROM chat_messages cm
      INNER JOIN users u ON cm.sender_id = u.user_id
      WHERE cm.room_id = @roomId
      AND cm.is_deleted = 0
    `;

      if (before) {
        messageRequest.input('before', sql.DateTime2, before);
        query += ` AND cm.created_at < @before`;
      }

      query += ` ORDER BY cm.created_at DESC`;

      const result = await messageRequest.query(query);

      // Reverse to get chronological order (oldest first)
      const messages = result.recordset.reverse();

      console.log(`📨 Found ${messages.length} messages for room ${roomId}`);
      res.json(messages);
    } catch (error) {
      console.error('❌ Error getting partner chat messages:', error);
      res.status(500).json({ error: 'Failed to get messages' });
    }
  }
);

// Send a message to partner chat
router.post(
  '/partner/:partnerId/message',
  authenticateToken,
  ensureServiceReady,
  async (req, res) => {
    try {
      const { partnerId } = req.params;
      const userId = req.user.id;
      const { content, messageType = 'text' } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      console.log('💬 Sending partner message:', {
        userId,
        partnerId,
        content: content.substring(0, 50) + '...',
      });

      // Create consistent room name from user IDs
      const userIds = [userId, partnerId].sort();
      const roomName = `partner_${userIds.join('_')}`;

      // Get or create room
      const roomRequest = pool.request();
      roomRequest.input('roomName', sql.NVarChar(255), roomName);

      let roomResult = await roomRequest.query(`
      SELECT room_id FROM chat_rooms WHERE room_name = @roomName
    `);

      let roomId;
      if (roomResult.recordset.length === 0) {
        // Create new room
        const createRoomRequest = pool.request();
        createRoomRequest.input('roomName', sql.NVarChar(255), roomName);
        createRoomRequest.input('roomType', sql.NVarChar(50), 'private');

        const createResult = await createRoomRequest.query(`
        INSERT INTO chat_rooms (group_id, room_name, room_type, is_active)
        OUTPUT INSERTED.room_id
        VALUES (1, @roomName, @roomType, 1)
      `);
        roomId = createResult.recordset[0].room_id;
      } else {
        roomId = roomResult.recordset[0].room_id;
      }

      // Save message to database
      const messageRequest = pool.request();
      messageRequest.input('roomId', sql.Int, roomId);
      messageRequest.input('senderId', sql.NVarChar(255), userId);
      messageRequest.input('content', sql.NText, content.trim());
      messageRequest.input('messageType', sql.NVarChar(50), messageType);

      const messageResult = await messageRequest.query(`
      INSERT INTO chat_messages (room_id, sender_id, message_content, message_type)
      OUTPUT INSERTED.message_id, INSERTED.created_at
      VALUES (@roomId, @senderId, @content, @messageType)
    `);

      const newMessage = messageResult.recordset[0];

      // Get sender name
      const senderRequest = pool.request();
      senderRequest.input('senderId', sql.NVarChar(255), userId);
      const senderResult = await senderRequest.query(`
      SELECT first_name + ' ' + last_name as senderName FROM users WHERE user_id = @senderId
    `);

      const senderName = senderResult.recordset[0]?.senderName || 'Unknown User';

      // Send real-time message via WebPubSub
      const messagePayload = {
        type: 'chat_message',
        payload: {
          chatRoomId: roomName,
          content: content.trim(),
          messageType,
          senderId: userId,
          senderName,
          timestamp: newMessage.created_at,
          messageId: newMessage.message_id,
        },
      };

      try {
        await serviceClient.sendToGroup(roomName, messagePayload);
        console.log('✅ Real-time message sent via WebPubSub');
      } catch (pubsubError) {
        console.warn('⚠️ Failed to send real-time message:', pubsubError);
      }

      console.log('✅ Message saved and sent');
      res.json({
        messageId: newMessage.message_id,
        timestamp: newMessage.created_at,
        success: true,
      });
    } catch (error) {
      console.error('❌ Error sending partner message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

module.exports = router;
// Export for testing
module.exports.verifyGroupAccess = verifyGroupAccess;
