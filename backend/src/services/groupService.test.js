const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Get database pool (assuming it's initialized in userService.js)
const getPool = () => {
  return sql.globalPool || require('./userService').pool;
};

// Get all study groups (with filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { moduleId, groupType, search, limit = 50, offset = 0 } = req.query;
    
    const request = getPool().request();
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));

    let whereClause = 'WHERE sg.is_active = 1';
    
    if (moduleId) {
      request.input('moduleId', sql.Int, moduleId);
      whereClause += ' AND sg.module_id = @moduleId';
    }
    
    if (groupType) {
      request.input('groupType', sql.NVarChar(50), groupType);
      whereClause += ' AND sg.group_type = @groupType';
    }
    
    if (search) {
      request.input('search', sql.NVarChar(255), `%${search}%`);
      whereClause += ' AND (sg.group_name LIKE @search OR sg.description LIKE @search)';
    }

    const result = await request.query(`
      SELECT 
        sg.*,
        u.first_name + ' ' + u.last_name as creator_name,
        m.module_code,
        m.module_name,
        COUNT(gm.user_id) as member_count
      FROM study_groups sg
      JOIN users u ON sg.creator_id = u.user_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN group_members gm ON sg.group_id = gm.group_id AND gm.status = 'active'
      ${whereClause}
      GROUP BY sg.group_id, sg.group_name, sg.description, sg.creator_id, sg.module_id, 
               sg.max_members, sg.group_type, sg.group_goals, sg.is_active, sg.created_at, sg.updated_at,
               u.first_name, u.last_name, m.module_code, m.module_name
      ORDER BY sg.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const groups = result.recordset.map(group => ({
      ...group,
      group_goals: group.group_goals ? JSON.parse(group.group_goals) : null
    }));

    res.json(groups);
  } catch (error) {
    console.error('Error fetching study groups:', error);
    res.status(500).json({ error: 'Failed to fetch study groups' });
  }
});

// Get specific study group with details
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);
    request.input('userId', sql.Int, req.user.id);

    const result = await request.query(`
      SELECT 
        sg.*,
        u.first_name + ' ' + u.last_name as creator_name,
        m.module_code,
        m.module_name,
        COUNT(gm.user_id) as member_count,
        CASE WHEN ugm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member,
        ugm.role as user_role,
        ugm.status as membership_status
      FROM study_groups sg
      JOIN users u ON sg.creator_id = u.user_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN group_members gm ON sg.group_id = gm.group_id AND gm.status = 'active'
      LEFT JOIN group_members ugm ON sg.group_id = ugm.group_id AND ugm.user_id = @userId
      WHERE sg.group_id = @groupId AND sg.is_active = 1
      GROUP BY sg.group_id, sg.group_name, sg.description, sg.creator_id, sg.module_id, 
               sg.max_members, sg.group_type, sg.group_goals, sg.is_active, sg.created_at, sg.updated_at,
               u.first_name, u.last_name, m.module_code, m.module_name, ugm.user_id, ugm.role, ugm.status
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Study group not found' });
    }

    const group = result.recordset[0];
    group.group_goals = group.group_goals ? JSON.parse(group.group_goals) : null;

    res.json(group);
  } catch (error) {
    console.error('Error fetching study group:', error);
    res.status(500).json({ error: 'Failed to fetch study group' });
  }
});

