/**
 * Azure Storage Service
 * Handles file uploads to Azure Blob Storage
 * Supports profile images, study materials, and shared files
 */

import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { azureConfig } from '../config/azureConfig';
import { Readable } from 'stream';

interface UploadOptions {
  containerName: string;
  fileName: string;
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

interface UploadResult {
  url: string;
  blobName: string;
  containerName: string;
  etag: string;
  lastModified: Date;
  contentLength: number;
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

    const containerClient = await azureConfig.getStorageContainerClient(containerName);
    
    // Ensure container exists
    await containerClient.createIfNotExists({
      access: 'blob' // Changed from 'private' to valid option
    });

    this.containerClients.set(containerName, containerClient);
    return containerClient;
  }

  public async uploadFile(
    fileData: Buffer | Readable,
    options: UploadOptions
  ): Promise<UploadResult> {
    try {
      const containerClient = await this.getContainerClient(options.containerName);
      const blobClient = containerClient.getBlockBlobClient(options.fileName);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: options.contentType || 'application/octet-stream',
        },
        metadata: options.metadata,
        tags: options.tags,
      };

      let uploadResponse;
      if (Buffer.isBuffer(fileData)) {
        uploadResponse = await blobClient.uploadData(fileData, uploadOptions);
      } else {
        // Stream upload
        uploadResponse = await blobClient.uploadStream(fileData, undefined, undefined, uploadOptions);
      }

      return {
        url: blobClient.url,
        blobName: options.fileName,
        containerName: options.containerName,
        etag: uploadResponse.etag!,
        lastModified: uploadResponse.lastModified!,
        contentLength: Buffer.isBuffer(fileData) ? fileData.length : 0,
      };
    } catch (error) {
      console.error('File upload failed:', error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async uploadProfileImage(
    userId: number,
    imageData: Buffer,
    contentType: string
  ): Promise<UploadResult> {
    const fileExtension = this.getFileExtension(contentType);
    const fileName = `profile-${userId}-${Date.now()}${fileExtension}`;

    return this.uploadFile(imageData, {
      containerName: 'profile-images',
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
    const uniqueFileName = `${userId}/${moduleId}/${Date.now()}-${sanitizedFileName}`;

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

  public async uploadUserFile(
    userId: number,
    fileName: string,
    fileData: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const uniqueFileName = `${userId}/${Date.now()}-${sanitizedFileName}`;

    return this.uploadFile(fileData, {
      containerName: 'user-files',
      fileName: uniqueFileName,
      contentType,
      metadata: {
        userId: userId.toString(),
        originalFileName: fileName,
        uploadType: 'user-file',
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
      tags: {
        type: 'user-file',
        userId: userId.toString(),
      },
    });
  }

  public async deleteFile(containerName: string, fileName: string): Promise<boolean> {
    try {
      const containerClient = await this.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(fileName);
      
      const deleteResponse = await blobClient.deleteIfExists();
      return deleteResponse.succeeded;
    } catch (error) {
      console.error('File deletion failed:', error);
      return false;
    }
  }

  public async getFileUrl(
    containerName: string,
    fileName: string,
    expiryMinutes: number = 60
  ): Promise<string> {
    try {
      const containerClient = await this.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(fileName);

      // Generate SAS URL for temporary access
      const sasUrl = await blobClient.generateSasUrl({
        permissions: 'r' as any, // Read permission - cast to any to avoid type issues
        expiresOn: new Date(Date.now() + expiryMinutes * 60 * 1000),
      });

      return sasUrl;
    } catch (error) {
      console.error('Failed to generate file URL:', error);
      throw new Error('Failed to generate file access URL');
    }
  }

  public async listUserFiles(
    userId: number,
    containerName: string = 'user-files'
  ): Promise<Array<{
    name: string;
    url: string;
    size: number;
    lastModified: Date;
    contentType: string;
    metadata?: Record<string, string>;
  }>> {
    try {
      const containerClient = await this.getContainerClient(containerName);
      const prefix = `${userId}/`;
      
      const files = [];
      for await (const blob of containerClient.listBlobsFlat({
        prefix,
        includeMetadata: true,
      })) {
        files.push({
          name: blob.name,
          url: `${containerClient.url}/${blob.name}`,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified!,
          contentType: blob.properties.contentType || 'application/octet-stream',
          metadata: blob.metadata,
        });
      }

      return files;
    } catch (error) {
      console.error('Failed to list user files:', error);
      return [];
    }
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  private getFileExtension(contentType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    };

    return extensions[contentType] || '';
  }

  // Health check method
  public async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      await azureConfig.getBlobServiceClient();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Storage health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const azureStorage = AzureStorageService.getInstance();
export default azureStorage;