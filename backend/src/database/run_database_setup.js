const DatabaseConnection = require('./database_setup');

async function checkDatabaseHealth() {
  // Use Azure configuration for database connection
  let dbConfig;

  try {
    const { azureConfig } = require('../config/azureConfig');
    dbConfig = await azureConfig.getLegacyDatabaseConfig();
    console.log('✅ Using Azure configuration for database health check');
  } catch (error) {
    console.error('❌ Azure config not available or failed:', error.message);
    process.exit(1);
  }

  console.log('Starting Database Health Check...\n');
  console.log(
    `Connecting to: ${dbConfig.server}/${dbConfig.database || 'csb-prod-sqldb-7ndjbzgu'}`
  );

  const dbConnection = new DatabaseConnection(dbConfig);

  try {
    await dbConnection.connect();
    // Run a simple query to check DB health
    if (typeof dbConnection.query === 'function') {
      const result = await dbConnection.query('SELECT 1 AS ok');
      const isHealthy =
        result && result.recordset && result.recordset[0] && result.recordset[0].ok === 1;
      if (isHealthy) {
        console.log('\n✅ Database is healthy and ready!');
      } else {
        console.log('\n❌ Database health check failed');
      }
      return isHealthy;
    } else {
      console.log('\n✅ Connected to Azure SQL Database (no query method to check health)');
      return true;
    }
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
