const express = require('express')
const { CosmosClient } = require('@azure/cosmos')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = cosmosClient.database('StudyBuddyDB')
const progressContainer = database.container('Progress')
const usersContainer = database.container('Users')

// TODO: Implement progress tracking for study sessions
// This will include endpoints to log study hours, track topics completed, and view progress statistics

module.exports = router