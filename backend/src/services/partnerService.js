/**
 * Azure-native Partner Service
 * Uses Azure SQL Database directly instead of Cosmos DB
 * Implements complete partner matching with real-time notifications via Web PubSub
 */

const express = require('express');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');
const { azureSQL } = require('./azureSQLService');
const { azureConfig } = require('../config/azureConfig');

const router = express.Router();

async function getPool() {
  return await azureSQL.getPool();
}

// GET /partners/search - Find study partners based on criteria
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { subjects, university, year, studyStyle, availability, limit = 20 } = req.query;
    const currentUserId = req.user.id;

    const pool = await getPool();
    const request = pool.request();
    request.input('currentUserId', sql.Int, currentUserId);
    request.input('limit', sql.Int, parseInt(limit));

    let whereConditions = ['u.user_id != @currentUserId', 'u.is_active = 1'];
    
    if (university) {
      request.input('university', sql.NVarChar(255), university);
      whereConditions.push('u.university = @university');
    }

    if (year) {
      request.input('year', sql.Int, parseInt(year));
      whereConditions.push('u.year_of_study = @year');
    }

    if (subjects) {
      // Find users enrolled in similar modules
      const subjectList = subjects.split(',').map(s => s.trim());
      whereConditions.push(`EXISTS (
        SELECT 1 FROM user_modules um 
        INNER JOIN modules m ON um.module_id = m.module_id 
        WHERE um.user_id = u.user_id 
        AND um.enrollment_status = 'active'
        AND (${subjectList.map((subj, i) => {
          request.input(`subject${i}`, sql.NVarChar(255), `%${subj}%`);
          return `m.module_code LIKE @subject${i} OR m.module_name LIKE @subject${i}`;
        }).join(' OR ')})
      )`);
    }

    const query = `
      SELECT TOP (@limit)
        u.user_id,
        u.first_name + ' ' + u.last_name as name,
        u.university,
        u.course,
        u.year_of_study,
        u.bio,
        u.study_preferences,
        u.rating,
        u.total_study_hours,
        u.last_active,
        u.profile_image_url,
        STRING_AGG(m.module_code, ', ') as enrolled_modules,
        COUNT(DISTINCT um.module_id) as module_count,
        -- Calculate compatibility score based on shared modules and preferences
        CASE 
          WHEN u.study_preferences IS NOT NULL 
          THEN 0.7 + (COUNT(DISTINCT um.module_id) * 0.1)
          ELSE 0.5
        END as compatibility_score
      FROM users u
      LEFT JOIN user_modules um ON u.user_id = um.user_id AND um.enrollment_status = 'active'
      LEFT JOIN modules m ON um.module_id = m.module_id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY u.user_id, u.first_name, u.last_name, u.university, u.course, 
               u.year_of_study, u.bio, u.study_preferences, u.rating, 
               u.total_study_hours, u.last_active, u.profile_image_url
      ORDER BY compatibility_score DESC, u.rating DESC, u.last_active DESC
    `;

    const result = await request.query(query);
    
    const partners = result.recordset.map(partner => ({
      id: partner.user_id,
      name: partner.name,
      university: partner.university,
      major: partner.course,
      year: `${partner.year_of_study}${getOrdinalSuffix(partner.year_of_study)} Year`,
      bio: partner.bio,
      studyHours: partner.total_study_hours || 0,
      rating: partner.rating || 0,
      lastActive: partner.last_active,
      courses: partner.enrolled_modules ? partner.enrolled_modules.split(', ') : [],
      compatibilityScore: Math.min(partner.compatibility_score || 0.5, 1.0),
      avatar: partner.profile_image_url,
      overlap: `${partner.module_count || 0} mutual courses`,
      studyPreferences: partner.study_preferences ? JSON.parse(partner.study_preferences) : {}
    }));

    res.json(partners);
  } catch (error) {
    console.error('Error searching for partners:', error);
    res.status(500).json({ error: 'Failed to search for study partners' });
  }
});

