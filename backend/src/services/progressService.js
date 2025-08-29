const express = require('express')
const { CosmosClient } = require('@azure/cosmos')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = cosmosClient.database('StudyBuddyDB')
//const progressContainer = database.container('Progress')
//const usersContainer = database.container('Users')

let progressContainerPromise = (async () => {
  const { database } = await cosmosClient.databases.createIfNotExists({ id: 'StudyBuddyDB', throughput: 400 });
  const { container } = await database.containers.createIfNotExists({ id: 'Progress', partitionKey: { paths: ['/id'] } });
  return container;
})();

let userContainerPromise = (async () => {
  const { database } = await cosmosClient.databases.createIfNotExists({ id: 'StudyBuddyDB', throughput: 400 });
  const { container } = await database.containers.createIfNotExists({ id: 'Users', partitionKey: { paths: ['/id'] } });
  return container;
})();

// Log study session
router.post('/sessions', authenticateToken, async (req, res) => {
  try {
    const { subject, topics, duration, notes, groupId } = req.body

    /*req.user = {
      id: 'user123',
      university: 'UniXYZ',
      email: 'test@example.com',
      name: 'Test User',
      course: 'Computer Science'
    };*/
    
    const progressEntry = {
      id: req.user.id,
      userId: req.user.id,
      partitionKey: req.user.id,
      type: 'study_session',
      subject,
      topics: topics || [],
      duration:60, // in minutes
      notes,
      groupId,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString()
    }
    
    const progressContainer = await progressContainerPromise;
    const { resource: createdEntry } = await progressContainer.items.create(progressEntry)
    
    // Update user statistics
    await updateUserStatistics(req.user.id, req.user.university, {
      totalStudyHours: duration / 60,
      topicsCompleted: topics.length
    })
    
    res.status(201).json(createdEntry)
  } catch (error) {
    console.error('Error logging progress:', error)
    res.status(500).json({ error: 'Failed to log progress' })
  }
})

// Get progress analytics
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    /*req.user = {
      id: 'user123',
      university: 'UniXYZ',
      email: 'test@example.com',
      name: 'Test User',
      course: 'Computer Science'
    };*/
    
    const querySpec = {
      query: `
        SELECT * FROM progress p 
        WHERE p.userId = @userId 
        AND p.timestamp >= @startDate 
        ORDER BY p.timestamp DESC
      `,
      parameters: [
        { name: '@userId', value: req.user.id },
        { name: '@startDate', value: startDate.toISOString() }
      ]
    }
    
    const progressContainer = await progressContainerPromise;
    const { resources: progressData } = await progressContainer.items.query(querySpec).fetchAll()
    
    // Calculate analytics
    const analytics = {
      totalSessions: progressData.length,
      totalHours: progressData.reduce((sum, p) => sum + (p.duration || 0), 0) / 60,
      topicsStudied: [...new Set(progressData.flatMap(p => p.topics || []))],
      dailyBreakdown: generateDailyBreakdown(progressData, daysBack),
      subjectBreakdown: generateSubjectBreakdown(progressData)
    }
    
    res.json(analytics)
  } catch (error) {
    console.error('Error fetching analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

async function updateUserStatistics(userId, university, updates) {
  try {
    usersContainer = await userContainerPromise;
    const { resource: user } = await usersContainer.item(userId, university).read()
    
    user.statistics.totalStudyHours = (user.statistics.totalStudyHours || 0) + updates.totalStudyHours
    user.statistics.topicsCompleted = (user.statistics.topicsCompleted || 0) + updates.topicsCompleted
    user.statistics.lastStudySession = new Date().toISOString()
    
    usersContainer, progressContainer = await containerPromise;
    await usersContainer.item(userId, university).replace(user)
  } catch (error) {
    console.error('Error updating user statistics:', error)
  }
}

function generateDailyBreakdown(progressData, days) {
  const breakdown = {}
  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateKey = date.toISOString().split('T')[0]
    breakdown[dateKey] = {
      sessions: 0,
      hours: 0
    }
  }
  
  progressData.forEach(entry => {
    const date = entry.date
    if (breakdown[date]) {
      breakdown[date].sessions++
      breakdown[date].hours += (entry.duration || 0) / 60
    }
  })
  
  return breakdown
}

function generateSubjectBreakdown(progressData) {
  const breakdown = {}
  progressData.forEach(entry => {
    if (entry.subject) {
      breakdown[entry.subject] = breakdown[entry.subject] || { sessions: 0, hours: 0 }
      breakdown[entry.subject].sessions++
      breakdown[entry.subject].hours += (entry.duration || 0) / 60
    }
  })
  return breakdown
}

module.exports = router