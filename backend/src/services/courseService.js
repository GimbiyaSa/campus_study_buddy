const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Azure SQL Database configuration
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // Required for Azure SQL
        enableArithAbort: true,
        trustServerCertificate: false,
        requestTimeout: 30000,
        connectionTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Initialize connection pool
let poolPromise = sql.connect(dbConfig)
    .then(pool => {
        console.log('Connected to Azure SQL Database for Course Service');
        return pool;
    })
    .catch(err => {
        console.error('Database connection failed:', err);
        throw err;
    });

// Helper function to get database pool
async function getPool() {
    return await poolPromise;
}

// GET /courses - list user's enrolled modules/courses
router.get('/', /*authenticateToken,*/ async (req, res) => {
    // For testing - remove this in production
    req.user = {
        id: '1',
        university: 'UniXYZ',
        email: 'test@example.com',
        name: 'Test User',
        course: 'Computer Science'
    };

    try {
        const pool = await getPool();
        const request = pool.request();
        request.input('userId', sql.Int, req.user.id);

        // Query to get user's enrolled modules with progress
        const query = `
            SELECT 
                m.module_id as id,
                m.module_code as code,
                m.module_name as title,
                m.description,
                m.university,
                um.enrollment_status as status,
                um.enrolled_at as createdAt,
                um.enrolled_at as updatedAt,
                -- Calculate progress based on completed topics
                ISNULL(
                    (SELECT COUNT(*) 
                     FROM dbo.user_progress up 
                     INNER JOIN dbo.topics t ON up.topic_id = t.topic_id 
                     WHERE up.user_id = @userId 
                     AND t.module_id = m.module_id 
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
                ) as totalHours
            FROM dbo.modules m
            INNER JOIN dbo.user_modules um ON m.module_id = um.module_id
            WHERE um.user_id = @userId 
            AND m.is_active = 1
            ORDER BY um.enrolled_at DESC
        `;

        const result = await request.query(query);
        
        // Transform data to match expected frontend format
        const courses = result.recordset.map(row => ({
            id: row.id.toString(),
            type: 'institution', // All modules from database are institutional
            code: row.code,
            title: row.title,
            description: row.description,
            university: row.university,
            status: row.status,
            progress: Math.round(row.progress),
            totalHours: row.totalHours,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        }));

        res.json(courses);
    } catch (err) {
        console.error('GET /courses error:', err);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// POST /courses - enroll in existing module or create custom study group
router.post('/', /*authenticateToken,*/ async (req, res) => {
    // For testing - remove this in production
    req.user = {
        id: '1',
        university: 'UniXYZ',
        email: 'test@example.com',
        name: 'Test User',
        course: 'Computer Science'
    };

    try {
        const { type, code, title, term, description, moduleId } = req.body;
        
        if (!type || !['institution', 'casual'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type (institution|casual)' });
        }
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'Title is required' });
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

            } else {
                // Creating new module (for casual study or new institutional module)
                const createModuleRequest = new sql.Request(transaction);
                createModuleRequest.input('moduleCode', sql.NVarChar(50), code || `CUSTOM_${Date.now()}`);
                createModuleRequest.input('moduleName', sql.NVarChar(255), title.trim());
                createModuleRequest.input('description', sql.NText, description || '');
                createModuleRequest.input('university', sql.NVarChar(255), req.user.university || 'Custom');

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
            enrollmentCheckRequest.input('userId', sql.Int, req.user.id);
            enrollmentCheckRequest.input('moduleId', sql.Int, finalModuleId);

            const enrollmentCheck = await enrollmentCheckRequest.query(`
                SELECT user_module_id FROM dbo.user_modules 
                WHERE user_id = @userId AND module_id = @moduleId
            `);

            if (enrollmentCheck.recordset.length > 0) {
                await transaction.rollback();
                return res.status(409).json({ error: 'Already enrolled in this module' });
            }

            // Enroll user in the module
            const enrollRequest = new sql.Request(transaction);
            enrollRequest.input('userId', sql.Int, req.user.id);
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
                code: moduleData.module_code,
                title: moduleData.module_name,
                description: moduleData.description,
                university: moduleData.university,
                progress: 0,
                totalHours: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            res.status(201).json(response);

        } catch (transactionErr) {
            await transaction.rollback();
            throw transactionErr;
        }

    } catch (err) {
        console.error('POST /courses error:', err);
        res.status(500).json({ error: 'Failed to create/enroll in course' });
    }
});

// PUT /courses/:id - update user's enrollment or module preferences
router.put('/:id', /*authenticateToken,*/ async (req, res) => {
    // For testing - remove this in production
    req.user = {
        id: 'user123',
        university: 'UniXYZ',
        email: 'test@example.com',
        name: 'Test User',
        course: 'Computer Science'
    };

    try {
        const moduleId = parseInt(req.params.id);
        const { status } = req.body;

        if (status && !['active', 'completed', 'dropped'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const pool = await getPool();
        const request = pool.request();
        request.input('userId', sql.Int, req.user.id);
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
        updatedRequest.input('userId', sql.Int, req.user.id);
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
            updatedAt: moduleData.updatedAt
        };

        res.json(response);

    } catch (err) {
        console.error('PUT /courses/:id error:', err);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

// DELETE /courses/:id - unenroll from a course
router.delete('/:id', /*authenticateToken,*/ async (req, res) => {
    // For testing - remove this in production
    req.user = {
        id: 'user123',
        university: 'UniXYZ',
        email: 'test@example.com',
        name: 'Test User',
        course: 'Computer Science'
    };

    try {
        const moduleId = parseInt(req.params.id);
        
        const pool = await getPool();
        const request = pool.request();
        request.input('userId', sql.Int, req.user.id);
        request.input('moduleId', sql.Int, moduleId);

        // Check if enrollment exists
        const checkResult = await request.query(`
            SELECT user_module_id 
            FROM dbo.user_modules 
            WHERE user_id = @userId AND module_id = @moduleId
        `);

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        // Instead of hard delete, we could set status to 'dropped'
        // Or completely remove the enrollment - depends on your business logic
        await request.query(`
            DELETE FROM dbo.user_modules 
            WHERE user_id = @userId AND module_id = @moduleId
        `);

        res.status(204).end();

    } catch (err) {
        console.error('DELETE /courses/:id error:', err);
        res.status(500).json({ error: 'Failed to delete course enrollment' });
    }
});

// GET /courses/available - get available modules for enrollment
router.get('/available', authenticateToken, async (req, res) => {
    // For testing - remove this in production
    req.user = {
        id: 'user123',
        university: 'UniXYZ',
        email: 'test@example.com',
        name: 'Test User',
        course: 'Computer Science'
    };

    try {
        const { university, search } = req.query;
        
        const pool = await getPool();
        const request = pool.request();
        request.input('userId', sql.Int, req.user.id);

        let whereClause = 'WHERE m.is_active = 1';
        
        if (university) {
            request.input('university', sql.NVarChar(255), university);
            whereClause += ' AND m.university = @university';
        }
        
        if (search) {
            request.input('search', sql.NVarChar(255), `%${search}%`);
            whereClause += ' AND (m.module_name LIKE @search OR m.module_code LIKE @search OR m.description LIKE @search)';
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
        
        const availableModules = result.recordset.map(row => ({
            id: row.id.toString(),
            code: row.code,
            title: row.title,
            description: row.description,
            university: row.university,
            isEnrolled: Boolean(row.isEnrolled),
            enrolledCount: row.enrolledCount,
            createdAt: row.createdAt
        }));

        res.json(availableModules);

    } catch (err) {
        console.error('GET /courses/available error:', err);
        res.status(500).json({ error: 'Failed to fetch available courses' });
    }
});

// GET /courses/:id/topics - get topics for a specific module
router.get('/:id/topics', authenticateToken, async (req, res) => {
    // For testing - remove this in production  
    req.user = {
        id: 'user123',
        university: 'UniXYZ',
        email: 'test@example.com',
        name: 'Test User',
        course: 'Computer Science'
    };

    try {
        const moduleId = parseInt(req.params.id);
        
        const pool = await getPool();
        const request = pool.request();
        request.input('userId', sql.Int, req.user.id);
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
            LEFT JOIN dbo.user_progress up ON t.topic_id = up.topic_id AND up.user_id = @userId
            WHERE t.module_id = @moduleId AND t.is_active = 1
            ORDER BY t.order_sequence ASC, t.topic_name ASC
        `;

        const result = await request.query(topicsQuery);
        
        const topics = result.recordset.map(row => ({
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
            progress: row.chapterCount > 0 ? Math.round((row.completedChapters / row.chapterCount) * 100) : 0
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
        // Recreate connection pool
        poolPromise = sql.connect(dbConfig)
            .then(pool => {
                console.log('Database connection restored');
                return pool;
            })
            .catch(err => {
                console.error('Failed to restore database connection:', err);
                throw err;
            });
    }
    next(err);
});

module.exports = router;