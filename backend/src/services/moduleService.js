const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Azure SQL Database configuration
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
        // Local development fallback
        const config = {
          server: process.env.DB_SERVER || 'localhost',
          database: process.env.DB_NAME || 'study_buddy_db',
          user: process.env.DB_USER || 'sa',
          password: process.env.DB_PASSWORD || 'YourPassword123',
          options: {
            encrypt: true,
            trustServerCertificate: true,
          },
        };
        pool = await sql.connect(config);
      }
    }
    console.log('✅ Module Service: Database connected successfully');
  } catch (error) {
    console.error('❌ Module Service: Database connection failed:', error);
    throw error;
  }
};

// Helper function to get database pool
async function getPool() {
  if (!pool) {
    await initializeDatabase();
  }
  return pool;
}

// Get all modules (with filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { university, search, limit = 50, offset = 0 } = req.query;

    const pool = await getPool();
    const request = pool.request();
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));

    let whereClause = 'WHERE m.is_active = 1';

    if (university) {
      request.input('university', sql.NVarChar(255), university);
      whereClause += ' AND m.university = @university';
    }

    if (search) {
      request.input('search', sql.NVarChar(255), `%${search}%`);
      whereClause +=
        ' AND (m.module_name LIKE @search OR m.module_code LIKE @search OR m.description LIKE @search)';
    }

    const result = await request.query(`
      SELECT 
        m.*,
        COUNT(DISTINCT um.user_id) as enrolled_count,
        COUNT(DISTINCT t.topic_id) as topic_count
      FROM modules m
      LEFT JOIN user_modules um ON m.module_id = um.module_id AND um.enrollment_status = 'active'
      LEFT JOIN topics t ON m.module_id = t.module_id AND t.is_active = 1
      ${whereClause}
      GROUP BY m.module_id, m.module_code, m.module_name, m.description, m.university, m.is_active, m.created_at
      ORDER BY m.module_code
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Get specific module with details
router.get('/:moduleId', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('moduleId', sql.Int, req.params.moduleId);

    const result = await request.query(`
      SELECT 
        m.*,
        COUNT(DISTINCT um.user_id) as enrolled_count,
        COUNT(DISTINCT t.topic_id) as topic_count,
        COUNT(DISTINCT sg.group_id) as study_group_count
      FROM modules m
      LEFT JOIN user_modules um ON m.module_id = um.module_id AND um.enrollment_status = 'active'
      LEFT JOIN topics t ON m.module_id = t.module_id AND t.is_active = 1
      LEFT JOIN study_groups sg ON m.module_id = sg.module_id AND sg.is_active = 1
      WHERE m.module_id = @moduleId AND m.is_active = 1
      GROUP BY m.module_id, m.module_code, m.module_name, m.description, m.university, m.is_active, m.created_at
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching module:', error);
    res.status(500).json({ error: 'Failed to fetch module' });
  }
});

// Get module topics
router.get('/:moduleId/topics', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('moduleId', sql.Int, req.params.moduleId);

    const result = await request.query(`
      SELECT 
        t.*,
        COUNT(c.chapter_id) as chapter_count
      FROM topics t
      LEFT JOIN chapters c ON t.topic_id = c.topic_id AND c.is_active = 1
      WHERE t.module_id = @moduleId AND t.is_active = 1
      GROUP BY t.topic_id, t.module_id, t.topic_name, t.description, t.order_sequence, t.is_active, t.created_at
      ORDER BY t.order_sequence, t.topic_name
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching module topics:', error);
    res.status(500).json({ error: 'Failed to fetch module topics' });
  }
});

// Get topic chapters
router.get('/topics/:topicId/chapters', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('topicId', sql.Int, req.params.topicId);

    const result = await request.query(`
      SELECT *
      FROM chapters
      WHERE topic_id = @topicId AND is_active = 1
      ORDER BY order_sequence, chapter_name
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching topic chapters:', error);
    res.status(500).json({ error: 'Failed to fetch topic chapters' });
  }
});

