const express = require('express')
const { CosmosClient } = require('@azure/cosmos')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)

let containerPromise = (async () => {
  const { database } = await cosmosClient.databases.createIfNotExists({ id: 'StudyBuddyDB', throughput: 400 });
  const { container } = await database.containers.createIfNotExists({ id: 'Users', partitionKey: { paths: ['/id'] } });
  return container;
})();

// Search for study partners
router.get('/search', authenticateToken, async (req, res) => {
  try {
    /*req.user = {
      id: 'user123',
      university: 'UniXYZ',
      email: 'test@example.com',
      name: 'Test User',
      course: 'Computer Science'
    };*/

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
        { name: '@currentUserId', value: currentUser.id }
      ]
    };

    const container = await containerPromise;
    const { resources: partners } = await container.items.query(querySpec).fetchAll();


    // Filter by subjects in JS (if provided)
    let filteredPartners = partners;
    if (subjects) {
      const subjectArr = subjects.split(',');
      filteredPartners = partners.filter(partner =>
        partner.profile &&
        Array.isArray(partner.profile.subjects) &&
        partner.profile.subjects.some(s => subjectArr.includes(s))
      );
    }

    console.log('partners:', partners);
    console.log('filteredPartners:', filteredPartners);
    console.log('subjects:', subjects);

    // Calculate compatibility scores
    const scoredPartners = filteredPartners.map(partner => ({
      ...partner,
      compatibilityScore: calculateCompatibilityScore(partner, {
        subjects: subjects?.split(',') || [],
        studyStyle,
        groupSize,
        availability
      })
    })).sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    res.json(scoredPartners.slice(0, 20)); // Return top 20 matches
  } catch (error) {
    console.error('Error searching partners:', error);
    res.status(500).json({ error: 'Failed to search for partners' });
  }
})

function calculateCompatibilityScore(partner, criteria) {
  let score = 0
  
  // Subject match (40% weight)
  if (criteria.subjects.length > 0) {
    const commonSubjects = partner.profile.subjects.filter(s => 
      criteria.subjects.includes(s)
    ).length
    score += (commonSubjects / Math.max(criteria.subjects.length, partner.profile.subjects.length)) * 40
  }
  
  // Study style match (30% weight)
  if (partner.profile.studyPreferences.studyStyle === criteria.studyStyle) {
    score += 30
  }
  
  // Group size preference (20% weight)
  if (partner.profile.studyPreferences.groupSize === criteria.groupSize) {
    score += 20
  }
  
  // Activity level (10% weight)
  score += Math.min(partner.statistics.sessionsAttended / 10, 1) * 10
  
  return Math.round(score)
}

module.exports = router