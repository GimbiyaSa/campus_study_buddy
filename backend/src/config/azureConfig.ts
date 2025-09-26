/**
 * Azure Configuration Service
 * Handles all Azure service integrations using Key Vault for secrets
 * Designed for Container Apps deployment with managed identity
 */

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
      // In Container Apps, use managed identity for Key Vault access
      if (process.env.AZURE_CLIENT_ID) {
        console.log('Initializing Azure clients with managed identity...');
        const credential = new DefaultAzureCredential();
        
        // Key Vault client
        const keyVaultName = process.env.KEY_VAULT_NAME || 'csb-prod-kv-san-7ndjbzgu';
        const keyVaultUrl = `https://${keyVaultName}.vault.azure.net/`;
        this.secretClient = new SecretClient(keyVaultUrl, credential);

        // Get all required secrets at startup
        await this.preloadSecrets();
      } else {
        console.log('Running in local development mode - using environment variables');
      }
    } catch (error) {
      console.warn('Azure client initialization failed, falling back to local env:', error);
    }
  }

  private async preloadSecrets() {
    const secretNames = [
      'database-connection-string',
      'storage-connection-string', 
      'web-pubsub-connection-string',
      'jwt-secret'
    ];

    for (const secretName of secretNames) {
      try {
        await this.getSecret(secretName);
      } catch (error) {
        console.warn(`Failed to preload secret ${secretName}:`, error);
      }
    }
  }

  private async getSecret(secretName: string): Promise<string> {
    // Check cache first (5 minute TTL)
    const cached = this.secretCache.get(secretName);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      if (this.secretClient) {
        const secret = await this.secretClient.getSecret(secretName);
        const value = secret.value!;
        
        // Cache for 5 minutes
        this.secretCache.set(secretName, {
          value,
          expiry: Date.now() + (5 * 60 * 1000)
        });
        
        return value;
      }
    } catch (error) {
      console.warn(`Failed to get secret ${secretName} from Key Vault:`, error);
    }

    // Fallback to environment variables
    const envKey = secretName.replace(/-/g, '_').toUpperCase();
    const envValue = process.env[envKey];
    
    if (!envValue) {
      throw new Error(`Secret ${secretName} not found in Key Vault or environment`);
    }
    
    return envValue;
  }

  public async getDatabaseConfig(): Promise<sql.config> {
    if (this.sqlConfig) {
      return this.sqlConfig;
    }

    try {
      const connectionString = await this.getSecret('database-connection-string');
      
      // Parse connection string into SQL config
      const config = this.parseConnectionString(connectionString);
      this.sqlConfig = config;
      
      return config;
    } catch (error) {
      console.error('Failed to get database config:', error);
      throw error;
    }
  }

  private parseConnectionString(connectionString: string): sql.config {
    const parts = connectionString.split(';');
    const config: any = {
      options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: false,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    for (const part of parts) {
      const [key, value] = part.split('=', 2);
      if (!key || !value) continue;

      switch (key.toLowerCase().trim()) {
        case 'server':
          const serverParts = value.split(',');
          config.server = serverParts[0].replace('tcp:', '');
          if (serverParts[1]) {
            config.port = parseInt(serverParts[1]);
          }
          break;
        case 'database':
          config.database = value;
          break;
        case 'user id':
          config.user = value;
          break;
        case 'password':
          config.password = value;
          break;
        case 'connection timeout':
          config.connectionTimeout = parseInt(value) * 1000;
          break;
      }
    }

    return config as sql.config;
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
      console.error('Failed to initialize Blob service client:', error);
      throw error;
    }
  }

  public async getWebPubSubClient(): Promise<WebPubSubServiceClient> {
    if (this.webPubSubClient) {
      return this.webPubSubClient;
    }

    try {
      const connectionString = await this.getSecret('web-pubsub-connection-string');
      this.webPubSubClient = new WebPubSubServiceClient(connectionString, 'chat_hub');
      return this.webPubSubClient;
    } catch (error) {
      console.error('Failed to initialize Web PubSub client:', error);
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

  // Helper method to check if running in Azure Container Apps
  public isRunningInAzure(): boolean {
    return Boolean(
      process.env.AZURE_CLIENT_ID || 
      process.env.CONTAINER_APP_NAME ||
      process.env.WEBSITE_SITE_NAME
    );
  }

  // Helper to get CORS origins
  public getCorsOrigins(): string[] {
    const origins = [
      process.env.FRONTEND_URL,
      process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()),
    ].flat().filter(Boolean) as string[];

    // Add local development origins if not in production
    if (!this.isRunningInAzure()) {
      origins.push(
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5175',
        'http://127.0.0.1:5175'
      );
    }

    return [...new Set(origins)]; // Remove duplicates
  }
}

export const azureConfig = AzureConfigService.getInstance();