const express = require('express')
const { WebPubSubServiceClient } = require('@azure/web-pubsub')
const { CosmosClient } = require('@azure/cosmos')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const serviceClient = new WebPubSubServiceClient(
  process.env.WEB_PUBSUB_CONNECTION_STRING, 
  'chat-hub'
)

const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const messagesContainer = cosmosClient.database('StudyBuddyDB').container('Messages')

// Get chat connection
router.post('/negotiate', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body
    
    // Verify user has access to the group
    const hasAccess = await verifyGroupAccess(req.user.id, groupId)
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to group' })
    }
    
    const token = await serviceClient.getClientAccessToken({
      userId: req.user.id,
      groups: [`group_${groupId}`],
      roles: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup']
    })
    
    res.json({
      url: token.url,
      accessToken: token.token
    })
  } catch (error) {
    console.error('Error negotiating chat connection:', error)
    res.status(500).json({ error: 'Failed to establish chat connection' })
  }
})

// Send message to group
router.post('/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params
    const { content, type = 'text' } = req.body
    
    const message = {
      id: generateId(),
      groupId,
      partitionKey: groupId,
      userId: req.user.id,
      userName: req.user.name,
      content,
      type,
      timestamp: new Date().toISOString()
    }
    
    // Save message to database
    await messagesContainer.items.create(message)
    
    // Broadcast to group members
    await serviceClient.sendToGroup(`group_${groupId}`, {
      type: 'message',
      data: message
    })
    
    res.status(201).json(message)
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Get chat history
router.get('/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params
    const { limit = 50, before } = req.query
    
    let querySpec = {
      query: `
        SELECT TOP @limit * FROM messages m 
        WHERE m.groupId = @groupId 
        ${before ? 'AND m.timestamp < @before' : ''}
        ORDER BY m.timestamp DESC
      `,
      parameters: [
        { name: '@groupId', value: groupId },
        { name: '@limit', value: parseInt(limit) }
      ]
    }
    
    if (before) {
      querySpec.parameters.push({ name: '@before', value: before })
    }
    
    const { resources: messages } = await messagesContainer.items.query(querySpec).fetchAll()
    res.json(messages.reverse()) // Return in chronological order
  } catch (error) {
    console.error('Error fetching messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

async function verifyGroupAccess(userId, groupId) {
  // Implementation to verify user is member of the group
  const groupsContainer = cosmosClient.database('StudyBuddyDB').container('Groups')
  
  try {
    const querySpec = {
      query: `
        SELECT VALUE COUNT(1) FROM groups g 
        WHERE g.id = @groupId 
        AND EXISTS(SELECT VALUE m FROM m IN g.members WHERE m.userId = @userId)
      `,
      parameters: [
        { name: '@groupId', value: groupId },
        { name: '@userId', value: userId }
      ]
    }
    
    const { resources } = await groupsContainer.items.query(querySpec).fetchAll()
    return resources[0] > 0
  } catch (error) {
    console.error('Error verifying group access:', error)
    return false
  }
}

module.exports = router