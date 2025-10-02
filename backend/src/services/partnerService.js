// services/partnerService.js
const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Initialize Azure SQL connection pool and Web PubSub client
let pool;
let webPubSubClient;

const initializeDatabase = async () => {
  try {
    // Try to use Azure configuration first
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
      // Initialize Web PubSub client
      webPubSubClient = await azureConfig.getWebPubSubClient();
      console.log('✅ Connected to Azure Web PubSub for partner notifications');
    } catch (azureError) {
      console.warn('Azure config not available, using environment variables');
      // Fallback to connection string
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found in environment variables');
      }
      
      // Try to initialize Web PubSub with env vars
      if (process.env.WEB_PUBSUB_CONNECTION_STRING) {
        const { WebPubSubServiceClient } = require('@azure/web-pubsub');
        webPubSubClient = new WebPubSubServiceClient(process.env.WEB_PUBSUB_CONNECTION_STRING, 'studybuddy');
        console.log('✅ Connected to Azure Web PubSub (via env vars)');
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
    const buddyIdsString = buddyIds.map(id => `'${id}'`).join(',');
    
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

    console.log('🔍 Partner search params:', { subjects, studyStyle, groupSize, availability, university, search });

    // Get current user's info for better compatibility scoring
    const currentUserRequest = pool.request();
    currentUserRequest.input('userId', sql.NVarChar(255), currentUserId);
    const currentUserResult = await currentUserRequest.query(`
      SELECT university, course, year_of_study, study_preferences
      FROM users WHERE user_id = @userId
    `);

    const currentUser = currentUserResult.recordset[0] || {};
    let currentUserPreferences = {};
    try {
      if (currentUser.study_preferences) {
        currentUserPreferences = typeof currentUser.study_preferences === 'string' 
          ? JSON.parse(currentUser.study_preferences) 
          : currentUser.study_preferences;
      }
    } catch (e) {
      console.warn('Failed to parse current user study preferences');
    }

    const request = pool.request();
    request.input('currentUserId', sql.NVarChar(255), currentUserId);

    // Base query to find potential partners with shared courses and connection status
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
        ), 1, 2, '') as sharedCourses,
        -- Check connection status with current user
        pm.match_status as connectionStatus,
        pm.match_id as connectionId,
        pm.requester_id as connectionRequesterId
      FROM users u
      LEFT JOIN partner_matches pm ON (
        (pm.requester_id = @currentUserId AND pm.matched_user_id = u.user_id) OR
        (pm.requester_id = u.user_id AND pm.matched_user_id = @currentUserId)
      )
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

    // Format the response with enhanced compatibility scoring
    const formattedPartners = partners.map(partner => {
      let studyPreferences = {};
      try {
        if (partner.study_preferences) {
          studyPreferences = typeof partner.study_preferences === 'string' 
            ? JSON.parse(partner.study_preferences) 
            : partner.study_preferences;
        }
      } catch (e) {
        console.warn('Failed to parse study preferences for user:', partner.id);
      }

      const partnerData = {
        name: [partner.first_name, partner.last_name].filter(Boolean).join(' ') || partner.email || 'Unknown',
        university: partner.university,
        course: partner.course,
        yearOfStudy: partner.year_of_study
      };

      const searchCriteria = {
        subjects: subjects?.split(',') || [],
        studyStyle: studyStyle || currentUserPreferences.studyStyle,
        groupSize: groupSize || currentUserPreferences.groupSize,
        availability: availability || currentUserPreferences.availability,
        university: university || currentUser.university,
        course: currentUser.course,
        yearOfStudy: currentUser.year_of_study
      };

      const sharedCoursesCount = partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean).length : 0;

      // Determine connection status
      let connectionStatus = 'none'; // none, pending, accepted, declined
      let connectionId = null;
      let isPendingReceived = false;
      let isPendingSent = false;

      if (partner.connectionStatus) {
        connectionStatus = partner.connectionStatus;
        connectionId = partner.connectionId;
        
        if (connectionStatus === 'pending') {
          // Check if current user sent the request or received it
          isPendingSent = partner.connectionRequesterId === currentUserId;
          isPendingReceived = partner.connectionRequesterId !== currentUserId;
        }
      }

      return {
        id: partner.id,
        name: partnerData.name,
        email: partner.email,
        university: partner.university,
        course: partner.course,
        yearOfStudy: partner.year_of_study,
        bio: partner.bio,
        studyPreferences,
        
        // Enhanced shared courses and topics
        sharedCourses: partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean) : [],
        sharedTopics: [], // Could be enhanced with topic-level data
        
        // Connection status information
        connectionStatus,
        connectionId,
        isPendingSent,
        isPendingReceived,
        
        profile: {
          subjects: partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean) : [],
          studyStyle: studyPreferences.studyStyle || null,
          groupSize: studyPreferences.groupSize || null,
          availability: studyPreferences.availability || null
        },
        statistics: {
          sessionsAttended: 0, // Could be enhanced with actual study session data
          completedStudies: 0
        },
        compatibilityScore: calculateEnhancedCompatibilityScore(
          studyPreferences, 
          searchCriteria, 
          sharedCoursesCount, 
          partnerData
        )
      };
    });

    // Sort by compatibility score
    const sortedPartners = formattedPartners
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, 20); // Return top 20 matches

    console.log(`🎯 Top matches with scores:`, sortedPartners.slice(0, 3).map(p => ({
      name: p.name, 
      score: p.compatibilityScore, 
      university: p.university,
      course: p.course,
      sharedCourses: p.sharedCourses.length
    })));

    res.json(sortedPartners);
  } catch (error) {
    console.error('❌ Error searching partners:', error);
    res.status(500).json({ error: 'Failed to search for partners' });
  }
});

