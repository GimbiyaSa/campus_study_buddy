require('dotenv').config();
const DatabaseConnection = require('./database_setup');

async function checkDatabaseHealth() {
  // Use Azure configuration for database connection
  let dbConfig;
  
  try {
    const { azureConfig } = require('../config/azureConfig');
    dbConfig = await azureConfig.getLegacyDatabaseConfig();
    console.log('✅ Using Azure configuration for database health check');
  } catch (error) {
    console.log('⚠️ Azure config not available, using environment variables');
    dbConfig = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || 'csb-prod-sql-san-7ndjbzgu.database.windows.net',
      database: process.env.DB_DATABASE || 'csb-prod-sqldb-7ndjbzgu'
    };
  }

  console.log('Starting Database Health Check...\n');
  console.log(`Connecting to: ${dbConfig.server}/${dbConfig.database || 'csb-prod-sqldb-7ndjbzgu'}`);

  const dbConnection = new DatabaseConnection(dbConfig);

  try {
    await dbConnection.connect();
    const isHealthy = await dbConnection.checkHealth();
    
    if (isHealthy) {
      console.log('\n✅ Database is healthy and ready!');
    } else {
      console.log('\n❌ Database health check failed');
    }
    
    return isHealthy;
    
  } catch (error) {
    console.error('\n❌ Database connection failed:', error.message);
    return false;
  } finally {
    await dbConnection.disconnect();
  }
}

// Run the health check only if called directly
if (require.main === module) {
  checkDatabaseHealth();
}

module.exports = { checkDatabaseHealth };
