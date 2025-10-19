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
  private loggedSecrets: Set<string> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Intentionally minimal constructor. Async init happens lazily.
  }

  public static getInstance(): AzureConfigService {
    if (!AzureConfigService.instance) {
      AzureConfigService.instance = new AzureConfigService();
    }
    return AzureConfigService.instance;
  }

  private async initializeClients(): Promise<void> {
    // make initialization idempotent
    if (this.initialized) return;

    try {
      const keyVaultName = process.env.KEY_VAULT_NAME; // do NOT default to a production name

      if (keyVaultName) {
        // Initialize Key Vault client and let DefaultAzureCredential try the
        // available auth mechanisms (Managed Identity in Azure, Azure CLI locally,
        // environment variables for service principals, etc.). This is more
        // flexible for local dev where `az login` can provide a credential.
        try {
          const keyVaultUrl = `https://${keyVaultName}.vault.azure.net/`;
          const credential = new DefaultAzureCredential();
          this.secretClient = new SecretClient(keyVaultUrl, credential);
          console.info('[AzureConfig] Azure Key Vault client initialized');
        } catch (innerErr) {
          console.warn('[AzureConfig] Failed to initialize Key Vault client:', innerErr);
          // fall through to env var fallback
          this.secretClient = null;
        }
      } else {
        console.info('[AzureConfig] No KEY_VAULT_NAME configured; using env vars');
      }
    } catch (error) {
      console.warn(
        '[AzureConfig] Key Vault initialization encountered an error, falling back to env vars'
      );
    } finally {
      this.initialized = true;
    }
  }

  private ensureInitialized(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = this.initializeClients();
    }
    return this.initPromise;
  }

  private async getSecret(secretName: string): Promise<string> {
    // Check cache first
    const cached = this.secretCache.get(secretName);
    if (cached && cached.expiry > Date.now()) {
      // Do not log on cache hit
      return cached.value;
    }

    await this.ensureInitialized();

    // Try Key Vault first (if available)
    if (this.secretClient) {
      try {
        const secret = await this.secretClient.getSecret(secretName);
        const value = secret.value || '';
        this.secretCache.set(secretName, { value, expiry: Date.now() + 5 * 60 * 1000 });
        if (!this.loggedSecrets.has(secretName)) {
          console.info(`[AzureConfig] Secret ${secretName} loaded from Key Vault`);
          this.loggedSecrets.add(secretName);
        }
        return value;
      } catch (error) {
        console.warn('[AzureConfig] Failed to get secret from Key Vault:', secretName);
      }
    }

    // No fallback - Key Vault only
    throw new Error(`Secret ${secretName} not found in Key Vault`);
  }

  public async getDatabaseConfig(): Promise<sql.config> {
    if (this.sqlConfig) {
      return this.sqlConfig;
    }

    const connectionString = await this.getSecret('database-connection-string');
    // Secret source is already logged by getSecret(); no need to print the value here.
    this.sqlConfig = this.parseConnectionString(connectionString);
    return this.sqlConfig;
  }

  // Legacy method to support existing database setup
  public async getLegacyDatabaseConfig(): Promise<{
    user: string;
    password: string;
    server: string;
    database?: string;
  }> {
    try {
      const config = await this.getDatabaseConfig();
      return {
        user: (config as any).user || '',
        password: (config as any).password || '',
        server: (config as any).server || '',
        database: (config as any).database,
      };
    } catch (error) {
      throw error; // No fallback - Key Vault only
    }
  }

  private parseConnectionString(connectionString: string): sql.config {
    const parts = connectionString
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
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

    parts.forEach((part) => {
      const idx = part.indexOf('=');
      if (idx <= 0) return;
      const key = part.slice(0, idx).trim().toLowerCase();
      const value = part.slice(idx + 1).trim();

      switch (key) {
        case 'server':
          // Handle tcp:host,port and host,port
          let serverVal = value.replace(/^tcp:/i, '');
          if (serverVal.includes(',') || serverVal.includes(':')) {
            const sep = serverVal.includes(',') ? ',' : ':';
            const [hostname, port] = serverVal.split(sep);
            config.server = hostname;
            const parsed = parseInt((port || '').replace(/[^0-9]/g, ''), 10);
            if (!Number.isNaN(parsed)) config.port = parsed;
          } else {
            config.server = serverVal;
          }
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
        case 'connection timeout':
          const t = parseInt(value, 10);
          if (!Number.isNaN(t)) config.connectionTimeout = t * 1000;
          break;
      }
    });

    return config;
  }

  public async getBlobServiceClient(): Promise<BlobServiceClient> {
    if (this.blobServiceClient) return this.blobServiceClient;

    try {
      const connectionString = await this.getSecret('storage-connection-string');
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      return this.blobServiceClient;
    } catch (error) {
      // Fallback to constructing from storage account name + key if provided in env
      const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      if (accountName && accountKey) {
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        return this.blobServiceClient;
      }
      console.error('[AzureConfig] Failed to initialize Blob Service Client');
      throw error;
    }
  }

  public async getWebPubSubClient(): Promise<WebPubSubServiceClient> {
    if (this.webPubSubClient) return this.webPubSubClient;

    const connectionString = await this.getSecret('web-pubsub-connection-string');
    this.webPubSubClient = new WebPubSubServiceClient(
      connectionString,
      process.env.WEB_PUBSUB_HUB || 'studybuddy'
    );
    return this.webPubSubClient;
  }

  public async getJwtSecret(): Promise<string> {
    return this.getSecret('jwt-secret');
  }


  public async getLogicAppReminderUrl(): Promise<string> {
    const envUrl = process.env.LOGIC_APP_REMINDER_URL;
    if (envUrl) {
      console.info(`[AzureConfig] Using LOGIC_APP_REMINDER_URL from environment variable`);
      return envUrl;
    }
    throw new Error('Logic App reminder URL not configured');
  }

  public async getFrontendUrl(): Promise<string> {
    try {
      return await this.getSecret('frontend-url');
    } catch (error) {
      // Fallback to environment variable
      const envUrl = process.env.FRONTEND_URL;
      if (envUrl) {
        return envUrl;
      }
      // Default to production frontend URL if nothing is configured
      return 'https://csb-prod-app-frontend-w0zgifbb.azurewebsites.net';
    }
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
    const origins: string[] = [];
    if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL);
    if (process.env.ALLOWED_ORIGINS) {
      origins.push(
        ...process.env.ALLOWED_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }

    // Always allow GitHub Pages documentation site for Swagger UI
    origins.push('https://gimbiyasa.github.io');

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
    return Array.from(new Set(origins));
  }

  // Health check method
  public async healthCheck(): Promise<{
    database: string;
    storage: string;
    webpubsub: string;
    logicApps: string;
    timestamp: string;
  }> {
    const result = {
      database: 'unknown',
      storage: 'unknown',
      webpubsub: 'unknown',
      logicApps: 'unknown',
      timestamp: new Date().toISOString(),
    };

    try {
      await this.getDatabaseConfig();
      result.database = 'healthy';
    } catch {
      result.database = 'unhealthy';
    }

    try {
      await this.getBlobServiceClient();
      result.storage = 'healthy';
    } catch {
      result.storage = 'unhealthy';
    }

    try {
      await this.getWebPubSubClient();
      result.webpubsub = 'healthy';
    } catch {
      result.webpubsub = 'unhealthy';
    }

    try {
      await this.getLogicAppReminderUrl();
      result.logicApps = 'healthy';
    } catch {
      result.logicApps = 'unhealthy';
    }

    return result;
  }
}

export const azureConfig = AzureConfigService.getInstance();
