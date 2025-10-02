// app.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { azureConfig } from './config/azureConfig';

dotenv.config();

// Only relax TLS in local dev
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import userService from './services/userService';
import partnerService from './services/partnerService';
import groupService from './services/groupService';
import progressService from './services/progressService';
import chatService from './services/chatService';
import courseService from './services/courseService';
import moduleService from './services/moduleService';
import sessionService from './services/sessionService';
import notificationService from './services/notificationService';

const app = express();

// If running behind a proxy (Azure, Nginx), this gives correct client IPs for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = azureConfig.getCorsOrigins();
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      console.warn('Blocked CORS request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // per IP per window
  standardHeaders: true, // add RateLimit-* headers
  legacyHeaders: false, // remove X-RateLimit-*
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check with Azure services
app.get('/health', async (req: Request, res: Response) => {
  try {
    const azureHealth = await azureConfig.healthCheck();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      azure: azureHealth,
    });
  } catch {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

(async () => {
  try {
    console.log('🔄 Initializing Azure services...');
    let dbOk = false,
      storageOk = false,
      pubsubOk = false;
    try {
      await azureConfig.getDatabaseConfig();
      dbOk = true;
    } catch {}
    try {
      await azureConfig.getBlobServiceClient();
      storageOk = true;
    } catch {}
    try {
      await azureConfig.getWebPubSubClient();
      pubsubOk = true;
    } catch {}

    if (dbOk) console.log('✅ Connected to Azure SQL (via Azure Config)');
    else console.warn('⚠️ Could not connect to Azure SQL');
    if (storageOk) console.log('✅ Connected to Azure Storage (via Azure Config)');
    else console.warn('⚠️ Could not connect to Azure Storage');
    if (pubsubOk) console.log('✅ Connected to Azure Web PubSub (via Azure Config)');
    else console.warn('⚠️ Could not connect to Azure Web PubSub');

    await azureConfig.healthCheck();
  } catch (error) {
    console.error('Error during initialization:', error);
  }

  const PORT = process.env.PORT || 5000;
  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
      console.log(`🚀 Study Buddy API server running on port ${PORT}`);
      console.log(`🌍 CORS enabled for: ${azureConfig.getCorsOrigins().join(', ')}`);
    });
  }
})();

// API routes
app.use('/api/v1/users', userService);
app.use('/api/v1/partners', partnerService);
app.use('/api/v1/groups', groupService);
app.use('/api/v1/progress', progressService);
app.use('/api/v1/notifications', notificationService);
app.use('/api/v1/chat', chatService);
app.use('/api/v1/courses', courseService);
app.use('/api/v1/modules', moduleService);
app.use('/api/v1/sessions', sessionService);

// Aliases (router-level logic determines "me" semantics)
app.use('/api/v1/users/me/notifications', notificationService);
app.use('/api/v1/users/me/sessions', sessionService);
app.use('/api/v1/users/me/notifications', notificationService); // alias for user-scoped path
app.use('/api/v1/users/me/sessions', sessionService); // alias for user-scoped path

// Bridge: allow POST /api/v1/groups/:groupId/sessions to create a session in that group
app.use(
  '/api/v1/groups/:groupId/sessions',
  (req: Request, res: Response, next: NextFunction) => {
    // Only need to augment POST bodies; other methods just pass through
    if (req.method === 'POST') {
      const gid = Number(req.params.groupId);
      if (!Number.isFinite(gid)) {
        return res.status(400).json({ error: 'Invalid group id' });
      }
      // Ensure backend sees a numeric FK so it doesn’t try to auto-provision a personal group
      req.body = { ...req.body, group_id: gid, groupId: gid };
    }
    next();
  },
  // Mount the same sessions router under the group path.
  // Its `POST '/'` will now serve POST /api/v1/groups/:groupId/sessions
  sessionService
);


// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

export default app;
