// Custom error classes for better error handling
class CourseServiceError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'CourseServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

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

// Helper function for better parameter management
const setParameter = (request, name, type, value) => {
  if (request.parameters[name]) {
    request.parameters[name].value = value;
  } else {
    request.input(name, type, value);
  }
};

// Helper function to check for duplicate courses
const checkDuplicateCourse = async (transaction, userId, moduleName, moduleCode = null) => {
  const request = new sql.Request(transaction);
  request.input('userId', sql.NVarChar(255), userId);
  request.input('moduleName', sql.NVarChar(255), moduleName.trim());

  let query = `
    SELECT m.module_name, m.module_code, m.university
    FROM dbo.modules m
    INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
    WHERE um.user_id = @userId AND (
      LOWER(TRIM(m.module_name)) = LOWER(TRIM(@moduleName))
  `;

  if (moduleCode && moduleCode.trim()) {
    // Clean the provided module code (remove any existing suffix)
    const cleanCode = moduleCode.trim().replace(/_[a-zA-Z0-9]{3,}$/, '');
    request.input('moduleCode', sql.NVarChar(50), cleanCode);
    query += ` OR LOWER(REPLACE(m.module_code, '_' + 
      CASE 
        WHEN CHARINDEX('_', REVERSE(m.module_code)) > 0 
        THEN RIGHT(m.module_code, CHARINDEX('_', REVERSE(m.module_code)) - 1)
        ELSE ''
      END, '')) = LOWER(@moduleCode)`;
  }

  query += `)`;

  const result = await request.query(query);
  return result.recordset;
};

// Helper function to get database pool
async function getPool() {
  if (!pool) {
    await initializeDatabase();
  }
  return pool;
}

