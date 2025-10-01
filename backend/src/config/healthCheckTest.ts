import dotenv from 'dotenv';
import { azureConfig } from './azureConfig';

// Load environment from .env for standalone test runs
dotenv.config();

async function run() {
  try {
    const result = await azureConfig.healthCheck();
    console.log('Health check result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Health check failed:', err);
    process.exit(2);
  }
}

run();
