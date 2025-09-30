/**
 * Seed script to purge user-related data and insert a single deterministic test user.
 * Usage (from backend folder):
 *   npm run seed:test-user
 *
 * Order of deletion respects FK relationships to avoid constraint violations.
 */
require('dotenv').config();
const sql = require('mssql');

const TEST_USER_ID = 1; // Using integer ID to match service expectations

async function getPool() {
  try {
    // Try Azure config first
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      return await sql.connect(dbConfig);
    } catch (azureError) {
      // Fallback to connection string
      if (process.env.DATABASE_CONNECTION_STRING) {
        return await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      }
      throw new Error('DATABASE_CONNECTION_STRING not found in environment variables');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

async function seed() {
  const pool = await getPool();
  console.log('Connected to DB, starting purge...');
  const statements = [
    // Child tables first
    'DELETE FROM partner_matches',
    'DELETE FROM shared_notes',
    'DELETE FROM chat_messages',
    'DELETE FROM session_attendees',
    'DELETE FROM study_hours',
    'DELETE FROM user_progress',
    'DELETE FROM group_members',
    'DELETE FROM study_sessions',
    'DELETE FROM study_groups',
    'DELETE FROM user_modules',
    // Optionally keep modules & topics if you want catalog preserved
    // 'DELETE FROM topics',
    // 'DELETE FROM modules',
    'DELETE FROM notifications',
    'DELETE FROM users'
  ];

  for (const s of statements) {
    try {
      await pool.request().query(s);
      console.log('Executed:', s);
    } catch (err) {
      console.warn('Warning executing', s, err.message);
    }
  }

  console.log('Inserting test user...');
  
  // Let the database auto-generate the user_id, then get it back
  const result = await pool.request()
    .input('firstName', sql.NVarChar(100), 'Test')
    .input('lastName', sql.NVarChar(100), 'User')
    .input('email', sql.NVarChar(255), 'test.user@example.com')
    .input('passwordHash', sql.NVarChar(255), 'test_password_hash_123') // Dummy password hash for testing
    .input('university', sql.NVarChar(255), 'DevUniversity')
    .input('course', sql.NVarChar(255), 'Computer Science')
    .input('yearOfStudy', sql.Int, 3)
    .input('isActive', sql.Bit, 1)
    .query(`INSERT INTO users (first_name, last_name, email, password_hash, university, course, year_of_study, is_active, created_at, updated_at)
            OUTPUT inserted.user_id
            VALUES (@firstName, @lastName, @email, @passwordHash, @university, @course, @yearOfStudy, @isActive, GETUTCDATE(), GETUTCDATE())`);

  const insertedUserId = result.recordset[0].user_id;

  console.log('Test user inserted with user_id:', insertedUserId);
  console.log('✅ Test user created successfully!');
  console.log('📧 Email: test.user@example.com');
  console.log('🏫 University: DevUniversity');
  console.log('📚 Course: Computer Science');
  console.log('📈 Year: 3');
  console.log('🔑 User ID:', insertedUserId, '(use this in your frontend mock user)');
  console.log('Done.');
  await pool.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