function calculateEnhancedCompatibilityScore(partnerPreferences, criteria, sharedCoursesCount = 0, partnerData = {}) {
  let score = 0;
  const debugging = [];

  // 1. University/Location compatibility (20% weight)
  if (partnerData.university && criteria.university) {
    if (partnerData.university === criteria.university) {
      score += 20;
      debugging.push('University match: +20');
    } else {
      // Partial score for nearby universities or same city
      score += 5;
      debugging.push('Different university: +5');
    }
  }

  // 2. Course field similarity (15% weight)
  if (partnerData.course && criteria.course) {
    const partnerCourse = partnerData.course.toLowerCase();
    const criteraCourse = criteria.course.toLowerCase();
    
    // Exact match
    if (partnerCourse === criteraCourse) {
      score += 15;
      debugging.push('Exact course match: +15');
    } else {
      // Field similarity (CS, Software Engineering, Data Science, etc.)
      const techFields = ['computer', 'software', 'data', 'information', 'technology', 'engineering'];
      const mathFields = ['mathematics', 'statistics', 'physics', 'engineering'];
      const businessFields = ['business', 'management', 'economics', 'finance'];
      
      const isPartnerTech = techFields.some(field => partnerCourse.includes(field));
      const isCriteriaTech = techFields.some(field => criteraCourse.includes(field));
      const isPartnerMath = mathFields.some(field => partnerCourse.includes(field));
      const isCriteriaMath = mathFields.some(field => criteraCourse.includes(field));
      const isPartnerBusiness = businessFields.some(field => partnerCourse.includes(field));
      const isCriteriaBusiness = businessFields.some(field => criteraCourse.includes(field));
      
      if ((isPartnerTech && isCriteriaTech) || 
          (isPartnerMath && isCriteriaMath) || 
          (isPartnerBusiness && isCriteriaBusiness)) {
        score += 10;
        debugging.push('Similar field: +10');
      } else {
        score += 3;
        debugging.push('Different field: +3');
      }
    }
  }

  // 3. Year of study compatibility (15% weight)
  if (partnerData.yearOfStudy && criteria.yearOfStudy) {
    const yearDiff = Math.abs(partnerData.yearOfStudy - criteria.yearOfStudy);
    if (yearDiff === 0) {
      score += 15;
      debugging.push('Same year: +15');
    } else if (yearDiff === 1) {
      score += 10;
      debugging.push('1 year difference: +10');
    } else if (yearDiff === 2) {
      score += 5;
      debugging.push('2 year difference: +5');
    } else {
      score += 2;
      debugging.push('3+ year difference: +2');
    }
  }

  // 4. Study preferences alignment (20% weight total)
  // Study style match (10% weight)
  if (partnerPreferences.studyStyle && criteria.studyStyle) {
    if (partnerPreferences.studyStyle === criteria.studyStyle) {
      score += 10;
      debugging.push('Study style match: +10');
    } else {
      // Partial compatibility for complementary styles
      const visualAuditory = ['visual', 'auditory'];
      const collaborativeKinesthetic = ['collaborative', 'kinesthetic'];
      
      if ((visualAuditory.includes(partnerPreferences.studyStyle) && visualAuditory.includes(criteria.studyStyle)) ||
          (collaborativeKinesthetic.includes(partnerPreferences.studyStyle) && collaborativeKinesthetic.includes(criteria.studyStyle))) {
        score += 5;
        debugging.push('Compatible study style: +5');
      }
    }
  }

  // Group size preference (10% weight)
  if (partnerPreferences.groupSize && criteria.groupSize) {
    if (partnerPreferences.groupSize === criteria.groupSize) {
      score += 10;
      debugging.push('Group size match: +10');
    } else {
      // Flexible matching (small-medium, medium-large can work together)
      const flexible = {
        'small': ['medium'],
        'medium': ['small', 'large'],
        'large': ['medium']
      };
      if (flexible[partnerPreferences.groupSize]?.includes(criteria.groupSize)) {
        score += 5;
        debugging.push('Flexible group size: +5');
      }
    }
  }

  // 5. Availability overlap (15% weight)
  if (partnerPreferences.availability && criteria.availability) {
    try {
      const partnerAvail = Array.isArray(partnerPreferences.availability) 
        ? partnerPreferences.availability 
        : [partnerPreferences.availability];
      const criteriaAvail = Array.isArray(criteria.availability) 
        ? criteria.availability 
        : criteria.availability.split(',');
      
      const overlap = partnerAvail.filter(time => criteriaAvail.includes(time)).length;
      if (overlap > 0) {
        const overlapScore = (overlap / Math.max(partnerAvail.length, criteriaAvail.length)) * 15;
        score += overlapScore;
        debugging.push(`Availability overlap (${overlap}/${Math.max(partnerAvail.length, criteriaAvail.length)}): +${overlapScore.toFixed(1)}`);
      }
    } catch (e) {
      debugging.push('Availability parsing failed');
    }
  }

  // 6. Shared courses bonus (10% weight) - bonus, not requirement
  if (sharedCoursesCount > 0) {
    const sharedScore = Math.min(sharedCoursesCount * 3, 10); // 3 points per shared course, max 10
    score += sharedScore;
    debugging.push(`Shared courses (${sharedCoursesCount}): +${sharedScore}`);
  }

  // 7. Bio/interest matching (5% weight) - future enhancement
  // This could analyze keywords in bio for common interests
  score += 5; // Base engagement score for having a profile

  // Log debugging info occasionally
  if (Math.random() < 0.1) { // 10% chance to debug log
    console.log('🤖 Compatibility calculation:', {
      partner: partnerData.name || 'Unknown',
      score: Math.round(score),
      breakdown: debugging
    });
  }

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
      
      const overlap = partnerAvail.filter(time => criteriaAvail.includes(time)).length;
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

// Send a buddy request (alternative endpoint for frontend compatibility)
router.post('/match', authenticateToken, async (req, res) => {
  try {
    const { matched_user_id, module_id, message } = req.body;
    const requesterId = req.user.id;

    if (!matched_user_id) {
      return res.status(400).json({ error: 'Matched user ID is required' });
    }

    if (matched_user_id === requesterId) {
      return res.status(400).json({ error: 'Cannot send buddy request to yourself' });
    }

    console.log('🤝 Processing partner match request:', { requesterId, matched_user_id, module_id, message });

    const request = pool.request();
    request.input('requesterId', sql.NVarChar(255), requesterId);
    request.input('recipientId', sql.NVarChar(255), matched_user_id);
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
        error: `A ${status} connection already exists between these users` 
      });
    }

    // Get requester's info for the notification
    const requesterRequest = pool.request();
    requesterRequest.input('requesterId', sql.NVarChar(255), requesterId);
    const requesterResult = await requesterRequest.query(`
      SELECT first_name, last_name, email, university, course 
      FROM users WHERE user_id = @requesterId
    `);

    const requesterInfo = requesterResult.recordset[0];
    const requesterName = requesterInfo ? 
      [requesterInfo.first_name, requesterInfo.last_name].filter(Boolean).join(' ') || requesterInfo.email : 
      'Unknown User';

    // Use provided module_id or get default
    let targetModuleId = module_id;
    if (!targetModuleId) {
      const moduleRequest = pool.request();
      const moduleResult = await moduleRequest.query(`SELECT TOP 1 module_id FROM dbo.modules WHERE is_active = 1`);
      targetModuleId = moduleResult.recordset.length > 0 ? moduleResult.recordset[0].module_id : 1;
    }

    const finalInsertRequest = pool.request();
    finalInsertRequest.input('requesterId', sql.NVarChar(255), requesterId);
    finalInsertRequest.input('recipientId', sql.NVarChar(255), matched_user_id);
    finalInsertRequest.input('moduleId', sql.Int, targetModuleId);

    const result = await finalInsertRequest.query(`
      INSERT INTO partner_matches (requester_id, matched_user_id, module_id, match_status, created_at, updated_at)
      OUTPUT INSERTED.match_id, INSERTED.created_at
      VALUES (@requesterId, @recipientId, @moduleId, 'pending', GETDATE(), GETDATE())
    `);

    const newRequest = result.recordset[0];

    // Send Web PubSub notification to recipient
    if (webPubSubClient) {
      try {
        await webPubSubClient.sendToUser(matched_user_id, {
          type: 'partner_request',
          payload: {
            requestId: newRequest.match_id,
            requesterId: requesterId,
            requesterName: requesterName,
            requesterUniversity: requesterInfo?.university,
            requesterCourse: requesterInfo?.course,
            message: message || '',
            timestamp: newRequest.created_at
          }
        });
        console.log('✅ Web PubSub notification sent to user:', matched_user_id);
      } catch (pubsubError) {
        console.warn('⚠️ Failed to send Web PubSub notification:', pubsubError);
        // Don't fail the request if notification fails
      }
    } else {
      console.warn('⚠️ Web PubSub client not available, skipping notification');
    }

    console.log('✅ Partner match request sent successfully:', newRequest);

    res.status(201).json({
      id: newRequest.match_id,
      status: 'pending',
      message: 'Partner match request sent successfully',
      createdAt: newRequest.created_at
    });

  } catch (error) {
    console.error('❌ Error sending partner match request:', error);
    res.status(500).json({ error: 'Failed to send partner match request' });
  }
});

