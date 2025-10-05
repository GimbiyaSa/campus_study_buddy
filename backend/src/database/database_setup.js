const sql = require('mssql');

/**
 * Simple database utility for production use
 * Tables should already exist - this is just for connection management
 */
class DatabaseConnection {
  constructor(config) {
    // Always expect config from Azure Key Vault (already shaped)
    this.config = config;
  }

  async connect() {
    try {
      this.pool = await sql.connect(this.config);
      console.log('✅ Connected to Azure SQL Database');
      return this.pool;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
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
