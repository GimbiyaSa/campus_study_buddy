const sql = require('mssql');

/**
 * Simple database utility for production use
 * Tables should already exist - this is just for connection management
 */
class DatabaseConnection {
  constructor(config) {
    this.config =
      typeof config === 'string'
        ? config
        : {
            user: config.user,
            password: config.password,
            server: config.server,
            database: config.database,
            options: {
              encrypt: true,
              enableArithAbort: true,
              trustServerCertificate: false,
              requestTimeout: 30000,
              connectionTimeout: 30000,
            },
            pool: {
              max: 10,
              min: 0,
              idleTimeoutMillis: 30000,
            },
          };
  }

  async connect() {
    try {
      // First try to connect to the target database
      this.pool = await sql.connect(this.config);
      console.log('✅ Connected to Azure SQL Database');
      return this.pool;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async createDatabaseIfNotExists() {
    try {
      // Connect to master database to create the target database
      const masterConfig = { ...this.config, database: 'master' };
      const masterPool = await sql.connect(masterConfig);
      
      const createDbQuery = `
        IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${this.config.database}')
        BEGIN
          CREATE DATABASE [${this.config.database}]
        END
      `;
      
      await masterPool.request().query(createDbQuery);
      console.log(`Database '${this.config.database}' created successfully!`);
      
      await masterPool.close();
    } catch (error) {
      console.error('Error creating database:', error.message);
      // Don't throw here - we'll try with the original config anyway
    }
  }

  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.close();
      }
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  async executeQuery(query, params = {}) {
    try {
      if (!this.pool) {
        throw new Error('Database not connected');
      }

      const request = this.pool.request();
      Object.keys(params).forEach((key) => {
        request.input(key, params[key]);
      });

      return await request.query(query);
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  // Simple health check - just verify connection works
  async healthCheck() {
    try {
      const result = await this.executeQuery('SELECT 1 as healthy');
      return result.recordset.length > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = DatabaseConnection;
