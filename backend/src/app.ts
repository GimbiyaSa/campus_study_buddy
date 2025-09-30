import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { azureConfig } from './config/azureConfig';

dotenv.config();

import userService from './services/userService';
import partnerService from './services/partnerService';
import groupService from './services/groupService';
import progressService from './services/progressService';
import chatService from './services/chatService';
import courseService from './services/courseService';
import moduleService from './services/moduleService';
import sessionService from './services/sessionService';
import notificationService from './services/notificationService';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // For local dev with self-signed certs

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    // Use Azure config for CORS origins
    origin: (origin, callback) => {
      const allowed = azureConfig.getCorsOrigins();
      
      // If no origin (same-origin or curl), allow it
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      
      // In production, you may want to reject unknown origins.
      console.warn('Blocked CORS request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 100 requests per windowMs
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
      azure: azureHealth
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

(async () => {
  try {
    // Initialize Azure services first
    console.log('🔄 Initializing Azure services...');
    const azureHealth = await azureConfig.healthCheck();
    console.log('Azure Services Status:', azureHealth);
    
    // Skip database setup during normal startup
    console.log('⚠️ Database setup skipped (tables already exist)');
    console.log('💡 To setup database manually, run: node src/database/run_database_setup.js');
    
  } catch (error) {
    console.error('Error during initialization:', error);
  }

  // Start the server regardless of setup outcome
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

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

/*const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Study Buddy API server running on port ${PORT}`);
  });
}*/

export default app;
