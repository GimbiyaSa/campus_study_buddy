---
layout: default
title: Environment Variables Reference
description: Complete reference for all environment variables used by Campus Study Buddy backend
---

# Environment Variables Reference

This document provides a complete reference for all environment variables used by the Campus Study Buddy backend.

## Essential Variables

These variables are **required** for the application to function:

### Authentication
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | ✅ Yes | Google OAuth 2.0 Client ID for authentication | `123456789-abc.apps.googleusercontent.com` |

### Database
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_CONNECTION_STRING` | ✅ Yes | Complete Azure SQL connection string (preferred) | `Server=tcp:server.database.windows.net,1433;Initial Catalog=study_buddy_db;Persist Security Info=False;User ID=username;Password=password;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;` |

**OR** (if not using connection string):

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DB_SERVER` | ✅ Yes* | Database server hostname | `your-server.database.windows.net` |
| `DB_NAME` | ✅ Yes* | Database name | `study_buddy_db` |
| `DB_USER` | ✅ Yes* | Database username | `your-username` |
| `DB_PASSWORD` | ✅ Yes* | Database password | `your-password` |

*Required only if `DATABASE_CONNECTION_STRING` is not provided.

### Application
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | ⚠️ Recommended | Application environment | `development`, `production`, `test` |
| `PORT` | ⚠️ Recommended | Port for the server to listen on | `5000` (default) |

## Azure Services (Optional)

These variables enable additional Azure functionality:

### Key Vault
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `KEY_VAULT_NAME` | 🔹 Optional | Azure Key Vault name for secure secret management | `your-keyvault-name` |

### Storage
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AZURE_STORAGE_ACCOUNT_NAME` | 🔹 Optional | Azure Storage account for file operations | `yourstorageaccount` |
| `AZURE_STORAGE_ACCOUNT_KEY` | 🔹 Optional | Azure Storage account key | `your-storage-key` |

### Real-time Communication
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `WEB_PUBSUB_CONNECTION_STRING` | 🔹 Optional | Azure Web PubSub for real-time chat | `Endpoint=https://your-pubsub.webpubsub.azure.com;AccessKey=...` |
| `WEB_PUBSUB_HUB` | 🔹 Optional | Web PubSub hub name | `chat-hub` (default) |

### Background Processing
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SERVICE_BUS_CONNECTION_STRING` | 🔹 Optional | Azure Service Bus for background tasks | `Endpoint=sb://your-servicebus.servicebus.windows.net/;SharedAccessKeyName=...` |

## Deployment Variables

These variables are used in production Azure deployments:

### Azure Identity
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AZURE_CLIENT_ID` | 🔹 Optional | Managed Identity client ID | `12345678-1234-1234-1234-123456789012` |
| `CONTAINER_APP_NAME` | 🔹 Optional | Azure Container App name | `campus-study-buddy-api` |
| `WEBSITE_SITE_NAME` | 🔹 Optional | Azure App Service name | `campus-study-buddy-api` |
| `AZURE_FUNCTIONS_ENVIRONMENT` | 🔹 Optional | Azure Functions environment | `production` |

### CORS Configuration
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FRONTEND_URL` | ⚠️ Recommended | Frontend application URL | `https://your-frontend.com` |
| `ALLOWED_ORIGINS` | 🔹 Optional | Additional allowed CORS origins (comma-separated) | `https://domain1.com,https://domain2.com` |

## Feature Configuration

### Default Module Settings
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DEFAULT_MODULE_ID` | 🔹 Optional | Default module ID for groups | `1` |
| `DEFAULT_MODULE_CODE` | 🔹 Optional | Default module code | `GEN-DEFAULT` |
| `DEFAULT_MODULE_NAME` | 🔹 Optional | Default module name | `General` |
| `DEFAULT_MODULE_UNIVERSITY` | 🔹 Optional | Default university name | `Your University` |

## Development vs Production

### Development Setup (Minimal)
```env
# Required for local development
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
DATABASE_CONNECTION_STRING=your-local-or-dev-database-connection
NODE_ENV=development
PORT=5000

# Optional for full functionality
FRONTEND_URL=http://localhost:3000
```

### Production Setup (Full)
```env
# Authentication & Database (Required)
GOOGLE_CLIENT_ID=your-production-google-client-id.apps.googleusercontent.com
DATABASE_CONNECTION_STRING=your-production-database-connection

# Application
NODE_ENV=production
PORT=80

# Azure Services
KEY_VAULT_NAME=your-production-keyvault
AZURE_STORAGE_ACCOUNT_NAME=your-production-storage
WEB_PUBSUB_CONNECTION_STRING=your-production-webpubsub-connection
SERVICE_BUS_CONNECTION_STRING=your-production-servicebus-connection

# Deployment
AZURE_CLIENT_ID=your-managed-identity-client-id
WEBSITE_SITE_NAME=your-app-service-name

# CORS
FRONTEND_URL=https://your-production-frontend.com
ALLOWED_ORIGINS=https://your-production-frontend.com,https://your-admin-panel.com
```

## Security Notes

⚠️ **Important Security Considerations:**

- **Never commit environment variables to version control**
- **Use different values for development and production**
- **Store sensitive values in Azure Key Vault in production**
- **Rotate keys and passwords regularly**
- **Use managed identities in Azure when possible**
- **Restrict CORS origins to only necessary domains**

## Validation

The application will log warnings for missing optional variables and fail to start if required variables are missing. Check your application logs for specific error messages about missing configuration.

## Related Documentation

- **[Testing Setup Guide](setup.md)** - How to configure for API testing
- **[Google OAuth Setup](setup.md#how-to-get-google-oauth-client-id)** - Getting Google Client ID
- **[Azure Services Documentation](../infrastructure/)** - Azure service configuration