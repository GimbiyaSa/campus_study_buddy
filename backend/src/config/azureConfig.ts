import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { BlobServiceClient } from '@azure/storage-blob';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import sql from 'mssql';

export class AzureConfigService {
  private static instance: AzureConfigService;
  private secretClient: SecretClient | null = null;
  private blobServiceClient: BlobServiceClient | null = null;
  private webPubSubClient: WebPubSubServiceClient | null = null;
  private sqlConfig: sql.config | null = null;
  private secretCache: Map<string, { value: string; expiry: number }> = new Map();

  private constructor() {
    this.initializeClients();
  }

  public static getInstance(): AzureConfigService {
    if (!AzureConfigService.instance) {
      AzureConfigService.instance = new AzureConfigService();
    }
    return AzureConfigService.instance;
  }

  private async initializeClients() {
    try {
      // Use Key Vault for production, environment variables for development
      const keyVaultName = process.env.KEY_VAULT_NAME || 'csb-prod-kv-san-7ndjbzgu';
      
      if (this.isRunningInAzure() && keyVaultName) {
        const keyVaultUrl = `https://${keyVaultName}.vault.azure.net/`;
        const credential = new DefaultAzureCredential();
        this.secretClient = new SecretClient(keyVaultUrl, credential);
        console.log('✅ Azure Key Vault client initialized');
      } else {
        console.log('🔧 Using environment variables for secrets (development mode)');
      }
    } catch (error) {
      console.warn('⚠️ Azure Key Vault not available, using environment variables:', error);
    }
  }

  private async getSecret(secretName: string): Promise<string> {
    // Check cache first
    const cached = this.secretCache.get(secretName);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      if (this.secretClient) {
        const secret = await this.secretClient.getSecret(secretName);
        const value = secret.value || '';
        
        // Cache for 5 minutes
        this.secretCache.set(secretName, {
          value,
          expiry: Date.now() + 5 * 60 * 1000
        });
        
        return value;
      }
    } catch (error) {
      console.warn(`Failed to get secret ${secretName} from Key Vault:`, error);
    }

    // Fallback to environment variables
    const envMap: Record<string, string> = {
      'database-connection-string': 'DATABASE_CONNECTION_STRING',
      'storage-connection-string': 'AZURE_STORAGE_CONNECTION_STRING',
      'web-pubsub-connection-string': 'WEB_PUBSUB_CONNECTION_STRING',
      'jwt-secret': 'JWT_SECRET'
    };

    const envVar = envMap[secretName];
    let value = process.env[envVar] || '';

    // For development, construct connection string from individual parts if not provided
    if (!value && secretName === 'database-connection-string') {
      const server = process.env.DB_SERVER || 'csb-prod-sql-san-7ndjbzgu.database.windows.net';
      const database = process.env.DB_DATABASE || 'csb-prod-sqldb-7ndjbzgu';
      const user = process.env.DB_USER;
      const password = process.env.DB_PASSWORD;
      
      if (server && database && user && password) {
        value = `Server=${server};Database=${database};User Id=${user};Password=${password};Encrypt=true;TrustServerCertificate=false`;
      }
    }
    
    if (!value) {
      throw new Error(`Secret ${secretName} not found in Key Vault or environment variables`);
    }