// POST /partners/match - Send study partner request
router.post('/match', authenticateToken, async (req, res) => {
  try {
    const { matched_user_id, module_id, message } = req.body;
    const requesterId = req.user.id;

    if (!matched_user_id) {
      return res.status(400).json({ error: 'matched_user_id is required' });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();

      // Check if match already exists
      const existingMatch = await transaction.request()
        .input('requesterId', sql.Int, requesterId)
        .input('matchedUserId', sql.Int, matched_user_id)
        .query(`
          SELECT match_id FROM partner_matches 
          WHERE (requester_id = @requesterId AND matched_user_id = @matchedUserId)
             OR (requester_id = @matchedUserId AND matched_user_id = @requesterId)
        `);

      if (existingMatch.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ error: 'Partner match already exists' });
      }

      // Create new partner match
      const matchRequest = transaction.request();
      matchRequest.input('requesterId', sql.Int, requesterId);
      matchRequest.input('matchedUserId', sql.Int, matched_user_id);
      matchRequest.input('moduleId', sql.Int, module_id || null);
      matchRequest.input('message', sql.NText, message || '');

      const result = await matchRequest.query(`
        INSERT INTO partner_matches (requester_id, matched_user_id, module_id, match_status, created_at)
        OUTPUT inserted.*
        VALUES (@requesterId, @matchedUserId, @moduleId, 'pending', GETUTCDATE())
      `);

      // Create notification for the matched user
      const notificationRequest = transaction.request();
      notificationRequest.input('userId', sql.Int, matched_user_id);
      notificationRequest.input('type', sql.NVarChar(100), 'partner_match');
      notificationRequest.input('title', sql.NVarChar(255), 'New Study Partner Request');
      notificationRequest.input('message', sql.NText, `${req.user.name} sent you a study partner request`);
      notificationRequest.input('metadata', sql.NVarChar(sql.MAX), JSON.stringify({
        match_id: result.recordset[0].match_id,
        requester_id: requesterId,
        requester_name: req.user.name,
        message: message
      }));

      await notificationRequest.query(`
        INSERT INTO notifications (user_id, notification_type, title, message, metadata, created_at)
        VALUES (@userId, @type, @title, @message, @metadata, GETUTCDATE())
      `);

      await transaction.commit();

      // Send real-time notification via Azure Web PubSub
      try {
        const webPubSubClient = await azureConfig.getWebPubSubClient();
        
        await webPubSubClient.sendToUser(matched_user_id.toString(), {
          type: 'partner_request',
          data: {
            match_id: result.recordset[0].match_id,
            requester_name: req.user.name,
            message: message
          }
        });
        
        console.log(`Real-time notification sent to user ${matched_user_id}`);
      } catch (pubsubError) {
        console.warn('Failed to send real-time notification:', pubsubError);
        // Don't fail the request if real-time notification fails
      }

      res.status(201).json({
        match_id: result.recordset[0].match_id,
        status: 'pending',
        message: 'Partner request sent successfully'
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating partner match:', error);
    res.status(500).json({ error: 'Failed to send partner request' });
  }
});

// GET /partners/matches - Get user's partner matches
router.get('/matches', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status = 'all' } = req.query;

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.Int, userId);

    let statusFilter = '';
    if (status !== 'all') {
      request.input('status', sql.NVarChar(50), status);
      statusFilter = 'AND pm.match_status = @status';
    }

    const query = `
      SELECT 
        pm.match_id,
        pm.match_status,
        pm.compatibility_score,
        pm.created_at,
        pm.updated_at,
        CASE 
          WHEN pm.requester_id = @userId THEN 'sent'
          ELSE 'received'
        END as request_type,
        u.user_id as partner_id,
        u.first_name + ' ' + u.last_name as partner_name,
        u.university as partner_university,
        u.course as partner_course,
        u.year_of_study as partner_year,
        u.profile_image_url as partner_avatar,
        u.rating as partner_rating,
        m.module_code,
        m.module_name
      FROM partner_matches pm
      INNER JOIN users u ON (
        CASE 
          WHEN pm.requester_id = @userId THEN pm.matched_user_id
          ELSE pm.requester_id
        END = u.user_id
      )
      LEFT JOIN modules m ON pm.module_id = m.module_id
      WHERE (pm.requester_id = @userId OR pm.matched_user_id = @userId)
      ${statusFilter}
      ORDER BY pm.created_at DESC
    `;

    const result = await request.query(query);
    
    const matches = result.recordset.map(match => ({
      match_id: match.match_id,
      partner: {
        id: match.partner_id,
        name: match.partner_name,
        university: match.partner_university,
        course: match.partner_course,
        year: `${match.partner_year}${getOrdinalSuffix(match.partner_year)} Year`,
        avatar: match.partner_avatar,
        rating: match.partner_rating
      },
      module: match.module_code ? {
        code: match.module_code,
        name: match.module_name
      } : null,
      status: match.match_status,
      request_type: match.request_type,
      compatibility_score: match.compatibility_score,
      created_at: match.created_at,
      updated_at: match.updated_at
    }));

    res.json(matches);
  } catch (error) {
    console.error('Error fetching partner matches:', error);
    res.status(500).json({ error: 'Failed to fetch partner matches' });
  }
});

