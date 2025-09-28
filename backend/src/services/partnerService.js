// services/partnerService.js
const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);

// Users container
let containerPromise = (async () => {
  const { database } = await cosmosClient.databases.createIfNotExists({
    id: 'StudyBuddyDB',
    throughput: 400,
  });
  const { container } = await database.containers.createIfNotExists({
    id: 'Users',
    partitionKey: { paths: ['/id'] },
  });
  return container;
})();

// NEW: Connections container (stores connection requests / accepted links)
let connectionsContainerPromise = (async () => {
  const { database } = await cosmosClient.databases.createIfNotExists({
    id: 'StudyBuddyDB',
    throughput: 400,
  });
  const { container } = await database.containers.createIfNotExists({
    id: 'Connections',
    partitionKey: { paths: ['/id'] },
  });
  return container;
})();

/**
 * GET /api/v1/partners
 * Returns the current user's "buddies" — users with ACCEPTED connections
 * (either requests you sent that were accepted, or requests you accepted).
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const connectionsContainer = await connectionsContainerPromise;

    // Find accepted connections where current user is requester or recipient
    const { resources: links } = await connectionsContainer.items
      .query({
        query: `
          SELECT c.id, c.requesterId, c.recipientId, c.status, c.createdAt, c.updatedAt
          FROM c
          WHERE c.status = @accepted
          AND (c.requesterId = @uid OR c.recipientId = @uid)
        `,
        parameters: [
          { name: '@accepted', value: 'accepted' },
          { name: '@uid', value: userId },
        ],
      })
      .fetchAll();

    // Extract the "other side" of each accepted connection
    const buddyIds = Array.from(
      new Set(links.map((c) => (c.requesterId === userId ? c.recipientId : c.requesterId)))
    );

    if (buddyIds.length === 0) {
      return res.json([]);
    }

    // Fetch users for those IDs
    const usersContainer = await containerPromise;
    const { resources: buddies } = await usersContainer.items
      .query({
        query: `
          SELECT * FROM users u
          WHERE ARRAY_CONTAINS(@ids, u.id)
        `,
        parameters: [{ name: '@ids', value: buddyIds }],
      })
      .fetchAll();

    // Normalize response minimally (keep most user fields intact)
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