// GET /courses - list user's enrolled modules/courses with pagination and search
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'enrolled_at',
      sortOrder = 'DESC',
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Debug logging
    console.log('🔍 Course search params:', { search, sortBy, sortOrder, page, limit });

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, parseInt(limit));

    // Build search conditions
    let searchCondition = '';
    let searchParams = [];
    if (search && search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      request.input('search', sql.NVarChar(255), searchTerm);
      searchCondition = `
          AND (
            m.module_name LIKE @search 
            OR m.module_code LIKE @search 
            OR m.description LIKE @search
          )
        `;
      console.log('🔍 Applied search condition for term:', search.trim());
      searchParams.push(`search="${searchTerm}"`);
    }

    // Validate sort parameters
    const validSortFields = ['enrolled_at', 'module_name', 'progress'];
    const validSortOrders = ['ASC', 'DESC'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'enrolled_at';
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : 'DESC';

    // Build the base query
    let baseQuery = `
            SELECT 
                m.module_id as id,
                m.module_code as code,
                m.module_name as title,
                m.description,
                m.university,
                um.enrollment_status as status,
                um.enrolled_at as createdAt,
                um.enrolled_at as updatedAt,
                -- Calculate progress based on completed topics (topic-level progress only)
                ISNULL(
                    (SELECT COUNT(*) 
                     FROM dbo.user_progress up 
                     INNER JOIN dbo.topics t ON up.topic_id = t.topic_id 
                     WHERE up.user_id = @userId 
                     AND t.module_id = m.module_id 
                     AND up.chapter_id IS NULL
                     AND up.completion_status = 'completed'
                    ) * 100.0 / 
                    NULLIF((SELECT COUNT(*) FROM dbo.topics t WHERE t.module_id = m.module_id AND t.is_active = 1), 0), 
                    0
                ) as progress,
                -- Get total study hours for this module
                ISNULL(
                    (SELECT SUM(hours_logged) 
                     FROM dbo.study_hours sh 
                     WHERE sh.user_id = @userId AND sh.module_id = m.module_id
                    ), 
                    0
                ) as totalHours,
                -- Get topic counts
                (SELECT COUNT(*) FROM dbo.topics t WHERE t.module_id = m.module_id AND t.is_active = 1) as total_topics,
                (SELECT COUNT(*) 
                 FROM dbo.user_progress up 
                 INNER JOIN dbo.topics t ON up.topic_id = t.topic_id 
                 WHERE up.user_id = @userId 
                 AND t.module_id = m.module_id 
                 AND up.chapter_id IS NULL
                 AND up.completion_status = 'completed'
                ) as completed_topics
            FROM dbo.modules m
            INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
            WHERE um.user_id = @userId 
            AND m.is_active = 1`;

    // Add search condition
    if (searchCondition) {
      baseQuery += searchCondition;
    }

    // Add ordering and pagination
    const getOrderByClause = (sortField) => {
      switch (sortField) {
        case 'progress':
          return 'progress';
        case 'module_name':
          return 'm.module_name';
        case 'enrolled_at':
        default:
          return 'um.enrolled_at';
      }
    };

    baseQuery += `
            ORDER BY ${getOrderByClause(safeSortBy)} ${safeSortOrder}
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
      `;

    console.log('🔍 Executing SQL query with search params:', searchParams);
    console.log('🔍 Search condition applied:', !!searchCondition);

    let result;
    try {
      result = await request.query(baseQuery);
      console.log('✅ Query executed successfully, got', result.recordset.length, 'results');
    } catch (queryError) {
      console.error('❌ Query execution failed:', queryError);
      throw queryError;
    }

    // Get total count for pagination
    const countRequest = pool.request();
    countRequest.input('userId', sql.NVarChar(255), req.user.id);
    if (search && search.trim() !== '') {
      countRequest.input('search', sql.NVarChar(255), `%${search.trim()}%`);
    }

    let countQuery = `
        SELECT COUNT(*) as total
        FROM dbo.modules m
        INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
        WHERE um.user_id = @userId AND m.is_active = 1
      `;

    // Add search condition to count query too
    if (searchCondition) {
      countQuery += searchCondition;
    }

    const countResult = await countRequest.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    console.log(`📊 Found ${result.recordset.length} courses (page ${page}, total: ${totalCount})`);

    // Log each course for debugging
    result.recordset.forEach((row, index) => {
      console.log(
        `  ${index + 1}. ${row.title} (ID: ${row.id}, Progress: ${Math.round(row.progress)}%)`
      );
    });

    // Transform data to match expected frontend format
    const courses = result.recordset.map((row) => ({
      id: row.id.toString(),
      type: row.university === 'Custom' ? 'casual' : 'institution',
      code: row.university === 'Custom' ? undefined : row.code,
      title: row.title,
      description: row.description,
      university: row.university,
      status: row.status,
      progress: Math.round(row.progress),
      totalHours: row.totalHours,
      totalTopics: row.total_topics || 0,
      completedTopics: row.completed_topics || 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    // Return paginated response or simple array for backward compatibility
    if (req.query.page || req.query.search || req.query.sortBy) {
      // Return paginated format when explicitly requested
      res.json({
        courses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit)),
          hasNext: offset + parseInt(limit) < totalCount,
          hasPrev: parseInt(page) > 1,
        },
      });
    } else {
      // Return simple array for backward compatibility
      res.json(courses);
    }
  } catch (err) {
    console.error('GET /courses error:', err);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// POST /courses - enroll in existing module or create custom study group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { type, code, title, term, description, moduleId } = req.body;

    if (!type || !['institution', 'casual'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type (institution|casual)' });
    }
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (
      type === 'casual' &&
      (!description || typeof description !== 'string' || !description.trim())
    ) {
      return res.status(400).json({ error: 'Description is required for casual topic' });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      let finalModuleId;
      let moduleData;

      if (type === 'institution' && moduleId) {
        // Enrolling in existing institutional module
        const checkModuleRequest = new sql.Request(transaction);
        checkModuleRequest.input('moduleId', sql.Int, moduleId);

        const moduleCheck = await checkModuleRequest.query(`
                    SELECT module_id, module_code, module_name, description, university
                    FROM dbo.modules 
                    WHERE module_id = @moduleId AND is_active = 1
                `);

        if (moduleCheck.recordset.length === 0) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Module not found' });
        }

        finalModuleId = moduleId;
        moduleData = moduleCheck.recordset[0];
      } else if (type === 'institution') {
        // Creating a new institutional module
        const uniqueCode = code || `CUSTOM_${req.user.id}_${Date.now()}`;

        // Check if module with same name already exists for this user
        const duplicates = await checkDuplicateCourse(
          transaction,
          req.user.id,
          title.trim(),
          uniqueCode
        );

        if (duplicates.length > 0) {
          await transaction.rollback();
          const existing = duplicates[0];
          const courseType = type === 'institution' ? 'course' : 'topic';
          const codeInfo =
            existing.module_code &&
            !existing.module_code.startsWith('CUSTOM_') &&
            !existing.module_code.startsWith('CASUAL_')
              ? ` (${existing.module_code.replace(/_[a-zA-Z0-9]{3,}$/, '')})`
              : '';
          return res.status(409).json({
            error: `You already have a ${courseType} named "${existing.module_name}"${codeInfo}. Please choose a different name or code.`,
          });
        }

        // Check if module code already exists and generate new one if needed
        const codeCheckRequest = new sql.Request(transaction);
        codeCheckRequest.input('checkCode', sql.NVarChar(50), uniqueCode);
        const codeCheck = await codeCheckRequest.query(`
            SELECT COUNT(*) as count FROM dbo.modules WHERE module_code = @checkCode
          `);
        let finalCode = uniqueCode;
        // Only add suffix if the EXACT same code already exists
        if (codeCheck.recordset[0].count > 0) {
          // Use a simpler, cleaner suffix format
          finalCode = `${uniqueCode}_${Date.now().toString().slice(-3)}`;
        }

        // Use helper function for better parameter management
        const createModuleRequest = new sql.Request(transaction);
        setParameter(createModuleRequest, 'moduleCode', sql.NVarChar(50), finalCode);
        setParameter(createModuleRequest, 'moduleName', sql.NVarChar(255), title.trim());
        setParameter(createModuleRequest, 'description', sql.NText, description || '');
        setParameter(
          createModuleRequest,
          'university',
          sql.NVarChar(255),
          req.user.university || 'Custom'
        );

        const createResult = await createModuleRequest.query(`
                    INSERT INTO dbo.modules (module_code, module_name, description, university, is_active)
                    OUTPUT inserted.module_id, inserted.module_code, inserted.module_name, inserted.description, inserted.university
                    VALUES (@moduleCode, @moduleName, @description, @university, 1)
                `);

        finalModuleId = createResult.recordset[0].module_id;
        moduleData = createResult.recordset[0];
      } else if (type === 'casual') {
        // Creating a new casual topic (no code, university is 'Custom')

        // Check if casual topic with same name already exists for this user
        const duplicates = await checkDuplicateCourse(transaction, req.user.id, title.trim());

        if (duplicates.length > 0) {
          await transaction.rollback();
          return res.status(409).json({
            error: `You already have a topic named "${title.trim()}". Please choose a different name.`,
          });
        }

        const createModuleRequest = new sql.Request(transaction);
        const uniqueCode = `CASUAL_${req.user.id}_${Date.now()}`;
        setParameter(createModuleRequest, 'moduleCode', sql.NVarChar(50), uniqueCode);
        setParameter(createModuleRequest, 'moduleName', sql.NVarChar(255), title.trim());
        setParameter(createModuleRequest, 'description', sql.NText, description.trim());
        setParameter(createModuleRequest, 'university', sql.NVarChar(255), 'Custom');

        const createResult = await createModuleRequest.query(`
                    INSERT INTO dbo.modules (module_code, module_name, description, university, is_active)
                    OUTPUT inserted.module_id, inserted.module_code, inserted.module_name, inserted.description, inserted.university
                    VALUES (@moduleCode, @moduleName, @description, @university, 1)
                `);

        finalModuleId = createResult.recordset[0].module_id;
        moduleData = createResult.recordset[0];
      }

      // Check if user is already enrolled
      const enrollmentCheckRequest = new sql.Request(transaction);
      enrollmentCheckRequest.input('userId', sql.NVarChar(255), req.user.id);
      enrollmentCheckRequest.input('moduleId', sql.Int, finalModuleId);

      const enrollmentCheck = await enrollmentCheckRequest.query(`
                SELECT um.user_module_id, m.module_name, m.module_code 
                FROM dbo.user_modules um
                INNER JOIN dbo.modules m ON um.module_id = m.module_id
                WHERE um.user_id = @userId AND um.module_id = @moduleId
            `);

      if (enrollmentCheck.recordset.length > 0) {
        await transaction.rollback();
        const existing = enrollmentCheck.recordset[0];
        return res.status(409).json({
          error: `You are already enrolled in "${existing.module_name}"${
            existing.module_code ? ` (${existing.module_code})` : ''
          }.`,
        });
      }

      // Enroll user in the module
      const enrollRequest = new sql.Request(transaction);
      enrollRequest.input('userId', sql.NVarChar(255), req.user.id);
      enrollRequest.input('moduleId', sql.Int, finalModuleId);

      await enrollRequest.query(`
                INSERT INTO dbo.user_modules (user_id, module_id, enrollment_status, enrolled_at)
                VALUES (@userId, @moduleId, 'active', GETUTCDATE())
            `);

      await transaction.commit();

      // Return the created/enrolled module
      const response = {
        id: finalModuleId.toString(),
        type: type,
        code: type === 'casual' ? undefined : moduleData.module_code, // Don't show code for casual topics
        title: moduleData.module_name,
        description: moduleData.description,
        university: moduleData.university,
        progress: 0,
        totalHours: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (transactionErr) {
      await transaction.rollback();
      throw transactionErr;
    }
  } catch (err) {
    console.error('POST /courses error:', err);
    // Handle duplicate parameter error from mssql
    if (
      err &&
      err.message &&
      err.message.includes('The parameter name moduleCode has already been declared')
    ) {
      return res
        .status(409)
        .json({ error: 'A course with these details already exists or you are already enrolled.' });
    }
    // Handle mssql duplicate parameter code
    if (err && err.code === 'EDUPEPARAM') {
      return res
        .status(409)
        .json({ error: 'A course with these details already exists or you are already enrolled.' });
    }
    res
      .status(500)
      .json({ error: err && err.message ? err.message : 'Failed to create/enroll in course' });
  }
});

