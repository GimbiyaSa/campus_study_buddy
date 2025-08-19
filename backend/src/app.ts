import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

dotenv.config()

import userService from './services/userService'
import partnerService from './services/partnerService'
import groupService from './services/groupService'
import progressService from './services/progressService'
import chatService from './services/chatService'

const app = express()

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})
app.use('/api/', limiter)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// API routes
app.use('/api/v1/users', userService)
app.use('/api/v1/partners', partnerService)
app.use('/api/v1/groups', groupService)
app.use('/api/v1/progress', progressService)
app.use('/api/v1/chat', chatService)

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Study Buddy API server running on port ${PORT}`)
})

export default app