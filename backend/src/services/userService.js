const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');
const { azureSQL } = require('./azureSQLService');
const { azureStorage } = require('./azureStorageService');
const multer = require('multer');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images for profile pictures
    if (file.fieldname === 'profileImage') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for profile pictures'));
      }
    } else {
      cb(null, true);
    }
  },
});

async function getPool() {
  return await azureSQL.getPool();
}

// Get current user profile (Google-authenticated). Creates user if not exists.
router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user?.email) {
      return res.status(400).json({ error: 'Authenticated email is required' });
    }

    const pool = await getPool();

    // 1) Lookup by email - simplified query to avoid TEXT column GROUP BY issues
    const lookup = pool.request();
    lookup.input('email', sql.NVarChar(255), req.user.email);
    const existing = await lookup.query(`
      SELECT 
        u.user_id, u.email, u.first_name, u.last_name, u.university, u.course, 
        u.year_of_study, u.profile_image_url, u.is_active, u.created_at, u.updated_at,
        u.bio, u.study_preferences
      FROM users u
      WHERE u.email = @email AND u.is_active = 1
    `);
    
    // Get enrolled modules separately to avoid GROUP BY issues
    let enrolledModules = '';
    if (existing.recordset.length > 0) {
      const modulesQuery = pool.request();
      modulesQuery.input('userId', sql.Int, existing.recordset[0].user_id);
      const modules = await modulesQuery.query(`
        SELECT STRING_AGG(m.module_code, ',') as enrolled_modules
        FROM user_modules um
        JOIN modules m ON um.module_id = m.module_id
        WHERE um.user_id = @userId AND um.enrollment_status = 'active'
      `);
      enrolledModules = modules.recordset[0]?.enrolled_modules || '';
    }

    let user = existing.recordset[0];
    
    // Add enrolled modules to user object
    if (user) {
      user.enrolled_modules = enrolledModules;
    }

    // 2) Create if missing
    if (!user) {
      const insert = pool.request();
      const [firstName, ...rest] = (req.user.name || '').split(' ').filter(Boolean);
      const lastName = rest.join(' ');
      insert.input('email', sql.NVarChar(255), req.user.email);
      insert.input('firstName', sql.NVarChar(100), firstName || '');
      insert.input('lastName', sql.NVarChar(100), lastName || '');
      insert.input('university', sql.NVarChar(255), req.user.university || '');
      insert.input('course', sql.NVarChar(255), req.user.course || '');
      insert.input('studyPreferences', sql.NVarChar(sql.MAX), JSON.stringify({
        preferredTimes: [],
        studyStyle: 'visual',
        groupSize: 'medium',
      }));

      const created = await insert.query(`
        INSERT INTO users (email, password_hash, first_name, last_name, university, course, study_preferences, created_at)
        OUTPUT inserted.*
        VALUES (@email, '', @firstName, @lastName, @university, @course, @studyPreferences, GETUTCDATE())
      `);
      user = created.recordset[0];
      user.enrolled_modules = null;
    }

    // 3) Normalize output
    const response = {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`.trim(),
      firstName: user.first_name,
      lastName: user.last_name,
      university: user.university,
      course: user.course,
      yearOfStudy: user.year_of_study,
      bio: user.bio,
      profileImageUrl: user.profile_image_url,
      studyPreferences: user.study_preferences ? JSON.parse(user.study_preferences) : {},
      enrolledModules: user.enrolled_modules ? user.enrolled_modules.split(',') : [],
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in /users/me:', error);
    res.status(500).json({ error: 'Failed to fetch/create user profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      lastName,
      university,
      course,
      yearOfStudy,
      bio,
      studyPreferences,
      contactPreferences,
      availabilitySchedule
    } = req.body;

    const pool = await getPool();
    const request = pool.request();
    
    request.input('userId', sql.Int, userId);
    request.input('firstName', sql.NVarChar(100), firstName);
    request.input('lastName', sql.NVarChar(100), lastName);
    request.input('university', sql.NVarChar(255), university);
    request.input('course', sql.NVarChar(255), course);
    request.input('yearOfStudy', sql.Int, yearOfStudy);
    request.input('bio', sql.NText, bio);
    request.input('studyPreferences', sql.NVarChar(sql.MAX), JSON.stringify(studyPreferences || {}));
    request.input('contactPreferences', sql.NVarChar(sql.MAX), JSON.stringify(contactPreferences || {}));
    request.input('availabilitySchedule', sql.NVarChar(sql.MAX), JSON.stringify(availabilitySchedule || {}));

    const result = await request.query(`
      UPDATE users 
      SET 
        first_name = @firstName,
        last_name = @lastName,
        university = @university,
        course = @course,
        year_of_study = @yearOfStudy,
        bio = @bio,
        study_preferences = @studyPreferences,
        contact_preferences = @contactPreferences,
        availability_schedule = @availabilitySchedule,
        updated_at = GETUTCDATE()
      OUTPUT inserted.*
      WHERE user_id = @userId
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.recordset[0];
    const response = {
      id: updatedUser.user_id,
      email: updatedUser.email,
      name: `${updatedUser.first_name} ${updatedUser.last_name}`.trim(),
      firstName: updatedUser.first_name,
      lastName: updatedUser.last_name,
      university: updatedUser.university,
      course: updatedUser.course,
      yearOfStudy: updatedUser.year_of_study,
      bio: updatedUser.bio,
      profileImageUrl: updatedUser.profile_image_url,
      studyPreferences: updatedUser.study_preferences ? JSON.parse(updatedUser.study_preferences) : {},
      contactPreferences: updatedUser.contact_preferences ? JSON.parse(updatedUser.contact_preferences) : {},
      availabilitySchedule: updatedUser.availability_schedule ? JSON.parse(updatedUser.availability_schedule) : {},
      updatedAt: updatedUser.updated_at,
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Upload profile image
router.post('/profile/image', authenticateToken, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;
    
    // Upload to Azure Blob Storage
    const uploadResult = await azureStorage.uploadProfileImage(
      userId,
      req.file.buffer,
      req.file.mimetype
    );

    // Update user record with new profile image URL
    const pool = await getPool();
    const request = pool.request();
    
    request.input('userId', sql.Int, userId);
    request.input('profileImageUrl', sql.NVarChar(500), uploadResult.url);

    await request.query(`
      UPDATE users 
      SET profile_image_url = @profileImageUrl, updated_at = GETUTCDATE()
      WHERE user_id = @userId
    `);

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: uploadResult.url,
      uploadDetails: {
        fileName: uploadResult.blobName,
        size: uploadResult.contentLength,
        uploadedAt: uploadResult.lastModified
      }
    });

  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// Get user by ID (public profile)
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.Int, userId);

    const result = await request.query(`
      SELECT 
        u.user_id,
        u.first_name,
        u.last_name,
        u.university,
        u.course,
        u.year_of_study,
        u.bio,
        u.profile_image_url,
        u.rating,
        u.total_study_hours,
        u.study_streak_days,
        u.last_active,
        STRING_AGG(m.module_code, ',') as enrolled_modules
      FROM users u
      LEFT JOIN user_modules um ON u.user_id = um.user_id AND um.enrollment_status = 'active'
      LEFT JOIN modules m ON um.module_id = m.module_id
      WHERE u.user_id = @userId AND u.is_active = 1
      GROUP BY u.user_id, u.first_name, u.last_name, u.university, u.course, 
               u.year_of_study, u.bio, u.profile_image_url, u.rating, 
               u.total_study_hours, u.study_streak_days, u.last_active
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.recordset[0];
    const response = {
      id: user.user_id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      university: user.university,
      course: user.course,
      yearOfStudy: user.year_of_study,
      bio: user.bio,
      profileImageUrl: user.profile_image_url,
      rating: user.rating,
      totalStudyHours: user.total_study_hours,
      studyStreak: user.study_streak_days,
      lastActive: user.last_active,
      enrolledModules: user.enrolled_modules ? user.enrolled_modules.split(',') : [],
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Search users
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      search, 
      university, 
      course, 
      year, 
      limit = 20, 
      offset = 0 
    } = req.query;

    const pool = await getPool();
    const request = pool.request();
    
    let whereConditions = ['u.is_active = 1'];
    
    if (search) {
      request.input('search', sql.NVarChar(255), `%${search}%`);
      whereConditions.push(`(
        u.first_name LIKE @search OR 
        u.last_name LIKE @search OR 
        u.university LIKE @search OR 
        u.course LIKE @search
      )`);
    }

    if (university) {
      request.input('university', sql.NVarChar(255), university);
      whereConditions.push('u.university = @university');
    }

    if (course) {
      request.input('course', sql.NVarChar(255), course);
      whereConditions.push('u.course = @course');
    }

    if (year) {
      request.input('year', sql.Int, parseInt(year));
      whereConditions.push('u.year_of_study = @year');
    }

    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));

    const query = `
      SELECT 
        u.user_id,
        u.first_name,
        u.last_name,
        u.university,
        u.course,
        u.year_of_study,
        u.bio,
        u.profile_image_url,
        u.rating,
        u.total_study_hours,
        u.last_active,
        COUNT(*) OVER() as total_count
      FROM users u
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY u.last_active DESC, u.rating DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(query);
    
    const users = result.recordset.map(user => ({
      id: user.user_id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      university: user.university,
      course: user.course,
      yearOfStudy: user.year_of_study,
      bio: user.bio,
      profileImageUrl: user.profile_image_url,
      rating: user.rating,
      totalStudyHours: user.total_study_hours,
      lastActive: user.last_active,
    }));

    const totalCount = result.recordset.length > 0 ? result.recordset[0].total_count : 0;

    res.json({
      users,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount,
      },
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Upload user file (study materials, notes, etc.)
router.post('/files', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;
    const { moduleId, description, fileType } = req.body;
    
    let uploadResult;
    
    if (moduleId) {
      // Upload as study material
      uploadResult = await azureStorage.uploadStudyMaterial(
        userId,
        parseInt(moduleId),
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype
      );
    } else {
      // Upload as general user file
      uploadResult = await azureStorage.uploadUserFile(
        userId,
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype,
        {
          description: description || '',
          fileType: fileType || 'general',
        }
      );
    }

    res.json({
      message: 'File uploaded successfully',
      file: {
        url: uploadResult.url,
        name: req.file.originalname,
        size: uploadResult.contentLength,
        type: req.file.mimetype,
        uploadedAt: uploadResult.lastModified,
      }
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get user files
router.get('/files/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { container = 'user-files' } = req.query;
    
    const files = await azureStorage.listUserFiles(userId, container);
    
    res.json({
      files: files.map(file => ({
        name: file.name.split('/').pop(), // Remove user ID prefix
        url: file.url,
        size: file.size,
        type: file.contentType,
        lastModified: file.lastModified,
        metadata: file.metadata,
      }))
    });

  } catch (error) {
    console.error('Error listing user files:', error);
    res.status(500).json({ error: 'Failed to list user files' });
  }
});

module.exports = router;