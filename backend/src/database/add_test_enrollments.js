require('dotenv').config();
const sql = require('mssql');

async function checkModulesAndAddEnrollments() {
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

    // Check existing modules
    console.log('\n📚 Existing modules in database:');
    const modulesResult = await new sql.Request().query(`
      SELECT module_id, module_code, module_name, university, description
      FROM dbo.modules 
      WHERE is_active = 1
      ORDER BY module_name
    `);

    if (modulesResult.recordset.length === 0) {
      console.log('No modules found. Need to create some first.');

      // Create some common modules that align with your courses
      console.log('\n🔧 Creating modules for Algorithms and general study topics...');

      const modulesToCreate = [
        {
          code: 'CS736',
          name: 'Algorithms123',
          university: 'MIT',
          description: 'Advanced algorithms and data structures',
        },
        {
          code: 'CS101',
          name: 'Introduction to Computer Science',
          university: 'MIT',
          description: 'Basic programming and computer science concepts',
        },
        {
          code: 'MATH201',
          name: 'Calculus and Linear Algebra',
          university: 'MIT',
          description: 'Mathematical foundations for computer science',
        },
        {
          code: 'CS301',
          name: 'Data Structures',
          university: 'MIT',
          description: 'Data structures and algorithms implementation',
        },
      ];

      for (const module of modulesToCreate) {
        const request = new sql.Request();
        request.input('code', sql.NVarChar(50), module.code);
        request.input('name', sql.NVarChar(255), module.name);
        request.input('university', sql.NVarChar(255), module.university);
        request.input('description', sql.NText, module.description);

        await request.query(`
          INSERT INTO dbo.modules (module_code, module_name, university, description, is_active, created_at, updated_at)
          VALUES (@code, @name, @university, @description, 1, GETDATE(), GETDATE())
        `);
        console.log(`✅ Created module: ${module.name} (${module.code})`);
      }

      // Re-fetch modules
      const newModulesResult = await new sql.Request().query(`
        SELECT module_id, module_code, module_name, university, description
        FROM dbo.modules 
        WHERE is_active = 1
        ORDER BY module_name
      `);
      console.log(`\n📚 Available modules (${newModulesResult.recordset.length} total):`);
      newModulesResult.recordset.forEach((module) => {
        console.log(`- ${module.module_name} (${module.module_code}) - ID: ${module.module_id}`);
      });
    } else {
      console.log(`Found ${modulesResult.recordset.length} modules:`);
      modulesResult.recordset.forEach((module) => {
        console.log(`- ${module.module_name} (${module.module_code}) - ID: ${module.module_id}`);
      });
    }

    // Now enroll test users in some of these modules
    console.log('\n🎓 Enrolling test users in modules...');

    // Get the modules we want to use
    const moduleQuery = await new sql.Request().query(`
      SELECT module_id, module_code, module_name 
      FROM dbo.modules 
      WHERE module_code IN ('CS736', 'CS101', 'MATH201', 'CS301') 
      AND is_active = 1
    `);

    const modules = moduleQuery.recordset;
    console.log(`Found ${modules.length} modules to use for enrollment`);

    // Enroll test users in relevant modules
    const enrollments = [
      { userId: 'test_user_1', moduleCodes: ['CS736', 'CS301'] }, // Alice - Algorithms overlap
      { userId: 'test_user_2', moduleCodes: ['CS101', 'MATH201'] }, // Bob - Data Science
      { userId: 'test_user_3', moduleCodes: ['CS736', 'CS101'] }, // Carol - CS overlap
      { userId: 'test_user_4', moduleCodes: ['MATH201'] }, // David - Math
      { userId: 'test_user_5', moduleCodes: ['CS101', 'CS301'] }, // Emma - CS basics
    ];

    for (const enrollment of enrollments) {
      for (const moduleCode of enrollment.moduleCodes) {
        const module = modules.find((m) => m.module_code === moduleCode);
        if (module) {
          // Check if enrollment already exists
          const checkRequest = new sql.Request();
          checkRequest.input('userId', sql.NVarChar(255), enrollment.userId);
          checkRequest.input('moduleId', sql.Int, module.module_id);

          const existingEnrollment = await checkRequest.query(`
            SELECT * FROM dbo.user_modules 
            WHERE user_id = @userId AND module_id = @moduleId
          `);

          if (existingEnrollment.recordset.length === 0) {
            const enrollRequest = new sql.Request();
            enrollRequest.input('userId', sql.NVarChar(255), enrollment.userId);
            enrollRequest.input('moduleId', sql.Int, module.module_id);

            await enrollRequest.query(`
              INSERT INTO dbo.user_modules (user_id, module_id, enrollment_status, enrolled_at)
              VALUES (@userId, @moduleId, 'active', GETDATE())
            `);
            console.log(`✅ Enrolled ${enrollment.userId} in ${module.module_name}`);
          } else {
            console.log(`⚠️ ${enrollment.userId} already enrolled in ${module.module_name}`);
          }
        }
      }
    }

    console.log('\n🎉 Test users enrollment complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sql.close();
  }
}

checkModulesAndAddEnrollments();