// Create new module (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { module_code, module_name, description, university } = req.body;

    if (!module_code || !module_name || !university) {
      return res
        .status(400)
        .json({ error: 'module_code, module_name, and university are required' });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('moduleCode', sql.NVarChar(50), module_code);
    request.input('moduleName', sql.NVarChar(255), module_name);
    request.input('description', sql.NText, description || null);
    request.input('university', sql.NVarChar(255), university);

    await request.query(`
      INSERT INTO modules (module_code, module_name, description, university)
      VALUES (@moduleCode, @moduleName, @description, @university)
    `);

    // Get the inserted module
    const result = await request.query(`
      SELECT TOP 1 * FROM modules 
      WHERE module_code = @moduleCode AND university = @university
      ORDER BY module_id DESC
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    if (error.code === 'EREQUEST' && error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Module code already exists' });
    }
    console.error('Error creating module:', error);
    res.status(500).json({ error: 'Failed to create module' });
  }
});

// Create topic for a module
router.post('/:moduleId/topics', authenticateToken, async (req, res) => {
  try {
    const { topic_name, description, order_sequence } = req.body;

    if (!topic_name) {
      return res.status(400).json({ error: 'topic_name is required' });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('moduleId', sql.Int, req.params.moduleId);
    request.input('topicName', sql.NVarChar(255), topic_name);
    request.input('description', sql.NText, description || null);
    request.input('orderSequence', sql.Int, order_sequence || 0);

    await request.query(`
      INSERT INTO topics (module_id, topic_name, description, order_sequence)
      VALUES (@moduleId, @topicName, @description, @orderSequence)
    `);

    // Get the inserted topic
    const result = await request.query(`
      SELECT TOP 1 * FROM topics 
      WHERE module_id = @moduleId AND topic_name = @topicName
      ORDER BY topic_id DESC
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

// Create chapter for a topic
router.post('/topics/:topicId/chapters', authenticateToken, async (req, res) => {
  try {
    const { chapter_name, description, order_sequence, content_summary } = req.body;

    if (!chapter_name) {
      return res.status(400).json({ error: 'chapter_name is required' });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('topicId', sql.Int, req.params.topicId);
    request.input('chapterName', sql.NVarChar(255), chapter_name);
    request.input('description', sql.NText, description || null);
    request.input('orderSequence', sql.Int, order_sequence || 0);
    request.input('contentSummary', sql.NText, content_summary || null);

    await request.query(`
      INSERT INTO chapters (topic_id, chapter_name, description, order_sequence, content_summary)
      VALUES (@topicId, @chapterName, @description, @orderSequence, @contentSummary)
    `);

    // Get the inserted chapter
    const result = await request.query(`
      SELECT TOP 1 * FROM chapters 
      WHERE topic_id = @topicId AND chapter_name = @chapterName
      ORDER BY chapter_id DESC
    `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error creating chapter:', error);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// Update module
router.put('/:moduleId', authenticateToken, async (req, res) => {
  try {
    const allowedFields = ['module_name', 'description'];
    const updateFields = [];

    const pool = await getPool();
    const request = pool.request();
    request.input('moduleId', sql.Int, req.params.moduleId);

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = @${field}`);
        request.input(field, sql.NVarChar, req.body[field]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await request.query(`
      UPDATE modules 
      SET ${updateFields.join(', ')}
      WHERE module_id = @moduleId AND is_active = 1
    `);

    // Get the updated module
    const result = await request.query(`
      SELECT * FROM modules WHERE module_id = @moduleId AND is_active = 1
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

// Delete module (soft delete)
router.delete('/:moduleId', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('moduleId', sql.Int, req.params.moduleId);

    await request.query(`
      UPDATE modules 
      SET is_active = 0
      WHERE module_id = @moduleId
    `);

    // Check if module was found and updated
    const checkResult = await request.query(`
      SELECT module_id FROM modules WHERE module_id = @moduleId AND is_active = 0
    `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

// Initialize database connection
initializeDatabase().catch(console.error);

module.exports = router;