// Get study group members
router.get('/:groupId/members', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);

    const result = await request.query(`
      SELECT 
        gm.*,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_image_url,
        u.course,
        u.year_of_study
      FROM group_members gm
      JOIN users u ON gm.user_id = u.user_id
      WHERE gm.group_id = @groupId AND gm.status = 'active'
      ORDER BY gm.role DESC, gm.joined_at
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

// Create new study group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { group_name, description, module_id, max_members, group_type, group_goals } = req.body;
    
    if (!group_name || !module_id) {
      return res.status(400).json({ error: 'group_name and module_id are required' });
    }

    const request = getPool().request();
    request.input('groupName', sql.NVarChar(255), group_name);
    request.input('description', sql.NText, description || null);
    request.input('creatorId', sql.Int, req.user.id);
    request.input('moduleId', sql.Int, module_id);
    request.input('maxMembers', sql.Int, max_members || 10);
    request.input('groupType', sql.NVarChar(50), group_type || 'study');
    request.input('groupGoals', sql.NVarChar(sql.MAX), group_goals ? JSON.stringify(group_goals) : null);

    // Start transaction
    const transaction = getPool().transaction();
    await transaction.begin();

    try {
      // Create the study group
      const groupResult = await transaction.request()
        .input('groupName', sql.NVarChar(255), group_name)
        .input('description', sql.NText, description || null)
        .input('creatorId', sql.Int, req.user.id)
        .input('moduleId', sql.Int, module_id)
        .input('maxMembers', sql.Int, max_members || 10)
        .input('groupType', sql.NVarChar(50), group_type || 'study')
        .input('groupGoals', sql.NVarChar(sql.MAX), group_goals ? JSON.stringify(group_goals) : null)
        .query(`
          INSERT INTO study_groups (group_name, description, creator_id, module_id, max_members, group_type, group_goals)
          OUTPUT inserted.*
          VALUES (@groupName, @description, @creatorId, @moduleId, @maxMembers, @groupType, @groupGoals)
        `);

      const newGroup = groupResult.recordset[0];

      // Add creator as admin member
      await transaction.request()
        .input('groupId', sql.Int, newGroup.group_id)
        .input('userId', sql.Int, req.user.id)
        .query(`
          INSERT INTO group_members (group_id, user_id, role, status)
          VALUES (@groupId, @userId, 'admin', 'active')
        `);

      await transaction.commit();

      // Parse group_goals for response
      newGroup.group_goals = newGroup.group_goals ? JSON.parse(newGroup.group_goals) : null;

      res.status(201).json(newGroup);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating study group:', error);
    res.status(500).json({ error: 'Failed to create study group' });
  }
});

// Join a study group
router.post('/:groupId/join', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);
    request.input('userId', sql.Int, req.user.id);

    // Check if group exists and has space
    const groupCheck = await request.query(`
      SELECT 
        sg.*,
        COUNT(gm.user_id) as current_members,
        CASE WHEN existing_gm.user_id IS NOT NULL THEN 1 ELSE 0 END as already_member
      FROM study_groups sg
      LEFT JOIN group_members gm ON sg.group_id = gm.group_id AND gm.status = 'active'
      LEFT JOIN group_members existing_gm ON sg.group_id = existing_gm.group_id AND existing_gm.user_id = @userId
      WHERE sg.group_id = @groupId AND sg.is_active = 1
      GROUP BY sg.group_id, sg.group_name, sg.description, sg.creator_id, sg.module_id, 
               sg.max_members, sg.group_type, sg.group_goals, sg.is_active, sg.created_at, sg.updated_at,
               existing_gm.user_id
    `);

    if (groupCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Study group not found' });
    }

    const group = groupCheck.recordset[0];
    
    if (group.already_member) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    if (group.current_members >= group.max_members) {
      return res.status(400).json({ error: 'Group is full' });
    }

    // Add user as member
    const result = await request.query(`
      INSERT INTO group_members (group_id, user_id, role, status)
      OUTPUT inserted.*
      VALUES (@groupId, @userId, 'member', 'active')
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error joining study group:', error);
    res.status(500).json({ error: 'Failed to join study group' });
  }
});