// Test endpoint to verify basic functionality
router.post('/test', authenticateToken, async (req, res) => {
  try {
    console.log('🧪 Test endpoint hit:', {
      body: req.body,
      user: req.user,
      headers: req.headers
    });
    
    res.json({
      message: 'Test endpoint working',
      user: req.user,
      body: req.body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({ error: 'Test endpoint failed' });
  }
});

// Send a buddy request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const requesterId = req.user.id;

    console.log('🤝 Processing buddy request:', { 
      requesterId, 
      recipientId, 
      message: message || 'No message',
      requestBody: req.body,
      userInfo: { id: req.user.id, email: req.user.email }
    });

    // Validate required fields
    if (!recipientId) {
      console.log('❌ Missing recipientId');
      return res.status(400).json({ error: 'Recipient ID is required' });
    }

    if (recipientId === requesterId) {
      console.log('❌ Self-request attempt');
      return res.status(400).json({ error: 'Cannot send buddy request to yourself' });
    }

    // Check database connection
    if (!pool) {
      console.log('❌ Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    console.log('📋 Checking for existing connections...');
    const request = pool.request();
    request.input('requesterId', sql.NVarChar(255), requesterId);
    request.input('recipientId', sql.NVarChar(255), recipientId);

    // Check if there's already a connection between these users
    const existingConnection = await request.query(`
      SELECT match_id, match_status FROM partner_matches 
      WHERE (requester_id = @requesterId AND matched_user_id = @recipientId) 
      OR (requester_id = @recipientId AND matched_user_id = @requesterId)
    `);

    if (existingConnection.recordset.length > 0) {
      const status = existingConnection.recordset[0].match_status;
      console.log(`❌ Existing connection found with status: ${status}`);
      return res.status(400).json({ 
        error: `A ${status} connection already exists between these users` 
      });
    }

    // Simplified approach: Just ensure we have a default module and insert the request
    console.log('📚 Ensuring default module exists...');
    let targetModuleId = 1; // Default fallback

    try {
      // Check if any modules exist
      const moduleCheckRequest = pool.request();
      const moduleCheckResult = await moduleCheckRequest.query(`
        SELECT TOP 1 module_id FROM dbo.modules WHERE is_active = 1
      `);

      if (moduleCheckResult.recordset.length > 0) {
        targetModuleId = moduleCheckResult.recordset[0].module_id;
        console.log('📚 Using existing module ID:', targetModuleId);
      } else {
        // Create a simple default module
        console.log('📚 Creating default General Studies module...');
        const createModuleRequest = pool.request();
        createModuleRequest.input('code', sql.NVarChar(50), 'GEN001');
        createModuleRequest.input('name', sql.NVarChar(255), 'General Studies');
        createModuleRequest.input('university', sql.NVarChar(255), 'General');
        createModuleRequest.input('description', sql.NText, 'General study topics');

        const createResult = await createModuleRequest.query(`
          INSERT INTO dbo.modules (module_code, module_name, university, description, is_active, created_at)
          OUTPUT INSERTED.module_id
          VALUES (@code, @name, @university, @description, 1, GETDATE())
        `);
        
        targetModuleId = createResult.recordset[0].module_id;
        console.log('📚 Created default module with ID:', targetModuleId);
      }
    } catch (moduleError) {
      console.warn('⚠️ Module setup failed, using fallback ID 1:', moduleError.message);
      targetModuleId = 1;
    }

    console.log('💾 Inserting buddy request into database...');
    const insertRequest = pool.request();
    insertRequest.input('requesterId', sql.NVarChar(255), requesterId);
    insertRequest.input('recipientId', sql.NVarChar(255), recipientId);
    insertRequest.input('moduleId', sql.Int, targetModuleId);

    const result = await insertRequest.query(`
      INSERT INTO partner_matches (requester_id, matched_user_id, module_id, match_status, created_at, updated_at)
      OUTPUT INSERTED.match_id, INSERTED.created_at
      VALUES (@requesterId, @recipientId, @moduleId, 'pending', GETDATE(), GETDATE())
    `);

    const newRequest = result.recordset[0];
    console.log('✅ Buddy request inserted with ID:', newRequest.match_id);

    // Skip WebPubSub for now to isolate the issue
    console.log('⚠️ Skipping WebPubSub notification for debugging');

    console.log('✅ Buddy request sent successfully');

    res.status(201).json({
      id: newRequest.match_id,
      status: 'pending',
      message: 'Buddy request sent successfully',
      createdAt: newRequest.created_at
    });

  } catch (error) {
    console.error('❌ Error sending buddy request:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      state: error.state,
      number: error.number
    });
    
    res.status(500).json({ 
      error: 'Failed to send buddy request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Accept a buddy request
router.post('/accept/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log('👍 Processing accept request:', { requestId, userId });

    const request = pool.request();
    request.input('requestId', sql.Int, requestId);
    request.input('userId', sql.NVarChar(255), userId);

    // Check if request exists and user is the recipient
    const checkRequest = await request.query(`
      SELECT pm.*, u.first_name, u.last_name, u.email 
      FROM partner_matches pm
      LEFT JOIN users u ON pm.requester_id = u.user_id
      WHERE pm.match_id = @requestId 
      AND pm.matched_user_id = @userId 
      AND pm.match_status = 'pending'
    `);

    if (checkRequest.recordset.length === 0) {
      return res.status(404).json({ error: 'Partner request not found or already processed' });
    }

    const requestInfo = checkRequest.recordset[0];

    // Update request status to accepted
    const updateRequest = pool.request();
    updateRequest.input('requestId', sql.Int, requestId);
    
    await updateRequest.query(`
      UPDATE partner_matches 
      SET match_status = 'accepted', updated_at = GETDATE()
      WHERE match_id = @requestId
    `);

    // Send Web PubSub notification to requester
    if (webPubSubClient) {
      try {
        await webPubSubClient.sendToUser(requestInfo.requester_id, {
          type: 'partner_request_accepted',
          payload: {
            requestId: requestId,
            acceptedBy: userId,
            acceptedByName: req.user.name || 'Unknown User',
            timestamp: new Date().toISOString()
          }
        });
        console.log('✅ Acceptance notification sent to user:', requestInfo.requester_id);
      } catch (pubsubError) {
        console.warn('⚠️ Failed to send acceptance notification:', pubsubError);
      }
    }

    console.log('✅ Partner request accepted successfully');

    res.json({
      message: 'Partner request accepted successfully',
      requestId: requestId,
      status: 'accepted'
    });

  } catch (error) {
    console.error('❌ Error accepting partner request:', error);
    res.status(500).json({ error: 'Failed to accept partner request' });
  }
});

// Reject a buddy request
router.post('/reject/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log('👎 Processing reject request:', { requestId, userId });

    const request = pool.request();
    request.input('requestId', sql.Int, requestId);
    request.input('userId', sql.NVarChar(255), userId);

    // Check if request exists and user is the recipient
    const checkRequest = await request.query(`
      SELECT pm.*, u.first_name, u.last_name, u.email 
      FROM partner_matches pm
      LEFT JOIN users u ON pm.requester_id = u.user_id
      WHERE pm.match_id = @requestId 
      AND pm.matched_user_id = @userId 
      AND pm.match_status = 'pending'
    `);

    if (checkRequest.recordset.length === 0) {
      return res.status(404).json({ error: 'Partner request not found or already processed' });
    }

    const requestInfo = checkRequest.recordset[0];

    // Update request status to declined
    const updateRequest = pool.request();
    updateRequest.input('requestId', sql.Int, requestId);
    
    await updateRequest.query(`
      UPDATE partner_matches 
      SET match_status = 'declined', updated_at = GETDATE()
      WHERE match_id = @requestId
    `);

    // Send Web PubSub notification to requester
    if (webPubSubClient) {
      try {
        await webPubSubClient.sendToUser(requestInfo.requester_id, {
          type: 'partner_request_rejected',
          payload: {
            requestId: requestId,
            rejectedBy: userId,
            rejectedByName: req.user.name || 'Unknown User',
            timestamp: new Date().toISOString()
          }
        });
        console.log('✅ Rejection notification sent to user:', requestInfo.requester_id);
      } catch (pubsubError) {
        console.warn('⚠️ Failed to send rejection notification:', pubsubError);
      }
    }

    console.log('✅ Partner request rejected successfully');

    res.json({
      message: 'Partner request rejected successfully',
      requestId: requestId,
      status: 'declined'
    });

  } catch (error) {
    console.error('❌ Error rejecting partner request:', error);
    res.status(500).json({ error: 'Failed to reject partner request' });
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
        preferences: '{"studyStyle": "visual", "groupSize": "small", "environment": "quiet", "availability": ["morning", "afternoon"]}'
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
        preferences: '{"studyStyle": "collaborative", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}'
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
        preferences: '{"studyStyle": "mixed", "groupSize": "large", "environment": "flexible", "availability": ["evening"]}'
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
        preferences: '{"studyStyle": "auditory", "groupSize": "small", "environment": "quiet", "availability": ["morning"]}'
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
        preferences: '{"studyStyle": "kinesthetic", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}'
      }
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
    res.json({ message: `Successfully added ${testUsers.length} test users`, users: testUsers.length });

  } catch (error) {
    console.error('❌ Error adding test users:', error);
    res.status(500).json({ error: 'Failed to add test users' });
  }
});

module.exports = router;
