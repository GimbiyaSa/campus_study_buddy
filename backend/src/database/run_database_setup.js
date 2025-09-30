require('dotenv').config();
const DatabaseSetup = require('./database_setup');

async function setupCampusStudyBuddyDatabase() {
  // Azure SQL Database configuration
  const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
  };

  console.log('Starting Campus Study Buddy Database Setup...\n');
  console.log(`Connecting to: ${dbConfig.server}/${dbConfig.database}`);

  const dbSetup = new DatabaseSetup(dbConfig);

  try {
    // Step 1: Connect to Azure SQL Database
    console.log('\nConnecting to SQL Server...');
    await dbSetup.connect();

    // Step 2: Create all tables and relationships
    console.log('\nCreating database schema...');
    await dbSetup.setupDatabase();

    // Step 3: Verify the setup
    console.log('\nVerifying database setup...');
    const tables = await dbSetup.verifySetup();

    // Step 4: Insert sample data (optional)
    //const insertSampleData = process.argv.includes('--sample-data');
    //if (insertSampleData) {
    console.log('\nInserting sample data...');
    await dbSetup.insertSampleData();
    //}

    // Step 5: Final success message
    console.log('\nCampus Study Buddy database setup completed successfully!');
    console.log('\nSummary:');
    console.log(`   - Database: ${dbConfig.database}`);
    console.log(`   - Tables created: ${tables.length}`);
    //console.log(`   - Sample data: ${insertSampleData ? 'Inserted' : 'Skipped'}`);

    /*if (!insertSampleData) {
            console.log('\n💡 Tip: Run with --sample-data flag to insert sample data');
            console.log('   Example: node setup-example.js --sample-data');
        }*/

    console.log('\nCampus Study Buddy platform is ready to use!');
  } catch (error) {
    console.error('\nDatabase setup failed:', error.message);
    //process.exit(1);
  } finally {
    // Do NOT disconnect here if running as part of server startup
    // await dbSetup.disconnect();
  }
}

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  //process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  //process.exit(1);
});

// Run the setup
if (require.main === module) {
  setupCampusStudyBuddyDatabase();
}

module.exports = {
  setupCampusStudyBuddyDatabase,
};
