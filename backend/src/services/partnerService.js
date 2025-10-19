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
        webPubSubClient = new WebPubSubServiceClient(
          process.env.WEB_PUBSUB_CONNECTION_STRING,
          'studybuddy'
        );
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
// Tokenize helper: split into normalized tokens (letters/digits), lowercase, basic stemming (naive)
function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/(ing|ers|er|s)$/g, ''))
    .filter(Boolean);
}

function jaccardSimilarity(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size || 1;
  return inter / uni;
}

function calculateEnhancedCompatibilityScore(
  partnerPreferences,
  criteria,
  sharedCoursesCount = 0,
  partnerData = {},
  currentUser = {}
) {
  // New weighting (sum to 100):
  // Shared courses: up to 60, Program/course similarity (Jaccard): up to 30,
  // Year proximity: up to 7, Same university: up to 3. No other hidden factors.
  let score = 0;
  const breakdown = [];

  // 1) Shared courses (max 60)
  const clampedShared = Math.max(0, Math.min(sharedCoursesCount, 4));
  if (clampedShared > 0) {
    const sharedPts = clampedShared * 15; // 1->15, 2->30, 3->45, 4+->60
    score += sharedPts;
    breakdown.push(`Shared courses x${sharedCoursesCount}: +${sharedPts}`);
  }

  // 2) Program/course similarity via Jaccard (max 30)
  let programSimilarity = 0;
  if (partnerData.course && criteria.course) {
    const a = tokenize(partnerData.course);
    const b = tokenize(criteria.course);
    programSimilarity = jaccardSimilarity(a, b); // 0..1
    const progPts = Math.round(programSimilarity * 30);
    if (progPts > 0) {
      score += progPts;
      breakdown.push(`Program similarity ${(programSimilarity * 100).toFixed(0)}%: +${progPts}`);
    }
  }

  // 3) Year of study proximity (max 7)
  let yearDiff = null;
  if (partnerData.yearOfStudy && criteria.yearOfStudy) {
    yearDiff = Math.abs(partnerData.yearOfStudy - criteria.yearOfStudy);
    if (yearDiff === 0) {
      score += 7;
      breakdown.push('Same year: +7');
    } else if (yearDiff === 1) {
      score += 4;
      breakdown.push('Year proximity (±1): +4');
    } else if (yearDiff === 2) {
      score += 2;
      breakdown.push('Year proximity (±2): +2');
    }
  }

  // 4) Same university (max 3)
  let sameUniversity = false;
  if (
    partnerData.university &&
    criteria.university &&
    partnerData.university === criteria.university
  ) {
    sameUniversity = true;
    score += 3;
    breakdown.push('Same university: +3');
  }

  // Final score 0..100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: finalScore,
    breakdown,
    details: {
      sharedCoursesCount,
      programSimilarity,
      yearDiff,
      sameUniversity,
    },
  };
}
// Search potential study partners
router.get('/search', authenticateToken, async (req, res) => {
  try {
    if (!pool) await initializeDatabase();

    const currentUser = req.user || {};
    const currentUserId = currentUser.id;

    // Parse query params (tolerant to arrays/strings)
    let { university, search, subjects, studyStyle, groupSize, availability } = req.query || {};
    university = typeof university === 'string' ? university : undefined;
    search = typeof search === 'string' ? search : undefined;
    subjects = typeof subjects === 'string' ? subjects : undefined;
    studyStyle = typeof studyStyle === 'string' ? studyStyle : undefined;
    groupSize = typeof groupSize === 'string' ? groupSize : undefined;
    availability = typeof availability === 'string' ? availability : undefined;

    let currentUserPreferences = {};
    try {
      if (currentUser.study_preferences) {
        currentUserPreferences =
          typeof currentUser.study_preferences === 'string'
            ? JSON.parse(currentUser.study_preferences)
            : currentUser.study_preferences;
      }
    } catch (e) {
      console.warn('Failed to parse current user study preferences');
    }

    const request = pool.request();
    request.input('currentUserId', sql.NVarChar(255), currentUserId);

    // Get current user's stats for better matching
    const currentUserStatsQuery = await request.query(`
      SELECT 
        (SELECT COUNT(*) FROM dbo.user_modules WHERE user_id = @currentUserId AND enrollment_status = 'active') as activeModulesCount,
        ISNULL((SELECT SUM(hours_logged) FROM dbo.study_hours WHERE user_id = @currentUserId), 0) as totalStudyHours
    `);

    if (currentUserStatsQuery.recordset.length > 0) {
      currentUser.activeModulesCount = currentUserStatsQuery.recordset[0].activeModulesCount;
      currentUser.totalStudyHours = currentUserStatsQuery.recordset[0].totalStudyHours;
    }

    // Enhanced query to find potential partners with SMART matching based on:
    // 1. Shared courses (fuzzy matching on module names, codes, descriptions)
    // 2. Shared topics within courses
    // 3. Similar study progress and hours
    // 4. Module descriptions for better context matching
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
        
        -- Get ALL user's courses with details (for display)
        STUFF((
          SELECT DISTINCT ', ' + m.module_name
          FROM dbo.user_modules um_all
          INNER JOIN dbo.modules m ON um_all.module_id = m.module_id
          WHERE um_all.user_id = u.user_id AND um_all.enrollment_status = 'active'
          FOR XML PATH('')
        ), 1, 2, '') as allCourses,
        
        -- Get matched courses with match details (for suggestions)
        -- This includes module name, code, AND description fuzzy matching
        STUFF((
          SELECT DISTINCT ', ' + m1.module_name
          FROM dbo.user_modules um1
          INNER JOIN dbo.modules m1 ON um1.module_id = m1.module_id
          WHERE um1.user_id = u.user_id
          AND um1.enrollment_status = 'active'
          AND EXISTS (
            SELECT 1
            FROM dbo.user_modules um2
            INNER JOIN dbo.modules m2 ON um2.module_id = m2.module_id
            WHERE um2.user_id = @currentUserId
            AND um2.enrollment_status = 'active'
            AND (
              -- Exact module match
              um1.module_id = um2.module_id
              OR
              -- Fuzzy match: similar module names
              (
                LOWER(m1.module_name) LIKE '%' + LOWER(m2.module_name) + '%'
                OR LOWER(m2.module_name) LIKE '%' + LOWER(m1.module_name) + '%'
                OR EXISTS (
                  -- Word-level matching (e.g., "Math Science" matches "Math" OR "Science")
                  SELECT value FROM STRING_SPLIT(LOWER(ISNULL(m2.module_name, '')), ' ')
                  WHERE LEN(value) > 2
                  AND LOWER(m1.module_name) LIKE '%' + value + '%'
                )
              )
              OR
              -- Module code similarity
              (
                m1.module_code IS NOT NULL 
                AND m2.module_code IS NOT NULL
                AND (
                  LOWER(m1.module_code) LIKE LOWER(LEFT(m2.module_code, 3)) + '%'
                  OR LOWER(m2.module_code) LIKE LOWER(LEFT(m1.module_code, 3)) + '%'
                )
              )
              OR
              -- Description similarity (for better context matching)
              (
                m1.description IS NOT NULL 
                AND m2.description IS NOT NULL
                AND LEN(CAST(m1.description AS NVARCHAR(MAX))) > 20
                AND LEN(CAST(m2.description AS NVARCHAR(MAX))) > 20
                AND (
                  LOWER(CAST(m1.description AS NVARCHAR(MAX))) LIKE '%' + LOWER(LEFT(CAST(m2.description AS NVARCHAR(MAX)), 50)) + '%'
                  OR LOWER(CAST(m2.description AS NVARCHAR(MAX))) LIKE '%' + LOWER(LEFT(CAST(m1.description AS NVARCHAR(MAX)), 50)) + '%'
                )
              )
            )
          )
          FOR XML PATH('')
        ), 1, 2, '') as sharedCourses,
        
        -- Count shared topics within matched courses (deeper matching)
        (
          SELECT COUNT(DISTINCT t1.topic_name)
          FROM dbo.user_modules um1
          INNER JOIN dbo.topics t1 ON um1.module_id = t1.module_id
          WHERE um1.user_id = u.user_id
          AND EXISTS (
            SELECT 1
            FROM dbo.user_modules um2
            INNER JOIN dbo.topics t2 ON um2.module_id = t2.module_id
            WHERE um2.user_id = @currentUserId
            AND (
              LOWER(t1.topic_name) = LOWER(t2.topic_name)
              OR LOWER(t1.topic_name) LIKE '%' + LOWER(t2.topic_name) + '%'
              OR LOWER(t2.topic_name) LIKE '%' + LOWER(t1.topic_name) + '%'
            )
          )
        ) as sharedTopicsCount,
        
        -- Total study hours (indicates engagement level)
        ISNULL((
          SELECT SUM(sh.hours_logged)
          FROM dbo.study_hours sh
          WHERE sh.user_id = u.user_id
        ), 0) as totalStudyHours,
        
        -- Active modules count
        (
          SELECT COUNT(*)
          FROM dbo.user_modules um
          WHERE um.user_id = u.user_id AND um.enrollment_status = 'active'
        ) as activeModulesCount,
        
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
      -- CRITICAL: Only show users who have at least one active course
      AND EXISTS (
        SELECT 1 
        FROM dbo.user_modules um 
        WHERE um.user_id = u.user_id 
        AND um.enrollment_status = 'active'
      )
    `;

    // Add university filter if provided
    if (university) {
      request.input('university', sql.NVarChar(255), university);
      query += ` AND u.university = @university`;
    }

    // Add name/email/course search if provided
    if (search && search.trim()) {
      request.input('searchTerm', sql.NVarChar(255), `%${search.trim()}%`);
      query += ` AND (u.first_name LIKE @searchTerm OR u.last_name LIKE @searchTerm OR u.email LIKE @searchTerm OR u.course LIKE @searchTerm OR EXISTS (
        SELECT 1 FROM dbo.user_modules um_search 
        INNER JOIN dbo.modules m_search ON um_search.module_id = m_search.module_id 
        WHERE um_search.user_id = u.user_id 
        AND um_search.enrollment_status = 'active'
        AND (m_search.module_name LIKE @searchTerm OR m_search.module_code LIKE @searchTerm)
      ))`;
    }

    // Limit results
    query += ` ORDER BY u.created_at DESC`;

    console.log('🔍 Executing partner search query...');
    const result = await request.query(query);
    const partners = result.recordset;

    console.log(`📊 Found ${partners.length} potential partners`);

    // Format the response with enhanced compatibility scoring
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

      const partnerData = {
        name:
          [partner.first_name, partner.last_name].filter(Boolean).join(' ') ||
          partner.email ||
          'Unknown',
        university: partner.university,
        course: partner.course,
        yearOfStudy: partner.year_of_study,
        bio: partner.bio,
        activeModulesCount: partner.activeModulesCount || 0,
        totalStudyHours: partner.totalStudyHours || 0,
      };

      const searchCriteria = {
        subjects: subjects?.split(',') || [],
        studyStyle: studyStyle || currentUserPreferences.studyStyle,
        groupSize: groupSize || currentUserPreferences.groupSize,
        availability: availability || currentUserPreferences.availability,
        university: university || currentUser.university,
        course: currentUser.course,
        yearOfStudy: currentUser.year_of_study,
      };

      const sharedCoursesCount = partner.sharedCourses
        ? partner.sharedCourses.split(', ').filter(Boolean).length
        : 0;

      // Get all courses for this partner
      const allCourses = partner.allCourses ? partner.allCourses.split(', ').filter(Boolean) : [];

      // Get shared topics count
      const sharedTopicsCount = partner.sharedTopicsCount || 0;

      // Calculate match percentage for "Suggested for you" section
      // This shows the user WHAT percentage was matched
      const currentUserModulesCount = currentUser.activeModulesCount || 1;
      const partnerModulesCount = partner.activeModulesCount || 1;
      const maxModules = Math.max(currentUserModulesCount, partnerModulesCount);

      // Course overlap as percentage (0-100)
      const courseMatchPercent =
        maxModules > 0 ? Math.round((sharedCoursesCount / maxModules) * 100) : 0;

      // Topic overlap bonus (0-30 extra points)
      const topicMatchBonus = Math.min(sharedTopicsCount * 1.5, 30);

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

      // Compute compatibility score with improved weighting and capture breakdown
      const {
        score: compatibilityScore,
        breakdown: scoreBreakdown,
        details,
      } = calculateEnhancedCompatibilityScore(
        studyPreferences,
        searchCriteria,
        sharedCoursesCount,
        partnerData,
        currentUser // pass current user for better reasoning
      );

      // Build SMART match reasons based on actual data
      const matchReasons = [];

      // Courses match
      if (details.sharedCoursesCount > 0) {
        matchReasons.push(
          `${details.sharedCoursesCount} similar course${details.sharedCoursesCount > 1 ? 's' : ''}`
        );
      }

      // Topics match (shows deeper alignment)
      if (sharedTopicsCount > 0) {
        matchReasons.push(`${sharedTopicsCount} shared topic${sharedTopicsCount > 1 ? 's' : ''}`);
      }

      // Program/field similarity
      if (details.programSimilarity >= 0.6) {
        matchReasons.push('Similar program/field');
      } else if (
        partnerData.course &&
        currentUser.course &&
        partnerData.course === currentUser.course
      ) {
        matchReasons.push('Same program');
      }

      // Year alignment
      if (typeof details.yearDiff === 'number' && details.yearDiff === 0) {
        matchReasons.push('Same year');
      } else if (typeof details.yearDiff === 'number' && details.yearDiff === 1) {
        matchReasons.push('Similar year');
      }

      // Study engagement level (if both are active studiers)
      if (partnerData.totalStudyHours > 10 && currentUser.totalStudyHours > 10) {
        matchReasons.push('Active studier');
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
        // Only include shared courses for matching/suggestions
        sharedCourses: partner.sharedCourses
          ? partner.sharedCourses.split(', ').filter(Boolean)
          : [],
        // Include ALL courses for display purposes
        allCourses: allCourses,
        sharedTopics: [],
        sharedTopicsCount: sharedTopicsCount, // Number of shared topics
        courseMatchPercent: courseMatchPercent, // Percentage of course overlap
        matchReasons,
        recommendationReason:
          matchReasons.length > 0
            ? matchReasons.join(' • ')
            : 'Active student looking for study partners',
        connectionStatus,
        connectionId,
        isPendingSent,
        isPendingReceived,
        studyHours: partnerData.totalStudyHours,
        rating: 0,
        weeklyHours: 0,
        studyStreak: 0,
        activeGroups: 0,
        sessionsAttended: 0,
        profile: {
          subjects: partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean) : [],
          studyStyle: studyPreferences.studyStyle || null,
          groupSize: studyPreferences.groupSize || null,
          availability: studyPreferences.availability || null,
        },
        statistics: {
          sessionsAttended: 0,
          completedStudies: 0,
        },
        compatibilityScore,
        scoreBreakdown,
        // Flag to help frontend identify if this is a valid suggestion
        hasMatchedCourses: sharedCoursesCount > 0,
      };
    });

    // Sort ALL partners by compatibility score
    // CRITICAL: For suggestions, we ONLY want partners with matched courses
    // For "All partners" discovery, show everyone
    const sortedPartners = formattedPartners
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, 100); // Return up to 100 partners

    console.log(
      `🎯 Top matches with scores:`,
      sortedPartners.slice(0, 3).map((p) => ({
        name: p.name,
        score: p.compatibilityScore,
        university: p.university,
        course: p.course,
        sharedCourses: p.sharedCourses.length,
      }))
    );

    res.json(sortedPartners);
  } catch (error) {
    console.error('❌ Error searching partners:', error);
    res.status(500).json({ error: 'Failed to search for partners' });
  }
});

// Get accepted study partners (current connections)
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (!pool) await initializeDatabase();

    const currentUser = req.user || {};
    const currentUserId = currentUser.id;

    const request = pool.request();
    request.input('currentUserId', sql.NVarChar(255), currentUserId);

    const query = `
      SELECT 
        pm.match_id as connectionId,
        CASE WHEN pm.requester_id = @currentUserId THEN pm.matched_user_id ELSE pm.requester_id END as id,
        u.email,
        u.first_name,
        u.last_name,
        u.university,
        u.course,
        u.year_of_study,
        u.bio,
        u.study_preferences,
        'accepted' as connectionStatus,
        -- Get ALL user's courses
        STUFF((
          SELECT DISTINCT ', ' + m.module_name
          FROM dbo.user_modules um_all
          INNER JOIN dbo.modules m ON um_all.module_id = m.module_id
          WHERE um_all.user_id = u.user_id
          FOR XML PATH('')
        ), 1, 2, '') as allCourses,
        -- Shared courses with the other user (for reference)
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
      FROM partner_matches pm
      INNER JOIN users u ON u.user_id = CASE WHEN pm.requester_id = @currentUserId THEN pm.matched_user_id ELSE pm.requester_id END
      WHERE (pm.requester_id = @currentUserId OR pm.matched_user_id = @currentUserId)
      AND pm.match_status = 'accepted'
      ORDER BY pm.updated_at DESC
    `;

    const result = await request.query(query);
    const partners = result.recordset;

    const formatted = partners.map((partner) => {
      let studyPreferences = {};
      try {
        if (partner.study_preferences) {
          studyPreferences =
            typeof partner.study_preferences === 'string'
              ? JSON.parse(partner.study_preferences)
              : partner.study_preferences;
        }
      } catch {}

      const partnerData = {
        name:
          [partner.first_name, partner.last_name].filter(Boolean).join(' ') ||
          partner.email ||
          'Unknown',
        university: partner.university,
        course: partner.course,
        yearOfStudy: partner.year_of_study,
        bio: partner.bio,
      };

      // Compute a score for consistency, though UI may not use it here
      const { score: compatibilityScore, breakdown: scoreBreakdown } =
        calculateEnhancedCompatibilityScore(
          studyPreferences,
          {
            university: currentUser.university,
            course: currentUser.course,
            yearOfStudy: currentUser.year_of_study,
          },
          partner.sharedCourses ? partner.sharedCourses.split(', ').filter(Boolean).length : 0,
          partnerData,
          currentUser
        );

      return {
        id: partner.id,
        name: partnerData.name,
        email: partner.email,
        university: partner.university,
        course: partner.course,
        yearOfStudy: partner.year_of_study,
        bio: partner.bio,
        studyPreferences,
        // Return ALL courses for accepted partners (buddies)
        sharedCourses: partner.allCourses ? partner.allCourses.split(', ').filter(Boolean) : [],
        allCourses: partner.allCourses ? partner.allCourses.split(', ').filter(Boolean) : [],
        sharedTopics: [],
        connectionStatus: 'accepted',
        connectionId: partner.connectionId,
        isPendingSent: false,
        isPendingReceived: false,
        compatibilityScore,
        scoreBreakdown,
        matchReasons: [],
        recommendationReason: undefined,
        studyHours: 0,
        rating: 0,
        weeklyHours: 0,
        studyStreak: 0,
        activeGroups: 0,
        sessionsAttended: 0,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('❌ Error fetching partners:', error);
    res.status(500).json({ error: 'Failed to fetch partners' });
  }
});

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

    console.log('🤝 Processing partner match request:', {
      requesterId,
      matched_user_id,
      module_id,
      message,
    });

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
        error: `A ${status} connection already exists between these users`,
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
    const requesterName = requesterInfo
      ? [requesterInfo.first_name, requesterInfo.last_name].filter(Boolean).join(' ') ||
        requesterInfo.email
      : 'Unknown User';

    // Use provided module_id or get default
    let targetModuleId = module_id;
    if (!targetModuleId) {
      const moduleRequest = pool.request();
      const moduleResult = await moduleRequest.query(
        `SELECT TOP 1 module_id FROM dbo.modules WHERE is_active = 1`
      );
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
            timestamp: newRequest.created_at,
          },
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
      createdAt: newRequest.created_at,
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
      headers: req.headers,
    });

    res.json({
      message: 'Test endpoint working',
      user: req.user,
      body: req.body,
      timestamp: new Date().toISOString(),
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
      userInfo: { id: req.user.id, email: req.user.email },
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
      
      // Provide more specific error messages based on status
      let errorMessage = '';
      let errorCode = '';
      
      switch (status) {
        case 'pending':
          errorMessage = 'A buddy request is already pending between these users';
          errorCode = 'REQUEST_PENDING';
          break;
        case 'accepted':
          errorMessage = 'These users are already connected as study buddies';
          errorCode = 'ALREADY_CONNECTED';
          break;
        case 'declined':
          errorMessage = 'This person has declined your previous buddy request';
          errorCode = 'REQUEST_DECLINED';
          break;
        default:
          errorMessage = `A ${status} connection already exists between these users`;
          errorCode = 'CONNECTION_EXISTS';
      }
      
      return res.status(400).json({
        error: errorMessage,
        code: errorCode,
        status: status,
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

    // Send Web PubSub notification to recipient
    if (webPubSubClient) {
      try {
        await webPubSubClient.sendToUser(recipientId, {
          type: 'partner_request',
          data: {
            requestId: newRequest.match_id,
            requesterId: requesterId,
            requesterName:
              req.user.name ||
              `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() ||
              req.user.email,
            requesterUniversity: req.user.university,
            requesterCourse: req.user.course,
            message: message,
            timestamp: new Date().toISOString(),
          },
        });
        console.log('✅ Web PubSub notification sent to user:', recipientId);
      } catch (pubsubError) {
        console.warn('⚠️ Failed to send Web PubSub notification:', pubsubError);
        // Don't fail the request if notification fails
      }
    } else {
      console.warn('⚠️ Web PubSub client not available, skipping notification');
    }

    console.log('✅ Buddy request sent successfully');

    // Send email notification to recipient (non-blocking)
    try {
      // Get recipient and sender info for email
      const recipientRes = await pool
        .request()
        .input('recipientId', sql.NVarChar(255), recipientId)
        .query('SELECT email, first_name, last_name FROM users WHERE user_id = @recipientId');

      const senderRes = await pool.request().input('senderId', sql.NVarChar(255), requesterId)
        .query(`
          SELECT u.first_name + ' ' + u.last_name as name, u.email, u.university, u.course, u.bio,
                 COALESCE((SELECT SUM(hours_spent) FROM study_hours WHERE user_id = u.user_id), 0) as studyHours
          FROM users u 
          WHERE u.user_id = @senderId
        `);

      if (recipientRes.recordset.length > 0 && senderRes.recordset.length > 0) {
        const recipientEmail = recipientRes.recordset[0].email;
        const senderInfo = senderRes.recordset[0];
        senderInfo.id = requesterId;
        
        // Log buddy request notification (Logic Apps removed)
        console.log('📧 Buddy request notification:', {
          recipient: recipientEmail,
          sender: senderInfo.first_name + ' ' + senderInfo.last_name,
          message: message
        });
      }
    } catch (err) {
      console.error('⚠️ Buddy request email notification failed:', err.message);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      id: newRequest.match_id,
      status: 'pending',
      message: 'Buddy request sent successfully',
      createdAt: newRequest.created_at,
    });
  } catch (error) {
    console.error('❌ Error sending buddy request:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      state: error.state,
      number: error.number,
    });

    res.status(500).json({
      error: 'Failed to send buddy request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Get pending invitations for current user
router.get('/pending-invitations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 Fetching pending invitations for user:', userId);

    // Get all pending requests where current user is the recipient
    const request = pool.request();
    request.input('userId', sql.NVarChar(255), userId);

    const result = await request.query(`
      SELECT 
        pm.match_id as requestId,
        pm.requester_id as requesterId,
        u.first_name + ' ' + u.last_name as requesterName,
        u.email as requesterEmail,
        u.university as requesterUniversity,
        u.course as requesterCourse,
        pm.created_at as timestamp
      FROM partner_matches pm
      INNER JOIN users u ON pm.requester_id = u.user_id
      WHERE pm.matched_user_id = @userId 
      AND pm.match_status = 'pending'
      ORDER BY pm.created_at DESC
    `);

    console.log(`📋 Found ${result.recordset.length} pending invitations`);
    res.json(result.recordset);
  } catch (error) {
    console.error('❌ Error fetching pending invitations:', error);
    res.status(500).json({ error: 'Failed to fetch pending invitations' });
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
            timestamp: new Date().toISOString(),
          },
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
      status: 'accepted',
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
            timestamp: new Date().toISOString(),
          },
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
      status: 'declined',
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