// PUT /courses/:id - update user's enrollment or module preferences
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const { status } = req.body;

    if (status && !['active', 'completed', 'dropped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);
    request.input('moduleId', sql.Int, moduleId);

    // Check if enrollment exists
    const checkQuery = `
            SELECT um.user_module_id, m.module_code, m.module_name, m.description, m.university
            FROM dbo.user_modules um
            INNER JOIN dbo.modules m ON um.module_id = m.module_id
            WHERE um.user_id = @userId AND um.module_id = @moduleId
        `;

    const checkResult = await request.query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    // Update enrollment status if provided
    if (status) {
      request.input('status', sql.NVarChar(50), status);
      await request.query(`
                UPDATE dbo.user_modules 
                SET enrollment_status = @status 
                WHERE user_id = @userId AND module_id = @moduleId
            `);
    }

    // Get updated module data with progress
    const updatedRequest = pool.request();
    updatedRequest.input('userId', sql.NVarChar(255), req.user.id);
    updatedRequest.input('moduleId', sql.Int, moduleId);

    const updatedResult = await updatedRequest.query(`
            SELECT 
                m.module_id as id,
                m.module_code as code,
                m.module_name as title,
                m.description,
                m.university,
                um.enrollment_status as status,
                um.enrolled_at as createdAt,
                GETUTCDATE() as updatedAt,
                ISNULL(
                    (SELECT COUNT(*) 
                     FROM dbo.user_progress up 
                     INNER JOIN dbo.topics t ON up.topic_id = t.topic_id 
                     WHERE up.user_id = @userId 
                     AND t.module_id = m.module_id 
                     AND up.chapter_id IS NULL
                     AND up.completion_status = 'completed'
                    ) * 100.0 / 
                    NULLIF((SELECT COUNT(*) FROM dbo.topics t WHERE t.module_id = m.module_id AND t.is_active = 1), 0), 
                    0
                ) as progress,
                ISNULL(
                    (SELECT SUM(hours_logged) 
                     FROM dbo.study_hours sh 
                     WHERE sh.user_id = @userId AND sh.module_id = m.module_id
                    ), 
                    0
                ) as totalHours
            FROM dbo.modules m
            INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
            WHERE um.user_id = @userId AND m.module_id = @moduleId
        `);

    const moduleData = updatedResult.recordset[0];
    const response = {
      id: moduleData.id.toString(),
      type: 'institution',
      code: moduleData.code,
      title: moduleData.title,
      description: moduleData.description,
      university: moduleData.university,
      status: moduleData.status,
      progress: Math.round(moduleData.progress),
      totalHours: moduleData.totalHours,
      createdAt: moduleData.createdAt,
      updatedAt: moduleData.updatedAt,
    };

    res.json(response);
  } catch (err) {
    console.error('PUT /courses/:id error:', err);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// DELETE /courses/:id - unenroll from a course
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    console.log(`🗑️ Attempting to delete course ${moduleId} for user ${req.user.id}`);

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);
    request.input('moduleId', sql.Int, moduleId);

    // Check if enrollment exists and get course details
    const checkResult = await request.query(`
            SELECT um.user_module_id, m.module_name, m.module_code, m.university
            FROM dbo.user_modules um
            INNER JOIN dbo.modules m ON um.module_id = m.module_id
            WHERE um.user_id = @userId AND um.module_id = @moduleId
        `);

    if (checkResult.recordset.length === 0) {
      console.log(`❌ No enrollment found for course ${moduleId} and user ${req.user.id}`);
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const courseInfo = checkResult.recordset[0];
    console.log(`📝 Found enrollment: ${courseInfo.module_name} (${courseInfo.module_code})`);

    // Delete the enrollment
    const deleteResult = await request.query(`
            DELETE FROM dbo.user_modules 
            WHERE user_id = @userId AND module_id = @moduleId
        `);

    console.log(`✅ Successfully deleted enrollment for ${courseInfo.module_name}`);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /courses/:id error:', err);
    res.status(500).json({ error: 'Failed to delete course enrollment' });
  }
});