// PUT /partners/matches/:matchId/respond - Respond to partner request
router.put('/matches/:matchId/respond', authenticateToken, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { response } = req.body; // 'accepted' or 'declined'
    const userId = req.user.id;

    if (!['accepted', 'declined'].includes(response)) {
      return res.status(400).json({ error: 'Response must be "accepted" or "declined"' });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Verify user is the recipient of this match
      const matchCheck = await transaction.request()
        .input('matchId', sql.Int, matchId)
        .input('userId', sql.Int, userId)
        .query(`
          SELECT requester_id, matched_user_id, match_status 
          FROM partner_matches 
          WHERE match_id = @matchId AND matched_user_id = @userId
        `);

      if (matchCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Match not found or not authorized' });
      }

      const match = matchCheck.recordset[0];
      if (match.match_status !== 'pending') {
        await transaction.rollback();
        return res.status(400).json({ error: 'Match has already been responded to' });
      }

      // Update match status
      await transaction.request()
        .input('matchId', sql.Int, matchId)
        .input('status', sql.NVarChar(50), response)
        .query(`
          UPDATE partner_matches 
          SET match_status = @status, updated_at = GETUTCDATE()
          WHERE match_id = @matchId
        `);

      // Create notification for requester
      const notificationRequest = transaction.request();
      notificationRequest.input('userId', sql.Int, match.requester_id);
      notificationRequest.input('type', sql.NVarChar(100), 'partner_response');
      notificationRequest.input('title', sql.NVarChar(255), 
        response === 'accepted' ? 'Partner Request Accepted!' : 'Partner Request Declined');
      notificationRequest.input('message', sql.NText, 
        `${req.user.name} ${response} your study partner request`);
      notificationRequest.input('metadata', sql.NVarChar(sql.MAX), JSON.stringify({
        match_id: matchId,
        response: response,
        responder_name: req.user.name
      }));

      await notificationRequest.query(`
        INSERT INTO notifications (user_id, notification_type, title, message, metadata, created_at)
        VALUES (@userId, @type, @title, @message, @metadata, GETUTCDATE())
      `);

      await transaction.commit();

      // Send real-time notification
      try {
        const webPubSubClient = await azureConfig.getWebPubSubClient();
        
        await webPubSubClient.sendToUser(match.requester_id.toString(), {
          type: 'partner_response',
          data: {
            match_id: matchId,
            response: response,
            responder_name: req.user.name
          }
        });
        
        console.log(`Real-time response notification sent to user ${match.requester_id}`);
      } catch (pubsubError) {
        console.warn('Failed to send real-time notification:', pubsubError);
      }

      res.json({
        match_id: matchId,
        status: response,
        message: `Partner request ${response} successfully`
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error responding to partner match:', error);
    res.status(500).json({ error: 'Failed to respond to partner request' });
  }
});

// GET /partners/recommendations - Get AI-powered partner recommendations
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.Int, userId);
    request.input('limit', sql.Int, parseInt(limit));

    // Get user's study preferences and enrolled modules
    const userQuery = await request.query(`
      SELECT 
        u.study_preferences,
        u.university,
        u.course,
        u.year_of_study,
        STRING_AGG(m.module_code, ',') as user_modules
      FROM users u
      LEFT JOIN user_modules um ON u.user_id = um.user_id AND um.enrollment_status = 'active'
      LEFT JOIN modules m ON um.module_id = m.module_id
      WHERE u.user_id = @userId
      GROUP BY u.user_id, u.study_preferences, u.university, u.course, u.year_of_study
    `);

    if (userQuery.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = userQuery.recordset[0];
    const userModules = currentUser.user_modules ? currentUser.user_modules.split(',') : [];

    // Find recommended partners based on multiple criteria
    const recommendationsQuery = `
      WITH PartnerCandidates AS (
        SELECT 
          u.user_id,
          u.first_name + ' ' + u.last_name as name,
          u.university,
          u.course,
          u.year_of_study,
          u.bio,
          u.profile_image_url,
          u.rating,
          u.total_study_hours,
          u.last_active,
          u.study_preferences,
          STRING_AGG(m.module_code, ',') as enrolled_modules,
          COUNT(DISTINCT um.module_id) as shared_modules_count,
          -- Scoring algorithm
          (
            -- Same university bonus
            CASE WHEN u.university = '${currentUser.university}' THEN 20 ELSE 0 END +
            -- Same course bonus  
            CASE WHEN u.course = '${currentUser.course}' THEN 15 ELSE 0 END +
            -- Similar year bonus
            CASE WHEN ABS(u.year_of_study - ${currentUser.year_of_study}) <= 1 THEN 10 ELSE 0 END +
            -- Shared modules bonus (5 points per shared module)
            (COUNT(DISTINCT um.module_id) * 5) +
            -- Rating bonus
            (u.rating * 5) +
            -- Recent activity bonus
            CASE WHEN DATEDIFF(day, u.last_active, GETUTCDATE()) <= 7 THEN 10 ELSE 0 END
          ) as recommendation_score
        FROM users u
        LEFT JOIN user_modules um ON u.user_id = um.user_id AND um.enrollment_status = 'active'
        LEFT JOIN modules m ON um.module_id = m.module_id
        WHERE u.user_id != @userId 
          AND u.is_active = 1
          AND u.user_id NOT IN (
            SELECT CASE 
              WHEN requester_id = @userId THEN matched_user_id 
              ELSE requester_id 
            END
            FROM partner_matches 
            WHERE (requester_id = @userId OR matched_user_id = @userId)
              AND match_status IN ('pending', 'accepted')
          )
        GROUP BY u.user_id, u.first_name, u.last_name, u.university, u.course, 
                 u.year_of_study, u.bio, u.profile_image_url, u.rating, 
                 u.total_study_hours, u.last_active, u.study_preferences
      )
      SELECT TOP (@limit) *
      FROM PartnerCandidates
      WHERE recommendation_score > 0
      ORDER BY recommendation_score DESC, rating DESC, last_active DESC
    `;

    const request2 = pool.request();
    request2.input('userId', sql.Int, userId);
    request2.input('limit', sql.Int, parseInt(limit));

    const result = await request2.query(recommendationsQuery);
    
    const recommendations = result.recordset.map(partner => ({
      id: partner.user_id,
      name: partner.name,
      university: partner.university,
      major: partner.course,
      year: `${partner.year_of_study}${getOrdinalSuffix(partner.year_of_study)} Year`,
      bio: partner.bio,
      studyHours: partner.total_study_hours || 0,
      rating: partner.rating || 0,
      lastActive: partner.last_active,
      courses: partner.enrolled_modules ? partner.enrolled_modules.split(',') : [],
      compatibilityScore: Math.min(partner.recommendation_score / 100, 1.0),
      avatar: partner.profile_image_url,
      overlap: `${partner.shared_modules_count || 0} shared courses`,
      studyPreferences: partner.study_preferences ? JSON.parse(partner.study_preferences) : {},
      recommendationReason: generateRecommendationReason(partner, currentUser)
    }));

    res.json(recommendations);
  } catch (error) {
    console.error('Error getting partner recommendations:', error);
    res.status(500).json({ error: 'Failed to get partner recommendations' });
  }
});

function generateRecommendationReason(partner, currentUser) {
  const reasons = [];
  
  if (partner.university === currentUser.university) {
    reasons.push('Same university');
  }
  
  if (partner.course === currentUser.course) {
    reasons.push('Same course');
  }
  
  if (Math.abs(partner.year_of_study - currentUser.year_of_study) <= 1) {
    reasons.push('Similar academic year');
  }
  
  if (partner.shared_modules_count > 0) {
    reasons.push(`${partner.shared_modules_count} shared modules`);
  }
  
  if (partner.rating >= 4) {
    reasons.push('Highly rated');
  }
  
  return reasons.length > 0 ? reasons.join(', ') : 'Potential study partner';
}

function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

module.exports = router;