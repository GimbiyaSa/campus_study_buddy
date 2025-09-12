require('dotenv').config();
const DatabaseSetup = require('./database_setup');

async function setupCampusStudyBuddyDatabase() {
  // Azure SQL Database configuration
  const dbConfig = {
    user: process.env.DB_USER || 'admin_studybuddy',
    password: process.env.DB_PASSWORD || 'SDP@Project',
    server: process.env.DB_SERVER || 'studybuddysqlserver.database.windows.net',
    database: process.env.DB_DATABASE || 'StudyBuddyDb',
  };

  console.log('🚀 Starting Campus Study Buddy Database Setup...\n');
  console.log(`Connecting to: ${dbConfig.server}/${dbConfig.database}`);

  const dbSetup = new DatabaseSetup(process.env.DB_CONNECTION_STRING || 'StudyBuddyDb');

  try {
    // Step 1: Connect to Azure SQL Database
    console.log('\n📡 Connecting to Azure SQL Database...');
    await dbSetup.connect();

    // Step 2: Create all tables and relationships
    console.log('\n🏗️  Creating database schema...');
    await dbSetup.setupDatabase();

    // Step 3: Verify the setup
    console.log('\n🔍 Verifying database setup...');
    const tables = await dbSetup.verifySetup();

    // Step 4: Insert sample data (optional)
    //const insertSampleData = process.argv.includes('--sample-data');
    //if (insertSampleData) {
    console.log('\n📊 Inserting sample data...');
    await dbSetup.insertSampleData();
    //}

    // Step 5: Final success message
    console.log('\n✅ Campus Study Buddy database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Database: ${dbConfig.database}`);
    console.log(`   - Tables created: ${tables.length}`);
    //console.log(`   - Sample data: ${insertSampleData ? 'Inserted' : 'Skipped'}`);

    /*if (!insertSampleData) {
            console.log('\n💡 Tip: Run with --sample-data flag to insert sample data');
            console.log('   Example: node setup-example.js --sample-data');
        }*/

    console.log('\n🎉 Campus Study Buddy platform is ready to use!');
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    console.error('\n📋 Troubleshooting tips:');
    console.error('   1. Check your Azure SQL Database credentials');
    console.error('   2. Ensure your IP address is whitelisted in Azure');
    console.error('   3. Verify the database exists and you have proper permissions');
    console.error('   4. Check if the server name includes .database.windows.net');

    process.exit(1);
  } finally {
    // Do NOT disconnect here if running as part of server startup
    // await dbSetup.disconnect();
  }
}

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run the setup
if (require.main === module) {
  setupCampusStudyBuddyDatabase();
}

module.exports = {
  setupCampusStudyBuddyDatabase,
};