// GET /courses/test-search - debug endpoint to test search parameters
router.get('/test-search', async (req, res) => {
  const { search } = req.query;

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), '13'); // This should be dynamic in real usage

    let query = `
      SELECT m.module_name, m.module_code, m.description 
      FROM dbo.modules m
      INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
      WHERE um.user_id = @userId AND m.is_active = 1
    `;

    if (search && search.trim() !== '') {
      request.input('search', sql.NVarChar(255), `%${search.trim()}%`);
      query += ` AND (m.module_name LIKE @search OR m.module_code LIKE @search OR m.description LIKE @search)`;
    }

    const result = await request.query(query);

    res.json({
      searchTerm: search,
      query: query,
      results: result.recordset,
      count: result.recordset.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /courses/debug - debug endpoint to see all enrollments
router.get('/debug', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);

    const query = `
      SELECT 
        m.module_id,
        m.module_code,
        m.module_name,
        m.description,
        m.university,
        m.is_active,
        um.enrollment_status,
        um.enrolled_at
      FROM dbo.modules m
      INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
      WHERE um.user_id = @userId
      ORDER BY um.enrolled_at DESC
    `;

    const result = await request.query(query);

    console.log(
      `🔍 DEBUG: Found ${result.recordset.length} total enrollments for user ${req.user.id}`
    );

    res.json({
      totalEnrollments: result.recordset.length,
      enrollments: result.recordset,
    });
  } catch (err) {
    console.error('GET /courses/debug error:', err);
    res.status(500).json({ error: 'Failed to fetch debug info' });
  }
});

