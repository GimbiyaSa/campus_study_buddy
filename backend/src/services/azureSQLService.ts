/**
 * Azure SQL Database Service
 * Replaces local connection pooling with proper Azure SQL integration
 * Uses Azure Key Vault for connection strings and connection pooling best practices
 */

import sql from 'mssql';
import { azureConfig } from '../config/azureConfig';

class AzureSQLService {
  private static instance: AzureSQLService;
  private pool: sql.ConnectionPool | null = null;
  private isConnecting = false;

  private constructor() {}

  public static getInstance(): AzureSQLService {
    if (!AzureSQLService.instance) {
      AzureSQLService.instance = new AzureSQLService();
    }
    return AzureSQLService.instance;
  }

  public async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.pool?.connected) {
        return this.pool;
      }
    }

    try {
      this.isConnecting = true;
      console.log('Connecting to Azure SQL Database...');
      
      const config = await azureConfig.getDatabaseConfig();
      
      this.pool = new sql.ConnectionPool(config);
      
      // Handle connection events
      this.pool.on('connect', () => {
        console.log('✅ Connected to Azure SQL Database');
      });

      this.pool.on('error', (err) => {
        console.error('❌ SQL Pool Error:', err);
        this.pool = null;
      });

      await this.pool.connect();
      return this.pool;

    } catch (error) {
      console.error('❌ Failed to connect to Azure SQL Database:', error);
      this.pool = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  public async executeQuery<T = any>(query: string, inputs?: Record<string, any>): Promise<sql.IResult<T>> {
    const pool = await this.getPool();
    const request = pool.request();

    // Add input parameters
    if (inputs) {
      for (const [key, value] of Object.entries(inputs)) {
        request.input(key, value);
      }
    }

    return request.query<T>(query);
  }

  public async executeStoredProcedure<T = any>(
    procedureName: string, 
    inputs?: Record<string, any>
  ): Promise<sql.IResult<T>> {
    const pool = await this.getPool();
    const request = pool.request();

    // Add input parameters
    if (inputs) {
      for (const [key, value] of Object.entries(inputs)) {
        request.input(key, value);
      }
    }

    return request.execute<T>(procedureName);
  }

  public async beginTransaction(): Promise<sql.Transaction> {
    const pool = await this.getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    return transaction;
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('Azure SQL connection pool closed');
    }
  }

  // Health check method
  public async healthCheck(): Promise<{ status: string; timestamp: string; database?: string }> {
    try {
      const result = await this.executeQuery('SELECT DB_NAME() as database_name, GETUTCDATE() as server_time');
      const row = result.recordset[0];
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: row.database_name,
      };
    } catch (error) {
      console.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const azureSQL = AzureSQLService.getInstance();
export default azureSQL;