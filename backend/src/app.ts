import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { authenticateToken } from './middleware/authMiddleware';

dotenv.config();

// Import services
const userService = require('./services/userService');
const partnerService = require('./services/partnerService');
const authService = require('./services/authService');
const { setupCampusStudyBuddyDatabase } = require('./database/run_database_setup');
import progressService from './services/progressService';
import courseService from './services/courseService';
import moduleService from './services/moduleService';
import sessionService from './services/sessionService';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // For local dev with self-signed certs

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    // Allow FRONTEND_URL and any CSV in ALLOWED_ORIGINS, plus common local dev ports.
    origin: (origin, callback) => {
      const csv = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed = [
        process.env.FRONTEND_URL || '',
        ...csv,
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'https://csb-prod-app-frontend-7ndjbzgu.azurewebsites.net',
      ].filter(Boolean);
      
      // For development, allow all localhost origins
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
      
      if (allowed.includes(origin)) return callback(null, true);
      console.warn('Blocked CORS request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 1000 for dev, 100 for production
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      message: 'Campus Study Buddy API is running',
      version: '1.0.0'
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      error: error?.message || 'Unknown error'
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// API routes
app.use('/api/v1/auth', authService);
app.use('/api/v1/users', userService);
app.use('/api/v1/partners', partnerService); // Now using Azure SQL
app.use('/api/v1/sessions', sessionService);
app.use('/api/v1/progress', progressService);
app.use('/api/v1/courses', courseService);
app.use('/api/v1/modules', moduleService);

// Conditionally enable partners/groups services - now using Azure SQL for both
const hasAzureSQL = Boolean(process.env.DATABASE_CONNECTION_STRING || process.env.DB_SERVER);
if (!hasAzureSQL) {
  console.warn('Azure SQL not configured - using stub services');
  
  const groupsStub = express.Router();
  groupsStub.get('/', authenticateToken, (req: Request, res: Response) => res.json([]));
  groupsStub.get('/my-groups', authenticateToken, (req: Request, res: Response) => res.json([]));
  groupsStub.all('*', authenticateToken, (req: Request, res: Response) =>
    res.status(501).json({ error: 'Groups service requires Azure SQL Database' })
  );
  app.use('/api/v1/groups', groupsStub);
}

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

// Database setup and server start
(async () => {
  try {
    // Run DB setup only when explicitly requested to avoid long/blocking ops at startup
    // and repeated restarts causing port contention.
    if (process.env.SETUP_DB_ON_STARTUP === 'true') {
      console.log('🚀 Initializing Campus Study Buddy API (DB setup enabled)...');
      await setupCampusStudyBuddyDatabase();
      console.log('✅ Database setup completed');
    } else {
      console.log('Skipping DB setup on startup (SETUP_DB_ON_STARTUP not set)');
    }
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    // Continue anyway - database might already be set up
  }

  // Start the server regardless of setup outcome  
  const PORT = process.env.PORT || 3002;
  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
      console.log(`🎓 Study Buddy API server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  }
})();

export default app;