const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const { ServiceBusClient } = require('@azure/service-bus');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = cosmosClient.database('StudyBuddyDB');
const groupsContainer = database.container('Groups');
const sessionsContainer = database.container('Sessions');

// Create study group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, subjects, maxMembers, isPublic } = req.body;

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
          joinedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    const { resource: createdGroup } = await groupsContainer.items.create(group);

    // Send notification to invited members (optional)
    if (req.body.inviteUserIds && req.body.inviteUserIds.length > 0) {
      await sendGroupInvitations(createdGroup, req.body.inviteUserIds);
    }

    res.status(201).json(createdGroup);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// List groups (same university; public OR ones you're a member of)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const querySpec = {
      query: `
        SELECT * FROM groups g
        WHERE g.partitionKey = @university
          AND (g.isPublic = true OR
               EXISTS(SELECT VALUE m FROM m IN g.members WHERE m.userId = @userId))
        ORDER BY g.lastActivity DESC
      `,
      parameters: [
        { name: '@university', value: req.user.university },
        { name: '@userId', value: req.user.id },
      ],
    };

    const { resources: groups } = await groupsContainer.items.query(querySpec).fetchAll();
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get user's groups (member of)
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
        { name: '@userId', value: req.user.id },
      ],
    };

    const { resources: groups } = await groupsContainer.items.query(querySpec).fetchAll();
    res.json(groups);
  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Join a group (idempotent; checks capacity)
router.post('/:groupId/join', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Read group by id + partitionKey (university)
    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Already a member? Return OK and current group (idempotent)
    const isMember = Array.isArray(group.members)
      ? group.members.some((m) => m.userId === req.user.id)
      : false;

    if (isMember) {
      return res.status(200).json(group);
    }

    // Capacity check (if defined)
    const currentCount = Array.isArray(group.members) ? group.members.length : 0;
    if (group.maxMembers && currentCount >= group.maxMembers) {
      return res.status(409).json({ error: 'Group is full' });
    }

    // Add as member
    group.members = Array.isArray(group.members) ? group.members : [];
    group.members.push({
      userId: req.user.id,
      role: 'member',
      joinedAt: new Date().toISOString(),
    });
    group.lastActivity = new Date().toISOString();

    const { resource: updated } = await groupsContainer.item(groupId, req.user.university).replace(group);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error joining group:', error);
    if (error.code === 404) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// Invite members to a group (owner/admin only)
router.post('/:groupId/invite', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { inviteUserIds } = req.body;

    if (!Array.isArray(inviteUserIds) || inviteUserIds.length === 0) {
      return res.status(400).json({ error: 'inviteUserIds array is required' });
    }

    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only creator/admin can invite
    const memberEntry = (group.members || []).find((m) => m.userId === req.user.id);
    const isOwnerOrAdmin = req.user.id === group.createdBy || (memberEntry && memberEntry.role === 'admin');

    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the group owner or admin can send invites' });
    }

    await sendGroupInvitations(group, inviteUserIds);

    // Touch activity (no structural change needed)
    group.lastActivity = new Date().toISOString();
    await groupsContainer.item(groupId, req.user.university).replace(group);

    res.status(202).json({ groupId, invitedCount: inviteUserIds.length });
  } catch (error) {
    console.error('Error inviting group members:', error);
    if (error.code === 404) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.status(500).json({ error: 'Failed to send invites' });
  }
});

// Schedule group session
router.post('/:groupId/sessions', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, description, startTime, endTime, location, topics } = req.body;

    // Verify user is member of the group
    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();
    const isMember = group.members.some((m) => m.userId === req.user.id);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
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
      createdAt: new Date().toISOString(),
    };

    const { resource: createdSession } = await sessionsContainer.items.create(session);

    // Schedule reminder notifications
    if (typeof scheduleSessionReminders === 'function') {
      await scheduleSessionReminders(createdSession, group.members);
    }

    res.status(201).json(createdSession);
  } catch (error) {
    console.error('Error scheduling session:', error);
    res.status(500).json({ error: 'Failed to schedule session' });
  }
});

async function sendGroupInvitations(group, userIds) {
  const serviceBusClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING);
  const sender = serviceBusClient.createSender('group-invitations');

  try {
    for (const userId of userIds) {
      await sender.sendMessages({
        body: {
          type: 'group_invitation',
          groupId: group.id,
          groupName: group.name,
          invitedBy: group.createdBy,
          userId,
        },
      });
    }
  } finally {
    await sender.close();
    await serviceBusClient.close();
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDatePartition(dateString) {
  return new Date(dateString).toISOString().split('T')[0]; // YYYY-MM-DD
}

module.exports = router;
