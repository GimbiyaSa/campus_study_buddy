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
      console.log('✅ Connected to Azure SQL Database for Partner Service (via Azure Config)');
    } catch (azureError) {
      console.warn('Azure config not available, using environment variables');
      // Fallback to connection string
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
        console.log('✅ Connected to Azure SQL Database for Partner Service (via connection string)');
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
    const userId = req.user.id;
    const request = pool.request();
    request.input('userId', sql.NVarChar, userId);

    // Find accepted connections where current user is requester or recipient
    const connectionsResult = await request.query(`
      SELECT 
        pm.match_id as id,
        pm.user_id as requesterId,
        pm.matched_user_id as recipientId,
        pm.status,
        pm.created_at as createdAt,
        pm.updated_at as updatedAt
      FROM partner_matches pm
      WHERE pm.status = 'accepted'
      AND (pm.user_id = @userId OR pm.matched_user_id = @userId)
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
    const payload = buddies.map((u) => ({
      id: u.id,
      name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown',
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

// Search for study partners (unchanged)
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { subjects, studyStyle, groupSize, availability } = req.query;
    const currentUser = req.user;

    // Query for users in the same university and not the current user
    let querySpec = {
      query: `
        SELECT * FROM users u 
        WHERE u.university = @university 
        AND u.id != @currentUserId
      `,
      parameters: [
        { name: '@university', value: currentUser.university },
        { name: '@currentUserId', value: currentUser.id },
      ],
    };

    const container = await containerPromise;
    const { resources: partners } = await container.items.query(querySpec).fetchAll();

    // Filter by subjects in JS (if provided)
    let filteredPartners = partners;
    if (subjects) {
      const subjectArr = subjects.split(',');
      filteredPartners = partners.filter(
        (partner) =>
          partner.profile &&
          Array.isArray(partner.profile.subjects) &&
          partner.profile.subjects.some((s) => subjectArr.includes(s))
      );
    }

    // Calculate compatibility scores
    const scoredPartners = filteredPartners
      .map((partner) => ({
        ...partner,
        compatibilityScore: calculateCompatibilityScore(partner, {
          subjects: subjects?.split(',') || [],
          studyStyle,
          groupSize,
          availability,
        }),
      }))
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    res.json(scoredPartners.slice(0, 20)); // Return top 20 matches
  } catch (error) {
    console.error('Error searching partners:', error);
    res.status(500).json({ error: 'Failed to search for partners' });
  }
});

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

module.exports = router;
