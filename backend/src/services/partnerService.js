// services/partnerService.js
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

/**
 * GET /api/v1/partners
 * Returns the current user's "buddies" — users with ACCEPTED connections
 * (either requests you sent that were accepted, or requests you accepted).
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('📋 Fetching buddies for user:', req.user.id);
    const userId = req.user.id;
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), userId);

    // Find accepted connections where current user is requester or recipient
    const connectionsResult = await request.query(`
      SELECT 
        pm.match_id as id,
        pm.requester_id as requesterId,
        pm.matched_user_id as recipientId,
        pm.match_status as status,
        pm.created_at as createdAt,
        pm.updated_at as updatedAt
      FROM partner_matches pm
      WHERE pm.match_status = 'accepted'
      AND (pm.requester_id = @userId OR pm.matched_user_id = @userId)
    `);

    const links = connectionsResult.recordset;

    // Extract the "other side" of each accepted connection
    const buddyIds = Array.from(
      new Set(links.map((c) => (c.requesterId === userId ? c.recipientId : c.requesterId)))
    );

    if (buddyIds.length === 0) {
      return res.json([]);
    }

    // Fetch users for those IDs
    const usersRequest = pool.request();
    const buddyIdsString = buddyIds.map((id) => `'${id}'`).join(',');

    const usersResult = await usersRequest.query(`
      SELECT 
        u.user_id as id,
        u.email,
        u.first_name,
        u.last_name,
        u.university,
        u.course,
        u.year_of_study,
        u.bio,
        u.study_preferences,
        u.created_at,
        u.updated_at
      FROM users u
      WHERE u.user_id IN (${buddyIdsString})
    `);

    const buddies = usersResult.recordset;
    console.log(`👥 Found ${buddies.length} buddies for user ${userId}`);

    const payload = buddies.map((u) => ({
      id: u.id,
      name: u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unknown',
      email: u.email,
      university: u.university,
      course: u.course,
      profile: u.profile || null,
      statistics: u.statistics || null,
    }));

    res.json(payload);
  } catch (error) {
    console.error('Error fetching buddies:', error);
    res.status(500).json({ error: 'Failed to fetch buddies' });
  }
});

// Search for study partners (SQL-based implementation)
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { subjects, studyStyle, groupSize, availability, university, search } = req.query;
    const currentUserId = req.user.id;

    console.log('🔍 Partner search params:', {
      subjects,
      studyStyle,
      groupSize,
      availability,
      university,
      search,
    });

    const request = pool.request();
    request.input('currentUserId', sql.NVarChar(255), currentUserId);

    // Base query to find potential partners with shared courses
    let query = `
      SELECT 
        u.user_id as id,
        u.email,
        u.first_name,
        u.last_name,
        u.university,
        u.course,
        u.year_of_study,
        u.bio,
        u.study_preferences,
        u.created_at,
        u.updated_at,
        -- Get shared courses as comma-separated list
        STUFF((
          SELECT DISTINCT ', ' + m.module_name
          FROM dbo.user_modules um1
          INNER JOIN dbo.modules m ON um1.module_id = m.module_id
          WHERE um1.user_id = u.user_id
          AND um1.module_id IN (
            SELECT um2.module_id 
            FROM dbo.user_modules um2 
            WHERE um2.user_id = @currentUserId
          )
          FOR XML PATH('')
        ), 1, 2, '') as sharedCourses
      FROM users u
      WHERE u.user_id != @currentUserId
      AND u.is_active = 1
    `;

    // Add university filter if provided
    if (university) {
      request.input('university', sql.NVarChar(255), university);
      query += ` AND u.university = @university`;
    }

    // Add name/email search if provided
    if (search && search.trim()) {
      request.input('searchTerm', sql.NVarChar(255), `%${search.trim()}%`);
      query += ` AND (u.first_name LIKE @searchTerm OR u.last_name LIKE @searchTerm OR u.email LIKE @searchTerm)`;
    }

    // Limit results
    query += ` ORDER BY u.created_at DESC`;

    console.log('🔍 Executing partner search query...');
    const result = await request.query(query);
    const partners = result.recordset;

    console.log(`📊 Found ${partners.length} potential partners`);

    // Format the response
    const formattedPartners = partners.map((partner) => {
      let studyPreferences = {};
      try {
        if (partner.study_preferences) {
          studyPreferences =
            typeof partner.study_preferences === 'string'
              ? JSON.parse(partner.study_preferences)
              : partner.study_preferences;
        }
      } catch (e) {
        console.warn('Failed to parse study preferences for user:', partner.id);
      }

      return {
        id: partner.id,
        name:
          [partner.first_name, partner.last_name].filter(Boolean).join(' ') ||
          partner.email ||
          'Unknown',
        email: partner.email,
        university: partner.university,
        course: partner.course,
        yearOfStudy: partner.year_of_study,
        bio: partner.bio,
        studyPreferences,

        // Enhanced shared courses and topics
        sharedCourses: partner.sharedCourses
          ? partner.sharedCourses.split(', ').filter(Boolean)
          : [],
        sharedTopics: [], // Could be enhanced with topic-level data

        profile: {
          subjects: partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean) : [],
          studyStyle: studyPreferences.studyStyle || null,
          groupSize: studyPreferences.groupSize || null,
          availability: studyPreferences.availability || null,
        },
        statistics: {
          sessionsAttended: 0, // Could be enhanced with actual study session data
          completedStudies: 0,
        },
        compatibilityScore: calculateEnhancedCompatibilityScore(
          studyPreferences,
          {
            subjects: subjects?.split(',') || [],
            studyStyle,
            groupSize,
            availability,
          },
          partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean).length : 0
        ),
      };
    });

    // Sort by compatibility score
    const sortedPartners = formattedPartners
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, 20); // Return top 20 matches

    res.json(sortedPartners);
  } catch (error) {
    console.error('❌ Error searching partners:', error);
    res.status(500).json({ error: 'Failed to search for partners' });
  }
});

function calculateEnhancedCompatibilityScore(partnerPreferences, criteria, sharedCoursesCount = 0) {
  let score = 0;

  // Shared courses (40% weight) - most important for study partners
  if (sharedCoursesCount > 0) {
    score += Math.min(sharedCoursesCount * 20, 40); // 20 points per shared course, max 40
  }

  // Study style match (25% weight)
  if (partnerPreferences.studyStyle && partnerPreferences.studyStyle === criteria.studyStyle) {
    score += 25;
  }

  // Group size preference (20% weight)
  if (partnerPreferences.groupSize && partnerPreferences.groupSize === criteria.groupSize) {
    score += 20;
  }

  // Availability overlap (10% weight)
  if (partnerPreferences.availability && criteria.availability) {
    try {
      const partnerAvail = Array.isArray(partnerPreferences.availability)
        ? partnerPreferences.availability
        : [partnerPreferences.availability];
      const criteriaAvail = Array.isArray(criteria.availability)
        ? criteria.availability
        : criteria.availability.split(',');

      const overlap = partnerAvail.filter((time) => criteriaAvail.includes(time)).length;
      if (overlap > 0) {
        score += (overlap / Math.max(partnerAvail.length, criteriaAvail.length)) * 10;
      }
    } catch (e) {
      // Ignore availability comparison if parsing fails
    }
  }

  // Base activity score (5% weight) - everyone gets some base score for being active
  score += 5;

  return Math.round(score);
}

function calculateBasicCompatibilityScore(partnerPreferences, criteria) {
  let score = 0;

  // Study style match (40% weight)
  if (partnerPreferences.studyStyle && partnerPreferences.studyStyle === criteria.studyStyle) {
    score += 40;
  }

  // Group size preference (30% weight)
  if (partnerPreferences.groupSize && partnerPreferences.groupSize === criteria.groupSize) {
    score += 30;
  }

  // Availability overlap (20% weight)
  if (partnerPreferences.availability && criteria.availability) {
    try {
      const partnerAvail = Array.isArray(partnerPreferences.availability)
        ? partnerPreferences.availability
        : [partnerPreferences.availability];
      const criteriaAvail = Array.isArray(criteria.availability)
        ? criteria.availability
        : criteria.availability.split(',');

      const overlap = partnerAvail.filter((time) => criteriaAvail.includes(time)).length;
      if (overlap > 0) {
        score += (overlap / Math.max(partnerAvail.length, criteriaAvail.length)) * 20;
      }
    } catch (e) {
      // Ignore availability comparison if parsing fails
    }
  }

  // Base activity score (10% weight) - everyone gets some base score for being active
  score += 10;

  return Math.round(score);
}

function calculateCompatibilityScore(partner, criteria) {
  let score = 0;

  // Subject match (40% weight)
  if (criteria.subjects.length > 0 && partner.profile?.subjects?.length) {
    const commonSubjects = partner.profile.subjects.filter((s) =>
      criteria.subjects.includes(s)
    ).length;
    score +=
      (commonSubjects / Math.max(criteria.subjects.length, partner.profile.subjects.length)) * 40;
  }

  // Study style match (30% weight)
  if (partner.profile?.studyPreferences?.studyStyle === criteria.studyStyle) {
    score += 30;
  }

  // Group size preference (20% weight)
  if (partner.profile?.studyPreferences?.groupSize === criteria.groupSize) {
    score += 20;
  }

  // Activity level (10% weight)
  if (partner.statistics?.sessionsAttended != null) {
    score += Math.min(partner.statistics.sessionsAttended / 10, 1) * 10;
  }

  return Math.round(score);
}

// Send a buddy request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const requesterId = req.user.id;

    if (!recipientId) {
      return res.status(400).json({ error: 'Recipient ID is required' });
    }

    if (recipientId === requesterId) {
      return res.status(400).json({ error: 'Cannot send buddy request to yourself' });
    }

    console.log('🤝 Processing buddy request:', { requesterId, recipientId, message });

    const request = pool.request();
    request.input('requesterId', sql.NVarChar(255), requesterId);
    request.input('recipientId', sql.NVarChar(255), recipientId);
    request.input('message', sql.NVarChar(500), message || '');

    // Check if there's already a connection between these users
    const existingConnection = await request.query(`
      SELECT match_id, match_status FROM partner_matches 
      WHERE (requester_id = @requesterId AND matched_user_id = @recipientId) 
      OR (requester_id = @recipientId AND matched_user_id = @requesterId)
    `);

    if (existingConnection.recordset.length > 0) {
      const status = existingConnection.recordset[0].match_status;
      return res.status(400).json({
        error: `A ${status} connection already exists between these users`,
      });
    }

    // Insert new buddy request - need a module_id, let's get the first shared module or use 1 as default
    const moduleRequest = pool.request();

    // Get first available module ID as default (in real app, this should be based on shared interests)
    const moduleResult = await moduleRequest.query(
      `SELECT TOP 1 module_id FROM dbo.modules WHERE is_active = 1`
    );
    const defaultModuleId =
      moduleResult.recordset.length > 0 ? moduleResult.recordset[0].module_id : 1;

    const finalInsertRequest = pool.request();
    finalInsertRequest.input('requesterId', sql.NVarChar(255), requesterId);
    finalInsertRequest.input('recipientId', sql.NVarChar(255), recipientId);
    finalInsertRequest.input('moduleId', sql.Int, defaultModuleId);

    const result = await finalInsertRequest.query(`
      INSERT INTO partner_matches (requester_id, matched_user_id, module_id, match_status, created_at, updated_at)
      OUTPUT INSERTED.match_id, INSERTED.created_at
      VALUES (@requesterId, @recipientId, @moduleId, 'pending', GETDATE(), GETDATE())
    `);

    const newRequest = result.recordset[0];
    console.log('✅ Buddy request sent successfully:', newRequest);

    res.status(201).json({
      id: newRequest.match_id,
      status: 'pending',
      message: 'Buddy request sent successfully',
      createdAt: newRequest.created_at,
    });
  } catch (error) {
    console.error('❌ Error sending buddy request:', error);
    res.status(500).json({ error: 'Failed to send buddy request' });
  }
});

// Test endpoint to add sample users (for development only)
router.post('/test-users', async (req, res) => {
  try {
    console.log('🧪 Adding test users for development...');

    // Delete existing test users first
    await pool.request().query(`
      DELETE FROM dbo.users WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3', 'test_user_4', 'test_user_5')
    `);

    const testUsers = [
      {
        id: 'test_user_1',
        email: 'alice.smith@mit.edu',
        firstName: 'Alice',
        lastName: 'Smith',
        university: 'MIT',
        course: 'Computer Science',
        year: 3,
        bio: 'Passionate about algorithms and machine learning. Love solving complex problems and working in study groups.',
        preferences:
          '{"studyStyle": "visual", "groupSize": "small", "environment": "quiet", "availability": ["morning", "afternoon"]}',
      },
      {
        id: 'test_user_2',
        email: 'bob.johnson@mit.edu',
        firstName: 'Bob',
        lastName: 'Johnson',
        university: 'MIT',
        course: 'Data Science',
        year: 2,
        bio: 'Data enthusiast looking for study partners for statistics and machine learning projects.',
        preferences:
          '{"studyStyle": "collaborative", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}',
      },
      {
        id: 'test_user_3',
        email: 'carol.wilson@stanford.edu',
        firstName: 'Carol',
        lastName: 'Wilson',
        university: 'Stanford University',
        course: 'Software Engineering',
        year: 4,
        bio: 'Senior student with experience in full-stack development. Happy to help junior students and collaborate on projects.',
        preferences:
          '{"studyStyle": "mixed", "groupSize": "large", "environment": "flexible", "availability": ["evening"]}',
      },
      {
        id: 'test_user_4',
        email: 'david.brown@mit.edu',
        firstName: 'David',
        lastName: 'Brown',
        university: 'MIT',
        course: 'Applied Mathematics',
        year: 1,
        bio: 'First-year student eager to learn and find study partners for calculus and linear algebra.',
        preferences:
          '{"studyStyle": "auditory", "groupSize": "small", "environment": "quiet", "availability": ["morning"]}',
      },
      {
        id: 'test_user_5',
        email: 'emma.davis@mit.edu',
        firstName: 'Emma',
        lastName: 'Davis',
        university: 'MIT',
        course: 'Computer Science',
        year: 2,
        bio: 'Second-year CS student interested in web development and databases. Prefer hands-on learning.',
        preferences:
          '{"studyStyle": "kinesthetic", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}',
      },
    ];

    for (const user of testUsers) {
      const request = pool.request();
      request.input('userId', sql.NVarChar(255), user.id);
      request.input('email', sql.NVarChar(255), user.email);
      request.input('firstName', sql.NVarChar(100), user.firstName);
      request.input('lastName', sql.NVarChar(100), user.lastName);
      request.input('university', sql.NVarChar(255), user.university);
      request.input('course', sql.NVarChar(255), user.course);
      request.input('year', sql.Int, user.year);
      request.input('bio', sql.NText, user.bio);
      request.input('preferences', sql.NVarChar(sql.MAX), user.preferences);

      await request.query(`
        INSERT INTO dbo.users (
          user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
        ) VALUES (
          @userId, @email, 'test_password_hash', @firstName, @lastName, @university, @course, @year, @bio, @preferences, 1
        )
      `);
    }

    console.log(`✅ Added ${testUsers.length} test users successfully`);
    res.json({
      message: `Successfully added ${testUsers.length} test users`,
      users: testUsers.length,
    });
  } catch (error) {
    console.error('❌ Error adding test users:', error);
    res.status(500).json({ error: 'Failed to add test users' });
  }
});

module.exports = router;
