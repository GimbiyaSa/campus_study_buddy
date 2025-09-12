const sql = require('mssql');
const fs = require('fs');
const path = require('path');

class DatabaseSetup {
  constructor(config) {
    // If config is a string, treat it as a connection string
    if (typeof config === 'string') {
      this.config = config;
    } else {
      this.config = {
        user: config.user,
        password: config.password,
        server: config.server,
        database: config.database,
        options: {
          encrypt: true,
          enableArithAbort: true,
          trustServerCertificate: false,
          requestTimeout: 60000,
          connectionTimeout: 60000,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      };
    }
  }

  async connect() {
    try {
      this.pool = await sql.connect(this.config);
      console.log('Connected to Azure SQL Database successfully!');
      return this.pool;
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.close();
        console.log('Database connection closed.');
      }
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  async executeSqlScript(scriptContent) {
    try {
      if (!this.pool) {
        throw new Error('Database not connected. Call connect() first.');
      }

      // Split the script by GO statements (SQL Server batch separator)
      const batches = scriptContent
        .split(/^\s*GO\s*$/gim)
        .map((batch) => batch.trim())
        .filter((batch) => batch.length > 0);

      console.log(`Executing ${batches.length} SQL batches...`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (batch.trim()) {
          try {
            console.log(`Executing batch ${i + 1}/${batches.length}...`);
            await this.pool.request().query(batch);
          } catch (batchError) {
            console.error(`Error in batch ${i + 1}:`, batchError.message);
            // Continue with other batches unless it's a critical error
            if (batchError.message.includes('already exists')) {
              console.log('Object already exists, continuing...');
            } else {
              throw batchError;
            }
          }
        }
      }

      console.log('SQL script executed successfully!');
    } catch (error) {
      console.error('Error executing SQL script:', error);
      throw error;
    }
  }

  async executeQuery(query, params = {}) {
    try {
      if (!this.pool) {
        throw new Error('Database not connected. Call connect() first.');
      }

      const request = this.pool.request();

      // Add parameters to the request
      Object.keys(params).forEach((key) => {
        request.input(key, params[key]);
      });

      const result = await request.query(query);
      return result;
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  // Method to set up the database schema
  async setupDatabase() {
    // Read the SQL script from azure_sql_script.sql
    const scriptPath = path.join(__dirname, 'azure_sql_script.sql');
    let sqlScript;
    try {
      sqlScript = fs.readFileSync(scriptPath, 'utf-8');
    } catch (err) {
      console.error(`Failed to read SQL script file at ${scriptPath}:`, err);
      throw err;
    }

    try {
      console.log('Setting up Campus Study Buddy database...');
      await this.executeSqlScript(sqlScript);
      console.log('Database setup completed successfully!');
    } catch (error) {
      console.error('Database setup failed:', error);
      throw error;
    }
  }

  // Utility method to verify tables were created
  async verifySetup() {
    try {
      const query = `
                SELECT 
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = 'dbo'
                ORDER BY TABLE_NAME;
            `;

      const result = await this.executeQuery(query);
      console.log('\nDatabase Tables Created:');
      console.log('========================');
      result.recordset.forEach((table) => {
        console.log(`- ${table.TABLE_NAME} (${table.TABLE_TYPE})`);
      });
      console.log(`\nTotal tables: ${result.recordset.length}`);

      return result.recordset;
    } catch (error) {
      console.error('Error verifying setup:', error);
      throw error;
    }
  }

  // Method to insert sample data for testing
  async insertSampleData() {
    const sampleDataScript = `
        -- Insert sample users
        INSERT INTO dbo.users (email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences) VALUES
        ('john.doe@university.ac.za', 'hashed_password_1', 'John', 'Doe', 'University of the Witwatersrand', 'Computer Science', 2, 'Passionate about algorithms and data structures', '{"preferred_study_times": ["morning", "evening"], "subjects_of_interest": ["algorithms", "databases"]}'),
        ('jane.smith@university.ac.za', 'hashed_password_2', 'Jane', 'Smith', 'University of the Witwatersrand', 'Computer Science', 2, 'Love collaborative learning', '{"preferred_study_times": ["afternoon"], "subjects_of_interest": ["web_development", "databases"]}'),
        ('mike.jones@university.ac.za', 'hashed_password_3', 'Mike', 'Jones', 'University of the Witwatersrand', 'Computer Science', 3, 'Final year student, happy to help others', '{"preferred_study_times": ["evening"], "subjects_of_interest": ["machine_learning", "algorithms"]}');

        -- Insert sample modules
        INSERT INTO dbo.modules (module_code, module_name, description, university) VALUES
        ('CS2001', 'Database Systems', 'Introduction to relational databases and SQL', 'University of the Witwatersrand'),
        ('CS2002', 'Data Structures and Algorithms', 'Fundamental data structures and algorithmic thinking', 'University of the Witwatersrand'),
        ('CS3001', 'Web Development', 'Modern web development with HTML, CSS, JavaScript', 'University of the Witwatersrand');

        -- Insert user module enrollments
        INSERT INTO dbo.user_modules (user_id, module_id, enrollment_status) VALUES
        (1, 1, 'active'),
        (1, 2, 'active'),
        (2, 1, 'active'),
        (2, 3, 'active'),
        (3, 2, 'active'),
        (3, 3, 'active');

        -- Insert sample topics
        INSERT INTO dbo.topics (module_id, topic_name, description, order_sequence) VALUES
        (1, 'SQL Fundamentals', 'Basic SQL queries and operations', 1),
        (1, 'Database Design', 'ER diagrams and normalization', 2),
        (1, 'Advanced SQL', 'Joins, subqueries, and optimization', 3),
        (2, 'Arrays and Lists', 'Linear data structures', 1),
        (2, 'Trees and Graphs', 'Hierarchical and network structures', 2),
        (3, 'Frontend Basics', 'HTML, CSS fundamentals', 1),
        (3, 'JavaScript Programming', 'Client-side scripting', 2);

        -- Insert sample study group
        INSERT INTO dbo.study_groups (group_name, description, creator_id, module_id, max_members, group_type, group_goals) VALUES
        ('Database Masters', 'Study group focused on mastering database concepts', 1, 1, 6, 'study', '{"goals": ["Complete all assignments", "Prepare for final exam", "Build a database project"]}'),
        ('Algorithm Enthusiasts', 'Weekly algorithm practice sessions', 3, 2, 8, 'study', '{"goals": ["Solve 5 problems per week", "Understand time complexity", "Prepare for coding interviews"]}');

        -- Insert group members
        INSERT INTO dbo.group_members (group_id, user_id, role, status) VALUES
        (1, 1, 'admin', 'active'),
        (1, 2, 'member', 'active'),
        (2, 3, 'admin', 'active'),
        (2, 1, 'member', 'active');

        -- Insert sample study session
        INSERT INTO dbo.study_sessions (group_id, organizer_id, session_title, description, scheduled_start, scheduled_end, location, session_type) VALUES
        (1, 1, 'SQL Basics Workshop', 'Hands-on practice with SELECT statements and basic queries', DATEADD(day, 1, GETUTCDATE()), DATEADD(day, 1, DATEADD(hour, 2, GETUTCDATE())), 'Library Room 201', 'study'),
        (2, 3, 'Binary Trees Deep Dive', 'Understanding tree traversal algorithms', DATEADD(day, 2, GETUTCDATE()), DATEADD(day, 2, DATEADD(hour, 1.5, GETUTCDATE())), 'Computer Lab 3', 'study');

        PRINT 'Sample data inserted successfully!';
        `;

    try {
      console.log('Inserting sample data...');
      await this.executeSqlScript(sampleDataScript);
      console.log('Sample data inserted successfully!');
    } catch (error) {
      console.error('Error inserting sample data:', error);
      throw error;
    }
  }
}

module.exports = DatabaseSetup;

// Example usage:
/*
const DatabaseSetup = require('./database-setup');

async function main() {
    const dbSetup = new DatabaseSetup({
        user: 'your_username',
        password: 'your_password',
        server: 'your_server.database.windows.net',
        database: 'your_database_name'
    });

    try {
        await dbSetup.connect();
        await dbSetup.setupDatabase();
        await dbSetup.verifySetup();
        await dbSetup.insertSampleData(); // Optional
    } catch (error) {
        console.error('Setup failed:', error);
    } finally {
        await dbSetup.disconnect();
    }
}

// Uncomment to run
// main();
*/
