const express = require('express')
const { CosmosClient } = require('@azure/cosmos')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = cosmosClient.database('StudyBuddyDB')
const container = database.container('Users')

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { resource: user } = await container.item(req.user.id, req.user.university).read()
    
    if (!user) {
      // Create user profile from Azure AD claims
      const newUser = {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        university: req.user.university,
        course: req.user.course,
        partitionKey: req.user.university,
        profile: {
          subjects: [],
          studyPreferences: {
            preferredTimes: [],
            studyStyle: 'visual',
            groupSize: 'medium'
          },
          availability: {}
        },
        statistics: {
          totalStudyHours: 0,
          sessionsAttended: 0,
          topicsCompleted: 0
        },
        createdAt: new Date().toISOString()
      }
      
      await container.items.create(newUser)
      return res.json(newUser)
    }
    
    res.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user profile' })
  }
})

// Update user profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { resource: existingUser } = await container.item(req.user.id, req.user.university).read()
    
    const updatedUser = {
      ...existingUser,
      ...req.body,
      id: req.user.id, // Prevent ID change
      email: req.user.email, // Prevent email change
      updatedAt: new Date().toISOString()
    }
    
    const { resource: user } = await container.item(req.user.id, req.user.university).replace(updatedUser)
    res.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user profile' })
  }
})

module.exports = router