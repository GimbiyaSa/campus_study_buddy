const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);

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

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Mock user for testing purposes - replace with actual auth middleware
    /*req.user = {
      id: 'user126',
      email: 'test@example.com',
      name: 'Test User',
      university: 'UniXYZ',
      course: 'Computer Science'
    };*/

    const container = await containerPromise;
    const { resource: user } = await container.item(req.user.id, req.user.id).read();

    if (!user) {
      // Create user profile from Azure AD claims
      const newUser = {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        university: req.user.university,
        course: req.user.course,
        partitionKey: req.user.id,
        profile: {
          subjects: [],
          studyPreferences: {
            preferredTimes: [],
            studyStyle: 'visual',
            groupSize: 'medium',
          },
          availability: {},
        },
        statistics: {
          totalStudyHours: 0,
          sessionsAttended: 0,
          topicsCompleted: 0,
        },
        createdAt: new Date().toISOString(),
      };

      await container.items.create(newUser);
      return res.json(newUser);
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const container = await containerPromise;
    const { resource: existingUser } = await container.item(req.user.id, req.user.id).read();

    const updatedUser = {
      ...existingUser,
      ...req.body,
      id: req.user.id, // Prevent ID change
      email: req.user.email, // Prevent email change
      updatedAt: new Date().toISOString(),
    };

    const { resource: user } = await container.item(req.user.id, req.user.id).replace(updatedUser);
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

module.exports = router;