    return value;
  }

  public async getDatabaseConfig(): Promise<sql.config> {
    if (this.sqlConfig) {
      return this.sqlConfig;
    }

    try {
      const connectionString = await this.getSecret('database-connection-string');
      this.sqlConfig = this.parseConnectionString(connectionString);
      return this.sqlConfig;
    } catch (error) {
      console.error('Failed to get database config:', error);
      throw error;
    }
  }

  // Legacy method to support existing database setup
  public async getLegacyDatabaseConfig(): Promise<{ user: string; password: string; server: string; database?: string }> {
    try {
      const config = await this.getDatabaseConfig();
      return {
        user: config.user || '',
        password: config.password || '',
        server: config.server || '',
        database: config.database
      };
    } catch (error) {
      // Fallback to environment variables for legacy support
      return {
        user: process.env.DB_USER || '',
        password: process.env.DB_PASSWORD || '',
        server: process.env.DB_SERVER || 'csb-prod-sql-san-7ndjbzgu.database.windows.net',
        database: process.env.DB_DATABASE || 'csb-prod-sqldb-7ndjbzgu'
      };
    }
  }

  private parseConnectionString(connectionString: string): sql.config {
    const parts = connectionString.split(';');
    const config: any = {
      options: {
        encrypt: true,
        trustServerCertificate: process.env.NODE_ENV === 'development',
        enableArithAbort: true,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    parts.forEach(part => {
      const [key, value] = part.split('=');
      if (key && value) {
        switch (key.toLowerCase()) {
          case 'server':
            config.server = value;
            break;
          case 'database':
            config.database = value;
            break;
          case 'uid':
          case 'user id':
            config.user = value;
            break;
          case 'pwd':
          case 'password':
            config.password = value;
            break;
        }
      }
    });

    return config;
  }

  public async getBlobServiceClient(): Promise<BlobServiceClient> {
    if (this.blobServiceClient) {
      return this.blobServiceClient;
    }

    try {
      const connectionString = await this.getSecret('storage-connection-string');
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      return this.blobServiceClient;
    } catch (error) {
      // Fallback to constructing from storage account name
      const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'csbprodstsan7ndjbzgu';
      const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      
      if (accountKey) {
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        return this.blobServiceClient;
      }
      
      console.error('Failed to initialize Blob Service Client:', error);
      throw error;
    }
  }

  public async getWebPubSubClient(): Promise<WebPubSubServiceClient> {
    if (this.webPubSubClient) {
      return this.webPubSubClient;
    }

    try {
      const connectionString = await this.getSecret('web-pubsub-connection-string');
      this.webPubSubClient = new WebPubSubServiceClient(connectionString, 'chat-hub');
      return this.webPubSubClient;
    } catch (error) {
      console.error('Failed to initialize Web PubSub Client:', error);
      throw error;
    }
  }

  public async getJwtSecret(): Promise<string> {
    return this.getSecret('jwt-secret');
  }

  public async getStorageContainerClient(containerName: string) {
    const blobServiceClient = await this.getBlobServiceClient();
    return blobServiceClient.getContainerClient(containerName);
  }

  // Helper method to check if running in Azure
  public isRunningInAzure(): boolean {
    return Boolean(
      process.env.AZURE_CLIENT_ID || 
      process.env.CONTAINER_APP_NAME ||
      process.env.WEBSITE_SITE_NAME ||
      process.env.AZURE_FUNCTIONS_ENVIRONMENT
    );
  }

  // Helper to get CORS origins
  public getCorsOrigins(): string[] {
    const origins = [];
    
    // Add configured frontend URL
    if (process.env.FRONTEND_URL) {
      origins.push(process.env.FRONTEND_URL);
    }
    
    // Add additional allowed origins
    if (process.env.ALLOWED_ORIGINS) {
      origins.push(...process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()));
    }

    // Add local development origins if not in production
    if (!this.isRunningInAzure()) {
      origins.push(
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5175',
        'http://127.0.0.1:5175',
        'http://localhost:8000',
        'http://127.0.0.1:8000'
      );
    }

    return [...new Set(origins.filter(Boolean))]; // Remove duplicates and empty values
  }

  // Health check method
  public async healthCheck(): Promise<{ 
    database: string; 
    storage: string; 
    webpubsub: string; 
    timestamp: string 
  }> {
    const result = {
      database: 'unknown',
      storage: 'unknown', 
      webpubsub: 'unknown',
      timestamp: new Date().toISOString()
    };

    // Check database
    try {
      await this.getDatabaseConfig();
      result.database = 'healthy';
    } catch (error) {
      result.database = 'unhealthy';
    }

    // Check storage
    try {
      await this.getBlobServiceClient();
      result.storage = 'healthy';
    } catch (error) {
      result.storage = 'unhealthy';
    }

    // Check Web PubSub
    try {
      await this.getWebPubSubClient();
      result.webpubsub = 'healthy';
    } catch (error) {
      result.webpubsub = 'unhealthy';
    }

    return result;
  }
}

export const azureConfig = AzureConfigService.getInstance();