// Leave a study group
router.post('/:groupId/leave', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is the creator
    const creatorCheck = await request.query(`
      SELECT creator_id FROM study_groups WHERE group_id = @groupId
    `);

    if (creatorCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Study group not found' });
    }

    if (creatorCheck.recordset[0].creator_id === req.user.id) {
      return res.status(400).json({ error: 'Group creator cannot leave. Transfer ownership or delete the group.' });
    }

    // Remove user from group
    const result = await request.query(`
      UPDATE group_members 
      SET status = 'removed'
      OUTPUT inserted.*
      WHERE group_id = @groupId AND user_id = @userId AND status = 'active'
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    res.json({ message: 'Left study group successfully' });
  } catch (error) {
    console.error('Error leaving study group:', error);
    res.status(500).json({ error: 'Failed to leave study group' });
  }
});

// Update study group (admin/creator only)
router.put('/:groupId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is admin or creator
    const permissionCheck = await request.query(`
      SELECT sg.creator_id, gm.role
      FROM study_groups sg
      LEFT JOIN group_members gm ON sg.group_id = gm.group_id AND gm.user_id = @userId AND gm.status = 'active'
      WHERE sg.group_id = @groupId AND sg.is_active = 1
    `);

    if (permissionCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Study group not found' });
    }

    const { creator_id, role } = permissionCheck.recordset[0];
    if (creator_id !== req.user.id && role !== 'admin') {
      return res.status(403).json({ error: 'Only group creators and admins can update the group' });
    }

    const allowedFields = ['group_name', 'description', 'max_members', 'group_type', 'group_goals'];
    const updateFields = [];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = @${field}`);
        if (field === 'group_goals') {
          request.input(field, sql.NVarChar(sql.MAX), JSON.stringify(req.body[field]));
        } else {
          request.input(field, sql.NVarChar, req.body[field]);
        }
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const result = await request.query(`
      UPDATE study_groups 
      SET ${updateFields.join(', ')}
      OUTPUT inserted.*
      WHERE group_id = @groupId
    `);

    const updatedGroup = result.recordset[0];
    updatedGroup.group_goals = updatedGroup.group_goals ? JSON.parse(updatedGroup.group_goals) : null;

    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating study group:', error);
    res.status(500).json({ error: 'Failed to update study group' });
  }
});

// Delete study group (creator only)
router.delete('/:groupId', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('groupId', sql.Int, req.params.groupId);
    request.input('userId', sql.Int, req.user.id);

    // Check if user is creator
    const creatorCheck = await request.query(`
      SELECT creator_id FROM study_groups WHERE group_id = @groupId AND creator_id = @userId
    `);

    if (creatorCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Only group creator can delete the group' });
    }

    // Soft delete the group
    await request.query(`
      UPDATE study_groups 
      SET is_active = 0
      WHERE group_id = @groupId
    `);

    res.json({ message: 'Study group deleted successfully' });
  } catch (error) {
    console.error('Error deleting study group:', error);
    res.status(500).json({ error: 'Failed to delete study group' });
  }
});

// Get user's study groups
router.get('/user/my-groups', authenticateToken, async (req, res) => {
  try {
    const request = getPool().request();
    request.input('userId', sql.Int, req.user.id);

    const result = await request.query(`
      SELECT 
        sg.*,
        gm.role,
        gm.status as membership_status,
        gm.joined_at,
        m.module_code,
        m.module_name,
        COUNT(all_gm.user_id) as member_count
      FROM group_members gm
      JOIN study_groups sg ON gm.group_id = sg.group_id
      JOIN modules m ON sg.module_id = m.module_id
      LEFT JOIN group_members all_gm ON sg.group_id = all_gm.group_id AND all_gm.status = 'active'
      WHERE gm.user_id = @userId AND gm.status = 'active' AND sg.is_active = 1
      GROUP BY sg.group_id, sg.group_name, sg.description, sg.creator_id, sg.module_id, 
               sg.max_members, sg.group_type, sg.group_goals, sg.is_active, sg.created_at, sg.updated_at,
               gm.role, gm.status, gm.joined_at, m.module_code, m.module_name
      ORDER BY gm.joined_at DESC
    `);

    const groups = result.recordset.map(group => ({
      ...group,
      group_goals: group.group_goals ? JSON.parse(group.group_goals) : null
    }));

    res.json(groups);
  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

module.exports = router;