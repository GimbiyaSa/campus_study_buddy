require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

async function runSqlFile(sqlFilePath) {
  let dbConfig;
  try {
    const { azureConfig } = require('../../dist/config/azureConfig');
    dbConfig = await azureConfig.getLegacyDatabaseConfig();
    console.log('✅ Using Azure configuration for SQL execution');
  } catch (error) {
    console.error('❌ Azure config not available or failed:', error.message);
    process.exit(1);
  }

  if (!fs.existsSync(sqlFilePath)) {
    console.error(`❌ SQL file not found: ${sqlFilePath}`);
    process.exit(1);
  }
  const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

  // Split script on GO (case-insensitive, on its own line)
  const batches = sqlScript.split(/^[ \t]*GO[ \t]*$/gim).map(batch => batch.trim()).filter(Boolean);

  try {
    console.log('Connecting to database...');
    await sql.connect(dbConfig);
    console.log(`Running SQL script in ${batches.length} batches...`);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch) continue;
      try {
        await sql.batch(batch);
        console.log(`✅ Batch ${i + 1}/${batches.length} executed successfully.`);
      } catch (err) {
        console.error(`❌ Error in batch ${i + 1}:`, err.message);
        throw err;
      }
    }
    console.log('✅ All batches executed successfully!');
  } catch (err) {
    console.error('❌ SQL execution failed:', err.message);
  } finally {
    await sql.close();
  }
}

if (require.main === module) {
  // Default to azure_sql_script.sql in the same folder
  const sqlFile = path.join(__dirname, 'azure_sql_script.sql');
  runSqlFile(sqlFile);
}

module.exports = { runSqlFile };