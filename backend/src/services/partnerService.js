const express = require('express')
const { CosmosClient } = require('@azure/cosmos')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = cosmosClient.database('StudyBuddyDB')
const container = database.container('Users')

// Search for study partners
router.get('/search', authenticateToken, async (req, res) => {

})

module.exports = router