// GET /courses/available - get available modules for enrollment
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const { university, search } = req.query;

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);

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

    const query = `
            SELECT 
                m.module_id as id,
                m.module_code as code,
                m.module_name as title,
                m.description,
                m.university,
                m.created_at as createdAt,
                -- Check if user is already enrolled
                CASE WHEN um.user_module_id IS NOT NULL THEN 1 ELSE 0 END as isEnrolled,
                -- Count total enrolled students
                (SELECT COUNT(*) FROM dbo.user_modules um2 WHERE um2.module_id = m.module_id AND um2.enrollment_status = 'active') as enrolledCount
            FROM dbo.modules m
            LEFT JOIN dbo.user_modules um ON m.module_id = um.module_id AND um.user_id = @userId
            ${whereClause}
            ORDER BY m.module_name ASC
        `;

    const result = await request.query(query);

    const availableModules = result.recordset.map((row) => ({
      id: row.id.toString(),
      code: row.code,
      title: row.title,
      description: row.description,
      university: row.university,
      isEnrolled: Boolean(row.isEnrolled),
      enrolledCount: row.enrolledCount,
      createdAt: row.createdAt,
    }));

    res.json(availableModules);
  } catch (err) {
    console.error('GET /courses/available error:', err);
    res.status(500).json({ error: 'Failed to fetch available courses' });
  }
});

