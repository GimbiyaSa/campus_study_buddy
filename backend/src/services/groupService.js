// groupService.js
const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

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

// Initialize database connection
initializeDatabase();

// Helpers
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
function formatDatePartition(dateString) {
  return new Date(dateString).toISOString().split('T')[0]; // YYYY-MM-DD
}
function isActiveMember(m) {
  // Treat missing status as active for backward compatibility
  return !m || !m.status || m.status === 'active';
}
function activeMemberCount(group) {
  if (!Array.isArray(group?.members)) return 0;
  return group.members.filter(isActiveMember).length;
}

// Create study group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, subjects, maxMembers, isPublic, course, courseCode } = req.body;

    const group = {
      id: generateId(),
      name,
      description,
      subjects: Array.isArray(subjects) ? subjects : [],
      maxMembers,
      isPublic,
      course: course || '',
      courseCode: courseCode || '',
      createdBy: req.user.id,
      partitionKey: req.user.university,
      members: [
        {
          userId: req.user.id,
          role: 'admin',
          status: 'active',
          joinedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    const { resource: createdGroup } = await groupsContainer.items.create(group);

    // OPTIONAL: invitations on create (kept for compatibility; your UI now invites later)
    if (req.body.inviteUserIds && req.body.inviteUserIds.length > 0) {
      await sendGroupInvitations(createdGroup, req.body.inviteUserIds);
    }

    res.status(201).json(createdGroup);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// List groups (same university; public OR ones you're an active member of)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const querySpec = {
      query: `
        SELECT * FROM groups g
        WHERE g.partitionKey = @university
          AND (
            g.isPublic = true OR
            EXISTS(
              SELECT VALUE m FROM m IN g.members 
              WHERE m.userId = @userId AND (NOT IS_DEFINED(m.status) OR m.status = "active")
            )
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
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get user's groups (active member of)
router.get('/my-groups', authenticateToken, async (req, res) => {
  try {
    const querySpec = {
      query: `
        SELECT * FROM groups g 
        WHERE g.partitionKey = @university 
          AND EXISTS(
            SELECT VALUE m FROM m IN g.members 
            WHERE m.userId = @userId AND (NOT IS_DEFINED(m.status) OR m.status = "active")
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

// Join a group (idempotent; revives if previously left; capacity checks use active members only)
router.post('/:groupId/join', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = Array.isArray(group.members) ? group.members : [];
    const idx = group.members.findIndex((m) => String(m.userId) === String(req.user.id));

    if (idx !== -1) {
      // Member exists: if left/inactive, revive; otherwise idempotent join
      const m = group.members[idx];
      if (!isActiveMember(m)) {
        m.status = 'active';
        m.joinedAt = new Date().toISOString();
        delete m.leftAt;
      }
      group.lastActivity = new Date().toISOString();
      const { resource: updated } = await groupsContainer
        .item(groupId, req.user.university)
        .replace(group);
      return res.status(200).json(updated);
    }

    // fresh join → capacity against ACTIVE members
    const count = activeMemberCount(group);
    if (group.maxMembers && count >= group.maxMembers) {
      return res.status(409).json({ error: 'Group is full' });
    }

    group.members.push({
      userId: req.user.id,
      role: 'member',
      status: 'active',
      joinedAt: new Date().toISOString(),
    });
    group.lastActivity = new Date().toISOString();

    const { resource: updated } = await groupsContainer
      .item(groupId, req.user.university)
      .replace(group);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error joining group:', error);
    if (error.code === 404) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// Leave a group (idempotent; marks status = left)
router.post('/:groupId/leave', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = Array.isArray(group.members) ? group.members : [];
    const idx = group.members.findIndex((m) => String(m.userId) === String(req.user.id));

    if (idx === -1) {
      // not a member → idempotent success
      return res.status(200).json(group);
    }

    const m = group.members[idx];

    // If already left/inactive, idempotent success
    if (!isActiveMember(m)) {
      return res.status(200).json(group);
    }

    // Optional: prevent owner from leaving if sole admin — keep it simple and allow leaving
    m.status = 'left';
    m.leftAt = new Date().toISOString();
    group.lastActivity = new Date().toISOString();

    const { resource: updated } = await groupsContainer
      .item(groupId, req.user.university)
      .replace(group);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error leaving group:', error);
    if (error.code === 404) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// Invite members to a group (owner/admin only)
router.post('/:groupId/invite', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const inviteUserIds = Array.isArray(req.body?.inviteUserIds) ? req.body.inviteUserIds : [];

    if (inviteUserIds.length === 0) {
      return res.status(400).json({ error: 'inviteUserIds is required' });
    }

    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isOwner = String(group.createdBy) === String(req.user.id);
    const isAdmin =
      Array.isArray(group.members) &&
      group.members.some(
        (m) => String(m.userId) === String(req.user.id) && m.role === 'admin' && isActiveMember(m)
      );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to invite members' });
    }

    await sendGroupInvitations(group, inviteUserIds);

    group.lastActivity = new Date().toISOString();
    await groupsContainer.items.upsert(group);

    return res.status(202).json({ ok: true, invited: inviteUserIds.length });
  } catch (error) {
    console.error('Error inviting members:', error);
    return res.status(500).json({ error: 'Failed to send invites' });
  }
});

// Schedule group session
router.post('/:groupId/sessions', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, description, startTime, endTime, location, topics } = req.body;

    const { resource: group } = await groupsContainer.item(groupId, req.user.university).read();
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember =
      Array.isArray(group.members) &&
      group.members.some((m) => String(m.userId) === String(req.user.id) && isActiveMember(m));

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

    if (typeof scheduleSessionReminders === 'function') {
      await scheduleSessionReminders(createdSession, group.members.filter(isActiveMember));
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

module.exports = router;
