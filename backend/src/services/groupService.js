const express = require('express')
const { CosmosClient } = require('@azure/cosmos')
const { ServiceBusClient } = require('@azure/service-bus')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = cosmosClient.database('StudyBuddyDB')
const groupsContainer = database.container('Groups')
const sessionsContainer = database.container('Sessions')

// Create study group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, subjects, maxMembers, isPublic } = req.body
    
    const group = {
      id: generateId(),
      name,
      description,
      subjects,
      maxMembers,
      isPublic,
      createdBy: req.user.id,
      partitionKey: req.user.university,
      members: [
        {
          userId: req.user.id,
          role: 'admin',
          joinedAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }
    
    const { resource: createdGroup } = await groupsContainer.items.create(group)
    
    // Send notification to invited members
    if (req.body.inviteUserIds && req.body.inviteUserIds.length > 0) {
      await sendGroupInvitations(createdGroup, req.body.inviteUserIds)
    }
    
    res.status(201).json(createdGroup)
  } catch (error) {
    console.error('Error creating group:', error)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

// Get user's groups
router.get('/my-groups', authenticateToken, async (req, res) => {
  try {
    const querySpec = {
      query: `
        SELECT * FROM groups g 
        WHERE g.partitionKey = @university 
        AND EXISTS(
          SELECT VALUE m FROM m IN g.members 
          WHERE m.userId = @userId
        )
        ORDER BY g.lastActivity DESC
      `,
      parameters: [
        { name: '@university', value: req.user.university },
        { name: '@userId', value: req.user.id }
      ]
    }
    
    const { resources: groups } = await groupsContainer.items.query(querySpec).fetchAll()
    res.json(groups)
  } catch (error) {
    console.error('Error fetching user groups:', error)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

// Schedule group session
router.post('/:groupId/sessions', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params
    const { title, description, startTime, endTime, location, topics } = req.body
    
    // Verify user is member of the group
    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read()
    const isMember = group.members.some(m => m.userId === req.user.id)
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' })
    }
    
    const session = {
      id: generateId(),
      groupId,
      title,
      description,
      startTime,
      endTime,
      location,
      topics,
      createdBy: req.user.id,
      partitionKey: formatDatePartition(startTime),
      attendees: [],
      status: 'scheduled',
      createdAt: new Date().toISOString()
    }
    
    const { resource: createdSession } = await sessionsContainer.items.create(session)
    
    // Schedule reminder notifications
    await scheduleSessionReminders(createdSession, group.members)
    
    res.status(201).json(createdSession)
  } catch (error) {
    console.error('Error scheduling session:', error)
    res.status(500).json({ error: 'Failed to schedule session' })
  }
})

async function sendGroupInvitations(group, userIds) {
  // Implementation for sending invitations via Azure Service Bus
  const serviceBusClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING)
  const sender = serviceBusClient.createSender('group-invitations')
  
  for (const userId of userIds) {
    await sender.sendMessages({
      body: {
        type: 'group_invitation',
        groupId: group.id,
        groupName: group.name,
        invitedBy: group.createdBy,
        userId
      }
    })
  }
  
  await sender.close()
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function formatDatePartition(dateString) {
  return new Date(dateString).toISOString().split('T')[0] // YYYY-MM-DD
}

module.exports = router