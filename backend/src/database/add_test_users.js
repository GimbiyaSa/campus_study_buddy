require('dotenv').config();
const sql = require('mssql');

async function addTestUsers() {
  let dbConfig;
  try {
    const { azureConfig } = require('../../dist/config/azureConfig');
    dbConfig = await azureConfig.getLegacyDatabaseConfig();
    console.log('✅ Using Azure configuration for database connection');
  } catch (error) {
    console.error('❌ Azure config not available or failed:', error.message);
    process.exit(1);
  }

  try {
    console.log('Connecting to database...');
    await sql.connect(dbConfig);

    // Delete existing test users
    console.log('🗑️ Removing existing test users...');
    await sql.batch(`
      DELETE FROM dbo.users WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3', 'test_user_4', 'test_user_5')
    `);

    // Add test users
    console.log('👥 Adding test users...');
    
    const testUsers = [
      {
        id: 'test_user_1',
        email: 'alice.smith@mit.edu',
        firstName: 'Alice',
        lastName: 'Smith',
        university: 'MIT',
        course: 'Computer Science',
        year: 3,
        bio: 'Passionate about algorithms and machine learning. Love solving complex problems and working in study groups.',
        preferences: '{"studyStyle": "visual", "groupSize": "small", "environment": "quiet", "availability": ["morning", "afternoon"]}'
      },
      {
        id: 'test_user_2',
        email: 'bob.johnson@mit.edu',
        firstName: 'Bob',
        lastName: 'Johnson',
        university: 'MIT',
        course: 'Data Science',
        year: 2,
        bio: 'Data enthusiast looking for study partners for statistics and machine learning projects.',
        preferences: '{"studyStyle": "collaborative", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}'
      },
      {
        id: 'test_user_3',
        email: 'carol.wilson@stanford.edu',
        firstName: 'Carol',
        lastName: 'Wilson',
        university: 'Stanford University',
        course: 'Software Engineering',
        year: 4,
        bio: 'Senior student with experience in full-stack development. Happy to help junior students and collaborate on projects.',
        preferences: '{"studyStyle": "mixed", "groupSize": "large", "environment": "flexible", "availability": ["evening"]}'
      },
      {
        id: 'test_user_4',
        email: 'david.brown@mit.edu',
        firstName: 'David',
        lastName: 'Brown',
        university: 'MIT',
        course: 'Applied Mathematics',
        year: 1,
        bio: 'First-year student eager to learn and find study partners for calculus and linear algebra.',
        preferences: '{"studyStyle": "auditory", "groupSize": "small", "environment": "quiet", "availability": ["morning"]}'
      },
      {
        id: 'test_user_5',
        email: 'emma.davis@mit.edu',
        firstName: 'Emma',
        lastName: 'Davis',
        university: 'MIT',
        course: 'Computer Science',
        year: 2,
        bio: 'Second-year CS student interested in web development and databases. Prefer hands-on learning.',
        preferences: '{"studyStyle": "kinesthetic", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}'
      }
    ];

    for (const user of testUsers) {
      const request = new sql.Request();
      request.input('userId', sql.NVarChar(255), user.id);
      request.input('email', sql.NVarChar(255), user.email);
      request.input('firstName', sql.NVarChar(100), user.firstName);
      request.input('lastName', sql.NVarChar(100), user.lastName);
      request.input('university', sql.NVarChar(255), user.university);
      request.input('course', sql.NVarChar(255), user.course);
      request.input('year', sql.Int, user.year);
      request.input('bio', sql.NText, user.bio);
      request.input('preferences', sql.NVarChar(sql.MAX), user.preferences);

      await request.query(`
        INSERT INTO dbo.users (
          user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
        ) VALUES (
          @userId, @email, 'test_password_hash', @firstName, @lastName, @university, @course, @year, @bio, @preferences, 1
        )
      `);
      
      console.log(`✅ Added user: ${user.firstName} ${user.lastName}`);
    }

    // Verify the users were added
    console.log('\n📋 Test users in database:');
    const result = await new sql.Request().query(`
      SELECT 
        user_id,
        first_name + ' ' + last_name as name,
        email,
        university,
        course,
        year_of_study,
        study_preferences
      FROM dbo.users 
      WHERE user_id LIKE 'test_user_%'
      ORDER BY user_id
    `);

    result.recordset.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - ${user.course} at ${user.university}`);
    });

    console.log(`\n🎉 Successfully added ${testUsers.length} test users!`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.close();
  }
}

addTestUsers();