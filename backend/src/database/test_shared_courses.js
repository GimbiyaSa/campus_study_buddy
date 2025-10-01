require('dotenv').config();
const sql = require('mssql');

async function testSharedCoursesQuery() {
  let dbConfig;
  try {
    const { azureConfig } = require('../../dist/config/azureConfig');
    dbConfig = await azureConfig.getLegacyDatabaseConfig();
  } catch (error) {
    console.error('❌ Azure config failed:', error.message);
    process.exit(1);
  }

  try {
    await sql.connect(dbConfig);
    console.log('✅ Connected to database');

    // First, let's see what courses the current user has
    console.log('\n📚 Your current user modules:');
    const yourModules = await new sql.Request().query(`
      SELECT DISTINCT m.module_name, m.module_code, m.module_id
      FROM dbo.user_modules um
      INNER JOIN dbo.modules m ON um.module_id = m.module_id
      WHERE um.user_id = '113742007518690789243'
      ORDER BY m.module_name
    `);
    
    console.log('Your enrolled modules:');
    yourModules.recordset.forEach(module => {
      console.log(`- ${module.module_name} (${module.module_code}) - ID: ${module.module_id}`);
    });

    // Now let's see what modules the test users have
    console.log('\n👥 Test users and their modules:');
    const testUserModules = await new sql.Request().query(`
      SELECT 
        u.user_id,
        u.first_name + ' ' + u.last_name as name,
        m.module_name,
        m.module_code,
        m.module_id
      FROM dbo.users u
      INNER JOIN dbo.user_modules um ON u.user_id = um.user_id
      INNER JOIN dbo.modules m ON um.module_id = m.module_id
      WHERE u.user_id LIKE 'test_user_%'
      ORDER BY u.first_name, m.module_name
    `);

    const userModuleMap = {};
    testUserModules.recordset.forEach(row => {
      if (!userModuleMap[row.name]) {
        userModuleMap[row.name] = [];
      }
      userModuleMap[row.name].push(`${row.module_name} (${row.module_code})`);
    });

    Object.keys(userModuleMap).forEach(userName => {
      console.log(`- ${userName}:`);
      userModuleMap[userName].forEach(module => {
        console.log(`  * ${module}`);
      });
    });

    // Now test the shared courses logic
    console.log('\n🔍 Testing shared courses query...');
    const sharedCoursesTest = await new sql.Request()
      .input('currentUserId', sql.NVarChar(255), '113742007518690789243')
      .query(`
        SELECT 
          u.user_id,
          u.first_name + ' ' + u.last_name as name,
          -- Get shared courses as comma-separated list
          STUFF((
            SELECT DISTINCT ', ' + m.module_name
            FROM dbo.user_modules um1
            INNER JOIN dbo.modules m ON um1.module_id = m.module_id
            WHERE um1.user_id = u.user_id
            AND um1.module_id IN (
              SELECT um2.module_id 
              FROM dbo.user_modules um2 
              WHERE um2.user_id = @currentUserId
            )
            FOR XML PATH('')
          ), 1, 2, '') as sharedCourses
        FROM users u
        WHERE u.user_id LIKE 'test_user_%'
        ORDER BY u.first_name
      `);

    console.log('Shared courses results:');
    sharedCoursesTest.recordset.forEach(user => {
      console.log(`- ${user.name}: ${user.sharedCourses || 'No shared courses'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.close();
  }
}

testSharedCoursesQuery();