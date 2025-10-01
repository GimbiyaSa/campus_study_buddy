import { azureConfig } from '../config/azureConfig';
import { BlobServiceClient, ContainerClient, BlobSASPermissions } from '@azure/storage-blob';
import { Readable } from 'stream';

interface UploadOptions {
  containerName: string;
  fileName: string;
  contentType: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

interface UploadResult {
  url: string;
  etag: string;
  lastModified: Date;
  contentLength: number;
  contentType: string;
}

class AzureStorageService {
  private static instance: AzureStorageService;
  private containerClients: Map<string, ContainerClient> = new Map();

  private constructor() {}

  public static getInstance(): AzureStorageService {
    if (!AzureStorageService.instance) {
      AzureStorageService.instance = new AzureStorageService();
    }
    return AzureStorageService.instance;
  }

  private async getContainerClient(containerName: string): Promise<ContainerClient> {
    if (this.containerClients.has(containerName)) {
      return this.containerClients.get(containerName)!;
    }

    const blobServiceClient = await azureConfig.getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Ensure container exists
    await containerClient.createIfNotExists({
      access: 'container',
    });

    this.containerClients.set(containerName, containerClient);
    return containerClient;
  }

  public async uploadFile(
    fileData: Buffer | Readable,
    options: UploadOptions
  ): Promise<UploadResult> {
    const containerClient = await this.getContainerClient(options.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(options.fileName);

    const uploadResponse = await blockBlobClient.upload(
      fileData,
      Buffer.isBuffer(fileData) ? fileData.length : 0,
      {
        blobHTTPHeaders: {
          blobContentType: options.contentType,
        },
        metadata: options.metadata,
        tags: options.tags,
      }
    );

    return {
      url: blockBlobClient.url,
      etag: uploadResponse.etag || '',
      lastModified: uploadResponse.lastModified || new Date(),
      contentLength: Buffer.isBuffer(fileData) ? fileData.length : 0,
      contentType: options.contentType,
    };
  }

  public async uploadProfileImage(
    userId: number,
    imageData: Buffer,
    contentType: string
  ): Promise<UploadResult> {
    const fileName = `profiles/${userId}/avatar-${Date.now()}.${this.getFileExtension(
      contentType
    )}`;

    return this.uploadFile(imageData, {
      containerName: 'user-files',
      fileName,
      contentType,
      metadata: {
        userId: userId.toString(),
        uploadType: 'profile-image',
        uploadedAt: new Date().toISOString(),
      },
      tags: {
        type: 'profile-image',
        userId: userId.toString(),
      },
    });
  }

  public async uploadStudyMaterial(
    userId: number,
    moduleId: number,
    fileName: string,
    fileData: Buffer,
    contentType: string
  ): Promise<UploadResult> {
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const uniqueFileName = `study-materials/${userId}/${moduleId}/${Date.now()}-${sanitizedFileName}`;

    return this.uploadFile(fileData, {
      containerName: 'study-materials',
      fileName: uniqueFileName,
      contentType,
      metadata: {
        userId: userId.toString(),
        moduleId: moduleId.toString(),
        originalFileName: fileName,
        uploadType: 'study-material',
        uploadedAt: new Date().toISOString(),
      },
      tags: {
        type: 'study-material',
        userId: userId.toString(),
        moduleId: moduleId.toString(),
      },
    });
  }

  public async deleteFile(containerName: string, fileName: string): Promise<boolean> {
    try {
      const containerClient = await this.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(fileName);

      await blockBlobClient.delete();
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  public async getFileUrl(
    containerName: string,
    fileName: string,
    expiryMinutes: number = 60
  ): Promise<string> {
    const containerClient = await this.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // For development, return direct URL (make sure containers are public)
    // For production, generate SAS URL
    try {
      const permissions = new BlobSASPermissions();
      permissions.read = true;

      const sasUrl = await blockBlobClient.generateSasUrl({
        permissions,
        expiresOn: new Date(Date.now() + expiryMinutes * 60 * 1000),
      });
      return sasUrl;
    } catch (error) {
      // Fallback to direct URL
      return blockBlobClient.url;
    }
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  private getFileExtension(contentType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/json': 'json',
    };

    return extensions[contentType] || 'bin';
  }

  // Health check method
  public async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const blobServiceClient = await azureConfig.getBlobServiceClient();
      await blobServiceClient.getProperties();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const azureStorage = AzureStorageService.getInstance();
export default azureStorage;