// GET /courses/:id/topics - get topics for a specific module
router.get('/:id/topics', authenticateToken, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), req.user.id);
    request.input('moduleId', sql.Int, moduleId);

    // Verify user is enrolled in this module
    const enrollmentCheck = await request.query(`
            SELECT user_module_id 
            FROM dbo.user_modules 
            WHERE user_id = @userId AND module_id = @moduleId
        `);

    if (enrollmentCheck.recordset.length === 0) {
      return res.status(403).json({ error: 'Not enrolled in this module' });
    }

    // Get topics with user progress
    const topicsQuery = `
            SELECT 
                t.topic_id as id,
                t.topic_name as name,
                t.description,
                t.order_sequence,
                ISNULL(up.completion_status, 'not_started') as completionStatus,
                up.hours_spent as hoursSpent,
                up.started_at as startedAt,
                up.completed_at as completedAt,
                -- Count chapters in this topic
                (SELECT COUNT(*) FROM dbo.chapters c WHERE c.topic_id = t.topic_id AND c.is_active = 1) as chapterCount,
                -- Count completed chapters
                (SELECT COUNT(*) 
                 FROM dbo.chapters c 
                 INNER JOIN dbo.user_progress up2 ON c.chapter_id = up2.chapter_id 
                 WHERE c.topic_id = t.topic_id AND up2.user_id = @userId AND up2.completion_status = 'completed'
                ) as completedChapters
            FROM dbo.topics t
            LEFT JOIN dbo.user_progress up ON t.topic_id = up.topic_id AND up.user_id = @userId AND up.chapter_id IS NULL
            WHERE t.module_id = @moduleId AND t.is_active = 1
            ORDER BY t.order_sequence ASC, t.topic_name ASC
        `;

    const result = await request.query(topicsQuery);

    const topics = result.recordset.map((row) => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      orderSequence: row.order_sequence,
      completionStatus: row.completionStatus,
      hoursSpent: row.hoursSpent || 0,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      chapterCount: row.chapterCount,
      completedChapters: row.completedChapters,
      progress:
        row.chapterCount > 0 ? Math.round((row.completedChapters / row.chapterCount) * 100) : 0,
    }));

    res.json(topics);
  } catch (err) {
    console.error('GET /courses/:id/topics error:', err);
    res.status(500).json({ error: 'Failed to fetch course topics' });
  }
});

// Error handling middleware for database connection issues
router.use((err, req, res, next) => {
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('Database connection issue detected:', err.message);
    // The connection will be re-established automatically in initializeDatabase()
    res.status(503).json({ error: 'Service temporarily unavailable' });
    return;
  }
  next(err);
});

module.exports = router;
