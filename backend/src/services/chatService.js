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
        'chat-hub'
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
const initializeDatabase = async () => {
  try {
    // Try to use Azure configuration first
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
    } catch (azureError) {
      console.warn('Azure config not available, using environment variables');
      // Fallback to connection string
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found in environment variables');
      }
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Initialize both services
Promise.all([initializeWebPubSub(), initializeDatabase()]).catch(console.error);

// Get chat connection
router.post('/negotiate', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body;

    // Verify user has access to the group
    const hasAccess = await verifyGroupAccess(req.user.id, groupId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to group' });
    }

    const token = await serviceClient.getClientAccessToken({
      userId: req.user.id,
      groups: [`group_${groupId}`],
      roles: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup'],
    });

    res.json({
      url: token.url,
      accessToken: token.token,
    });
  } catch (error) {
    console.error('Error negotiating chat connection:', error);
    res.status(500).json({ error: 'Failed to establish chat connection' });
  }
});

// Send message to group
router.post('/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, type = 'text' } = req.body;

    const message = {
      id: generateId(),
      groupId,
      partitionKey: groupId,
      userId: req.user.id,
      userName: req.user.name,
      content,
      type,
      timestamp: new Date().toISOString(),
    };

    // Save message to database
    await messagesContainer.items.create(message);

    // Broadcast to group members
    await serviceClient.sendToGroup(`group_${groupId}`, {
      type: 'message',
      data: message,
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get chat history
router.get('/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50, before } = req.query;

    let querySpec = {
      query: `
        SELECT TOP @limit * FROM messages m 
        WHERE m.groupId = @groupId 
        ${before ? 'AND m.timestamp < @before' : ''}
        ORDER BY m.timestamp DESC
      `,
      parameters: [
        { name: '@groupId', value: groupId },
        { name: '@limit', value: parseInt(limit) },
      ],
    };

    if (before) {
      querySpec.parameters.push({ name: '@before', value: before });
    }

    const { resources: messages } = await messagesContainer.items.query(querySpec).fetchAll();
    res.json(messages.reverse()); // Return in chronological order
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

async function verifyGroupAccess(userId, groupId) {
  // Implementation to verify user is member of the group using Azure SQL
  try {
    const request = pool.request();
    request.input('userId', sql.NVarChar, userId);
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

module.exports = router;